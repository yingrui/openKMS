"""Explorer reports API — persisted analyses for the Data Explorer app.

Reads: `console:datasets` or `ontology:read`. Writes: `console:datasets`.
Agents (via `openkms-skill`) author the narrative + charts; this API persists them.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.database import get_db
from app.models.explorer_report import ExplorerReport
from app.schemas.explorer_report import (
    ExplorerReportCreate,
    ExplorerReportListResponse,
    ExplorerReportResponse,
    ExplorerReportUpdate,
)
from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

router = APIRouter(
    prefix="/explorer-reports",
    tags=["explorer"],
    dependencies=[Depends(require_auth)],
)
_VIEW = (PERM_DATA_READ,)


def _response(r: ExplorerReport) -> ExplorerReportResponse:
    return ExplorerReportResponse(
        id=r.id,
        name=r.name,
        question=r.question,
        dataset_id=r.dataset_id,
        status=r.status,
        narrative=r.narrative,
        charts=r.charts,
        created_by_name=r.created_by_name,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


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
async def list_reports(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(select(ExplorerReport).order_by(ExplorerReport.updated_at.desc()))
    ).scalars().all()
    return ExplorerReportListResponse(items=[_response(r) for r in rows], total=len(rows))


@router.post(
    "",
    response_model=ExplorerReportResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
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
        dataset_id=body.dataset_id,
        status=body.status,
        narrative=body.narrative,
        charts=body.charts,
        created_by=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return _response(report)


@router.get(
    "/{report_id}",
    response_model=ExplorerReportResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def get_report(report_id: str, db: AsyncSession = Depends(get_db)):
    return _response(await _get(db, report_id))


@router.put(
    "/{report_id}",
    response_model=ExplorerReportResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def update_report(
    report_id: str,
    body: ExplorerReportUpdate,
    db: AsyncSession = Depends(get_db),
):
    report = await _get(db, report_id)
    data = body.model_dump(exclude_unset=True)
    for field in ("name", "question", "dataset_id", "status", "narrative", "charts"):
        if field in data:
            setattr(report, field, data[field])
    await db.commit()
    await db.refresh(report)
    return _response(report)


@router.delete(
    "/{report_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def delete_report(report_id: str, db: AsyncSession = Depends(get_db)):
    report = await _get(db, report_id)
    await db.delete(report)
