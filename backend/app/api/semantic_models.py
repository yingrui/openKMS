"""Semantic models API — named scopes over the shared data layer.

Reads require `data:read`; writes require `data:write`.
"""
from __future__ import annotations

from typing import Any

import yaml
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_permission
from app.database import get_db
from app.models.semantic_model import ACCESS_PUBLIC, ACCESS_RESTRICTED, SemanticModel
from app.schemas.semantic_model import (
    QueryRequest,
    QueryResponse,
    SemanticModelCreate,
    SemanticModelDatasetRef,
    SemanticModelListResponse,
    SemanticModelResponse,
    SemanticModelUpdate,
    SqlLabRequest,
)
from app.api.catalog_scoped import require_model_access
from app.api.query_errors import query_failure_detail
from app.services.data_layer.catalog_access import resolve_catalog_scope
from app.services.data_layer.model_sql import run_model_sql
from app.services.data_layer.query import QueryError, run_query
from app.services.data_layer.semantic_model import (
    export_semantic_model,
    import_semantic_model,
)
from app.services.data_layer.semantic_models import (
    SemanticModelError,
    apply_update,
    create_semantic_model,
    dataset_refs,
    member_ids,
    members_map,
)
from app.services.identity.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

# Read/query routes are restricted by the **data resource grant** (`require_model_access`), not by
# an operation key: `data:read` is "may use the Data Model feature", which is a different
# question from "may read this slice". See docs/features/catalog-data-access.md.
router = APIRouter(prefix="/semantic-models", tags=["semantic-models"])


def _access_mode(model: SemanticModel) -> str:
    """The API value for a stored access mode: anything unrecognised reads as `public`.

    One mapping instead of the same ternary at every response site — a second copy is how the
    default silently differs between the detail and the list endpoint.
    """
    return ACCESS_RESTRICTED if model.is_restricted else ACCESS_PUBLIC


