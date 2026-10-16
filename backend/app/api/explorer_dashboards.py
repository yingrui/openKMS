"""Explorer dashboards API — saved analyses for the Data Explorer app.

A **dashboard** is the document: a question, a narrative, and the **reports** in it. Each report owns
its **source** (a dataset or a semantic model) and the query it came from, so one dashboard can mix
sources and `POST /{id}/run` re-runs each report through its own engine.

**Permissions.** Dashboards have their own keys (`explorer:read` / `explorer:write`): an analysis is
not the same grant as the data it came from. Re-running is a **read** (it recomputes each report from
its source and writes only our own cached results), so the run needs `explorer:read`.

**Each report's source ACL still applies.** Results are stored, so reading a report is reading the
data behind it: a report whose source this caller may not read answers with a classified
`EXPLORER_SOURCE_FORBIDDEN` **instead of its rows**, and a dashboard is listed only while at least
one of its reports (or none — a draft) is readable. Semantic models carry no per-resource ACL, so
they are gated by the data-layer keys alone.
"""
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.database import get_db
from app.api.query_errors import query_failure_detail
from app.models.explorer_dashboard import ExplorerDashboard
from app.models.explorer_dashboard_run import ExplorerDashboardRun
from app.models.dataset import Dataset
from app.models.semantic_model import SemanticModel
from app.schemas.explorer_dashboard import (
    ExplorerDashboardCreate,
    ExplorerDashboardRunListResponse,
    ExplorerDashboardRunResponse,
    ExplorerDashboardListResponse,
    ExplorerDashboardResponse,
    ExplorerDashboardSource,
    ExplorerDashboardSummary,
    ExplorerDashboardUpdate,
)
from app.services.data_layer.dataset_rows import query_dataset_rows, query_dataset_summary
from app.services.data_layer.explorer import (
    SOURCE_SEMANTIC_MODEL,
    ReportSource,
    dataset_query_kwargs,
    dataset_summary_kwargs,
    is_summary_query,
    model_query_kwargs,
    report_source,
    source_failure,
    source_forbidden,
)
from app.services.data_layer.query import QueryError, run_query
from app.services.data_layer.query_errors import QueryFailure
from app.services.data_layer.row_filters import RowFilterError
from app.services.acl.resource_acl_constants import PERM_READ, RT_DATASET
from app.services.acl.resource_acl_service import readable_resource_ids
from app.services.evaluations.dataset_scope import load_dataset_scoped
from app.services.permissions.permission_catalog import PERM_EXPLORER_READ, PERM_EXPLORER_WRITE

router = APIRouter(
    prefix="/explorer-dashboards",
    tags=["explorer"],
    dependencies=[Depends(require_auth)],
)
_VIEW = (PERM_EXPLORER_READ,)
#: How much of a dashboard's history to return: enough to see a pattern, not a log to scroll.
RUN_HISTORY_LIMIT = 20
_WRITE = (PERM_EXPLORER_WRITE,)

#: Stored per-report result keys — dropped when the caller may not read that report's source.
_RESULT_KEYS = ("columns", "rows", "total", "capped", "duration_ms", "sql")


def _failure_dict(failure: QueryFailure) -> dict:
    """What a run persists for a failed report: the code + kind, never a localized string."""
    return {
        "code": failure.code,
        "kind": failure.kind,
        "detail": failure.detail,
        "params": failure.params,
    }


def _localize(report: dict, request: Request) -> dict:
    """A stored failure, with its message localized for the caller."""
    error = report.get("error")
    if isinstance(error, dict) and isinstance(error.get("code"), str):
        failure = QueryFailure(
            error["code"],
            error.get("kind") or "request",
            error.get("detail"),
            error.get("params") or {},
        )
        return {**report, "error": query_failure_detail(request, failure)}
    return report


