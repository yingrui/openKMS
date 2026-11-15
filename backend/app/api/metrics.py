"""Metrics API — model-level metric definitions, computation, and run audit.

Reads: `data:read`. Writes: `data:write`.
"""
from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.database import get_db
from app.models.dataset import Dataset
from app.models.metric_definition import MetricDefinition
from app.models.metric_rule import MetricRule
from app.models.metric_run import MetricRun
from app.models.semantic_model import SemanticModel
from app.models.semantic_model_field import SemanticModelField
from app.services.data.semantic_models import member_ids
from app.schemas.metric import (
    RuleRefOut,
    MetricComputeResponse,
    MetricCreate,
    MetricListResponse,
    MetricResponse,
    MetricRunResponse,
    MetricUpdate,
)
from app.services.data.expressions import normalize_expression
from app.services.data.metric_graph import assertions_by_metric, build_graph
from app.services.data.metric_refs import MetricRefError, expand, metric_references
from app.services.data.metrics import (
    MetricError,
    metric_expression_sql,
    resolve_joins,
    validate_ai_context,
    validate_metric_definition,
    validate_metric_filters,
)
from app.api.catalog_scoped import require_metric_access, readable_model_ids
from app.services.ontology.rules.refs import metrics_with_rules, rules_for_metric
from app.services.ontology.rules.relations import list_relation_rules
from app.api.query_errors import query_failure_detail
from app.services.data.query_errors import DEFINITION, QueryFailure
from app.services.data.query import QueryError, run_query
from app.services.data.semantic_model_fields import (
    FieldError,
    resolve_is_time,
    validate_datatype,
)
from app.services.identity.permissions.permission_catalog import PERM_DATA_WRITE
from app.services.platform.dataset_label import dataset_label

router = APIRouter(prefix="/metrics", tags=["metrics"])


async def _name_map(db: AsyncSession, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    rows = (await db.execute(select(Dataset).where(Dataset.id.in_(ids)))).scalars().all()
    return {d.id: dataset_label(d) for d in rows}


TIME_MODES = ("period", "snapshot", "none")


def _validate_time_mode(mode: str | None, dimension: str | None) -> None:
    """`period` names a **time dimension**; `snapshot`/`none` must not claim one.

    Ossie has no metric period. What it has is a *field* whose `dimension.is_time` resolves true, and grain
    is a consumption-time choice. So `time_dimension` is the field a run's period filters on — it must exist
    in the model *and* be a time dimension, otherwise "this period" would silently filter on a status code.
    """
    resolved = str(mode or "none")
    if resolved not in TIME_MODES:
        raise HTTPException(status_code=400, detail=f"time_mode must be one of: {', '.join(TIME_MODES)}.")
    if resolved != "period":
        return
    name = (dimension or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="time_mode 'period' needs a time_dimension.")
    # Checked against the model's fields below (it needs the metric), see `_validate_time_dimension`.


async def _validate_time_dimension(
    db: AsyncSession, semantic_model_id: str, dimension: str | None
) -> None:
    name = (dimension or "").strip()
    if not name:
        return
    field = (
        await db.execute(
            select(SemanticModelField).where(
                SemanticModelField.semantic_model_id == semantic_model_id,
                SemanticModelField.name == name,
            )
        )
    ).scalars().first()
    if field is None:
        raise HTTPException(
            status_code=400,
            detail=f"time_dimension '{name}' is not a field of this metric's model.",
        )
    if not resolve_is_time(field.dimension, field.datatype):
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{name}' is not a time dimension — mark the field `dimension.is_time` (or give it a "
                "temporal datatype) before using it as the period column."
            ),
        )


def _depends_on(m: MetricDefinition, model_metrics: list[MetricDefinition]) -> list[dict]:
    """The metrics this one names in its expression — read from the SQL, not a second field."""
    sql = metric_expression_sql(m.expression)
    peers = [x for x in model_metrics if x.semantic_model_id == m.semantic_model_id]
    index = {x.name: x for x in peers}
    index.update({x.id: x for x in peers})
    out: list[dict] = []
    for ref in metric_references(sql if isinstance(sql, str) else None):
        hit = index.get(ref)
        if hit and hit.id != m.id:
            out.append({"id": hit.id, "name": hit.name})
    return out


