"""Ontology Action Types API."""
from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.database import get_db
from app.models.object_instance import ObjectInstance
from app.models.ontology_function import (
    OntologyActionLog,
    OntologyActionType,
    OntologyFunction,
    OntologyFunctionVersion,
)
from app.schemas.ontology_functions import (
    OntologyActionExecuteRequest,
    OntologyActionExecuteResponse,
    OntologyActionLogResponse,
    OntologyActionTypeCreate,
    OntologyActionTypeResponse,
    OntologyActionTypeUpdate,
)
from app.services.ontology.function_runtime import FunctionExecutionError, execute_in_ofs
from app.services.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE

router = APIRouter(prefix="/ontology/action-types", tags=["ontology-action-types"], dependencies=[Depends(require_auth)])

_API_NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*$")


def _to_response(at: OntologyActionType) -> OntologyActionTypeResponse:
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
        status=at.status,
        created_at=at.created_at,
        updated_at=at.updated_at,
    )


def _caller_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("access_token")


def _user_from_request(request: Request) -> tuple[str | None, str | None]:
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    return payload.get("sub"), payload.get("preferred_username") or payload.get("name")


async def _get_action_type(db: AsyncSession, action_type_id: str) -> OntologyActionType:
    at = (await db.execute(select(OntologyActionType).where(OntologyActionType.id == action_type_id))).scalar_one_or_none()
    if not at:
        raise HTTPException(status_code=404, detail="Action type not found")
    return at


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
    return [_to_response(r) for r in rows]


@router.get("/{action_type_id}", response_model=OntologyActionTypeResponse)
async def get_action_type(
    action_type_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    return _to_response(await _get_action_type(db, action_type_id))


@router.post("", response_model=OntologyActionTypeResponse, status_code=201)
async def create_action_type(
    body: OntologyActionTypeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    if not _API_NAME_RE.match(body.api_name):
        raise HTTPException(status_code=400, detail="api_name must be a valid identifier")
    exists = (
        await db.execute(select(OntologyActionType.id).where(OntologyActionType.api_name == body.api_name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="api_name already exists")
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    at = OntologyActionType(
        id=f"at-{uuid.uuid4().hex[:12]}",
        api_name=body.api_name,
        display_name=body.display_name,
        description=body.description,
        object_type_id=body.object_type_id,
        rule_type=body.rule_type,
        function_id=body.function_id,
        function_version=body.function_version,
        parameters=body.parameters,
        created_by=payload.get("sub"),
        created_by_name=payload.get("preferred_username") or payload.get("name"),
    )
    db.add(at)
    await db.commit()
    await db.refresh(at)
    return _to_response(at)


@router.patch("/{action_type_id}", response_model=OntologyActionTypeResponse)
async def update_action_type(
    action_type_id: str,
    body: OntologyActionTypeUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    at = await _get_action_type(db, action_type_id)
    for field in ("display_name", "description", "rule_type", "function_id", "function_version", "parameters", "status"):
        val = getattr(body, field)
        if val is not None:
            setattr(at, field, val)
    await db.commit()
    await db.refresh(at)
    return _to_response(at)


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
    if not at.function_id:
        raise HTTPException(status_code=400, detail="Action has no bound function")

    fn = (await db.execute(select(OntologyFunction).where(OntologyFunction.id == at.function_id))).scalar_one_or_none()
    if not fn or not fn.published_version_id:
        raise HTTPException(status_code=400, detail="Bound function has no published version")

    ver = (
        await db.execute(
            select(OntologyFunctionVersion).where(OntologyFunctionVersion.id == fn.published_version_id)
        )
    ).scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="Published function version not found")

    input_payload = dict(body.input or {})
    object_id = body.object_id
    if object_id:
        instance = await db.get(ObjectInstance, object_id)
        if not instance:
            raise HTTPException(status_code=404, detail="Object instance not found")
        if instance.object_type_id != at.object_type_id:
            raise HTTPException(status_code=400, detail="Object type does not match action")
        input_payload.setdefault("object_id", instance.id)
        input_payload.setdefault("object", instance.data or {})

    uid, _ = _user_from_request(request)
    log_id = f"al-{uuid.uuid4().hex[:12]}"
    try:
        output, err, duration_ms = await execute_in_ofs(
            source_code=ver.source_code,
            input_payload=input_payload,
            api_name=fn.api_name,
            version=ver.version,
            caller_token=_caller_token(request),
        )
    except FunctionExecutionError as e:
        log = OntologyActionLog(
            id=log_id,
            action_type_id=at.id,
            object_id=object_id,
            caller_user_id=uid,
            status="error",
            input_payload=input_payload,
            error_message=str(e),
        )
        db.add(log)
        await db.commit()
        return OntologyActionExecuteResponse(status="error", error=str(e), log_id=log_id)

    status = "ok" if err is None else "error"
    output_dict = output if isinstance(output, dict) else {"result": output} if output is not None else None
    log = OntologyActionLog(
        id=log_id,
        action_type_id=at.id,
        object_id=object_id,
        caller_user_id=uid,
        status=status,
        input_payload=input_payload,
        output_payload=output_dict,
        error_message=err,
    )
    db.add(log)
    await db.commit()
    return OntologyActionExecuteResponse(
        status=status,
        output=output_dict,
        error=err,
        duration_ms=duration_ms,
        log_id=log_id,
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
            created_at=r.created_at,
        )
        for r in rows
    ]
