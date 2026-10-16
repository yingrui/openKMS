"""Explorer reports API — persisted analyses for the Data Explorer app.

A report binds to a **dataset** or a **semantic model**, carries blocks (each with the query it came
from) and can be re-run: `POST /{id}/run` executes every block through that source's engine.

**Reports have their own permissions** (`explorer:read` / `explorer:write`): an analysis is not the
same grant as the data it came from — reading data does not hand out saved analyses, and sharing
analyses does not hand out dataset management. Re-running is a **read** (it recomputes the report
from its source and writes only our own cached results), so it needs `explorer:read`.

**The source's own ACL still applies.** A report's results are stored, so viewing or running one is
viewing the data behind it: a dataset-backed report is visible only while that dataset is (the same
check browsing it makes). Semantic models carry no per-resource ACL — they are gated by the
data-layer keys. Agents author the narrative + blocks through `openkms-skill`; this API also runs them.
"""
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.database import get_db
from app.api.query_errors import query_failure_detail
from app.models.explorer_report import ExplorerReport
from app.schemas.explorer_report import (
    ExplorerReportCreate,
    ExplorerReportListResponse,
    ExplorerReportResponse,
    ExplorerReportUpdate,
)
from app.services.data_layer.dataset_rows import query_dataset_rows, query_dataset_summary
from app.services.data_layer.explorer import (
    SOURCE_SEMANTIC_MODEL,
    dataset_query_kwargs,
    dataset_summary_kwargs,
    is_summary_query,
    model_query_kwargs,
    source_failure,
)
from app.services.data_layer.query import QueryError, run_query
from app.services.data_layer.query_errors import QueryFailure
from app.services.data_layer.row_filters import RowFilterError
from app.services.acl.resource_acl_constants import PERM_READ, RT_DATASET
from app.services.acl.resource_list_acl import readable_id_filter
from app.services.evaluations.dataset_scope import load_dataset_scoped
from app.services.permissions.permission_catalog import PERM_EXPLORER_READ, PERM_EXPLORER_WRITE

router = APIRouter(
    prefix="/explorer-reports",
    tags=["explorer"],
    dependencies=[Depends(require_auth)],
)
_VIEW = (PERM_EXPLORER_READ,)
_WRITE = (PERM_EXPLORER_WRITE,)


def _failure_dict(failure: QueryFailure) -> dict:
    """What a run persists for a failed block: the code + kind, never a localized string."""
    return {
        "code": failure.code,
        "kind": failure.kind,
        "detail": failure.detail,
        "params": failure.params,
    }


def _blocks_response(r: ExplorerReport, request: Request) -> list[dict] | None:
    """Stored blocks, with each failure's message localized for the caller."""
    if r.blocks is None:
        return None
    out: list[dict] = []
    for block in r.blocks:
        error = block.get("error") if isinstance(block, dict) else None
        if isinstance(error, dict) and isinstance(error.get("code"), str):
            failure = QueryFailure(
                error["code"],
                error.get("kind") or "request",
                error.get("detail"),
                error.get("params") or {},
            )
            out.append({**block, "error": query_failure_detail(request, failure)})
        else:
            out.append(block)
    return out


