"""Ontology Functions API — registry, versions, validate, publish, execute."""
from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth import require_any_permission, require_auth
from app.database import get_db
from app.models.ontology_function import (
    OntologyActionType,
    OntologyFunction,
    OntologyFunctionExecution,
    OntologyFunctionVersion,
)
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
from app.services.ontology.function_runtime import FunctionExecutionError, execute_in_ofs, new_execution_id
from app.services.ontology.function_templates import DEFAULT_FUNCTION_SOURCE, validate_function_source
from app.services.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE

router = APIRouter(
    prefix="/ontology/functions",
    tags=["ontology-functions"],
    dependencies=[Depends(require_auth)],
)

_API_NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*$")


def _user_from_request(request: Request) -> tuple[str | None, str | None]:
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    uid = payload.get("sub")
    name = payload.get("preferred_username") or payload.get("name")
    return uid, name


def _caller_token(request: Request) -> str:
    token = getattr(request.state, "openkms_auth_token", None)
    if not token:
        raise HTTPException(status_code=401, detail="Missing auth token for function execution")
    return token


async def _get_function(db: AsyncSession, function_id: str) -> OntologyFunction:
    fn = (
        await db.execute(select(OntologyFunction).where(OntologyFunction.id == function_id))
    ).scalar_one_or_none()
    if not fn:
        raise HTTPException(status_code=404, detail="Function not found")
    return fn


