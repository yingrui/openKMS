"""Quality rules API — declarative checks on datasets (nested under /datasets).

Reads: `console:datasets` or `ontology:read`. Writes: `console:datasets`.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.api.datasets import get_dataset_scoped, get_dataset_scoped_write
from app.database import get_db
from app.models.dataset import Dataset
from app.models.quality_rule import QualityRule, QualityRun
from app.schemas.quality import (
    QualityRuleCreate,
    QualityRuleResponse,
    QualityRuleUpdate,
    QualityRunResponse,
)
from app.services.data_layer.quality import RULE_TYPES, QualityError, run_rule
from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

router = APIRouter(prefix="/datasets", tags=["quality"], dependencies=[Depends(require_auth)])
_VIEW = (PERM_DATA_READ,)


def _rule_response(rule: QualityRule, latest: QualityRun | None) -> QualityRuleResponse:
    return QualityRuleResponse(
        id=rule.id,
        dataset_id=rule.dataset_id,
        name=rule.name,
        rule_type=rule.rule_type,
        column_name=rule.column_name,
        config=rule.config,
        severity=rule.severity,
        enabled=rule.enabled,
        created_by_name=rule.created_by_name,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
        last_status=latest.status if latest else None,
        last_run_at=latest.created_at if latest else None,
    )


async def _latest_run(db: AsyncSession, rule_id: str) -> QualityRun | None:
    return (
        await db.execute(
            select(QualityRun)
            .where(QualityRun.rule_id == rule_id)
            .order_by(QualityRun.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _get_rule(db: AsyncSession, dataset_id: str, rule_id: str) -> QualityRule:
    rule = await db.get(QualityRule, rule_id)
    if not rule or rule.dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Quality rule not found")
    return rule


@router.get(
    "/{dataset_id}/quality-rules",
    response_model=list[QualityRuleResponse],
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_quality_rules(
    dataset: Dataset = Depends(get_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    rules = (
        await db.execute(
            select(QualityRule)
            .where(QualityRule.dataset_id == dataset.id)
            .order_by(QualityRule.created_at.desc())
        )
    ).scalars().all()
    return [_rule_response(r, await _latest_run(db, r.id)) for r in rules]


@router.post(
    "/{dataset_id}/quality-rules",
    response_model=QualityRuleResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def create_quality_rule(
    request: Request,
    body: QualityRuleCreate,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    if body.rule_type not in RULE_TYPES:
        raise HTTPException(
            status_code=400, detail=f"rule_type must be one of: {', '.join(RULE_TYPES)}"
        )
    payload = request.state.openkms_jwt_payload
    uname = payload.get("preferred_username") or payload.get("name")
    rule = QualityRule(
        id=str(uuid.uuid4()),
        dataset_id=dataset.id,
        name=body.name,
        rule_type=body.rule_type,
        column_name=body.column_name,
        config=body.config,
        severity=body.severity,
        enabled=body.enabled,
        created_by=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_response(rule, None)


@router.put(
    "/{dataset_id}/quality-rules/{rule_id}",
    response_model=QualityRuleResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def update_quality_rule(
    rule_id: str,
    body: QualityRuleUpdate,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule(db, dataset.id, rule_id)
    data = body.model_dump(exclude_unset=True)
    for field in ("name", "column_name", "config", "severity", "enabled"):
        if field in data:
            setattr(rule, field, data[field])
    await db.commit()
    await db.refresh(rule)
    return _rule_response(rule, await _latest_run(db, rule.id))


@router.delete(
    "/{dataset_id}/quality-rules/{rule_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def delete_quality_rule(
    rule_id: str,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule(db, dataset.id, rule_id)
    await db.delete(rule)


@router.post(
    "/{dataset_id}/quality-rules/{rule_id}/run",
    response_model=QualityRuleResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def run_quality_rule(
    rule_id: str,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule(db, dataset.id, rule_id)
    try:
        result = await run_rule(db, dataset, rule)
    except QualityError as exc:
        db.add(
            QualityRun(
                id=str(uuid.uuid4()), rule_id=rule.id, status="error", error_message=str(exc)
            )
        )
        await db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    run = QualityRun(
        id=str(uuid.uuid4()),
        rule_id=rule.id,
        status=result["status"],
        checked_count=result["checked_count"],
        failed_count=result["failed_count"],
        detail=result["detail"],
    )
    db.add(run)
    await db.commit()
    return _rule_response(rule, run)


@router.get(
    "/{dataset_id}/quality-rules/{rule_id}/runs",
    response_model=list[QualityRunResponse],
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_quality_runs(
    rule_id: str,
    dataset: Dataset = Depends(get_dataset_scoped),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
):
    rule = await _get_rule(db, dataset.id, rule_id)
    runs = (
        await db.execute(
            select(QualityRun)
            .where(QualityRun.rule_id == rule.id)
            .order_by(QualityRun.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [
        QualityRunResponse(
            id=r.id,
            rule_id=r.rule_id,
            status=r.status,
            checked_count=r.checked_count,
            failed_count=r.failed_count,
            detail=r.detail,
            error_message=r.error_message,
            created_at=r.created_at,
        )
        for r in runs
    ]