def _reports_response(
    dashboard: ExplorerDashboard, request: Request, readable: set[str] | None
) -> list[dict] | None:
    """The dashboard's reports, each localized — and reduced when its source is out of reach.

    `readable` is the caller's readable dataset ids (`None` = every dataset), so a report this caller
    may not read keeps its existence and title but loses the rows it once returned.
    """
    if dashboard.reports is None:
        return None
    out: list[dict] = []
    for entry in dashboard.reports:
        if not isinstance(entry, dict):
            out.append(entry)
            continue
        source = report_source(entry)
        if not _may_read(source, readable):
            failure = query_failure_detail(request, source_forbidden(source))
            hidden = {k: v for k, v in entry.items() if k not in _RESULT_KEYS}
            out.append({**hidden, "error": failure, "ran_at": None})
            continue
        out.append(_localize(entry, request))
    return out


def _response(
    dashboard: ExplorerDashboard, request: Request | None = None, readable: set[str] | None = None
) -> ExplorerDashboardResponse:
    return ExplorerDashboardResponse(
        id=dashboard.id,
        name=dashboard.name,
        question=dashboard.question,
        status=dashboard.status,
        narrative=dashboard.narrative,
        reports=_reports_response(dashboard, request, readable) if request is not None else dashboard.reports,
        created_by_name=dashboard.created_by_name,
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


def _may_read(source: ReportSource, readable: set[str] | None) -> bool:
    """Datasets carry per-resource ACLs (`readable` = the caller's); semantic models do not."""
    if source.kind == SOURCE_SEMANTIC_MODEL:
        return True
    if readable is None:
        return True
    return bool(source.dataset_id) and source.dataset_id in readable


async def _readable_datasets(db: AsyncSession, request: Request) -> set[str] | None:
    """The dataset ids this caller may read; `None` when ACLs do not restrict them."""
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    return await readable_resource_ids(
        db, payload, sub if isinstance(sub, str) else None, RT_DATASET
    )


async def _source_labels(db: AsyncSession, sources: list[ExplorerDashboardSource]) -> None:
    """Name the sources in place — two queries for the whole page, not one per report."""
    dataset_ids = {s.id for s in sources if s.kind != SOURCE_SEMANTIC_MODEL}
    model_ids = {s.id for s in sources if s.kind == SOURCE_SEMANTIC_MODEL}
    labels: dict[str, str] = {}
    if dataset_ids:
        rows = (
            await db.execute(
                select(Dataset.id, Dataset.display_name, Dataset.schema_name, Dataset.table_name).where(
                    Dataset.id.in_(dataset_ids)
                )
            )
        ).all()
        labels.update(
            {str(i): (display or f"{schema}.{table}") for i, display, schema, table in rows}
        )
    if model_ids:
        rows = (
            await db.execute(select(SemanticModel.id, SemanticModel.name).where(SemanticModel.id.in_(model_ids)))
        ).all()
        labels.update({str(i): str(name) for i, name in rows})
    for source in sources:
        source.label = labels.get(source.id, source.id)


def _summary(dashboard: ExplorerDashboard, readable: set[str] | None) -> ExplorerDashboardSummary:
    """A list entry: only the reports this caller may read are counted (and their sources named)."""
    sources: list[ExplorerDashboardSource] = []
    seen: set[tuple[str, str | None]] = set()
    report_count = 0
    for entry in dashboard.reports or []:
        source = report_source(entry)
        if not _may_read(source, readable):
            continue
        report_count += 1
        key = (source.kind, source.resource_id)
        if source.resource_id and key not in seen:
            seen.add(key)
            sources.append(ExplorerDashboardSource(kind=source.kind, id=source.resource_id, label=source.resource_id))
    return ExplorerDashboardSummary(
        id=dashboard.id,
        name=dashboard.name,
        question=dashboard.question,
        status=dashboard.status,
        report_count=report_count,
        sources=sources,
        created_by_name=dashboard.created_by_name,
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


async def _get(db: AsyncSession, dashboard_id: str) -> ExplorerDashboard:
    row = await db.get(ExplorerDashboard, dashboard_id)
    if not row:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return row


async def _require_sources(db: AsyncSession, request: Request, dashboard: ExplorerDashboard) -> None:
    """Every report must name a source the caller may read — fail early, not at run time."""
    for entry in dashboard.reports or []:
        source = report_source(entry)
        if source.kind == SOURCE_SEMANTIC_MODEL:
            continue
        if not source.dataset_id:
            continue  # a report may still be a draft; `run` reports the missing source
        await load_dataset_scoped(db, request, source.dataset_id, PERM_READ)


@router.get(
    "",
    response_model=ExplorerDashboardListResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_dashboards(request: Request, db: AsyncSession = Depends(get_db)):
    """Dashboards with at least one readable report (or none yet, when a draft just started)."""
    readable = await _readable_datasets(db, request)
    rows = (
        await db.execute(select(ExplorerDashboard).order_by(ExplorerDashboard.updated_at.desc()))
    ).scalars().all()
    visible = [
        d
        for d in rows
        if not d.reports or any(_may_read(report_source(e), readable) for e in d.reports)
    ]
    summaries = [_summary(d, readable) for d in visible]
    await _source_labels(db, [s for summary in summaries for s in summary.sources])
    return ExplorerDashboardListResponse(items=summaries, total=len(summaries))


@router.post(
    "",
    response_model=ExplorerDashboardResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_EXPLORER_WRITE))],
)
async def create_dashboard(
    request: Request,
    body: ExplorerDashboardCreate,
    db: AsyncSession = Depends(get_db),
):
    payload = request.state.openkms_jwt_payload
    uname = payload.get("preferred_username") or payload.get("name")
    dashboard = ExplorerDashboard(
        id=str(uuid.uuid4()),
        name=body.name,
        question=body.question,
        status=body.status,
        narrative=body.narrative,
        reports=body.reports,
        created_by=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    await _require_sources(db, request, dashboard)
    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)
    return _response(dashboard, request, await _readable_datasets(db, request))


