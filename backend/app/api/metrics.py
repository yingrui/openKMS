"""Metrics API — model-level metric definitions, computation, and run audit.

Reads: `data:read`. Writes: `data:write`.
"""
from __future__ import annotations

import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.database import get_db
from app.models.dataset import Dataset
from app.models.metric_definition import MetricDefinition
from app.models.metric_run import MetricRun
from app.models.semantic_model import SemanticModel
from app.services.data_layer.semantic_models import member_ids
from app.schemas.metric import (
    MetricComputeResponse,
    MetricCreate,
    MetricListResponse,
    MetricResponse,
    MetricRunResponse,
    MetricUpdate,
)
from app.services.data_layer.expressions import normalize_expression
from app.services.data_layer.metrics import MetricError, validate_metric_definition
from app.services.data_layer.query import QueryError, run_query
from app.services.data_layer.semantic_model_fields import FieldError, validate_datatype
from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

router = APIRouter(prefix="/metrics", tags=["metrics"], dependencies=[Depends(require_auth)])
_VIEW = (PERM_DATA_READ,)


async def _name_map(db: AsyncSession, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    rows = (await db.execute(select(Dataset).where(Dataset.id.in_(ids)))).scalars().all()
    return {d.id: (d.display_name or f"{d.schema_name}.{d.table_name}") for d in rows}


def _metric_response(m: MetricDefinition, base_name: str | None) -> MetricResponse:
    return MetricResponse(
        id=m.id,
        semantic_model_id=m.semantic_model_id,
        base_dataset_id=m.base_dataset_id,
        base_dataset_name=base_name,
        name=m.name,
        business_definition=m.business_definition,
        type=m.type,
        expression=m.expression,
        datatype=m.datatype,
        filters=m.filters,
        joins=m.joins,
        ai_context=m.ai_context,
        created_by_name=m.created_by_name,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


async def _load_metric(db: AsyncSession, metric_id: str) -> MetricDefinition:
    m = await db.get(MetricDefinition, metric_id)
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    return m


async def _record_run(
    db: AsyncSession,
    metric_id: str,
    status: str,
    row_count: int,
    duration_ms: int,
    error: str | None,
    payload: dict,
) -> None:
    uname = payload.get("preferred_username") or payload.get("name")
    db.add(
        MetricRun(
            id=str(uuid.uuid4()),
            metric_id=metric_id,
            status=status,
            row_count=row_count,
            duration_ms=duration_ms,
            error=error,
            ran_by=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
            ran_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
        )
    )
    await db.commit()


@router.get(
    "",
    response_model=MetricListResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_metrics(
    semantic_model_id: str | None = None,
    base_dataset_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List metrics, scoped to a semantic model and/or anchored on a base dataset."""
    query = select(MetricDefinition).order_by(MetricDefinition.created_at.desc())
    if semantic_model_id:
        query = query.where(MetricDefinition.semantic_model_id == semantic_model_id)
    if base_dataset_id:
        query = query.where(MetricDefinition.base_dataset_id == base_dataset_id)
    rows = (await db.execute(query)).scalars().all()
    names = await _name_map(db, {m.base_dataset_id for m in rows})
    return MetricListResponse(
        items=[_metric_response(m, names.get(m.base_dataset_id)) for m in rows], total=len(rows)
    )


@router.post(
    "",
    response_model=MetricResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def create_metric(
    request: Request,
    body: MetricCreate,
    db: AsyncSession = Depends(get_db),
):
    base = await db.get(Dataset, body.base_dataset_id)
    if not base:
        raise HTTPException(status_code=400, detail="Base dataset not found")
    if not await db.get(SemanticModel, body.semantic_model_id):
        raise HTTPException(status_code=400, detail="Semantic model not found")
    if body.base_dataset_id not in set(await member_ids(db, body.semantic_model_id)):
        raise HTTPException(
            status_code=400, detail="The base dataset is not in this semantic model."
        )
    try:
        validate_metric_definition(name=body.name, type=body.type, expression=body.expression)
        validate_datatype(body.datatype)
    except (MetricError, FieldError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    p = request.state.openkms_jwt_payload
    uname = p.get("preferred_username") or p.get("name")
    metric = MetricDefinition(
        id=str(uuid.uuid4()),
        semantic_model_id=body.semantic_model_id,
        base_dataset_id=body.base_dataset_id,
        name=body.name.strip(),
        business_definition=body.business_definition,
        type=body.type,
        expression=normalize_expression(body.expression),
        datatype=body.datatype,
        filters=[f.model_dump() for f in body.filters] if body.filters else None,
        joins=body.joins,
        ai_context=body.ai_context,
        created_by=p.get("sub") if isinstance(p.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(metric)
    await db.commit()
    await db.refresh(metric)
    names = await _name_map(db, {metric.base_dataset_id})
    return _metric_response(metric, names.get(metric.base_dataset_id))


@router.get(
    "/{metric_id}",
    response_model=MetricResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def get_metric(metric_id: str, db: AsyncSession = Depends(get_db)):
    m = await _load_metric(db, metric_id)
    names = await _name_map(db, {m.base_dataset_id})
    return _metric_response(m, names.get(m.base_dataset_id))


@router.put(
    "/{metric_id}",
    response_model=MetricResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def update_metric(
    metric_id: str,
    body: MetricUpdate,
    db: AsyncSession = Depends(get_db),
):
    m = await _load_metric(db, metric_id)
    data = body.model_dump(exclude_unset=True)

    if "base_dataset_id" in data and not await db.get(Dataset, data["base_dataset_id"]):
        raise HTTPException(status_code=400, detail="Base dataset not found")
    new_model_id = data.get("semantic_model_id", m.semantic_model_id)
    new_base_id = data.get("base_dataset_id", m.base_dataset_id)
    if not await db.get(SemanticModel, new_model_id):
        raise HTTPException(status_code=400, detail="Semantic model not found")
    if new_base_id not in set(await member_ids(db, new_model_id)):
        raise HTTPException(
            status_code=400, detail="The base dataset is not in this semantic model."
        )
    try:
        validate_metric_definition(
            name=data.get("name", m.name),
            type=data.get("type", m.type),
            expression=data.get("expression", m.expression),
        )
        validate_datatype(data.get("datatype", m.datatype))
    except (MetricError, FieldError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if "filters" in data:
        data["filters"] = data["filters"] or None
    if "expression" in data:
        data["expression"] = normalize_expression(data["expression"])
    if "name" in data:
        data["name"] = data["name"].strip()
    for field in (
        "name",
        "semantic_model_id",
        "base_dataset_id",
        "business_definition",
        "type",
        "expression",
        "datatype",
        "filters",
        "joins",
        "ai_context",
    ):
        if field in data:
            setattr(m, field, data[field])
    await db.commit()
    await db.refresh(m)
    names = await _name_map(db, {m.base_dataset_id})
    return _metric_response(m, names.get(m.base_dataset_id))


@router.delete(
    "/{metric_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def delete_metric(metric_id: str, db: AsyncSession = Depends(get_db)):
    m = await _load_metric(db, metric_id)
    await db.delete(m)


@router.get(
    "/{metric_id}/compute",
    response_model=MetricComputeResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def compute_metric_endpoint(
    request: Request,
    metric_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Compute a metric read-only (statement timeout + row cap); records a run."""
    m = await _load_metric(db, metric_id)
    p = request.state.openkms_jwt_payload
    start = time.perf_counter()
    try:
        # One engine: a metric's value is a query with no grouping.
        sql, _columns, rows, _capped, _duration = await run_query(
            db, model_id=m.semantic_model_id, metric=m.id, limit=1
        )
        duration = int((time.perf_counter() - start) * 1000)
        await _record_run(db, m.id, "ok", len(rows), duration, None, p)
        return MetricComputeResponse(metric_id=m.id, rows=rows, duration_ms=duration, sql=sql)
    except (MetricError, QueryError) as exc:
        duration = int((time.perf_counter() - start) * 1000)
        await _record_run(db, m.id, "error", 0, duration, str(exc), p)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/{metric_id}/runs",
    response_model=list[MetricRunResponse],
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_metric_runs(metric_id: str, db: AsyncSession = Depends(get_db)):
    """Recent executions of a metric (audit)."""
    await _load_metric(db, metric_id)
    rows = (
        await db.execute(
            select(MetricRun)
            .where(MetricRun.metric_id == metric_id)
            .order_by(MetricRun.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return [
        MetricRunResponse(
            id=r.id,
            metric_id=r.metric_id,
            status=r.status,
            row_count=r.row_count,
            duration_ms=r.duration_ms,
            error=r.error,
            ran_by_name=r.ran_by_name,
            created_at=r.created_at,
        )
        for r in rows
    ]