async def _response(db: AsyncSession, model: SemanticModel) -> SemanticModelResponse:
    ids = await member_ids(db, model.id)
    refs = await dataset_refs(db, ids)
    return SemanticModelResponse(
        id=model.id,
        name=model.name,
        description=model.description,
        dataset_ids=ids,
        datasets=[
            SemanticModelDatasetRef(id=i, name=refs.get(i, i)) for i in ids
        ],
        ai_context=model.ai_context,
        access_mode=_access_mode(model),
        created_by_name=model.created_by_name,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


async def _load(db: AsyncSession, model_id: str) -> SemanticModel:
    model = await db.get(SemanticModel, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Semantic model not found")
    return model


@router.get(
    "",
    response_model=SemanticModelListResponse,
    dependencies=[Depends(require_any_permission(PERM_DATA_READ))],
)
async def list_semantic_models(db: AsyncSession = Depends(get_db)):
    models = (
        await db.execute(select(SemanticModel).order_by(SemanticModel.created_at))
    ).scalars().all()
    members = await members_map(db, [m.id for m in models])
    all_ids = {i for ids in members.values() for i in ids}
    refs = await dataset_refs(db, list(all_ids))
    return SemanticModelListResponse(
        items=[
            SemanticModelResponse(
                id=m.id,
                name=m.name,
                description=m.description,
                dataset_ids=members.get(m.id, []),
                datasets=[
                    SemanticModelDatasetRef(id=i, name=refs.get(i, i))
                    for i in members.get(m.id, [])
                ],
                ai_context=m.ai_context,
                access_mode=_access_mode(m),
                created_by_name=m.created_by_name,
                created_at=m.created_at,
                updated_at=m.updated_at,
            )
            for m in models
        ],
        total=len(models),
    )


@router.post(
    "",
    response_model=SemanticModelResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def create_semantic_model_endpoint(
    request: Request,
    body: SemanticModelCreate,
    db: AsyncSession = Depends(get_db),
):
    p = request.state.openkms_jwt_payload
    uname = p.get("preferred_username") or p.get("name")
    try:
        model = await create_semantic_model(
            db,
            name=body.name,
            description=body.description,
            dataset_ids=body.dataset_ids,
            ai_context=body.ai_context,
            sub=p.get("sub") if isinstance(p.get("sub"), str) else None,
            uname=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
        )
        if body.access_mode:
            model.access_mode = body.access_mode
            await db.commit()
            await db.refresh(model)
    except SemanticModelError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await _response(db, model)


@router.get(
    "/{model_id}",
    response_model=SemanticModelResponse,
    dependencies=[Depends(require_model_access())],
)
async def get_semantic_model_endpoint(model_id: str, db: AsyncSession = Depends(get_db)):
    return await _response(db, await _load(db, model_id))


@router.put(
    "/{model_id}",
    response_model=SemanticModelResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def update_semantic_model_endpoint(
    model_id: str,
    body: SemanticModelUpdate,
    db: AsyncSession = Depends(get_db),
):
    model = await _load(db, model_id)
    data = body.model_dump(exclude_unset=True)
    access_mode = data.pop("access_mode", None)
    try:
        await apply_update(db, model, data)
    except SemanticModelError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if access_mode:
        model.access_mode = access_mode
        await db.commit()
        await db.refresh(model)
    return await _response(db, model)


@router.delete(
    "/{model_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def delete_semantic_model_endpoint(model_id: str, db: AsyncSession = Depends(get_db)):
    model = await _load(db, model_id)
    await db.delete(model)


@router.get(
    "/{model_id}/export",
    dependencies=[Depends(require_model_access())],
)
async def export_semantic_model_endpoint(
    model_id: str,
    fmt: str = Query("json", alias="format", pattern="^(json|yaml)$"),
    db: AsyncSession = Depends(get_db),
):
    """Export one semantic model as an Ossie document (`?format=json|yaml`)."""
    model = await _load(db, model_id)
    doc = await export_semantic_model(db, model)
    if fmt == "yaml":
        return Response(
            content=yaml.safe_dump(doc, sort_keys=False, allow_unicode=True),
            media_type="application/yaml",
        )
    return doc


@router.post("/import", dependencies=[Depends(require_permission(PERM_DATA_WRITE))])
async def import_semantic_model_endpoint(body: dict[str, Any], db: AsyncSession = Depends(get_db)):
    """Upsert a semantic model (and its metrics/queries) from an Ossie document."""
    if not isinstance(body, dict) or not (
        "datasets" in body or "metrics" in body or "name" in body
    ):
        raise HTTPException(status_code=400, detail="Invalid semantic model document.")
    return await import_semantic_model(db, body)


def _query_needs_audit(body: QueryRequest) -> bool:
    """Temporary expression / where / having must leave a run row; saved-metric-only Playground may skip."""
    if body.expression is not None and (
        (isinstance(body.expression, str) and body.expression.strip())
        or (isinstance(body.expression, dict) and body.expression)
    ):
        return True
    if body.where and str(body.where).strip():
        return True
    if body.having and str(body.having).strip():
        return True
    return False


@router.post(
    "/{model_id}/query",
    response_model=QueryResponse,
    dependencies=[Depends(require_model_access())],
)
async def query_semantic_model(
    model_id: str,
    body: QueryRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Answer one ad-hoc question of this model — read-only, capped and audited."""
    import uuid

    from app.models.semantic_model_query_run import SemanticModelQueryRun

    model = await _load(db, model_id)
    members = set(await member_ids(db, model_id))
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    sub = payload.get("sub") if isinstance(payload.get("sub"), str) else None
    scope = await resolve_catalog_scope(
        db,
        payload=payload,
        sub=sub,
        model=model,
        resource_id=body.resource_id,
    )
    uname = payload.get("preferred_username") or payload.get("name")
    audit = _query_needs_audit(body)
    request_summary = body.model_dump(exclude_none=True)
    try:
        sql, columns, rows, capped, duration = await run_query(
            db,
            model_id=model_id,
            metric=body.metric,
            expression=body.expression,
            base_dataset_id=body.base_dataset,
            joins=body.joins,
            group_by=[g.model_dump() for g in body.group_by],
            filters=[f.model_dump() for f in body.filters],
            where=body.where,
            having=body.having,
            order_by=[o.model_dump() for o in body.order_by],
            limit=body.limit,
            member_dataset_ids=members,
            entity_scope=scope.entity_scope,
        )
    except QueryError as exc:
        if audit:
            db.add(
                SemanticModelQueryRun(
                    id=str(uuid.uuid4()),
                    semantic_model_id=model_id,
                    data_resource_id=scope.resource_id,
                    status="error",
                    request=request_summary,
                    sql=None,
                    row_count=0,
                    duration_ms=0,
                    error=str(exc),
                    ran_by=sub,
                    ran_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
                )
            )
            await db.commit()
        raise HTTPException(status_code=400, detail=query_failure_detail(request, exc.failure)) from exc

    run_id: str | None = None
    if audit:
        run_id = str(uuid.uuid4())
        db.add(
            SemanticModelQueryRun(
                id=run_id,
                semantic_model_id=model_id,
                data_resource_id=scope.resource_id,
                status="ok",
                request=request_summary,
                sql=sql,
                row_count=len(rows),
                duration_ms=duration,
                error=None,
                ran_by=sub,
                ran_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
            )
        )
        await db.commit()

    return QueryResponse(
        sql=sql,
        columns=columns,
        rows=rows,
        row_count=len(rows),
        capped=capped,
        duration_ms=duration,
        run_id=run_id,
    )


@router.post(
    "/{model_id}/sql",
    response_model=QueryResponse,
    dependencies=[Depends(require_model_access())],
)
async def sql_lab_semantic_model(
    model_id: str,
    body: SqlLabRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Run one read-only SELECT against this model's tables (SQL Lab)."""
    import uuid

    from app.models.semantic_model_query_run import SemanticModelQueryRun

    model = await _load(db, model_id)
    members = set(await member_ids(db, model_id))
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    sub = payload.get("sub") if isinstance(payload.get("sub"), str) else None
    scope = await resolve_catalog_scope(
        db,
        payload=payload,
        sub=sub,
        model=model,
        resource_id=body.resource_id,
    )
    uname = payload.get("preferred_username") or payload.get("name")
    request_summary = {"mode": "sql", **body.model_dump(exclude_none=True)}
    try:
        sql, columns, rows, capped, duration = await run_model_sql(
            db,
            model_id=model_id,
            sql=body.sql,
            limit=body.limit,
            member_dataset_ids=members,
            entity_scope=scope.entity_scope,
        )
    except QueryError as exc:
        db.add(
            SemanticModelQueryRun(
                id=str(uuid.uuid4()),
                semantic_model_id=model_id,
                data_resource_id=scope.resource_id,
                status="error",
                request=request_summary,
                sql=None,
                row_count=0,
                duration_ms=0,
                error=str(exc),
                ran_by=sub,
                ran_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
            )
        )
        await db.commit()
        raise HTTPException(status_code=400, detail=query_failure_detail(request, exc.failure)) from exc

    run_id = str(uuid.uuid4())
    db.add(
        SemanticModelQueryRun(
            id=run_id,
            semantic_model_id=model_id,
            data_resource_id=scope.resource_id,
            status="ok",
            request=request_summary,
            sql=sql,
            row_count=len(rows),
            duration_ms=duration,
            error=None,
            ran_by=sub,
            ran_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
        )
    )
    await db.commit()

    return QueryResponse(
        sql=sql,
        columns=columns,
        rows=rows,
        row_count=len(rows),
        capped=capped,
        duration_ms=duration,
        run_id=run_id,
    )