@router.get(
    "/{dashboard_id}",
    response_model=ExplorerDashboardResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def get_dashboard(dashboard_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    dashboard = await _get(db, dashboard_id)
    return _response(dashboard, request, await _readable_datasets(db, request))


@router.put(
    "/{dashboard_id}",
    response_model=ExplorerDashboardResponse,
    dependencies=[Depends(require_permission(PERM_EXPLORER_WRITE))],
)
async def update_dashboard(
    dashboard_id: str,
    request: Request,
    body: ExplorerDashboardUpdate,
    db: AsyncSession = Depends(get_db),
):
    dashboard = await _get(db, dashboard_id)
    data = body.model_dump(exclude_unset=True)
    for field in ("name", "question", "status", "narrative", "reports"):
        if field in data:
            setattr(dashboard, field, data[field])
    # Reports may keep a source the caller has since lost access to (that is reported per report);
    # a **new** binding has to be one they can read.
    if "reports" in data:
        await _require_sources(db, request, dashboard)
    await db.commit()
    await db.refresh(dashboard)
    return _response(dashboard, request, await _readable_datasets(db, request))


async def _run_report(
    db: AsyncSession,
    entry: dict,
    source_error: QueryFailure | None,
) -> dict:
    """Run one report through its own source. A failure is recorded on it, never raised: one broken
    report must not hide the others."""
    ran_at = datetime.now(timezone.utc).isoformat()
    if source_error is not None:
        return {**entry, "error": _failure_dict(source_error), "ran_at": ran_at}
    source = report_source(entry)
    try:
        if source.kind == SOURCE_SEMANTIC_MODEL:
            sql, columns, rows, capped, duration_ms = await run_query(
                db,
                model_id=source.semantic_model_id or "",
                **model_query_kwargs(entry.get("query")),
            )
            result = {
                "columns": columns,
                "rows": rows,
                "capped": capped,
                "duration_ms": duration_ms,
                "sql": sql,
            }
        elif is_summary_query(entry.get("query")):
            summary = await query_dataset_summary(
                db, source.dataset_id or "", **dataset_summary_kwargs(entry.get("query"))
            )
            result = {
                "sql": summary.sql,
                "columns": summary.columns,
                "rows": summary.rows,
                # `total` = the summary's rows (one per group).
                "total": summary.row_count,
                "capped": summary.capped,
                "duration_ms": summary.duration_ms,
            }
        else:
            started = time.perf_counter()
            page = await query_dataset_rows(
                db, source.dataset_id or "", **dataset_query_kwargs(entry.get("query"))
            )
            result = {
                "sql": page.sql,
                "columns": page.columns,
                "rows": page.rows,
                # `total` counts the rows the filters match — the page may be a slice of it.
                "total": page.total,
                "capped": page.capped,
                "duration_ms": int((time.perf_counter() - started) * 1000),
            }
    except (QueryError, RowFilterError) as exc:
        return {**entry, "error": _failure_dict(exc.failure), "ran_at": ran_at}
    return {**entry, **result, "error": None, "ran_at": ran_at}


def _run_record(dashboard: ExplorerDashboard, reports: list[dict], duration_ms: int, request: Request) -> ExplorerDashboardRun:
    """What a run leaves behind in the document's history (counts only — never a result)."""
    payload = request.state.openkms_jwt_payload
    name = payload.get("preferred_username") or payload.get("name")
    return ExplorerDashboardRun(
        id=str(uuid.uuid4()),
        dashboard_id=dashboard.id,
        duration_ms=duration_ms,
        reports=len(reports),
        failed=sum(1 for report in reports if report.get("error")),
        ran_by_name=str(name)[:256] if isinstance(name, str) and name.strip() else None,
    )


@router.get(
    "/{dashboard_id}/runs",
    response_model=ExplorerDashboardRunListResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_dashboard_runs(
    dashboard_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """This dashboard's run history, newest first.

    A dashboard the caller cannot see answers 404 here too — the history is a fact *about* it.
    """
    dashboard = await _get(db, dashboard_id)
    readable = await _readable_datasets(db, request)
    if dashboard.reports and not any(_may_read(report_source(e), readable) for e in dashboard.reports):
        raise HTTPException(status_code=404, detail="Dashboard not found")
    rows = (
        (
            await db.execute(
                select(ExplorerDashboardRun)
                .where(ExplorerDashboardRun.dashboard_id == dashboard.id)
                .order_by(ExplorerDashboardRun.ran_at.desc())
                .limit(RUN_HISTORY_LIMIT)
            )
        )
        .scalars()
        .all()
    )
    return ExplorerDashboardRunListResponse(
        items=[
            ExplorerDashboardRunResponse(
                id=row.id,
                ran_at=row.ran_at,
                duration_ms=row.duration_ms,
                reports=row.reports,
                failed=row.failed,
                ran_by_name=row.ran_by_name,
            )
            for row in rows
        ],
        total=len(rows),
    )


@router.post(
    "/{dashboard_id}/run",
    response_model=ExplorerDashboardResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def run_dashboard(dashboard_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Run every report against **its own** source and keep the results.

    Both engines are read-only and capped. A report whose source the caller may not read stores the
    classified `EXPLORER_SOURCE_FORBIDDEN` (and the response never carries its old rows); any other
    failing report stores its own classified reason while the rest still run.
    """
    dashboard = await _get(db, dashboard_id)
    readable = await _readable_datasets(db, request)
    started = time.perf_counter()
    reports: list[dict] = []
    for entry in dashboard.reports or []:
        source = report_source(entry)
        if not _may_read(source, readable):
            reports.append({**entry, "error": _failure_dict(source_forbidden(source)), "ran_at": None})
            continue
        reports.append(await _run_report(db, entry, source_failure(source)))
    dashboard.reports = reports
    db.add(
        _run_record(dashboard, reports, int((time.perf_counter() - started) * 1000), request)
    )
    await db.commit()
    await db.refresh(dashboard)
    return _response(dashboard, request, readable)


@router.delete(
    "/{dashboard_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_EXPLORER_WRITE))],
)
async def delete_dashboard(dashboard_id: str, db: AsyncSession = Depends(get_db)):
    dashboard = await _get(db, dashboard_id)
    await db.delete(dashboard)
