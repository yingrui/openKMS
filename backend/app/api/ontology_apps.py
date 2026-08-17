"""Ontology Apps API — App Builder + Apps runtime."""

from __future__ import annotations

import json
from typing import Any, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission
from app.api.ontology.deps import jwt_user_from_request, validate_api_name
from app.database import get_db
from app.schemas.ontology_apps import (
    OntologyAppCreate,
    OntologyAppDesignResponse,
    OntologyAppDesignerChatIn,
    OntologyAppPublishIn,
    OntologyAppResponse,
    OntologyAppRunResponse,
    OntologyAppUpdate,
)
from app.services.agent.llm import resolve_agent_llm_config
from app.services.ontology import ontology_app_service as apps_svc
from app.services.ontology.ontology_app_a2ui import normalize_stored_a2ui_document
from app.services.ontology.ontology_app_designer import (
    iter_ontology_app_designer_chat_ndjson,
)
from app.services.ontology.ontology_app_session import (
    create_app_conversation,
    delete_app_conversation,
    get_app_session_messages,
    list_app_conversations,
    persist_app_turn_safe,
)
from app.services.knowledge_map.knowledge_map_overview_designer import last_user_content
from app.services.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE

router = APIRouter(
    prefix="/ontology/apps",
    tags=["ontology-apps"],
    dependencies=[Depends(require_any_permission(PERM_ONTOLOGY_READ))],
)


class DesignerConversationOut(BaseModel):
    id: str
    title: str | None = None
    created_at: Any
    updated_at: Any


class DesignerConversationListOut(BaseModel):
    conversations: list[DesignerConversationOut]


