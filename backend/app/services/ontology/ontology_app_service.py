"""CRUD, bindings resolution, publish/unpublish for Ontology Apps."""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.object_type import ObjectType
from app.models.ontology_app import OntologyApp
from app.models.ontology_function import OntologyActionType, OntologyFunction
from app.schemas.ontology_apps import OntologyAppBindings, OntologyAppCreate, OntologyAppUpdate
from app.services.ontology.ontology_app_a2ui import (
    bindings_board_ready,
    normalize_stored_a2ui_document,
    pack_a2ui_document,
    synthesize_status_board_a2ui_messages,
    synthesize_stub_a2ui_messages,
    validate_ontology_app_a2ui_messages,
)

APP_ID_PREFIX = "oa-"
ID_HEX = 12

BINDING_ACTION_KEYS = ("createAction", "updateAction", "setStatusAction", "deleteAction")
BINDING_FUNCTION_KEYS = ("suggestFunction",)
BOARD_REQUIRED_KEYS = ("objectType", "columnProperty", "columns", "cardTitleProperty")


def new_app_id() -> str:
    return f"{APP_ID_PREFIX}{uuid.uuid4().hex[:ID_HEX]}"


def bindings_as_dict(bindings: OntologyAppBindings | dict[str, Any] | None) -> dict[str, Any]:
    if bindings is None:
        return {}
    if isinstance(bindings, OntologyAppBindings):
        raw = bindings.model_dump(exclude_none=True)
    else:
        raw = dict(bindings)
    out: dict[str, Any] = {}
    for k, v in raw.items():
        if v is None:
            continue
        if isinstance(v, str) and not v.strip():
            continue
        if isinstance(v, list) and not v:
            continue
        out[k] = v
    return out


