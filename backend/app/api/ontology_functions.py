"""Ontology Functions API — registry, versions, validate, publish, execute."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.api.ontology.deps import jwt_user_from_request, require_caller_token, validate_api_name
from app.database import get_db
from app.models.ontology_function import OntologyFunctionExecution
from app.schemas.ontology_functions import (
    OntologyFunctionCreate,
    OntologyFunctionExecuteRequest,
    OntologyFunctionExecuteResponse,
    OntologyFunctionExecutionResponse,
    OntologyFunctionListResponse,
    OntologyFunctionResponse,
    OntologyFunctionUpdate,
    OntologyFunctionValidateResponse,
    OntologyFunctionVersionCreate,
    OntologyFunctionVersionResponse,
)
from app.services.ontology.constants import CALL_DEPTH_HEADER, CALL_STACK_HEADER, MAX_FUNCTION_CALL_DEPTH
from app.services.ontology import execution_service, function_service
from app.services.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE

router = APIRouter(
    prefix="/ontology/functions",
    tags=["ontology-functions"],
    dependencies=[Depends(require_auth)],
)


def _call_depth(request: Request) -> int:
    raw = request.headers.get(CALL_DEPTH_HEADER, "0")
    try:
        return max(0, int(raw))
    except ValueError:
        return 0


def _call_stack(request: Request) -> list[str]:
    raw = request.headers.get(CALL_STACK_HEADER, "")
    if not raw.strip():
        return []
    return [part for part in raw.split(",") if part.strip()]


@router.get("", response_model=OntologyFunctionListResponse)
async def list_functions(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    items, total = await function_service.list_functions(db, limit=limit, offset=offset)
    return OntologyFunctionListResponse(items=items, total=total)


@router.post("", response_model=OntologyFunctionResponse, status_code=201)
async def create_function(
    body: OntologyFunctionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    validate_api_name(body.api_name)
    uid, uname = jwt_user_from_request(request)
    fn = await function_service.create_function(db, body, created_by=uid, created_by_name=uname)
    return await function_service.function_to_response_for_one(db, fn)


@router.get("/{function_id}", response_model=OntologyFunctionResponse)
async def get_function(
    function_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    fn = await function_service.get_function(db, function_id)
    return await function_service.function_to_response_for_one(db, fn)


@router.patch("/{function_id}", response_model=OntologyFunctionResponse)
async def update_function(
    function_id: str,
    body: OntologyFunctionUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    fn = await function_service.update_function(db, function_id, body)
    return await function_service.function_to_response_for_one(db, fn)


@router.delete("/{function_id}", status_code=204)
async def delete_function(
    function_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    await function_service.delete_function(db, function_id)


@router.get("/{function_id}/versions", response_model=list[OntologyFunctionVersionResponse])
async def list_versions(
    function_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    return await function_service.list_versions(db, function_id)


@router.get("/{function_id}/versions/{version_id}", response_model=OntologyFunctionVersionResponse)
async def get_version(
    function_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    return await function_service.get_version(db, function_id, version_id)


@router.post("/{function_id}/versions", response_model=OntologyFunctionVersionResponse, status_code=201)
async def create_version(
    function_id: str,
    body: OntologyFunctionVersionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    uid, uname = jwt_user_from_request(request)
    return await function_service.create_version(
        db, function_id, body, created_by=uid, created_by_name=uname
    )


@router.post("/{function_id}/validate", response_model=OntologyFunctionValidateResponse)
async def validate_function(
    function_id: str,
    body: OntologyFunctionVersionCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    await function_service.get_function(db, function_id)
    return function_service.validate_source(body)


@router.post("/{function_id}/publish", response_model=OntologyFunctionResponse)
async def publish_function(
    function_id: str,
    version_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    fn = await function_service.publish_function(db, function_id, version_id=version_id)
    return await function_service.function_to_response_for_one(db, fn)


@router.post("/{function_id}/execute", response_model=OntologyFunctionExecuteResponse)
async def execute_function(
    function_id: str,
    body: OntologyFunctionExecuteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    depth = _call_depth(request)
    if depth >= MAX_FUNCTION_CALL_DEPTH:
        raise HTTPException(status_code=400, detail="Function call depth exceeded")
    uid, _ = jwt_user_from_request(request)
    return await execution_service.execute_function_by_id(
        db,
        function_id,
        input_payload=body.input,
        version_id=body.version_id,
        use_published=body.use_published,
        caller_user_id=uid,
        caller_token=require_caller_token(request),
        call_depth=depth,
        call_stack=_call_stack(request),
    )


@router.get("/{function_id}/executions", response_model=list[OntologyFunctionExecutionResponse])
async def list_executions(
    function_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
    limit: int = Query(50, ge=1, le=200),
):
    await function_service.get_function(db, function_id)
    rows = (
        await db.execute(
            select(OntologyFunctionExecution)
            .where(OntologyFunctionExecution.function_id == function_id)
            .order_by(OntologyFunctionExecution.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [
        OntologyFunctionExecutionResponse(
            id=e.id,
            function_id=e.function_id,
            version_id=e.version_id,
            caller_user_id=e.caller_user_id,
            duration_ms=e.duration_ms,
            status=e.status,
            input_payload=e.input_payload,
            output_payload=e.output_payload,
            error_message=e.error_message,
            created_at=e.created_at,
        )
        for e in rows
    ]


@router.post("/by-api-name/{api_name}/execute", response_model=OntologyFunctionExecuteResponse)
async def execute_by_api_name(
    api_name: str,
    body: OntologyFunctionExecuteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    depth = _call_depth(request)
    if depth >= MAX_FUNCTION_CALL_DEPTH:
        raise HTTPException(status_code=400, detail="Function call depth exceeded")
    uid, _ = jwt_user_from_request(request)
    return await execution_service.execute_published_by_api_name(
        db,
        api_name,
        input_payload=body.input,
        caller_user_id=uid,
        caller_token=require_caller_token(request),
        call_depth=depth,
        call_stack=_call_stack(request),
    )