class DesignerSessionMessageOut(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: Any


class DesignerSessionOut(BaseModel):
    conversation_id: str | None = None
    messages: list[DesignerSessionMessageOut]


async def _to_list_item(db: AsyncSession, app) -> OntologyAppResponse:
    stale, missing = await apps_svc.enrich_stale(db, app)
    return OntologyAppResponse(**apps_svc.to_response_base(app, stale=stale, missing=missing))


@router.get("", response_model=list[OntologyAppResponse])
async def list_ontology_apps(
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    rows = await apps_svc.list_apps(db, status=status)
    return [await _to_list_item(db, r) for r in rows]


@router.post("", response_model=OntologyAppResponse, status_code=201)
async def create_ontology_app(
    body: OntologyAppCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    validate_api_name(body.api_name)
    uid, uname = jwt_user_from_request(request)
    app = await apps_svc.create_app(db, body, created_by=uid, created_by_name=uname)
    return await _to_list_item(db, app)


@router.get("/{app_id}", response_model=OntologyAppRunResponse)
async def get_ontology_app_run(app_id: str, db: AsyncSession = Depends(get_db)):
    """Published runtime document only (404 if draft / unpublished)."""
    app = await apps_svc.get_app(db, app_id)
    messages = normalize_stored_a2ui_document(app.published_a2ui)
    if app.status != "published" or not messages:
        raise HTTPException(status_code=404, detail="Published app not found")
    stale, missing = await apps_svc.enrich_stale(db, app)
    base = apps_svc.to_response_base(app, stale=stale, missing=missing)
    return OntologyAppRunResponse(**base, a2ui_messages=messages)


@router.get("/{app_id}/design", response_model=OntologyAppDesignResponse)
async def get_ontology_app_design(
    app_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    app = await apps_svc.get_app(db, app_id)
    app = await apps_svc.heal_draft_if_removed_components(db, app)
    messages = normalize_stored_a2ui_document(app.draft_a2ui) or []
    stale, missing = await apps_svc.enrich_stale(db, app)
    base = apps_svc.to_response_base(app, stale=stale, missing=missing)
    return OntologyAppDesignResponse(**base, a2ui_messages=messages)


@router.patch("/{app_id}", response_model=OntologyAppResponse)
async def update_ontology_app(
    app_id: str,
    body: OntologyAppUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    app = await apps_svc.get_app(db, app_id)
    app = await apps_svc.update_app(db, app, body)
    return await _to_list_item(db, app)


@router.delete("/{app_id}", status_code=204)
async def delete_ontology_app(
    app_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    app = await apps_svc.get_app(db, app_id)
    await apps_svc.delete_app(db, app)
    return None


@router.post("/{app_id}/synthesize", response_model=OntologyAppDesignResponse)
async def synthesize_ontology_app(
    app_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    app = await apps_svc.get_app(db, app_id)
    app = await apps_svc.synthesize_draft(db, app)
    messages = normalize_stored_a2ui_document(app.draft_a2ui) or []
    stale, missing = await apps_svc.enrich_stale(db, app)
    base = apps_svc.to_response_base(app, stale=stale, missing=missing)
    return OntologyAppDesignResponse(**base, a2ui_messages=messages)


@router.post("/{app_id}/publish", response_model=OntologyAppRunResponse)
async def publish_ontology_app(
    app_id: str,
    body: OntologyAppPublishIn | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    app = await apps_svc.get_app(db, app_id)
    msgs = body.a2ui_messages if body else None
    app = await apps_svc.publish_app(db, app, a2ui_messages=msgs)
    messages = normalize_stored_a2ui_document(app.published_a2ui) or []
    stale, missing = await apps_svc.enrich_stale(db, app)
    base = apps_svc.to_response_base(app, stale=stale, missing=missing)
    return OntologyAppRunResponse(**base, a2ui_messages=messages)


@router.post("/{app_id}/unpublish", response_model=OntologyAppResponse)
async def unpublish_ontology_app(
    app_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    app = await apps_svc.get_app(db, app_id)
    app = await apps_svc.unpublish_app(db, app)
    return await _to_list_item(db, app)


@router.get("/{app_id}/designer/conversations", response_model=DesignerConversationListOut)
async def list_designer_conversations(
    app_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    await apps_svc.get_app(db, app_id)
    uid, _ = jwt_user_from_request(request)
    rows = await list_app_conversations(db, uid or "", app_id)
    return DesignerConversationListOut(
        conversations=[
            DesignerConversationOut(id=c.id, title=c.title, created_at=c.created_at, updated_at=c.updated_at)
            for c in rows
        ]
    )


@router.post(
    "/{app_id}/designer/conversations",
    response_model=DesignerConversationOut,
    status_code=201,
)
async def create_designer_conversation(
    app_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    await apps_svc.get_app(db, app_id)
    uid, _ = jwt_user_from_request(request)
    c = await create_app_conversation(db, uid or "", app_id)
    await db.commit()
    return DesignerConversationOut(id=c.id, title=c.title, created_at=c.created_at, updated_at=c.updated_at)


@router.get("/{app_id}/designer/session", response_model=DesignerSessionOut)
async def get_designer_session(
    app_id: str,
    request: Request,
    conversation_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    await apps_svc.get_app(db, app_id)
    uid, _ = jwt_user_from_request(request)
    cid, messages = await get_app_session_messages(db, uid or "", app_id, conversation_id)
    return DesignerSessionOut(
        conversation_id=cid,
        messages=[
            DesignerSessionMessageOut(
                id=m.id,
                role=cast(Literal["user", "assistant"], m.role if m.role in ("user", "assistant") else "assistant"),
                content=m.content or "",
                created_at=m.created_at,
            )
            for m in messages
            if m.role in ("user", "assistant")
        ],
    )


@router.delete("/{app_id}/designer/conversations/{conversation_id}", status_code=204)
async def delete_designer_conversation(
    app_id: str,
    conversation_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    await apps_svc.get_app(db, app_id)
    uid, _ = jwt_user_from_request(request)
    ok = await delete_app_conversation(db, uid or "", app_id, conversation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.commit()
    return None


@router.post("/{app_id}/designer/chat")
async def designer_chat(
    app_id: str,
    body: OntologyAppDesignerChatIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    app = await apps_svc.get_app(db, app_id)
    model_config = await resolve_agent_llm_config(db)
    if not model_config:
        raise HTTPException(status_code=400, detail="No LLM configured for agents")
    uid, _ = jwt_user_from_request(request)
    user_text = last_user_content(body.messages) or ""
    snapshot = await apps_svc.build_ontology_snapshot(db)
    initial_bindings = dict(app.bindings or {})

    async def ndjson():
        last_assistant = ""
        last_a2ui: list[dict] | None = None

        async def apply_bindings(raw: dict) -> dict:
            from app.database import async_session_maker

            async with async_session_maker() as s:
                row = await apps_svc.get_app(s, app_id)
                try:
                    row = await apps_svc.apply_bindings(s, row, raw, synthesize=False)
                except HTTPException as he:
                    detail = he.detail
                    if isinstance(detail, dict):
                        miss = detail.get("missing_bindings") or []
                        msg = str(detail.get("message") or "Invalid bindings")
                        if miss:
                            msg = f"{msg}: {', '.join(str(m) for m in miss)}"
                        raise ValueError(msg) from he
                    raise ValueError(str(detail)) from he
                msgs = normalize_stored_a2ui_document(row.draft_a2ui) or []
                return {"bindings": row.bindings or {}, "a2ui_messages": msgs}

        try:
            async for ev in iter_ontology_app_designer_chat_ndjson(
                body.messages,
                initial_bindings,
                model_config,
                working_a2ui_messages=body.working_a2ui_messages,
                app_name=app.name,
                ontology_snapshot=snapshot,
                apply_bindings=apply_bindings,
            ):
                if ev.get("type") == "done":
                    last_assistant = str(ev.get("content") or "")
                    msgs = ev.get("a2ui_messages")
                    if isinstance(msgs, list):
                        last_a2ui = msgs
                yield json.dumps(ev, ensure_ascii=False) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False) + "\n"
            return
        if user_text:
            await persist_app_turn_safe(uid or "", app_id, user_text, last_assistant, body.conversation_id)
        if last_a2ui is not None:
            from app.database import async_session_maker
            from app.schemas.ontology_apps import OntologyAppUpdate

            async with async_session_maker() as s:
                row = await apps_svc.get_app(s, app_id)
                # Resources may already be applied via set_resources; only persist A2UI here.
                await apps_svc.update_app(s, row, OntologyAppUpdate(draft_a2ui_messages=last_a2ui))

    return StreamingResponse(ndjson(), media_type="application/x-ndjson")
