"""Knowledge Map API: hierarchical nodes and links to channels / wiki spaces."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.config import settings
from app.database import get_db
from app.models.article_channel import ArticleChannel
from app.models.document_channel import DocumentChannel
from app.models.media_channel import MediaChannel
from app.models.knowledge_map import (
    DEFAULT_KNOWLEDGE_MAP_HTML_ARTIFACT_ID,
    KnowledgeMapHtmlArtifact,
    KnowledgeMapNode,
    KnowledgeMapResourceLink,
)
from app.models.wiki_models import WikiSpace
from app.services.agent.llm import resolve_agent_llm_config
from app.services.knowledge_map.knowledge_map_html import (
    designer_chat_via_llm,
    ensure_spa_link_targets,
    finalize_html_document,
    generate_static_html_via_llm,
    iter_designer_chat_llm_stream_events,
    load_semantic_snapshot,
    semantic_content_hash,
    knowledge_map_nodes_last_modified_at,
    static_html_for_empty_knowledge_map,
)
from app.services.knowledge_map.knowledge_map_html_designer_session import (
    append_designer_turn,
    create_designer_conversation,
    delete_designer_conversation,
    get_designer_conversation_owned,
    get_designer_session_messages,
    list_designer_conversations,
    persist_designer_turn_safe,
)
from app.services.permissions.permission_catalog import PERM_KNOWLEDGE_MAP_READ, PERM_KNOWLEDGE_MAP_WRITE
from app.services.feature_toggles import is_feature_enabled

router = APIRouter(prefix="/knowledge-map", tags=["knowledge-map"])
logger = logging.getLogger(__name__)

RESOURCE_TYPES: frozenset[str] = frozenset({"document_channel", "article_channel", "media_channel", "wiki_space"})


def _auth_sub(request: Request) -> str:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sub


def _last_user_message_content(messages: list[MapHtmlDesignerChatMessage]) -> str | None:
    for m in reversed(messages):
        if m.role == "user":
            return m.content
    return None


async def _designer_persist_conversation_id(
    db: AsyncSession, user_sub: str, body_conversation_id: str | None
) -> str | None:
    if not body_conversation_id or not str(body_conversation_id).strip():
        return None
    cid = str(body_conversation_id).strip()
    c = await get_designer_conversation_owned(db, user_sub, cid)
    if not c:
        raise HTTPException(status_code=404, detail="Designer conversation not found")
    return c.id


def _nid() -> str:
    return uuid.uuid4().hex[:32]


from app.services.knowledge_map.knowledge_map_read import (
    KnowledgeMapHtmlStatusOut,
    KnowledgeMapNodeOut,
    ResourceLinkOut,
    load_knowledge_map_tree,
    load_map_html_status,
    load_resource_links,
)


class KnowledgeMapNodeCreate(BaseModel):
    parent_id: str | None = None
    name: str = Field(..., min_length=1, max_length=256)
    description: str | None = Field(None, max_length=8192)
    sort_order: int = 0


class KnowledgeMapNodeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=256)
    description: str | None = Field(None, max_length=8192)
    sort_order: int | None = None
    parent_id: str | None = None


class ResourceLinkUpsert(BaseModel):
    knowledge_map_node_id: str = Field(..., min_length=1, max_length=64)
    resource_type: str = Field(..., min_length=1, max_length=32)
    resource_id: str = Field(..., min_length=1, max_length=64)


class KnowledgeMapHtmlRegenerateOut(BaseModel):
    content_hash: str
    generated_at: datetime


class MapHtmlDesignerChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=120_000)


class MapHtmlDesignerChatIn(BaseModel):
    messages: list[MapHtmlDesignerChatMessage] = Field(..., min_length=1, max_length=40)
    working_html: str | None = Field(None, max_length=500_000)
    stream: bool = False
    conversation_id: str | None = Field(None, max_length=64)


class MapHtmlDesignerChatOut(BaseModel):
    content: str


class MapHtmlDesignerSessionMessageOut(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class MapHtmlDesignerSessionOut(BaseModel):
    conversation_id: str | None = None
    messages: list[MapHtmlDesignerSessionMessageOut] = Field(default_factory=list)


class MapHtmlDesignerConversationOut(BaseModel):
    id: str
    title: str | None = None
    created_at: datetime
    updated_at: datetime


class MapHtmlDesignerConversationListOut(BaseModel):
    conversations: list[MapHtmlDesignerConversationOut] = Field(default_factory=list)


class MapHtmlBodyHtml(BaseModel):
    html: str = Field(..., min_length=1, max_length=500_000)


class MapHtmlPreviewOut(BaseModel):
    html: str


async def _validate_resource(db: AsyncSession, resource_type: str, resource_id: str) -> None:
    if resource_type not in RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail=f"resource_type must be one of: {sorted(RESOURCE_TYPES)}")
    if resource_type == "media_channel":
        if not await is_feature_enabled(db, "media"):
            raise HTTPException(status_code=404, detail="Media feature is disabled")
        ch = await db.get(MediaChannel, resource_id)
        if not ch:
            raise HTTPException(status_code=400, detail="media_channel not found")
    elif resource_type == "document_channel":
        ch = await db.get(DocumentChannel, resource_id)
        if not ch:
            raise HTTPException(status_code=400, detail="document_channel not found")
    elif resource_type == "wiki_space":
        ws = await db.get(WikiSpace, resource_id)
        if not ws:
            raise HTTPException(status_code=400, detail="wiki_space not found")
    else:
        ch = await db.get(ArticleChannel, resource_id)
        if not ch:
            raise HTTPException(status_code=400, detail="article_channel not found")


@router.get(
    "/nodes/tree",
    response_model=list[KnowledgeMapNodeOut],
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_READ))],
)
async def get_knowledge_map_tree(db: AsyncSession = Depends(get_db)):
    return await load_knowledge_map_tree(db)


@router.post(
    "/nodes",
    response_model=KnowledgeMapNodeOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def create_knowledge_map_node(body: KnowledgeMapNodeCreate, db: AsyncSession = Depends(get_db)):
    if body.parent_id:
        parent = await db.get(KnowledgeMapNode, body.parent_id)
        if not parent:
            raise HTTPException(status_code=400, detail="parent_id not found")
    node = KnowledgeMapNode(
        id=_nid(),
        parent_id=body.parent_id,
        name=body.name.strip(),
        description=(body.description.strip() if body.description else None) or None,
        sort_order=body.sort_order,
    )
    db.add(node)
    await db.flush()
    return KnowledgeMapNodeOut(
        id=node.id,
        parent_id=node.parent_id,
        name=node.name,
        description=node.description,
        sort_order=node.sort_order,
        link_count=0,
        children=[],
    )


@router.patch(
    "/nodes/{node_id}",
    response_model=KnowledgeMapNodeOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def update_knowledge_map_node(
    node_id: str,
    body: KnowledgeMapNodeUpdate,
    db: AsyncSession = Depends(get_db),
):
    node = await db.get(KnowledgeMapNode, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    patch = body.model_dump(exclude_unset=True)
    if "parent_id" in patch:
        new_parent = patch["parent_id"]
        if new_parent == node_id:
            raise HTTPException(status_code=400, detail="Cannot set parent to self")
        if new_parent:
            parent = await db.get(KnowledgeMapNode, new_parent)
            if not parent:
                raise HTTPException(status_code=400, detail="parent_id not found")
            cid: str | None = new_parent
            while cid:
                if cid == node_id:
                    raise HTTPException(status_code=400, detail="Cycle detected")
                anc = await db.get(KnowledgeMapNode, cid)
                cid = anc.parent_id if anc else None
        node.parent_id = new_parent
    if "name" in patch and patch["name"] is not None:
        node.name = str(patch["name"]).strip()
    if "description" in patch:
        d = patch["description"]
        node.description = (str(d).strip() or None) if d is not None else None
    if "sort_order" in patch and patch["sort_order"] is not None:
        node.sort_order = int(patch["sort_order"])
    await db.flush()
    cnt2 = await db.scalar(
        select(sa_func.count())
        .select_from(KnowledgeMapResourceLink)
        .where(KnowledgeMapResourceLink.knowledge_map_node_id == node_id)
    )
    return KnowledgeMapNodeOut(
        id=node.id,
        parent_id=node.parent_id,
        name=node.name,
        description=node.description,
        sort_order=node.sort_order,
        link_count=int(cnt2 or 0),
        children=[],
    )


@router.delete(
    "/nodes/{node_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def delete_knowledge_map_node(node_id: str, db: AsyncSession = Depends(get_db)):
    node = await db.get(KnowledgeMapNode, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    await db.delete(node)


@router.get(
    "/resource-links",
    response_model=list[ResourceLinkOut],
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_READ))],
)
async def list_resource_links(db: AsyncSession = Depends(get_db)):
    return await load_resource_links(db)


@router.put(
    "/resource-links",
    response_model=ResourceLinkOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def upsert_resource_link(body: ResourceLinkUpsert, db: AsyncSession = Depends(get_db)):
    node = await db.get(KnowledgeMapNode, body.knowledge_map_node_id)
    if not node:
        raise HTTPException(status_code=400, detail="knowledge_map_node_id not found")
    await _validate_resource(db, body.resource_type, body.resource_id)
    existing = await db.execute(
        select(KnowledgeMapResourceLink).where(
            KnowledgeMapResourceLink.resource_type == body.resource_type,
            KnowledgeMapResourceLink.resource_id == body.resource_id,
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        row.knowledge_map_node_id = body.knowledge_map_node_id
    else:
        row = KnowledgeMapResourceLink(
            id=_nid(),
            knowledge_map_node_id=body.knowledge_map_node_id,
            resource_type=body.resource_type,
            resource_id=body.resource_id,
        )
        db.add(row)
    await db.flush()
    return ResourceLinkOut(
        id=row.id,
        knowledge_map_node_id=row.knowledge_map_node_id,
        resource_type=row.resource_type,
        resource_id=row.resource_id,
    )


@router.delete(
    "/resource-links",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def delete_resource_link(
    resource_type: str = Query(..., min_length=1),
    resource_id: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KnowledgeMapResourceLink).where(
            KnowledgeMapResourceLink.resource_type == resource_type,
            KnowledgeMapResourceLink.resource_id == resource_id,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        await db.delete(row)


@router.get(
    "/map-html/status",
    response_model=KnowledgeMapHtmlStatusOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_READ))],
)
async def get_map_html_status(db: AsyncSession = Depends(get_db)):
    return await load_map_html_status(db)


@router.get(
    "/map-html",
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_READ))],
)
async def get_map_html(db: AsyncSession = Depends(get_db)):
    row = await db.get(KnowledgeMapHtmlArtifact, DEFAULT_KNOWLEDGE_MAP_HTML_ARTIFACT_ID)
    if not row or not (row.html or "").strip():
        raise HTTPException(status_code=404, detail="No HTML snapshot yet. POST /knowledge-map/map-html/regenerate first.")
    return HTMLResponse(
        content=ensure_spa_link_targets(row.html, settings.frontend_url),
        media_type="text/html; charset=utf-8",
    )


@router.delete(
    "/map-html",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def delete_map_html(db: AsyncSession = Depends(get_db)):
    row = await db.get(KnowledgeMapHtmlArtifact, DEFAULT_KNOWLEDGE_MAP_HTML_ARTIFACT_ID)
    if row:
        await db.delete(row)
        await db.flush()


@router.post(
    "/map-html/regenerate",
    response_model=KnowledgeMapHtmlRegenerateOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def regenerate_map_html(db: AsyncSession = Depends(get_db)):
    snapshot = await load_semantic_snapshot(db)
    content_hash = semantic_content_hash(snapshot)
    if not snapshot["nodes"]:
        final_html = static_html_for_empty_knowledge_map()
    else:
        model_config = await resolve_agent_llm_config(db)
        if not model_config:
            raise HTTPException(
                status_code=503,
                detail="No LLM model configured. Add an LLM in Console > Models.",
            )
        try:
            raw = await generate_static_html_via_llm(snapshot, model_config)
            final_html = finalize_html_document(raw, snapshot, settings.frontend_url)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"LLM or HTML processing failed: {e}") from e

    now = datetime.now(timezone.utc)
    row = await db.get(KnowledgeMapHtmlArtifact, DEFAULT_KNOWLEDGE_MAP_HTML_ARTIFACT_ID)
    if row:
        row.html = final_html
        row.content_hash = content_hash
        row.generated_at = now
    else:
        db.add(
            KnowledgeMapHtmlArtifact(
                id=DEFAULT_KNOWLEDGE_MAP_HTML_ARTIFACT_ID,
                html=final_html,
                content_hash=content_hash,
                generated_at=now,
            )
        )
    await db.flush()
    return KnowledgeMapHtmlRegenerateOut(content_hash=content_hash, generated_at=now)


@router.get(
    "/map-html/designer/conversations",
    response_model=MapHtmlDesignerConversationListOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_READ))],
)
async def list_map_html_designer_conversations(request: Request, db: AsyncSession = Depends(get_db)):
    sub = _auth_sub(request)
    rows = await list_designer_conversations(db, sub, limit=50)
    return MapHtmlDesignerConversationListOut(
        conversations=[
            MapHtmlDesignerConversationOut(
                id=c.id,
                title=c.title,
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
            for c in rows
        ],
    )


@router.post(
    "/map-html/designer/conversations",
    response_model=MapHtmlDesignerConversationOut,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def create_map_html_designer_conversation(request: Request, db: AsyncSession = Depends(get_db)):
    sub = _auth_sub(request)
    c = await create_designer_conversation(db, sub)
    return MapHtmlDesignerConversationOut(
        id=c.id,
        title=c.title,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get(
    "/map-html/designer/session",
    response_model=MapHtmlDesignerSessionOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_READ))],
)
async def get_map_html_designer_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
    conversation_id: str | None = Query(None, max_length=64),
):
    sub = _auth_sub(request)
    if conversation_id and conversation_id.strip():
        cid = conversation_id.strip()
        if not await get_designer_conversation_owned(db, sub, cid):
            raise HTTPException(status_code=404, detail="Designer conversation not found")
        conv_id, rows = await get_designer_session_messages(db, sub, cid)
    else:
        conv_id, rows = await get_designer_session_messages(db, sub, None)
    return MapHtmlDesignerSessionOut(
        conversation_id=conv_id,
        messages=[
            MapHtmlDesignerSessionMessageOut(
                id=m.id,
                role=cast(Literal["user", "assistant"], m.role),
                content=m.content,
                created_at=m.created_at,
            )
            for m in rows
            if m.role in ("user", "assistant")
        ],
    )


@router.delete(
    "/map-html/designer/conversations/{conversation_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def delete_map_html_designer_conversation(
    conversation_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = _auth_sub(request)
    ok = await delete_designer_conversation(db, sub, conversation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Designer conversation not found")


@router.post(
    "/map-html/designer/chat",
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def map_html_designer_chat(
    request: Request,
    body: MapHtmlDesignerChatIn,
    db: AsyncSession = Depends(get_db),
):
    model_config = await resolve_agent_llm_config(db)
    if not model_config:
        raise HTTPException(
            status_code=503,
            detail="No LLM model configured. Add an LLM in Console > Models.",
        )
    snapshot = await load_semantic_snapshot(db)
    conv = [{"role": m.role, "content": m.content} for m in body.messages]
    row = await db.get(KnowledgeMapHtmlArtifact, DEFAULT_KNOWLEDGE_MAP_HTML_ARTIFACT_ID)
    published = (row.html or "").strip() if row else None
    if not published:
        published = None

    sub = _auth_sub(request)
    last_user_content = _last_user_message_content(body.messages)
    persist_cid = await _designer_persist_conversation_id(db, sub, body.conversation_id)

    if body.stream:

        async def ndjson() -> AsyncIterator[bytes]:
            try:
                async for ev in iter_designer_chat_llm_stream_events(
                    conv,
                    snapshot,
                    model_config,
                    published_html=published,
                    working_html=body.working_html,
                ):
                    if ev.get("type") == "done" and last_user_content is not None:
                        asst = ev.get("content")
                        if isinstance(asst, str):
                            asyncio.create_task(
                                persist_designer_turn_safe(sub, last_user_content, asst, persist_cid),
                            )
                    yield (json.dumps(ev, ensure_ascii=False) + "\n").encode("utf-8")
            except ValueError as e:
                yield (json.dumps({"type": "error", "detail": str(e)}, ensure_ascii=False) + "\n").encode("utf-8")
            except Exception as e:
                yield (
                    json.dumps({"type": "error", "detail": f"Designer LLM failed: {e}"}, ensure_ascii=False) + "\n"
                ).encode("utf-8")

        return StreamingResponse(
            ndjson(),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        raw_reply = await designer_chat_via_llm(
            conv,
            snapshot,
            model_config,
            published_html=published,
            working_html=body.working_html,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Designer LLM failed: {e}") from e
    if last_user_content is not None:
        try:
            await append_designer_turn(db, sub, last_user_content, raw_reply, persist_cid)
        except Exception:
            logger.exception("Map HTML designer session persist failed (non-stream)")
    return MapHtmlDesignerChatOut(content=raw_reply)


@router.post(
    "/map-html/preview",
    response_model=MapHtmlPreviewOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def map_html_preview(body: MapHtmlBodyHtml, db: AsyncSession = Depends(get_db)):
    snapshot = await load_semantic_snapshot(db)
    try:
        safe = finalize_html_document(body.html.strip(), snapshot, settings.frontend_url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return MapHtmlPreviewOut(html=safe)


@router.post(
    "/map-html/publish",
    response_model=KnowledgeMapHtmlRegenerateOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def map_html_publish(body: MapHtmlBodyHtml, db: AsyncSession = Depends(get_db)):
    snapshot = await load_semantic_snapshot(db)
    content_hash = semantic_content_hash(snapshot)
    raw = body.html.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="html is empty")
    try:
        final_html = finalize_html_document(raw, snapshot, settings.frontend_url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    now = datetime.now(timezone.utc)
    row = await db.get(KnowledgeMapHtmlArtifact, DEFAULT_KNOWLEDGE_MAP_HTML_ARTIFACT_ID)
    if row:
        row.html = final_html
        row.content_hash = content_hash
        row.generated_at = now
    else:
        db.add(
            KnowledgeMapHtmlArtifact(
                id=DEFAULT_KNOWLEDGE_MAP_HTML_ARTIFACT_ID,
                html=final_html,
                content_hash=content_hash,
                generated_at=now,
            )
        )
    await db.flush()
    return KnowledgeMapHtmlRegenerateOut(content_hash=content_hash, generated_at=now)
