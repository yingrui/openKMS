"""Quality issues API — every rule that is not passing, across datasets.

A rule's result lives on its dataset's Quality tab, which is the right place to *fix* one and the wrong
place to *notice* one: nobody opens thirteen datasets to find out whether anything is broken. This is
the inbox: each rule with the latest run that judged it, the dataset it guards, and the numbers.

Read-only, `data:read`, and **filtered by dataset ACL** — an issue is a fact about a dataset, so it is
visible exactly when that dataset is (the same rule the dashboards list follows).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.database import get_db
from app.models.dataset import Dataset
from app.models.quality_rule import QualityRule, QualityRun
from app.schemas.quality import QualityIssueListResponse, QualityIssueResponse
from app.services.acl.resource_acl_constants import RT_DATASET
from app.services.acl.resource_list_acl import readable_id_filter
from app.services.permissions.permission_catalog import PERM_DATA_READ

router = APIRouter(
    prefix="/quality-issues",
    tags=["quality"],
    dependencies=[Depends(require_auth)],
)
_VIEW = (PERM_DATA_READ,)

#: What a caller may ask for: a rule that is failing, that could not be judged, that has never been
#: run, or one that passed (the last is useful when auditing what *is* covered).
STATUSES = ("failed", "error", "never", "passed")


@router.get("", response_model=QualityIssueListResponse, dependencies=[Depends(require_any_permission(*_VIEW))])
async def list_quality_issues(
    request: Request,
    status: str | None = Query(None, description="failed | error | never | passed"),
    db: AsyncSession = Depends(get_db),
):
    """Enabled rules with the latest run that judged them, newest judgement first."""
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    acl_filters, none_readable = await readable_id_filter(
        db, payload, sub if isinstance(sub, str) else None, RT_DATASET, QualityRule.dataset_id
    )
    if none_readable:
        return QualityIssueListResponse(items=[], total=0)

    # The latest run per rule, in the same query: a rule with no run at all is a state of its own.
    latest = (
        select(
            QualityRun.id.label("run_id"),
            QualityRun.rule_id.label("rule_id"),
            QualityRun.status.label("status"),
            QualityRun.checked_count.label("checked_count"),
            QualityRun.failed_count.label("failed_count"),
            QualityRun.detail.label("detail"),
            QualityRun.error_message.label("error_message"),
            QualityRun.created_at.label("ran_at"),
            func.row_number()
            .over(partition_by=QualityRun.rule_id, order_by=QualityRun.created_at.desc())
            .label("rank"),
        )
        .subquery()
    )

    # Only the columns to read: `select(..., latest)` would pull the whole subquery in and every row
    # would arrive as thirteen values instead of three.
    stmt = (
        select(
            QualityRule,
            Dataset,
            latest.c.status,
            latest.c.checked_count,
            latest.c.failed_count,
            latest.c.detail,
            latest.c.error_message,
            latest.c.ran_at,
        )
        .join(Dataset, Dataset.id == QualityRule.dataset_id)
        .outerjoin(latest, and_(latest.c.rule_id == QualityRule.id, latest.c.rank == 1))
        .where(QualityRule.enabled.is_(True))
    )
    if acl_filters:
        stmt = stmt.where(*acl_filters)
    if status in STATUSES:
        stmt = stmt.where(func.coalesce(latest.c.status, "never") == status)
    rows = (await db.execute(stmt)).all()

    items = [
        QualityIssueResponse(
            id=rule.id,
            dataset_id=rule.dataset_id,
            dataset_name=dataset.display_name or f"{dataset.schema_name}.{dataset.table_name}",
            name=rule.name,
            rule_type=rule.rule_type,
            column_name=rule.column_name,
            severity=rule.severity,
            # No run at all is a state of its own: "never" is not "passed".
            status=status or "never",
            checked_count=checked_count,
            failed_count=failed_count,
            detail=detail,
            error_message=error_message,
            last_run_at=ran_at,
        )
        for rule, dataset, status, checked_count, failed_count, detail, error_message, ran_at in rows
    ]
    # Worst first: what is broken, then what could not be judged, then what has never run.
    order = {"failed": 0, "error": 1, "never": 2, "passed": 3}
    items.sort(key=lambda i: (order.get(i.status, 9), i.dataset_name, i.name))
    return QualityIssueListResponse(items=items, total=len(items))
