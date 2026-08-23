"""CRUD, resource resolution, publish/unpublish for App Builder apps."""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.object_type import ObjectType
from app.models.app_builder import AppBuilderApp
from app.models.ontology_function import OntologyActionType, OntologyFunction, OntologyFunctionVersion
from app.schemas.app_builder import AppBuilderBindings, AppBuilderCreate, AppBuilderUpdate
from app.services.ontology.action_rule_types import is_builtin_object_rule
from app.services.ontology.builtin_action_service import input_schema_for_action
from app.services.app_builder.a2ui import (
    normalize_resources,
    normalize_stored_a2ui_document,
    pack_a2ui_document,
    reject_legacy_board_bindings,
    resources_nonempty,
    synthesize_stub_a2ui_messages,
    validate_app_a2ui_messages,
)

APP_ID_PREFIX = "oa-"
ID_HEX = 12


def new_app_id() -> str:
    return f"{APP_ID_PREFIX}{uuid.uuid4().hex[:ID_HEX]}"


def bindings_as_dict(bindings: AppBuilderBindings | dict[str, Any] | None) -> dict[str, Any]:
    if bindings is None:
        return {}
    if isinstance(bindings, AppBuilderBindings):
        raw = bindings.model_dump(exclude_none=True)
    else:
        raw = dict(bindings)
    reject_legacy_board_bindings(raw)
    return normalize_resources(raw)


def artifact_kind_of(app: AppBuilderApp) -> str:
    tid = (app.template_id or "a2ui").strip() or "a2ui"
    return tid if tid in ("a2ui", "module") else "a2ui"


async def resolve_bindings_snapshot(
    db: AsyncSession, bindings: dict[str, Any]
) -> tuple[dict[str, str], list[str]]:
    """Return resolved id map and list of missing resource keys."""
    resources = normalize_resources(bindings)
    resolved: dict[str, str] = {}
    missing: list[str] = []

    for name in resources.get("objectTypes") or []:
        ot = (await db.execute(select(ObjectType).where(ObjectType.name == name))).scalar_one_or_none()
        if not ot:
            ot = await db.get(ObjectType, name)
        if ot:
            resolved[f"objectTypes:{name}"] = ot.id
        else:
            missing.append(f"objectTypes:{name}")

    for api in resources.get("actions") or []:
        row = (
            await db.execute(select(OntologyActionType).where(OntologyActionType.api_name == str(api)))
        ).scalar_one_or_none()
        if row:
            resolved[f"actions:{api}"] = row.id
        else:
            missing.append(f"actions:{api}")

    for api in resources.get("functions") or []:
        row = (
            await db.execute(select(OntologyFunction).where(OntologyFunction.api_name == str(api)))
        ).scalar_one_or_none()
        if row:
            resolved[f"functions:{api}"] = row.id
        else:
            missing.append(f"functions:{api}")

    return resolved, missing


