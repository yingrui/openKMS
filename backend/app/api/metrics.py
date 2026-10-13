"""Metrics API — declarative metric definitions + on-demand computation (nested under /datasets).

Reads: `console:datasets` or `ontology:read`. Writes: `console:datasets`.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.api.datasets import get_dataset_scoped, get_dataset_scoped_write
from app.database import get_db
from app.models.dataset import Dataset
from app.models.metric_definition import MetricDefinition
from app.schemas.metric import MetricComputeResponse, MetricCreate, MetricResponse, MetricUpdate
from app.services.data_layer.metrics import AGGREGATIONS, MetricError, compute_metric
from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

router = APIRouter(prefix="/datasets", tags=["metrics"], dependencies=[Depends(require_auth)])
_VIEW = (PERM_DATA_READ,)


def _metric_response(m: MetricDefinition) -> MetricResponse:
    return MetricResponse(
        id=m.id,
        dataset_id=m.dataset_id,
        name=m.name,
        business_definition=m.business_definition,
        aggregation=m.aggregation,
        column_name=m.column_name,
        filters=m.filters,
        joins=m.joins,
        dimensions=m.dimensions,
        created_by_name=m.created_by_name,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


async def _get_metric(db: AsyncSession, dataset_id: str, metric_id: str) -> MetricDefinition:
    m = await db.get(MetricDefinition, metric_id)
    if not m or m.dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Metric not found")
    return m


@router.get(
    "/{dataset_id}/metrics",
    response_model=list[MetricResponse],
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_metrics(
    dataset: Dataset = Depends(get_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(MetricDefinition)
            .where(MetricDefinition.dataset_id == dataset.id)
            .order_by(MetricDefinition.created_at.desc())
        )
    ).scalars().all()
    return [_metric_response(m) for m in rows]


@router.post(
    "/{dataset_id}/metrics",
    response_model=MetricResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def create_metric(
    request: Request,
    body: MetricCreate,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    if body.aggregation not in AGGREGATIONS:
        raise HTTPException(
            status_code=400, detail=f"aggregation must be one of: {', '.join(AGGREGATIONS)}"
        )
    payload = request.state.openkms_jwt_payload
    uname = payload.get("preferred_username") or payload.get("name")
    metric = MetricDefinition(
        id=str(uuid.uuid4()),
        dataset_id=dataset.id,
        name=body.name,
        business_definition=body.business_definition,
        aggregation=body.aggregation,
        column_name=body.column_name,
        filters=[f.model_dump() for f in body.filters] if body.filters else None,
        joins=body.joins,
        dimensions=body.dimensions,
        created_by=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(metric)
    await db.commit()
    await db.refresh(metric)
    return _metric_response(metric)


@router.put(
    "/{dataset_id}/metrics/{metric_id}",
    response_model=MetricResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def update_metric(
    metric_id: str,
    body: MetricUpdate,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    metric = await _get_metric(db, dataset.id, metric_id)
    data = body.model_dump(exclude_unset=True)
    if "aggregation" in data and data["aggregation"] not in AGGREGATIONS:
        raise HTTPException(
            status_code=400, detail=f"aggregation must be one of: {', '.join(AGGREGATIONS)}"
        )
    if "filters" in data:
        data["filters"] = data["filters"] or None
    for field in ("name", "business_definition", "aggregation", "column_name", "filters", "joins", "dimensions"):
        if field in data:
            setattr(metric, field, data[field])
    await db.commit()
    await db.refresh(metric)
    return _metric_response(metric)


@router.delete(
    "/{dataset_id}/metrics/{metric_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def delete_metric(
    metric_id: str,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    metric = await _get_metric(db, dataset.id, metric_id)
    await db.delete(metric)


@router.post(
    "/{dataset_id}/metrics/{metric_id}/compute",
    response_model=MetricComputeResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def compute_metric_endpoint(
    metric_id: str,
    dataset: Dataset = Depends(get_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    metric = await _get_metric(db, dataset.id, metric_id)
    try:
        rows = await compute_metric(db, metric)
    except MetricError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return MetricComputeResponse(metric_id=metric.id, rows=rows)