def _response(r: ExplorerReport, request: Request | None = None) -> ExplorerReportResponse:
    return ExplorerReportResponse(
        id=r.id,
        name=r.name,
        question=r.question,
        source_kind=r.source_kind,
        dataset_id=r.dataset_id,
        semantic_model_id=r.semantic_model_id,
        status=r.status,
        narrative=r.narrative,
        blocks=_blocks_response(r, request) if request is not None else r.blocks,
        created_by_name=r.created_by_name,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


async def require_source_access(db: AsyncSession, request: Request, report: ExplorerReport) -> None:
    """A dataset-backed report is readable only while its dataset is — results are stored data."""
    if report.source_kind == SOURCE_SEMANTIC_MODEL or not report.dataset_id:
        return
    # Raises 403/404 exactly like browsing that dataset would.
    await load_dataset_scoped(db, request, report.dataset_id, PERM_READ)


async def _get(db: AsyncSession, report_id: str) -> ExplorerReport:
    row = await db.get(ExplorerReport, report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    return row


@router.get(
    "",
    response_model=ExplorerReportListResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_reports(request: Request, db: AsyncSession = Depends(get_db)):
    """Reports whose source the caller can read (a semantic model has no per-resource ACL)."""
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    acl_filters, none_readable = await readable_id_filter(
        db, payload, sub if isinstance(sub, str) else None, RT_DATASET, ExplorerReport.dataset_id
    )
    stmt = select(ExplorerReport).order_by(ExplorerReport.updated_at.desc())
    model_backed = ExplorerReport.source_kind == SOURCE_SEMANTIC_MODEL
    if none_readable:
        stmt = stmt.where(model_backed)
    elif acl_filters:
        stmt = stmt.where(or_(model_backed, *acl_filters))
    rows = (await db.execute(stmt)).scalars().all()
    return ExplorerReportListResponse(items=[_response(r, request) for r in rows], total=len(rows))


@router.post(
    "",
    response_model=ExplorerReportResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_EXPLORER_WRITE))],
)
async def create_report(
    request: Request,
    body: ExplorerReportCreate,
    db: AsyncSession = Depends(get_db),
):
    payload = request.state.openkms_jwt_payload
    uname = payload.get("preferred_username") or payload.get("name")
    report = ExplorerReport(
        id=str(uuid.uuid4()),
        name=body.name,
        question=body.question,
        source_kind=body.source_kind,
        dataset_id=body.dataset_id,
        semantic_model_id=body.semantic_model_id,
        status=body.status,
        narrative=body.narrative,
        blocks=body.blocks,
        created_by=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    await require_source_access(db, request, report)
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return _response(report, request)


@router.get(
    "/{report_id}",
    response_model=ExplorerReportResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def get_report(report_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    report = await _get(db, report_id)
    await require_source_access(db, request, report)
    return _response(report, request)


@router.put(
    "/{report_id}",
    response_model=ExplorerReportResponse,
    dependencies=[Depends(require_permission(PERM_EXPLORER_WRITE))],
)
async def update_report(
    report_id: str,
    request: Request,
    body: ExplorerReportUpdate,
    db: AsyncSession = Depends(get_db),
):
    report = await _get(db, report_id)
    data = body.model_dump(exclude_unset=True)
    for field in (
        "name",
        "question",
        "source_kind",
        "dataset_id",
        "semantic_model_id",
        "status",
        "narrative",
        "blocks",
    ):
        if field in data:
            setattr(report, field, data[field])
    await require_source_access(db, request, report)
    await db.commit()
    await db.refresh(report)
    return _response(report, request)


async def _run_block(
    db: AsyncSession,
    report: ExplorerReport,
    block: dict,
    source_error: QueryFailure | None,
) -> dict:
    """Run one block through the report's source. A failure is recorded on the block, never raised:
    one broken metric must not hide the other blocks."""
    ran_at = datetime.now(timezone.utc).isoformat()
    if source_error is not None:
        return {**block, "error": _failure_dict(source_error), "ran_at": ran_at}
    try:
        if report.source_kind == SOURCE_SEMANTIC_MODEL:
            sql, columns, rows, capped, duration_ms = await run_query(
                db,
                model_id=report.semantic_model_id or "",
                **model_query_kwargs(block.get("query")),
            )
            result = {
                "columns": columns,
                "rows": rows,
                "capped": capped,
                "duration_ms": duration_ms,
                "sql": sql,
            }
        elif is_summary_query(block.get("query")):
            summary = await query_dataset_summary(
                db, report.dataset_id or "", **dataset_summary_kwargs(block.get("query"))
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
                db, report.dataset_id or "", **dataset_query_kwargs(block.get("query"))
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
        return {**block, "error": _failure_dict(exc.failure), "ran_at": ran_at}
    return {**block, **result, "error": None, "ran_at": ran_at}


@router.post(
    "/{report_id}/run",
    response_model=ExplorerReportResponse,
    dependencies=[Depends(require_permission(PERM_EXPLORER_WRITE))],
)
async def run_report(report_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Run every block against the report's source and keep the results.

    Both engines are read-only and capped; a block that fails stores the classified reason
    (`{code, message, kind}` in the response) and the rest still run.
    """
    report = await _get(db, report_id)
    await require_source_access(db, request, report)
    source_error = source_failure(report.source_kind, report.dataset_id, report.semantic_model_id)
    report.blocks = [
        await _run_block(db, report, block, source_error) for block in (report.blocks or [])
    ]
    await db.commit()
    await db.refresh(report)
    return _response(report, request)


@router.delete(
    "/{report_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_EXPLORER_WRITE))],
)
async def delete_report(report_id: str, db: AsyncSession = Depends(get_db)):
    report = await _get(db, report_id)
    await db.delete(report)