def compute_bindings_hash(resolved: dict[str, str]) -> str:
    blob = json.dumps(resolved, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


async def compute_live_bindings_hash(db: AsyncSession, bindings: dict[str, Any]) -> tuple[str | None, list[str]]:
    resolved, missing = await resolve_bindings_snapshot(db, bindings)
    if missing:
        return None, missing
    if not resolved:
        return None, ["resources"] if not resources_nonempty(bindings) else missing
    return compute_bindings_hash(resolved), missing


def to_response_base(app: AppBuilderApp, *, stale: bool = False, missing: list[str] | None = None) -> dict[str, Any]:
    kind = artifact_kind_of(app)
    return {
        "id": app.id,
        "name": app.name,
        "api_name": app.api_name,
        "description": app.description,
        "template_id": app.template_id,
        "artifact_kind": kind,
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


async def enrich_stale(db: AsyncSession, app: AppBuilderApp) -> tuple[bool, list[str]]:
    bindings = app.bindings or {}
    if not bindings:
        return False, []
    try:
        reject_legacy_board_bindings(bindings)
    except ValueError:
        return True, ["legacy_board_bindings"]
    live_hash, missing = await compute_live_bindings_hash(db, bindings)
    if missing:
        return True, missing
    if app.bindings_hash and live_hash and app.bindings_hash != live_hash:
        return True, []
    return False, []


async def get_app(db: AsyncSession, app_id: str) -> AppBuilderApp:
    app = await db.get(AppBuilderApp, app_id)
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    return app


async def list_apps(
    db: AsyncSession, *, status: str | None = None
) -> list[AppBuilderApp]:
    q = select(AppBuilderApp).order_by(AppBuilderApp.updated_at.desc())
    if status:
        q = q.where(AppBuilderApp.status == status)
    return list((await db.execute(q)).scalars().all())


async def create_app(
    db: AsyncSession,
    body: AppBuilderCreate,
    *,
    created_by: str | None,
    created_by_name: str | None,
) -> AppBuilderApp:
    exists = (
        await db.execute(select(AppBuilderApp.id).where(AppBuilderApp.api_name == body.api_name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="api_name already exists")

    template_id = (body.template_id or "a2ui").strip() or "a2ui"
    if template_id not in ("a2ui", "module"):
        raise HTTPException(status_code=400, detail="template_id must be a2ui or module")
    if template_id == "module":
        raise HTTPException(
            status_code=400,
            detail="artifact_kind module is reserved; only a2ui apps can be created in this release",
        )

    try:
        bindings = bindings_as_dict(body.bindings)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    bindings_hash: str | None = None
    if bindings:
        resolved, missing = await resolve_bindings_snapshot(db, bindings)
        if missing:
            raise HTTPException(
                status_code=400,
                detail={"message": "Missing or unknown resources", "missing_bindings": missing},
            )
        bindings_hash = compute_bindings_hash(resolved) if resolved else None

    messages = synthesize_stub_a2ui_messages(title=body.name)
    app = AppBuilderApp(
        id=new_app_id(),
        name=body.name,
        api_name=body.api_name,
        description=body.description,
        template_id=template_id,
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


async def update_app(db: AsyncSession, app: AppBuilderApp, body: AppBuilderUpdate) -> AppBuilderApp:
    if body.name is not None:
        app.name = body.name
    if body.description is not None:
        app.description = body.description
    if body.bindings is not None:
        try:
            bindings = bindings_as_dict(body.bindings)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        if bindings:
            resolved, missing = await resolve_bindings_snapshot(db, bindings)
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail={"message": "Missing or unknown resources", "missing_bindings": missing},
                )
            app.bindings = bindings
            app.bindings_hash = compute_bindings_hash(resolved) if resolved else None
        else:
            app.bindings = {}
            app.bindings_hash = None
    if body.draft_a2ui_messages is not None:
        try:
            validated = validate_app_a2ui_messages(
                body.draft_a2ui_messages, bindings=app.bindings or {}
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        app.draft_a2ui = pack_a2ui_document(validated)
    await db.commit()
    await db.refresh(app)
    return app


async def apply_bindings(
    db: AsyncSession,
    app: AppBuilderApp,
    bindings: dict[str, Any],
    *,
    synthesize: bool = False,
) -> AppBuilderApp:
    """Validate and store resources. Never synthesizes product UI (stub only if synthesize)."""
    try:
        cleaned = bindings_as_dict(bindings)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not cleaned:
        raise HTTPException(
            status_code=400,
            detail={"message": "resources must include objectTypes, actions, and/or functions"},
        )
    resolved, missing = await resolve_bindings_snapshot(db, cleaned)
    if missing:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Missing or unknown resources",
                "missing_bindings": missing,
            },
        )
    app.bindings = cleaned
    app.bindings_hash = compute_bindings_hash(resolved)
    if synthesize:
        app.draft_a2ui = pack_a2ui_document(synthesize_stub_a2ui_messages(title=app.name))
    await db.commit()
    await db.refresh(app)
    return app


async def synthesize_draft(db: AsyncSession, app: AppBuilderApp) -> AppBuilderApp:
    """Reset layout to stub. Clear legacy board bindings so the designer can set_resources cleanly."""
    bindings = app.bindings or {}
    try:
        reject_legacy_board_bindings(bindings)
    except ValueError:
        app.bindings = {}
        app.bindings_hash = None
    app.draft_a2ui = pack_a2ui_document(synthesize_stub_a2ui_messages(title=app.name))
    await db.commit()
    await db.refresh(app)
    return app


async def publish_app(
    db: AsyncSession,
    app: AppBuilderApp,
    *,
    a2ui_messages: list[dict[str, Any]] | None = None,
) -> AppBuilderApp:
    if artifact_kind_of(app) != "a2ui":
        raise HTTPException(status_code=400, detail="Only a2ui apps can be published in this release")
    bindings = normalize_resources(app.bindings or {})
    if not resources_nonempty(bindings):
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Cannot publish until resources are set",
                "missing_bindings": ["objectTypes|actions|functions"],
            },
        )
    resolved, missing = await resolve_bindings_snapshot(db, bindings)
    if missing:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Cannot publish until resources resolve",
                "missing_bindings": missing,
            },
        )
    try:
        if a2ui_messages is not None:
            messages = validate_app_a2ui_messages(a2ui_messages, bindings=bindings)
            app.draft_a2ui = pack_a2ui_document(messages)
        else:
            messages = normalize_stored_a2ui_document(app.draft_a2ui)
            if not messages:
                raise ValueError("Draft A2UI is empty — ask the designer to set the layout")
            messages = validate_app_a2ui_messages(messages, bindings=bindings)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    app.published_a2ui = pack_a2ui_document(messages)
    app.status = "published"
    app.bindings_hash = compute_bindings_hash(resolved)
    await db.commit()
    await db.refresh(app)
    return app