async def _latest_version(db: AsyncSession, function_id: str) -> OntologyFunctionVersion | None:
    return (
        await db.execute(
            select(OntologyFunctionVersion)
            .where(OntologyFunctionVersion.function_id == function_id)
            .order_by(OntologyFunctionVersion.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _to_response(db: AsyncSession, fn: OntologyFunction) -> OntologyFunctionResponse:
    latest = await _latest_version(db, fn.id)
    pub_ver: int | None = None
    if fn.published_version_id:
        pv = (
            await db.execute(
                select(OntologyFunctionVersion).where(OntologyFunctionVersion.id == fn.published_version_id)
            )
        ).scalar_one_or_none()
        if pv:
            pub_ver = pv.version
    return OntologyFunctionResponse(
        id=fn.id,
        api_name=fn.api_name,
        display_name=fn.display_name,
        description=fn.description,
        source=fn.source,
        object_type_id=fn.object_type_id,
        development_status=fn.development_status,
        status=fn.status,
        published_version_id=fn.published_version_id,
        published_version=pub_ver,
        latest_version=latest.version if latest else None,
        created_by=fn.created_by,
        created_by_name=fn.created_by_name,
        created_at=fn.created_at,
        updated_at=fn.updated_at,
    )


@router.get("", response_model=OntologyFunctionListResponse)
async def list_functions(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    total = (await db.execute(select(func.count()).select_from(OntologyFunction))).scalar_one()
    rows = (
        await db.execute(
            select(OntologyFunction).order_by(OntologyFunction.api_name).offset(offset).limit(limit)
        )
    ).scalars().all()
    items = [await _to_response(db, fn) for fn in rows]
    return OntologyFunctionListResponse(items=items, total=total)


@router.post("", response_model=OntologyFunctionResponse, status_code=201)
async def create_function(
    body: OntologyFunctionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    if not _API_NAME_RE.match(body.api_name):
        raise HTTPException(status_code=400, detail="api_name must be a valid identifier")
    exists = (
        await db.execute(select(OntologyFunction.id).where(OntologyFunction.api_name == body.api_name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="api_name already exists")

    uid, uname = _user_from_request(request)
    fn_id = f"fn-{uuid.uuid4().hex[:12]}"
    fn = OntologyFunction(
        id=fn_id,
        api_name=body.api_name,
        display_name=body.display_name,
        description=body.description,
        object_type_id=body.object_type_id,
        created_by=uid,
        created_by_name=uname,
    )
    db.add(fn)
    source = body.source_code or DEFAULT_FUNCTION_SOURCE
    ver_id = f"fnv-{uuid.uuid4().hex[:12]}"
    ver = OntologyFunctionVersion(
        id=ver_id,
        function_id=fn_id,
        version=1,
        source_code=source,
        input_schema=body.input_schema,
        output_schema=body.output_schema,
        created_by=uid,
        created_by_name=uname,
    )
    db.add(ver)
    await db.commit()
    await db.refresh(fn)
    return await _to_response(db, fn)


@router.get("/{function_id}", response_model=OntologyFunctionResponse)
async def get_function(
    function_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    return await _to_response(db, await _get_function(db, function_id))


@router.patch("/{function_id}", response_model=OntologyFunctionResponse)
async def update_function(
    function_id: str,
    body: OntologyFunctionUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    fn = await _get_function(db, function_id)
    if body.display_name is not None:
        fn.display_name = body.display_name
    if body.description is not None:
        fn.description = body.description
    if body.object_type_id is not None:
        fn.object_type_id = body.object_type_id or None
    if body.development_status is not None:
        fn.development_status = body.development_status
    if body.status is not None:
        fn.status = body.status
    await db.commit()
    await db.refresh(fn)
    return await _to_response(db, fn)


@router.delete("/{function_id}", status_code=204)
async def delete_function(
    function_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    fn = await _get_function(db, function_id)
    if fn.published_version_id:
        raise HTTPException(status_code=400, detail="Archive or unpublish before delete")
    bound = (
        await db.execute(
            select(func.count()).select_from(OntologyActionType).where(OntologyActionType.function_id == function_id)
        )
    ).scalar_one()
    if bound:
        raise HTTPException(status_code=400, detail="Function is referenced by actions")
    await db.delete(fn)
    await db.commit()


@router.get("/{function_id}/versions", response_model=list[OntologyFunctionVersionResponse])
async def list_versions(
    function_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    await _get_function(db, function_id)
    rows = (
        await db.execute(
            select(OntologyFunctionVersion)
            .where(OntologyFunctionVersion.function_id == function_id)
            .order_by(OntologyFunctionVersion.version.desc())
        )
    ).scalars().all()
    return [
        OntologyFunctionVersionResponse(
            id=v.id,
            function_id=v.function_id,
            version=v.version,
            source_code=v.source_code,
            input_schema=v.input_schema,
            output_schema=v.output_schema,
            entrypoint=v.entrypoint,
            runtime=v.runtime,
            validation_result=v.validation_result,
            created_by=v.created_by,
            created_by_name=v.created_by_name,
            created_at=v.created_at,
        )
        for v in rows
    ]


@router.get("/{function_id}/versions/{version_id}", response_model=OntologyFunctionVersionResponse)
async def get_version(
    function_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    await _get_function(db, function_id)
    ver = (
        await db.execute(
            select(OntologyFunctionVersion).where(
                OntologyFunctionVersion.id == version_id,
                OntologyFunctionVersion.function_id == function_id,
            )
        )
    ).scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")
    return OntologyFunctionVersionResponse(
        id=ver.id,
        function_id=ver.function_id,
        version=ver.version,
        source_code=ver.source_code,
        input_schema=ver.input_schema,
        output_schema=ver.output_schema,
        entrypoint=ver.entrypoint,
        runtime=ver.runtime,
        validation_result=ver.validation_result,
        created_by=ver.created_by,
        created_by_name=ver.created_by_name,
        created_at=ver.created_at,
    )


@router.post("/{function_id}/versions", response_model=OntologyFunctionVersionResponse, status_code=201)
async def create_version(
    function_id: str,
    body: OntologyFunctionVersionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    await _get_function(db, function_id)
    latest = await _latest_version(db, function_id)
    next_ver = (latest.version + 1) if latest else 1
    uid, uname = _user_from_request(request)
    valid, errors, warnings = validate_function_source(body.source_code)
    ver_id = f"fnv-{uuid.uuid4().hex[:12]}"
    ver = OntologyFunctionVersion(
        id=ver_id,
        function_id=function_id,
        version=next_ver,
        source_code=body.source_code,
        input_schema=body.input_schema,
        output_schema=body.output_schema,
        validation_result={"valid": valid, "errors": errors, "warnings": warnings},
        created_by=uid,
        created_by_name=uname,
    )
    db.add(ver)
    await db.commit()
    await db.refresh(ver)
    return OntologyFunctionVersionResponse(
        id=ver.id,
        function_id=ver.function_id,
        version=ver.version,
        source_code=ver.source_code,
        input_schema=ver.input_schema,
        output_schema=ver.output_schema,
        entrypoint=ver.entrypoint,
        runtime=ver.runtime,
        validation_result=ver.validation_result,
        created_by=ver.created_by,
        created_by_name=ver.created_by_name,
        created_at=ver.created_at,
    )


@router.post("/{function_id}/validate", response_model=OntologyFunctionValidateResponse)
async def validate_function(
    function_id: str,
    body: OntologyFunctionVersionCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    await _get_function(db, function_id)
    valid, errors, warnings = validate_function_source(body.source_code)
    return OntologyFunctionValidateResponse(valid=valid, errors=errors, warnings=warnings)


@router.post("/{function_id}/publish", response_model=OntologyFunctionResponse)
async def publish_function(
    function_id: str,
    version_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    fn = await _get_function(db, function_id)
    if version_id:
        ver = (
            await db.execute(
                select(OntologyFunctionVersion).where(
                    OntologyFunctionVersion.id == version_id,
                    OntologyFunctionVersion.function_id == function_id,
                )
            )
        ).scalar_one_or_none()
    else:
        ver = await _latest_version(db, function_id)
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")
    valid, errors, _ = validate_function_source(ver.source_code)
    if not valid:
        raise HTTPException(status_code=400, detail={"message": "Validation failed", "errors": errors})
    fn.published_version_id = ver.id
    fn.development_status = "active"
    await db.commit()
    await db.refresh(fn)
    return await _to_response(db, fn)


@router.post("/{function_id}/execute", response_model=OntologyFunctionExecuteResponse)
async def execute_function(
    function_id: str,
    body: OntologyFunctionExecuteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    fn = await _get_function(db, function_id)
    if body.use_published:
        if not fn.published_version_id:
            raise HTTPException(status_code=400, detail="No published version")
        ver = (
            await db.execute(
                select(OntologyFunctionVersion).where(OntologyFunctionVersion.id == fn.published_version_id)
            )
        ).scalar_one_or_none()
    elif body.version_id:
        ver = (
            await db.execute(
                select(OntologyFunctionVersion).where(
                    OntologyFunctionVersion.id == body.version_id,
                    OntologyFunctionVersion.function_id == function_id,
                )
            )
        ).scalar_one_or_none()
    else:
        ver = await _latest_version(db, function_id)
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")

    uid, _ = _user_from_request(request)
    exec_id = new_execution_id()
    try:
        output, err, duration_ms = await execute_in_ofs(
            source_code=ver.source_code,
            input_payload=body.input,
            api_name=fn.api_name,
            version=ver.version,
            caller_token=_caller_token(request),
        )
    except FunctionExecutionError as e:
        ex = OntologyFunctionExecution(
            id=exec_id,
            function_id=fn.id,
            version_id=ver.id,
            caller_user_id=uid,
            duration_ms=None,
            status="error",
            input_payload=body.input,
            error_message=str(e),
        )
        db.add(ex)
        await db.commit()
        return OntologyFunctionExecuteResponse(status="error", error=str(e), execution_id=exec_id)

    status = "ok" if err is None else "error"
    ex = OntologyFunctionExecution(
        id=exec_id,
        function_id=fn.id,
        version_id=ver.id,
        caller_user_id=uid,
        duration_ms=duration_ms,
        status=status,
        input_payload=body.input,
        output_payload=output if isinstance(output, dict) else {"result": output},
        error_message=err,
    )
    db.add(ex)
    await db.commit()
    return OntologyFunctionExecuteResponse(
        status=status,
        output=output if isinstance(output, dict) else {"result": output} if output is not None else None,
        error=err,
        duration_ms=duration_ms,
        execution_id=exec_id,
    )


@router.get("/{function_id}/executions", response_model=list[OntologyFunctionExecutionResponse])
async def list_executions(
    function_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
    limit: int = Query(50, ge=1, le=200),
):
    await _get_function(db, function_id)
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
    fn = (
        await db.execute(select(OntologyFunction).where(OntologyFunction.api_name == api_name))
    ).scalar_one_or_none()
    if not fn:
        raise HTTPException(status_code=404, detail="Function not found")
    exec_body = body.model_copy(update={"use_published": True})
    return await execute_function(fn.id, exec_body, request, db, None)  # type: ignore[arg-type]