def _metric_response(
    m: MetricDefinition,
    base_name: str | None,
    model_metrics: list[MetricDefinition] | None = None,
    assertions: dict[str, list[dict]] | None = None,
) -> MetricResponse:
    return MetricResponse(
        id=m.id,
        semantic_model_id=m.semantic_model_id,
        base_dataset_id=m.base_dataset_id,
        base_dataset_name=base_name,
        name=m.name,
        business_definition=m.business_definition,
        additivity=m.additivity,
        time_mode=m.time_mode,
        time_dimension=m.time_dimension,
        depends_on=_depends_on(m, model_metrics or []),
        assertions=(assertions or {}).get(m.id, []),
        expression=m.expression,
        datatype=m.datatype,
        filters=m.filters,
        joins=m.joins,
        ai_context=m.ai_context,
        created_by_name=m.created_by_name,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


async def _validate_refs(
    db: AsyncSession,
    model_id: str,
    payload: Any,
    *,
    metric_id: str | None,
    current: MetricDefinition | None = None,
) -> None:
    """Expand the expression against the model's metrics as they will be after this save."""
    data = payload if isinstance(payload, dict) else payload.model_dump()
    expression = data.get("expression", current.expression if current else None)
    sql = metric_expression_sql(expression)
    if not isinstance(sql, str) or not metric_references(sql):
        return
    peers = [
        m
        for m in (
            await db.execute(
                select(MetricDefinition).where(MetricDefinition.semantic_model_id == model_id)
            )
        ).scalars().all()
        if m.id != metric_id
    ]
    candidate = MetricDefinition(
        id=metric_id or "new",
        semantic_model_id=model_id,
        base_dataset_id=data.get("base_dataset_id", current.base_dataset_id if current else ""),
        name=str(data.get("name", current.name if current else "")).strip(),
        expression=expression,
    )
    expand(
        sql,
        [*peers, candidate],
        base_dataset_id=candidate.base_dataset_id,
        joins=data.get("joins", current.joins if current else None),
    )


async def _rule_rows(db: AsyncSession, rule_ids: list[str]) -> list[MetricRule]:
    if not rule_ids:
        return []
    return list(
        (await db.execute(select(MetricRule).where(MetricRule.id.in_(rule_ids)))).scalars().all()
    )


async def _metric_assertions(
    db: AsyncSession, peers: list[MetricDefinition]
) -> dict[str, list[dict]]:
    """The identities each metric takes part in — same source as the graph view, shaped for a consumer."""
    if not peers:
        return {}
    rules = await list_relation_rules(db, [m.id for m in peers])
    return assertions_by_metric(build_graph(peers, rules))


async def _peers(db: AsyncSession, m: MetricDefinition) -> list[MetricDefinition]:
    """A metric's siblings — the names its `{{references}}` may resolve to."""
    return list(
        (
            await db.execute(
                select(MetricDefinition).where(
                    MetricDefinition.semantic_model_id == m.semantic_model_id
                )
            )
        ).scalars().all()
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


@router.get("", response_model=MetricListResponse)
async def list_metrics(
    request: Request,
    semantic_model_id: str | None = None,
    base_dataset_id: str | None = None,
    coverage: str | None = Query(None, pattern="^(covered|uncovered)$"),
    db: AsyncSession = Depends(get_db),
):
    """List metrics, scoped to a semantic model and/or anchored on a base dataset.

    Scoped by **model sharing** only: a restricted model's metrics are part of its definition, so
    they are listed to anyone who may open the model. Reading the *rows* still needs a data
    resource grant, which the data plane enforces per call.
    """
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    sub = payload.get("sub") if isinstance(payload.get("sub"), str) else None
    readable = await readable_model_ids(db, payload=payload, sub=sub)
    if semantic_model_id and semantic_model_id not in readable:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "MODEL_FORBIDDEN",
                "message": "You do not have access to this semantic model.",
            },
        )
    query = select(MetricDefinition).order_by(MetricDefinition.created_at.desc())
    if semantic_model_id:
        query = query.where(MetricDefinition.semantic_model_id == semantic_model_id)
    else:
        query = query.where(MetricDefinition.semantic_model_id.in_(readable or {""}))
    if base_dataset_id:
        query = query.where(MetricDefinition.base_dataset_id == base_dataset_id)
    rows = (await db.execute(query)).scalars().all()
    if coverage:
        # Coverage is a definition-side fact: a metric is covered when some rule references it.
        covered = await metrics_with_rules(db)
        rows = [m for m in rows if (m.id in covered) == (coverage == "covered")]
    names = await _name_map(db, {m.base_dataset_id for m in rows})
    assertions = await _metric_assertions(db, rows)
    return MetricListResponse(
        # `depends_on` and the assertions need the model's other metrics and its rules, so both are
        # resolved once for the whole list instead of per row.
        items=[
            _metric_response(m, names.get(m.base_dataset_id), rows, assertions)
            for m in rows
        ],
        total=len(rows),
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
    members = set(await member_ids(db, body.semantic_model_id))
    if body.base_dataset_id not in members:
        raise HTTPException(
            status_code=400, detail="The base dataset is not in this semantic model."
        )
    try:
        validate_metric_definition(
            name=body.name, additivity=body.additivity, expression=body.expression
        )
        validate_datatype(body.datatype)
        _validate_time_mode(body.time_mode, body.time_dimension)
        await _validate_time_dimension(db, body.semantic_model_id, body.time_dimension)
        body.ai_context = validate_ai_context(body.ai_context)
        cleaned_filters = validate_metric_filters(
            [f.model_dump() for f in body.filters] if body.filters else None
        )
        await resolve_joins(db, base, body.joins, member_dataset_ids=members)
        await _validate_refs(db, body.semantic_model_id, body, metric_id=None)
    except (MetricError, FieldError, MetricRefError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    p = request.state.openkms_jwt_payload
    uname = p.get("preferred_username") or p.get("name")
    metric = MetricDefinition(
        id=str(uuid.uuid4()),
        semantic_model_id=body.semantic_model_id,
        base_dataset_id=body.base_dataset_id,
        name=body.name.strip(),
        business_definition=body.business_definition,
        additivity=body.additivity,
        time_mode=body.time_mode,
        time_dimension=(body.time_dimension or "").strip() or None,
        expression=normalize_expression(body.expression),
        datatype=body.datatype,
        filters=cleaned_filters or None,
        joins=body.joins,
        ai_context=body.ai_context,
        created_by=p.get("sub") if isinstance(p.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(metric)
    await db.commit()
    await db.refresh(metric)
    names = await _name_map(db, {metric.base_dataset_id})
    peers = await _peers(db, metric)
    return _metric_response(
        metric, names.get(metric.base_dataset_id), peers, await _metric_assertions(db, peers)
    )


@router.get(
    "/{metric_id}",
    response_model=MetricResponse,
    dependencies=[Depends(require_metric_access)],
)
async def get_metric(metric_id: str, db: AsyncSession = Depends(get_db)):
    m = await _load_metric(db, metric_id)
    names = await _name_map(db, {m.base_dataset_id})
    peers = await _peers(db, m)
    return _metric_response(m, names.get(m.base_dataset_id), peers, await _metric_assertions(db, peers))


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
    members = set(await member_ids(db, new_model_id))
    if new_base_id not in members:
        raise HTTPException(
            status_code=400, detail="The base dataset is not in this semantic model."
        )
    base = await db.get(Dataset, new_base_id)
    if not base:
        raise HTTPException(status_code=400, detail="Base dataset not found")
    try:
        validate_metric_definition(
            name=data.get("name", m.name),
            additivity=data.get("additivity", m.additivity),
            expression=data.get("expression", m.expression),
        )
        validate_datatype(data.get("datatype", m.datatype))
        _validate_time_mode(
            data.get("time_mode", m.time_mode), data.get("time_dimension", m.time_dimension)
        )
        await _validate_time_dimension(
            db, new_model_id, data.get("time_dimension", m.time_dimension)
        )
        if "ai_context" in data:
            data["ai_context"] = validate_ai_context(data["ai_context"])
        if "filters" in data:
            data["filters"] = validate_metric_filters(data["filters"]) or None
        await resolve_joins(
            db, base, data.get("joins", m.joins), member_dataset_ids=members
        )
        await _validate_refs(db, new_model_id, data, metric_id=metric_id, current=m)
    except (MetricError, FieldError, MetricRefError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if "expression" in data:
        data["expression"] = normalize_expression(data["expression"])
    if "name" in data:
        data["name"] = data["name"].strip()
    for field in (
        "name",
        "semantic_model_id",
        "base_dataset_id",
        "business_definition",
        "additivity",
        "time_mode",
        "time_dimension",
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
    peers = await _peers(db, m)
    return _metric_response(m, names.get(m.base_dataset_id), peers, await _metric_assertions(db, peers))


@router.delete(
    "/{metric_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def delete_metric(metric_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a metric — unless a rule references it, which would leave that rule undecidable."""
    m = await _load_metric(db, metric_id)
    rule_ids = await rules_for_metric(db, metric_id)
    if rule_ids:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{len(rule_ids)} rule(s) reference this metric; update or delete them first "
                f"({', '.join(rule_ids[:5])})."
            ),
        )
    await db.delete(m)


@router.get(
    "/{metric_id}/rules",
    response_model=list[RuleRefOut],
    dependencies=[Depends(require_metric_access)],
)
async def list_metric_rules(metric_id: str, db: AsyncSession = Depends(get_db)):
    """The rules that reference this metric — what "run the checks on this number" means."""
    await _load_metric(db, metric_id)  # 404 when the metric does not exist
    rule_ids = await rules_for_metric(db, metric_id)
    rows = await _rule_rows(db, rule_ids)
    return [
        RuleRefOut(
            id=row.id,
            rule_id=row.slug,
            name=row.name,
            last_status=row.last_status,
            last_period_start=row.last_period_start,
            last_period_end=row.last_period_end,
            last_run_at=row.last_run_at,
            last_reason=row.last_reason,
        )
        for row in rows
    ]


@router.get(
    "/{metric_id}/compute",
    response_model=MetricComputeResponse,
    dependencies=[Depends(require_metric_access)],
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
        failure = (
            exc.failure
            if isinstance(exc, QueryError)
            else QueryFailure("QUERY_DEFINITION_INVALID", DEFINITION, str(exc))
        )
        raise HTTPException(status_code=400, detail=query_failure_detail(request, failure)) from exc


@router.get(
    "/{metric_id}/runs",
    response_model=list[MetricRunResponse],
    dependencies=[Depends(require_metric_access)],
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