async def unpublish_app(db: AsyncSession, app: AppBuilderApp) -> AppBuilderApp:
    app.status = "draft"
    app.published_a2ui = None
    await db.commit()
    await db.refresh(app)
    return app


async def delete_app(db: AsyncSession, app: AppBuilderApp) -> None:
    from app.services.app_builder.session import delete_all_conversations_for_app

    await delete_all_conversations_for_app(db, app.id)
    await db.delete(app)
    await db.commit()


def _property_names(ot: ObjectType) -> list[str]:
    props = ot.properties or []
    names: list[str] = []
    if isinstance(props, list):
        for p in props:
            if isinstance(p, dict):
                n = p.get("name") or p.get("api_name") or p.get("id")
                if n:
                    names.append(str(n))
    return names[:40]


def _summarize_input_schema(schema: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(schema, dict):
        return None
    props = schema.get("properties") or {}
    required = schema.get("required") or []
    if not isinstance(props, dict):
        return None
    return {
        "required": required if isinstance(required, list) else [],
        "properties": {
            k: {"type": (v or {}).get("type") if isinstance(v, dict) else None}
            for k, v in list(props.items())[:24]
        },
    }


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
    ot_by_id = {o.id: o for o in ots}
    fn_by_id = {f.id: f for f in fns}

    action_rows: list[dict[str, Any]] = []
    for a in acts:
        schema_summary: dict[str, Any] | None = None
        if is_builtin_object_rule(a.rule_type):
            ot = ot_by_id.get(a.object_type_id)
            if ot:
                schema_summary = _summarize_input_schema(input_schema_for_action(a, ot))
        else:
            fn = fn_by_id.get(a.function_id) if a.function_id else None
            if fn and fn.published_version_id:
                ver = await db.get(OntologyFunctionVersion, fn.published_version_id)
                if ver and isinstance(ver.input_schema, dict):
                    schema_summary = _summarize_input_schema(ver.input_schema)
        ot_obj = ot_by_id.get(a.object_type_id)
        action_rows.append(
            {
                "api_name": a.api_name,
                "display_name": a.display_name,
                "object_type": (ot_obj.name if ot_obj else None) or a.object_type_id,
                "input_schema": schema_summary,
            }
        )

    return {
        "object_types": [
            {"name": o.name, "id": o.id, "properties": _property_names(o)} for o in ots
        ],
        "actions": action_rows,
        "functions": [{"api_name": f.api_name, "display_name": f.display_name} for f in fns],
        "catalog_primitives": [
            "OntoObjectList",
            "OntoActionButton",
            "OntoFunctionButton",
            "OntoObjectLink",
            "Column",
            "Row",
            "Text",
            "Card",
            "Button",
            "Modal",
            "TextField",
        ],
    }
