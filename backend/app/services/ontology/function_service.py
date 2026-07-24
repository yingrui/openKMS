"""Ontology function registry — CRUD, versions, publish, resolve."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ontology_function import (
    OntologyActionType,
    OntologyFunction,
    OntologyFunctionVersion,
)
from app.schemas.ontology_functions import (
    OntologyFunctionCreate,
    OntologyFunctionResponse,
    OntologyFunctionUpdate,
    OntologyFunctionValidateResponse,
    OntologyFunctionVersionCreate,
    OntologyFunctionVersionResponse,
)
from app.services.ontology.constants import FUNCTION_ID_PREFIX, ID_HEX_LENGTH, VERSION_ID_PREFIX
from app.services.ontology.function_templates import (
    DEFAULT_FUNCTION_SOURCE,
    extract_function_uses,
    validate_function_source,
)


def new_function_id() -> str:
    return f"{FUNCTION_ID_PREFIX}{uuid.uuid4().hex[:ID_HEX_LENGTH]}"


def new_version_id() -> str:
    return f"{VERSION_ID_PREFIX}{uuid.uuid4().hex[:ID_HEX_LENGTH]}"


def version_to_response(ver: OntologyFunctionVersion) -> OntologyFunctionVersionResponse:
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


async def get_function(db: AsyncSession, function_id: str) -> OntologyFunction:
    fn = (
        await db.execute(select(OntologyFunction).where(OntologyFunction.id == function_id))
    ).scalar_one_or_none()
    if not fn:
        raise HTTPException(status_code=404, detail="Function not found")
    return fn


async def get_function_by_api_name(db: AsyncSession, api_name: str) -> OntologyFunction:
    fn = (
        await db.execute(select(OntologyFunction).where(OntologyFunction.api_name == api_name))
    ).scalar_one_or_none()
    if not fn:
        raise HTTPException(status_code=404, detail="Function not found")
    return fn


async def latest_version(db: AsyncSession, function_id: str) -> OntologyFunctionVersion | None:
    return (
        await db.execute(
            select(OntologyFunctionVersion)
            .where(OntologyFunctionVersion.function_id == function_id)
            .order_by(OntologyFunctionVersion.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _version_summaries(
    db: AsyncSession, function_ids: list[str]
) -> tuple[dict[str, int], dict[str, int]]:
    """Return (latest_version_by_fn_id, published_version_num_by_fn_id)."""
    if not function_ids:
        return {}, {}

    rows = (
        await db.execute(
            select(OntologyFunctionVersion).where(OntologyFunctionVersion.function_id.in_(function_ids))
        )
    ).scalars().all()

    latest: dict[str, int] = {}
    for ver in rows:
        cur = latest.get(ver.function_id)
        if cur is None or ver.version > cur:
            latest[ver.function_id] = ver.version

    fns = (
        await db.execute(select(OntologyFunction).where(OntologyFunction.id.in_(function_ids)))
    ).scalars().all()
    pub_version_ids = [fn.published_version_id for fn in fns if fn.published_version_id]
    pub_by_fn: dict[str, int] = {}
    if pub_version_ids:
        pub_rows = (
            await db.execute(select(OntologyFunctionVersion).where(OntologyFunctionVersion.id.in_(pub_version_ids)))
        ).scalars().all()
        pub_id_to_num = {v.id: v.version for v in pub_rows}
        for fn in fns:
            if fn.published_version_id and fn.published_version_id in pub_id_to_num:
                pub_by_fn[fn.id] = pub_id_to_num[fn.published_version_id]

    return latest, pub_by_fn


def function_to_response(
    fn: OntologyFunction,
    *,
    latest_version_num: int | None,
    published_version_num: int | None,
) -> OntologyFunctionResponse:
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
        published_version=published_version_num,
        latest_version=latest_version_num,
        created_by=fn.created_by,
        created_by_name=fn.created_by_name,
        created_at=fn.created_at,
        updated_at=fn.updated_at,
    )


async def function_to_response_for_one(db: AsyncSession, fn: OntologyFunction) -> OntologyFunctionResponse:
    latest, pub = await _version_summaries(db, [fn.id])
    return function_to_response(
        fn,
        latest_version_num=latest.get(fn.id),
        published_version_num=pub.get(fn.id),
    )


async def list_functions(
    db: AsyncSession,
    *,
    limit: int,
    offset: int,
) -> tuple[list[OntologyFunctionResponse], int]:
    total = (await db.execute(select(func.count()).select_from(OntologyFunction))).scalar_one()
    rows = (
        await db.execute(
            select(OntologyFunction).order_by(OntologyFunction.api_name).offset(offset).limit(limit)
        )
    ).scalars().all()
    ids = [fn.id for fn in rows]
    latest, pub = await _version_summaries(db, ids)
    items = [
        function_to_response(fn, latest_version_num=latest.get(fn.id), published_version_num=pub.get(fn.id))
        for fn in rows
    ]
    return items, total


async def create_function(
    db: AsyncSession,
    body: OntologyFunctionCreate,
    *,
    created_by: str | None,
    created_by_name: str | None,
) -> OntologyFunction:
    exists = (
        await db.execute(select(OntologyFunction.id).where(OntologyFunction.api_name == body.api_name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="api_name already exists")

    source = body.source_code or DEFAULT_FUNCTION_SOURCE
    valid, errors, warnings = validate_function_source(source)
    fn_id = new_function_id()
    fn = OntologyFunction(
        id=fn_id,
        api_name=body.api_name,
        display_name=body.display_name,
        description=body.description,
        object_type_id=body.object_type_id,
        created_by=created_by,
        created_by_name=created_by_name,
    )
    db.add(fn)
    ver = OntologyFunctionVersion(
        id=new_version_id(),
        function_id=fn_id,
        version=1,
        source_code=source,
        input_schema=body.input_schema,
        output_schema=body.output_schema,
        validation_result={"valid": valid, "errors": errors, "warnings": warnings},
        created_by=created_by,
        created_by_name=created_by_name,
    )
    db.add(ver)
    await db.commit()
    await db.refresh(fn)
    return fn


async def update_function(db: AsyncSession, function_id: str, body: OntologyFunctionUpdate) -> OntologyFunction:
    fn = await get_function(db, function_id)
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
    return fn


async def delete_function(db: AsyncSession, function_id: str) -> None:
    fn = await get_function(db, function_id)
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


async def list_versions(db: AsyncSession, function_id: str) -> list[OntologyFunctionVersionResponse]:
    await get_function(db, function_id)
    rows = (
        await db.execute(
            select(OntologyFunctionVersion)
            .where(OntologyFunctionVersion.function_id == function_id)
            .order_by(OntologyFunctionVersion.version.desc())
        )
    ).scalars().all()
    return [version_to_response(v) for v in rows]


async def get_version(db: AsyncSession, function_id: str, version_id: str) -> OntologyFunctionVersionResponse:
    await get_function(db, function_id)
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
    return version_to_response(ver)


async def create_version(
    db: AsyncSession,
    function_id: str,
    body: OntologyFunctionVersionCreate,
    *,
    created_by: str | None,
    created_by_name: str | None,
) -> OntologyFunctionVersionResponse:
    await get_function(db, function_id)
    latest = await latest_version(db, function_id)
    next_ver = (latest.version + 1) if latest else 1
    valid, errors, warnings = validate_function_source(body.source_code)
    ver = OntologyFunctionVersion(
        id=new_version_id(),
        function_id=function_id,
        version=next_ver,
        source_code=body.source_code,
        input_schema=body.input_schema,
        output_schema=body.output_schema,
        validation_result={"valid": valid, "errors": errors, "warnings": warnings},
        created_by=created_by,
        created_by_name=created_by_name,
    )
    db.add(ver)
    await db.commit()
    await db.refresh(ver)
    return version_to_response(ver)


def validate_source(body: OntologyFunctionVersionCreate) -> OntologyFunctionValidateResponse:
    valid, errors, warnings = validate_function_source(body.source_code)
    return OntologyFunctionValidateResponse(valid=valid, errors=errors, warnings=warnings)


async def validate_uses_dependencies(
    db: AsyncSession,
    source_code: str,
    *,
    entrypoint: str = "execute",
    self_api_name: str | None = None,
) -> list[str]:
    """Ensure every declared uses= dependency is a published function (not self)."""
    errors: list[str] = []
    for dep in extract_function_uses(source_code, entrypoint=entrypoint):
        if self_api_name and dep == self_api_name:
            errors.append(f"uses cannot reference self: {dep}")
            continue
        other = (
            await db.execute(select(OntologyFunction).where(OntologyFunction.api_name == dep))
        ).scalar_one_or_none()
        if not other:
            errors.append(f"uses dependency not found: {dep}")
        elif not other.published_version_id:
            errors.append(f"uses dependency is not published: {dep}")
    return errors


async def publish_function(
    db: AsyncSession,
    function_id: str,
    *,
    version_id: str | None,
) -> OntologyFunction:
    fn = await get_function(db, function_id)
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
        ver = await latest_version(db, function_id)
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")
    valid, errors, _ = validate_function_source(ver.source_code, entrypoint=ver.entrypoint)
    if not valid:
        raise HTTPException(status_code=400, detail={"message": "Validation failed", "errors": errors})
    uses_errors = await validate_uses_dependencies(
        db,
        ver.source_code,
        entrypoint=ver.entrypoint,
        self_api_name=fn.api_name,
    )
    if uses_errors:
        raise HTTPException(status_code=400, detail={"message": "Validation failed", "errors": uses_errors})
    fn.published_version_id = ver.id
    fn.development_status = "active"
    await db.commit()
    await db.refresh(fn)
    try:
        from app.services.ontology.sdk_codegen import generate_ontology_sdk

        await generate_ontology_sdk(db)
    except Exception:  # noqa: BLE001 — publish succeeds even if SDK write fails
        import logging

        logging.getLogger(__name__).exception("Failed to regenerate openkms_ontology_sdk after publish")
    return fn


async def resolve_version_for_execute(
    db: AsyncSession,
    fn: OntologyFunction,
    *,
    version_id: str | None,
    use_published: bool,
) -> OntologyFunctionVersion:
    if use_published:
        if not fn.published_version_id:
            raise HTTPException(status_code=400, detail="No published version")
        ver = (
            await db.execute(
                select(OntologyFunctionVersion).where(OntologyFunctionVersion.id == fn.published_version_id)
            )
        ).scalar_one_or_none()
    elif version_id:
        ver = (
            await db.execute(
                select(OntologyFunctionVersion).where(
                    OntologyFunctionVersion.id == version_id,
                    OntologyFunctionVersion.function_id == fn.id,
                )
            )
        ).scalar_one_or_none()
    else:
        ver = await latest_version(db, fn.id)
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")
    return ver
