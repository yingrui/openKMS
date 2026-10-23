"""Ontology Action Types API."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.api.ontology.deps import jwt_user_from_request, require_caller_token, validate_api_name
from app.database import get_db
from app.models.external_service import ExternalService
from app.models.object_type import ObjectType
from app.models.ontology_function import OntologyActionLog, OntologyActionType
from app.schemas.ontology_functions import (
    OntologyActionExecuteRequest,
    OntologyActionExecuteResponse,
    OntologyActionLogResponse,
    OntologyActionTypeCreate,
    OntologyActionTypeResponse,
    OntologyActionTypeUpdate,
)
from app.services.ontology.constants import ACTION_TYPE_ID_PREFIX, ID_HEX_LENGTH
from app.services.ontology.action_rule_types import is_builtin_object_rule, normalize_rule_type
from app.services.ontology import action_webhook, execution_service
from app.services.ontology.function_external_usage import function_external_services
from app.services.ontology.builtin_action_service import input_schema_for_action
from app.services.ontology.input_schema import validate_input_against_schema
from app.services.ontology.object_neo4j_store import resolve_object_props_for_action
from app.services.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE

router = APIRouter(prefix="/ontology/action-types", tags=["ontology-action-types"], dependencies=[Depends(require_auth)])


async def _resolve_input_schema(db: AsyncSession, at: OntologyActionType) -> dict | None:
    if is_builtin_object_rule(at.rule_type):
        ot = await db.get(ObjectType, at.object_type_id)
        if not ot:
            return None
        return input_schema_for_action(at, ot)
    if not at.function_id:
        return None
    try:
        _, ver = await execution_service.resolve_published_version_for_function(
            db, at.function_id, pinned_version=at.function_version
        )
    except ValueError:
        return None
    return ver.input_schema if isinstance(ver.input_schema, dict) else None


WEBHOOK_METHODS = ("POST", "PUT", "PATCH", "DELETE", "GET")


def _validate_webhook_method(method: str | None) -> None:
    if method is None:
        return
    if method.upper() not in WEBHOOK_METHODS:
        raise HTTPException(
            status_code=400, detail=f"webhook_method must be one of {WEBHOOK_METHODS}"
        )


def _validate_webhook_body(mode: str | None) -> None:
    if mode is None:
        return
    if mode not in action_webhook.BODY_MODES:
        raise HTTPException(
            status_code=400, detail=f"webhook_body must be one of {action_webhook.BODY_MODES}"
        )


def _caller_name(request: Request) -> str | None:
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    name = payload.get("preferred_username") or payload.get("name")
    return str(name) if name else None


async def _webhook_service_name(db: AsyncSession, service_id: str | None) -> str | None:
    if not service_id:
        return None
    service = await db.get(ExternalService, service_id)
    return service.api_name if service else None


async def _validate_webhook(
    db: AsyncSession, *, service_id: str | None, path: str | None
) -> None:
    """A path without a service (or one outside its allowlist) is a webhook that never lands."""
    if not service_id and not path:
        return
    if not service_id:
        raise HTTPException(status_code=400, detail="webhook_path needs webhook_service_id")
    service = await db.get(ExternalService, service_id)
    if not service:
        raise HTTPException(status_code=400, detail="Unknown webhook service")
    if not path:
        return
    if not path.startswith("/") or "://" in path:
        raise HTTPException(status_code=400, detail="webhook_path must start with '/' and be relative")
    if not any(path.startswith(prefix) for prefix in (service.allowed_paths or [])):
        raise HTTPException(
            status_code=400,
            detail=f"webhook_path {path!r} is not in the service's allowed prefixes {service.allowed_paths}",
        )


async def _to_response(db: AsyncSession, at: OntologyActionType) -> OntologyActionTypeResponse:
    return OntologyActionTypeResponse(
        id=at.id,
        api_name=at.api_name,
        display_name=at.display_name,
        description=at.description,
        object_type_id=at.object_type_id,
        rule_type=at.rule_type,
        function_id=at.function_id,
        function_version=at.function_version,
        parameters=at.parameters,
        webhook_service_id=at.webhook_service_id,
        webhook_service_name=await _webhook_service_name(db, at.webhook_service_id),
        webhook_path=at.webhook_path,
        webhook_body=getattr(at, "webhook_body", None) or "envelope",
        webhook_method=getattr(at, "webhook_method", None) or "POST",
        function_external_services=(
            await function_external_services(db, at.function_id) if at.function_id else []
        ),
        status=at.status,
        created_at=at.created_at,
        updated_at=at.updated_at,
        input_schema=await _resolve_input_schema(db, at),
    )


async def _get_action_type(db: AsyncSession, action_type_id: str) -> OntologyActionType:
    at = (await db.execute(select(OntologyActionType).where(OntologyActionType.id == action_type_id))).scalar_one_or_none()
    if not at:
        raise HTTPException(status_code=404, detail="Action type not found")
    return at


def _validate_action_type_fields(
    *,
    rule_type: str,
    function_id: str | None,
) -> None:
    try:
        rt = normalize_rule_type(rule_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if is_builtin_object_rule(rt) and function_id:
        raise HTTPException(
            status_code=400,
            detail="Built-in object actions cannot bind a function",
        )


@router.get("", response_model=list[OntologyActionTypeResponse])
async def list_action_types(
    object_type_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    q = select(OntologyActionType).order_by(OntologyActionType.api_name)
    if object_type_id:
        q = q.where(OntologyActionType.object_type_id == object_type_id)
    rows = (await db.execute(q)).scalars().all()
    return [await _to_response(db, r) for r in rows]


@router.get("/{action_type_id}", response_model=OntologyActionTypeResponse)
async def get_action_type(
    action_type_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    return await _to_response(db, await _get_action_type(db, action_type_id))


@router.post("", response_model=OntologyActionTypeResponse, status_code=201)
async def create_action_type(
    body: OntologyActionTypeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    validate_api_name(body.api_name)
    _validate_action_type_fields(rule_type=body.rule_type, function_id=body.function_id)
    exists = (
        await db.execute(select(OntologyActionType.id).where(OntologyActionType.api_name == body.api_name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="api_name already exists")
    _validate_webhook_body(body.webhook_body)
    _validate_webhook_method(body.webhook_method)
    await _validate_webhook(
        db, service_id=body.webhook_service_id, path=body.webhook_path
    )
    uid, uname = jwt_user_from_request(request)
    at = OntologyActionType(
        id=f"{ACTION_TYPE_ID_PREFIX}{uuid.uuid4().hex[:ID_HEX_LENGTH]}",
        api_name=body.api_name,
        display_name=body.display_name,
        description=body.description,
        object_type_id=body.object_type_id,
        rule_type=body.rule_type,
        function_id=body.function_id,
        function_version=body.function_version,
        parameters=body.parameters,
        webhook_service_id=body.webhook_service_id,
        webhook_path=(body.webhook_path or "").strip() or None,
        webhook_body=body.webhook_body,
        webhook_method=body.webhook_method.upper(),
        created_by=uid,
        created_by_name=uname,
    )
    db.add(at)
    await db.commit()
    await db.refresh(at)
    return await _to_response(db, at)


@router.patch("/{action_type_id}", response_model=OntologyActionTypeResponse)
async def update_action_type(
    action_type_id: str,
    body: OntologyActionTypeUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    at = await _get_action_type(db, action_type_id)
    data = body.model_dump(exclude_unset=True)
    next_rule_type = data.get("rule_type", at.rule_type)
    if "function_id" in data:
        next_function_id = data["function_id"]
    elif "rule_type" in data and is_builtin_object_rule(data["rule_type"]):
        # Converting to built-in CRUD clears any prior Function binding.
        next_function_id = None
    else:
        next_function_id = at.function_id
    if "rule_type" in data or "function_id" in data:
        _validate_action_type_fields(rule_type=next_rule_type, function_id=next_function_id)
    if "webhook_body" in data:
        _validate_webhook_body(data["webhook_body"])
    if "webhook_method" in data and data["webhook_method"]:
        _validate_webhook_method(data["webhook_method"])
        data["webhook_method"] = data["webhook_method"].upper()
    if "webhook_service_id" in data or "webhook_path" in data:
        await _validate_webhook(
            db,
            service_id=data.get("webhook_service_id", at.webhook_service_id),
            path=data.get("webhook_path", at.webhook_path),
        )
    for field, val in data.items():
        setattr(at, field, val)
    if "rule_type" in data and is_builtin_object_rule(data["rule_type"]) and "function_id" not in data:
        at.function_id = None
        at.function_version = None
    await db.commit()
    await db.refresh(at)
    return await _to_response(db, at)


@router.delete("/{action_type_id}", status_code=204)
async def delete_action_type(
    action_type_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    at = await _get_action_type(db, action_type_id)
    await db.delete(at)
    await db.commit()


@router.post("/{action_type_id}/execute", response_model=OntologyActionExecuteResponse)
async def execute_action_type(
    action_type_id: str,
    body: OntologyActionExecuteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    at = await _get_action_type(db, action_type_id)
    if at.status != "active":
        raise HTTPException(status_code=400, detail="Action type is not active")

    input_payload = dict(body.input or {})
    object_id = body.object_id
    if object_id:
        ot = await db.get(ObjectType, at.object_type_id)
        if not ot:
            raise HTTPException(status_code=404, detail="Object type not found")
        resolved = await resolve_object_props_for_action(db, ot, object_id)
        if not resolved:
            raise HTTPException(status_code=404, detail="Object instance not found")
        canonical_id, props = resolved
        input_payload.setdefault("object_id", canonical_id)
        input_payload.setdefault("object", props)
        object_id = canonical_id

    uid, _ = jwt_user_from_request(request)

    if is_builtin_object_rule(at.rule_type):
        ot = await db.get(ObjectType, at.object_type_id)
        if not ot:
            raise HTTPException(status_code=404, detail="Object type not found")
        schema_errors = validate_input_against_schema(
            input_payload, input_schema_for_action(at, ot)
        )
        if schema_errors:
            raise HTTPException(status_code=400, detail="; ".join(schema_errors))
        return await execution_service.execute_builtin_action_and_audit(
            db,
            at,
            ot,
            input_payload=input_payload,
            object_id=object_id,
            caller_user_id=uid,
            caller_name=_caller_name(request),
        )

    if not at.function_id:
        raise HTTPException(status_code=400, detail="Action has no bound function")

    try:
        fn, ver = await execution_service.resolve_published_version_for_function(
            db, at.function_id, pinned_version=at.function_version
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return await execution_service.execute_action_and_audit(
        db,
        at,
        fn,
        ver,
        input_payload=input_payload,
        object_id=object_id,
        caller_user_id=uid,
        caller_token=require_caller_token(request),
        caller_name=_caller_name(request),
    )


@router.get("/{action_type_id}/logs", response_model=list[OntologyActionLogResponse])
async def list_action_logs(
    action_type_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
    limit: int = Query(50, ge=1, le=200),
):
    await _get_action_type(db, action_type_id)
    rows = (
        await db.execute(
            select(OntologyActionLog)
            .where(OntologyActionLog.action_type_id == action_type_id)
            .order_by(OntologyActionLog.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [
        OntologyActionLogResponse(
            id=r.id,
            action_type_id=r.action_type_id,
            object_id=r.object_id,
            caller_user_id=r.caller_user_id,
            status=r.status,
            input_payload=r.input_payload,
            output_payload=r.output_payload,
            error_message=r.error_message,
            webhook_ok=r.webhook_ok,
            webhook_status=r.webhook_status,
            webhook_error=r.webhook_error,
            created_at=r.created_at,
        )
        for r in rows
    ]