def required_board_missing(bindings: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    for key in BOARD_REQUIRED_KEYS:
        if key == "columns":
            cols = bindings.get("columns") or []
            if isinstance(cols, list):
                ok = any(str(c).strip() for c in cols)
            else:
                ok = bool(str(cols).strip())
            if not ok:
                missing.append("columns")
        elif not str(bindings.get(key) or "").strip():
            missing.append(key)
    return missing


async def resolve_bindings_snapshot(
    db: AsyncSession, bindings: dict[str, Any]
) -> tuple[dict[str, str], list[str]]:
    """Return resolved id map and list of missing binding keys."""
    resolved: dict[str, str] = {}
    missing: list[str] = []

    ot_name = str(bindings.get("objectType") or "").strip()
    if not ot_name:
        if any(bindings.get(k) for k in BINDING_ACTION_KEYS + BINDING_FUNCTION_KEYS) or bindings.get(
            "columnProperty"
        ):
            missing.append("objectType")
    else:
        ot = (
            await db.execute(select(ObjectType).where(ObjectType.name == ot_name))
        ).scalar_one_or_none()
        if not ot:
            ot = await db.get(ObjectType, ot_name)
        if ot:
            resolved["objectType"] = ot.id
        else:
            missing.append("objectType")

    for key in BINDING_ACTION_KEYS:
        api = bindings.get(key)
        if not api:
            continue
        row = (
            await db.execute(select(OntologyActionType).where(OntologyActionType.api_name == str(api)))
        ).scalar_one_or_none()
        if row:
            resolved[key] = row.id
        else:
            missing.append(key)

    for key in BINDING_FUNCTION_KEYS:
        api = bindings.get(key)
        if not api:
            continue
        row = (
            await db.execute(select(OntologyFunction).where(OntologyFunction.api_name == str(api)))
        ).scalar_one_or_none()
        if row:
            resolved[key] = row.id
        else:
            missing.append(key)

    return resolved, missing


def compute_bindings_hash(resolved: dict[str, str]) -> str:
    blob = json.dumps(resolved, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


async def compute_live_bindings_hash(db: AsyncSession, bindings: dict[str, Any]) -> tuple[str | None, list[str]]:
    resolved, missing = await resolve_bindings_snapshot(db, bindings)
    if missing:
        return None, missing
    if not resolved:
        return None, required_board_missing(bindings)
    return compute_bindings_hash(resolved), missing


def to_response_base(app: OntologyApp, *, stale: bool = False, missing: list[str] | None = None) -> dict[str, Any]:
    return {
        "id": app.id,
        "name": app.name,
        "api_name": app.api_name,
        "description": app.description,
        "template_id": app.template_id,
        "bindings": app.bindings or {},
        "status": app.status,
        "bindings_hash": app.bindings_hash,
        "bindings_stale": stale,
        "missing_bindings": list(missing or []),
        "created_by": app.created_by,
        "created_by_name": app.created_by_name,
        "created_at": app.created_at,
        "updated_at": app.updated_at,
        "has_draft": normalize_stored_a2ui_document(app.draft_a2ui) is not None,
        "has_published": normalize_stored_a2ui_document(app.published_a2ui) is not None,
    }


async def enrich_stale(db: AsyncSession, app: OntologyApp) -> tuple[bool, list[str]]:
    bindings = app.bindings or {}
    board_miss = required_board_missing(bindings)
    if board_miss and not bindings:
        return False, board_miss
    live_hash, missing = await compute_live_bindings_hash(db, bindings)
    all_missing = list(dict.fromkeys([*board_miss, *missing]))
    if all_missing:
        return True, all_missing
    if app.bindings_hash and live_hash and app.bindings_hash != live_hash:
        return True, []
    return False, []


async def get_app(db: AsyncSession, app_id: str) -> OntologyApp:
    app = await db.get(OntologyApp, app_id)
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    return app


async def list_apps(
    db: AsyncSession, *, status: str | None = None
) -> list[OntologyApp]:
    q = select(OntologyApp).order_by(OntologyApp.updated_at.desc())
    if status:
        q = q.where(OntologyApp.status == status)
    return list((await db.execute(q)).scalars().all())


async def create_app(
    db: AsyncSession,
    body: OntologyAppCreate,
    *,
    created_by: str | None,
    created_by_name: str | None,
) -> OntologyApp:
    exists = (
        await db.execute(select(OntologyApp.id).where(OntologyApp.api_name == body.api_name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="api_name already exists")

    bindings = bindings_as_dict(body.bindings)
    bindings_hash: str | None = None
    if bindings:
        resolved, missing = await resolve_bindings_snapshot(db, bindings)
        if missing:
            raise HTTPException(
                status_code=400,
                detail={"message": "Missing or unknown bindings", "missing_bindings": missing},
            )
        if bindings_board_ready(bindings):
            messages = synthesize_status_board_a2ui_messages(bindings, title=body.name)
            bindings_hash = compute_bindings_hash(resolved)
        else:
            messages = synthesize_stub_a2ui_messages(title=body.name)
            if resolved:
                bindings_hash = compute_bindings_hash(resolved)
    else:
        messages = synthesize_stub_a2ui_messages(title=body.name)

    app = OntologyApp(
        id=new_app_id(),
        name=body.name,
        api_name=body.api_name,
        description=body.description,
        template_id=body.template_id or "a2ui",
        bindings=bindings,
        draft_a2ui=pack_a2ui_document(messages),
        published_a2ui=None,
        bindings_hash=bindings_hash,
        status="draft",
        created_by=created_by,
        created_by_name=created_by_name,
    )
    db.add(app)
    await db.commit()
    await db.refresh(app)
    return app


async def update_app(db: AsyncSession, app: OntologyApp, body: OntologyAppUpdate) -> OntologyApp:
    if body.name is not None:
        app.name = body.name
    if body.description is not None:
        app.description = body.description
    if body.bindings is not None:
        bindings = bindings_as_dict(body.bindings)
        if bindings:
            resolved, missing = await resolve_bindings_snapshot(db, bindings)
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail={"message": "Missing or unknown bindings", "missing_bindings": missing},
                )
            app.bindings = bindings
            app.bindings_hash = compute_bindings_hash(resolved) if resolved else None
        else:
            app.bindings = {}
            app.bindings_hash = None
    if body.draft_a2ui_messages is not None:
        validated = validate_ontology_app_a2ui_messages(
            body.draft_a2ui_messages, bindings=app.bindings or {}
        )
        app.draft_a2ui = pack_a2ui_document(validated)
    await db.commit()
    await db.refresh(app)
    return app


async def apply_bindings(
    db: AsyncSession,
    app: OntologyApp,
    bindings: dict[str, Any],
    *,
    synthesize: bool = True,
) -> OntologyApp:
    """Validate and store bindings; optionally synthesize board A2UI."""
    cleaned = bindings_as_dict(bindings)
    resolved, missing = await resolve_bindings_snapshot(db, cleaned)
    board_miss = required_board_missing(cleaned)
    if missing or board_miss:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Missing or unknown bindings",
                "missing_bindings": list(dict.fromkeys([*board_miss, *missing])),
            },
        )
    app.bindings = cleaned
    app.bindings_hash = compute_bindings_hash(resolved)
    if synthesize and bindings_board_ready(cleaned):
        messages = synthesize_status_board_a2ui_messages(cleaned, title=app.name)
        app.draft_a2ui = pack_a2ui_document(messages)
    await db.commit()
    await db.refresh(app)
    return app


async def synthesize_draft(db: AsyncSession, app: OntologyApp) -> OntologyApp:
    bindings = app.bindings or {}
    if bindings_board_ready(bindings):
        messages = synthesize_status_board_a2ui_messages(bindings, title=app.name)
    else:
        messages = synthesize_stub_a2ui_messages(title=app.name)
    app.draft_a2ui = pack_a2ui_document(messages)
    await db.commit()
    await db.refresh(app)
    return app


async def publish_app(
    db: AsyncSession,
    app: OntologyApp,
    *,
    a2ui_messages: list[dict[str, Any]] | None = None,
) -> OntologyApp:
    bindings = app.bindings or {}
    board_miss = required_board_missing(bindings)
    resolved, missing = await resolve_bindings_snapshot(db, bindings)
    if board_miss or missing:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Cannot publish until bindings resolve",
                "missing_bindings": list(dict.fromkeys([*board_miss, *missing])),
            },
        )
    if a2ui_messages is not None:
        messages = validate_ontology_app_a2ui_messages(a2ui_messages, bindings=bindings)
        app.draft_a2ui = pack_a2ui_document(messages)
    else:
        messages = normalize_stored_a2ui_document(app.draft_a2ui)
        if not messages or not bindings_board_ready(bindings):
            messages = synthesize_status_board_a2ui_messages(bindings, title=app.name)
            app.draft_a2ui = pack_a2ui_document(messages)
        else:
            messages = validate_ontology_app_a2ui_messages(messages, bindings=bindings)
    app.published_a2ui = pack_a2ui_document(messages)
    app.status = "published"
    app.bindings_hash = compute_bindings_hash(resolved)
    await db.commit()
    await db.refresh(app)
    return app


