"""Ontology Action Types API."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.api.ontology.deps import jwt_user_from_request, require_caller_token, validate_api_name
from app.database import get_db
from app.models.object_instance import ObjectInstance
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
from app.services.ontology import execution_service
from app.services.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE

router = APIRouter(prefix="/ontology/action-types", tags=["ontology-action-types"], dependencies=[Depends(require_auth)])


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
    validate_api_name(body.api_name)
    exists = (
        await db.execute(select(OntologyActionType.id).where(OntologyActionType.api_name == body.api_name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="api_name already exists")
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
        created_by=uid,
        created_by_name=uname,
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

    try:
        fn, ver = await execution_service.resolve_published_version_for_function(
            db, at.function_id, pinned_version=at.function_version
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

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

    uid, _ = jwt_user_from_request(request)
    return await execution_service.execute_action_and_audit(
        db,
        at,
        fn,
        ver,
        input_payload=input_payload,
        object_id=object_id,
        caller_user_id=uid,
        caller_token=require_caller_token(request),
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