async def unpublish_app(db: AsyncSession, app: OntologyApp) -> OntologyApp:
    app.status = "draft"
    app.published_a2ui = None
    await db.commit()
    await db.refresh(app)
    return app


async def delete_app(db: AsyncSession, app: OntologyApp) -> None:
    from app.services.ontology.ontology_app_session import delete_all_conversations_for_app

    await delete_all_conversations_for_app(db, app.id)
    await db.delete(app)
    await db.commit()


async def build_ontology_snapshot(db: AsyncSession, *, limit: int = 200) -> dict[str, Any]:
    """Compact live ontology for designer prompts (link only — no create)."""
    ots = list((await db.execute(select(ObjectType).order_by(ObjectType.name).limit(limit))).scalars().all())
    acts = list(
        (await db.execute(select(OntologyActionType).order_by(OntologyActionType.api_name).limit(limit))).scalars().all()
    )
    fns = list(
        (
            await db.execute(
                select(OntologyFunction)
                .where(OntologyFunction.published_version_id.is_not(None))
                .order_by(OntologyFunction.api_name)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    ot_by_id = {o.id: o.name for o in ots}
    return {
        "object_types": [{"name": o.name, "id": o.id} for o in ots],
        "actions": [
            {
                "api_name": a.api_name,
                "display_name": a.display_name,
                "object_type": ot_by_id.get(a.object_type_id) or a.object_type_id,
            }
            for a in acts
        ],
        "functions": [{"api_name": f.api_name, "display_name": f.display_name} for f in fns],
    }
