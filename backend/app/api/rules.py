"""Metric reconciliation rules and their alerts — plain tables, plain CRUD.

A rule watches one metric and states what must hold: an identity between metrics (`relation`) or a threshold
(`condition`). Running it yields pass / fail / unknown for a period and scope; a failure that carries advice
opens an alert. Both live in `metric_rules` / `metric_events` (see `models/metric_rule.py`); this module is
the HTTP surface over them.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission
from app.database import get_db
from app.models.metric_definition import MetricDefinition
from app.models.metric_rule import MetricEvent, MetricRule, MetricRuleRef
from app.models.semantic_model_field import SemanticModelField
from app.services.identity.permissions.permission_catalog import (
    PERM_DATA_READ,
    PERM_DATA_WRITE,
    PERM_ONTOLOGY_WRITE,
)
from app.services.ontology.rules.conditions import ConditionError, validate_condition
from app.services.ontology.rules.evaluator import EvalResult
from app.services.ontology.rules.events import (
    STATUSES,
    counts_by_subject,
    list_events,
    transition,
)
from app.services.ontology.rules.periods import PeriodError, parse_period
from app.services.ontology.rules.refs import sync_rule_refs
from app.services.ontology.rules.relations import RelationError, validate_relation
from app.services.ontology.rules.run import evaluate_rule_in_snapshot, evaluate_subject_in_snapshot

# Reads use the data plane's grants (an analyst reads a metric, so they read its checks); writes also accept
# the ontology grant, because the objects used to live there and admins still own them.
WRITE_DEPS = [
    Depends(require_any_permission(PERM_DATA_WRITE, PERM_ONTOLOGY_WRITE))
]
READ_DEPS = [Depends(require_any_permission(PERM_DATA_READ, PERM_DATA_WRITE, PERM_ONTOLOGY_WRITE))]

router = APIRouter(prefix="/metric-rules", tags=["metric-rules"])
events_router = APIRouter(prefix="/metric-events", tags=["metric-events"])

SLUG = r"^[a-z][a-z0-9-]{1,63}$"


class RuleGroup(BaseModel):
    """The dimension a rule is checked per: `scenario_id`."""

    field: str = Field(min_length=1)


class RuleWrite(BaseModel):
    name: str
    rule_id: str | None = Field(default=None, pattern=SLUG)
    #: The metric this rule watches.
    metric_id: str
    condition: dict[str, Any] | None = None
    relation: dict[str, Any] | None = None
    severity: str = Field(default="P1", pattern="^P[0-2]$")
    conclusion: str = ""
    suggestion: str = ""
    owner: str | None = None
    group_by: RuleGroup | None = None
    #: Column that turns the run's period into a filter (`trade_date`, `cycle`, …). Optional.
    period_field: str | None = None
    status: str = Field(default="active", pattern="^(active|paused)$")


class RulePatch(BaseModel):
    name: str | None = None
    rule_id: str | None = Field(default=None, pattern=SLUG)
    metric_id: str | None = None
    condition: dict[str, Any] | None = None
    relation: dict[str, Any] | None = None
    severity: str | None = Field(default=None, pattern="^P[0-2]$")
    conclusion: str | None = None
    suggestion: str | None = None
    owner: str | None = None
    group_by: RuleGroup | None = None
    period_field: str | None = None
    status: str | None = Field(default=None, pattern="^(active|paused)$")


class RuleOut(BaseModel):
    id: str
    rule_id: str | None = None
    name: str | None = None
    metric_id: str | None = None
    condition: dict | None = None
    relation: dict | None = None
    severity: str | None = None
    conclusion: str | None = None
    suggestion: str | None = None
    owner: str | None = None
    status: str | None = None
    version: int | None = None
    group_by: dict | None = None
    period_field: str | None = None
    last_run_at: str | None = None
    last_status: str | None = None
    last_period_start: str | None = None
    last_period_end: str | None = None
    last_reason: str | None = None
    #: Metric ids this rule references — lets a metric list answer "covered" without N calls.
    metric_ids: list[str] = []


class EvalOut(BaseModel):
    rule_id: str
    status: str
    values: dict[str, float | None] = {}
    event_id: str | None = None
    reason: str | None = None
    group: dict | None = None
    would_publish: bool = False


class EvaluateResponse(BaseModel):
    results: list[EvalOut]
    failed: int
    unknown: int


class EvaluateRequest(BaseModel):
    #: One period label (`2026-W46` / `2026-11` / `2026-11-15`); start/end are derived.
    period_start: str = ""
    period_end: str = ""
    dry_run: bool = False


class RulesEvaluateRequest(BaseModel):
    metric_id: str | None = None
    period_start: str = ""
    period_end: str = ""
    scope: str | None = None


class EventOut(BaseModel):
    id: str
    title: str | None = None
    severity: str | None = None
    intent: str | None = None
    status: str | None = None
    event_start_time: str | None = None
    event_end_time: str | None = None
    period_start: str | None = None
    period_end: str | None = None
    period_label: str | None = None
    scope: str | None = None
    description: str | None = None
    evidence: dict | None = None
    rule_id: str | None = None
    rule_object_id: str | None = None
    rule_version: int | None = None
    subject_type: str | None = None
    subject_id: str | None = None
    assignee: str | None = None


class EventListResponse(BaseModel):
    items: list[EventOut]
    total: int


class EventPatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(open|dismissed|resolved)$")
    assignee: str | None = None
    note: str | None = None


class CountOut(BaseModel):
    subject_id: str
    total: int
    open: int


class RuleRefOut(BaseModel):
    id: str
    rule_id: str | None = None
    name: str | None = None
    last_status: str | None = None
    last_period_start: str | None = None
    last_period_end: str | None = None
    last_run_at: str | None = None
    last_reason: str | None = None


def _slugify(name: str) -> str:
    """An ASCII slug from a name; a name with no ASCII (e.g. Chinese) gets a stable short fallback."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)[:48].strip("-")
    return slug if len(slug) >= 2 else "rule"


def _canonical_period(period_start: str, period_end: str) -> tuple[str, str]:
    """One period label in, one canonical date pair out."""
    if (period_start or "").strip() and (period_end or "").strip() and period_start != period_end:
        raise HTTPException(
            status_code=422,
            detail="Give one period label (`period_start`); its end is derived, not supplied.",
        )
    label = (period_start or period_end or "").strip()
    try:
        return parse_period(label)
    except PeriodError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _rule_out(rule: MetricRule) -> RuleOut:
    return RuleOut(
        id=rule.id,
        rule_id=rule.slug,
        name=rule.name,
        metric_id=rule.metric_id,
        condition=rule.condition,
        relation=rule.relation,
        severity=rule.severity,
        conclusion=rule.conclusion,
        suggestion=rule.suggestion,
        owner=rule.owner,
        status=rule.status,
        version=rule.version,
        group_by=rule.group_by,
        period_field=rule.period_field,
        last_run_at=rule.last_run_at,
        last_status=rule.last_status,
        last_period_start=rule.last_period_start,
        last_period_end=rule.last_period_end,
        last_reason=rule.last_reason,
    )


async def _load_rule(db: AsyncSession, rule_id: str) -> MetricRule:
    rule = await db.get(MetricRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


async def _metric_or_400(db: AsyncSession, metric_id: str) -> MetricDefinition:
    metric = await db.get(MetricDefinition, metric_id)
    if metric is None:
        raise HTTPException(status_code=400, detail="Metric not found")
    return metric


async def _slug_taken(db: AsyncSession, slug: str, *, exclude: str | None = None) -> bool:
    rows = (await db.execute(select(MetricRule.id).where(MetricRule.slug == slug))).scalars().all()
    return any(row != exclude for row in rows)


async def _validate_period_field(
    db: AsyncSession, metric: MetricDefinition, field: str | None
) -> None:
    """A period field must be a field of the metric's model — otherwise the period silently does nothing."""
    name = (field or "").strip()
    if not name:
        return
    known = (
        await db.execute(
            select(SemanticModelField.name, SemanticModelField.column_name).where(
                SemanticModelField.semantic_model_id == metric.semantic_model_id
            )
        )
    ).all()
    names = {str(value) for row in known for value in row if value}
    if name not in names:
        hint = ", ".join(sorted(names)[:12]) if names else "nothing is declared"
        raise HTTPException(
            status_code=400,
            detail=f"period_field '{name}' is not a field of this subject (known: {hint}).",
        )


async def _validate_group_by(db: AsyncSession, metric: MetricDefinition, group: RuleGroup | None) -> None:
    """`group_by.field` must be a field of the metric's model — a typo is a 400, not a silent "undecidable"."""
    if group is None:
        return
    names = (
        await db.execute(
            select(SemanticModelField.name, SemanticModelField.column_name).where(
                SemanticModelField.semantic_model_id == metric.semantic_model_id
            )
        )
    ).all()
    known = sorted({str(name) for row in names for name in row if name})
    if group.field not in known:
        hint = ", ".join(known[:12]) if known else "nothing is declared"
        raise HTTPException(
            status_code=400,
            detail=f"group_by.field '{group.field}' is not a field of this subject (known: {hint}).",
        )


def _validate_definition(payload: RuleWrite | dict) -> tuple[dict | None, dict | None]:
    """Exactly one of condition / relation, structurally valid; returns the pair to store."""
    data = payload if isinstance(payload, dict) else payload.model_dump()
    condition = data.get("condition")
    relation = data.get("relation")
    if bool(condition) == bool(relation):
        raise HTTPException(
            status_code=400,
            detail="A rule needs exactly one of `condition` (a threshold) and `relation` (an identity).",
        )
    if condition:
        try:
            validate_condition(condition)
        except ConditionError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid condition: {exc}") from exc
    if relation:
        try:
            validate_relation(relation)
        except RelationError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid relation: {exc}") from exc
    return condition, relation


@router.get("", response_model=list[RuleOut], dependencies=READ_DEPS)
async def list_rules(
    metric_id: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[RuleOut]:
    """Every rule, optionally narrowed to the metric it watches."""
    query = select(MetricRule).order_by(MetricRule.created_at.desc())
    if metric_id:
        query = query.where(MetricRule.metric_id == metric_id)
    rules = (await db.execute(query)).scalars().all()
    refs: dict[str, list[str]] = {}
    for rule_id, ref_metric in (
        await db.execute(select(MetricRuleRef.rule_id, MetricRuleRef.metric_id))
    ).all():
        refs.setdefault(rule_id, []).append(ref_metric)
    return [_rule_out(rule).model_copy(update={"metric_ids": refs.get(rule.id, [])}) for rule in rules]


@router.post("", response_model=RuleOut, status_code=201, dependencies=WRITE_DEPS)
async def create_rule(request: Request, body: RuleWrite, db: AsyncSession = Depends(get_db)):
    metric = await _metric_or_400(db, body.metric_id)
    condition, relation = _validate_definition(body)
    await _validate_group_by(db, metric, body.group_by)
    await _validate_period_field(db, metric, body.period_field)

    slug = (body.rule_id or "").strip() or _slugify(body.name)
    if await _slug_taken(db, slug):
        raise HTTPException(status_code=409, detail=f"rule_id '{slug}' is taken")
    payload = request.state.openkms_jwt_payload
    uname = payload.get("preferred_username") or payload.get("name")
    rule = MetricRule(
        id=uuid.uuid4().hex,
        slug=slug,
        name=body.name.strip(),
        metric_id=metric.id,
        condition=condition,
        relation=relation,
        severity=body.severity,
        conclusion=body.conclusion,
        suggestion=body.suggestion,
        owner=body.owner or (str(uname) if uname else None),
        status=body.status,
        version=1,
        group_by=body.group_by.model_dump() if body.group_by else None,
        period_field=(body.period_field or "").strip() or None,
        created_by_name=str(uname) if uname else None,
    )
    db.add(rule)
    await db.flush()
    await sync_rule_refs(db, rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_out(rule)


@router.get("/{rule_id}", response_model=RuleOut, dependencies=READ_DEPS)
async def get_rule(rule_id: str, db: AsyncSession = Depends(get_db)):
    return _rule_out(await _load_rule(db, rule_id))


@router.patch("/{rule_id}", response_model=RuleOut, dependencies=WRITE_DEPS)
async def update_rule(rule_id: str, body: RulePatch, db: AsyncSession = Depends(get_db)):
    rule = await _load_rule(db, rule_id)
    data = body.model_dump(exclude_unset=True)

    if body.metric_id is not None:
        rule.metric_id = (await _metric_or_400(db, body.metric_id)).id
    if body.condition is not None or body.relation is not None:
        condition, relation = _validate_definition(
            {"condition": body.condition, "relation": body.relation}
        )
        rule.condition = condition
        rule.relation = relation
        rule.version += 1
    if body.group_by is not None or "group_by" in body.model_fields_set:
        metric = await _metric_or_400(db, rule.metric_id)
        await _validate_group_by(db, metric, body.group_by)
        rule.group_by = body.group_by.model_dump() if body.group_by else None
    if "period_field" in body.model_fields_set:
        metric = await _metric_or_400(db, rule.metric_id)
        await _validate_period_field(db, metric, body.period_field)
        rule.period_field = (body.period_field or "").strip() or None

    if body.rule_id is not None and body.rule_id != rule.slug:
        if await _slug_taken(db, body.rule_id, exclude=rule.id):
            raise HTTPException(status_code=409, detail=f"rule_id '{body.rule_id}' is taken")
        rule.slug = body.rule_id
    for field_name in ("name", "severity", "conclusion", "suggestion", "owner", "status"):
        if field_name in data and data[field_name] is not None:
            setattr(rule, field_name, data[field_name])
    await db.flush()
    await sync_rule_refs(db, rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_out(rule)


@router.delete("/{rule_id}", status_code=204, dependencies=WRITE_DEPS)
async def delete_rule(rule_id: str, db: AsyncSession = Depends(get_db)):
    """Delete the rule. Its alerts go with it (FK cascade) — they have no meaning without the rule."""
    rule = await _load_rule(db, rule_id)
    await db.delete(rule)
    await db.commit()


@router.post("/{rule_id}/evaluate", response_model=EvaluateResponse, dependencies=READ_DEPS)
async def evaluate_one(
    rule_id: str,
    request: Request,
    body: EvaluateRequest,
    db: AsyncSession = Depends(get_db),
):
    rule = await _load_rule(db, rule_id)
    period_start, period_end = _canonical_period(body.period_start, body.period_end)
    try:
        results = await evaluate_rule_in_snapshot(
            request,
            rule_id=rule.id,
            period_start=period_start,
            period_end=period_end,
            period_label=(body.period_start or body.period_end or "").strip() or None,
            dry_run=body.dry_run,
        )
    except ConditionError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid condition: {exc}") from exc
    await db.refresh(rule)
    return EvaluateResponse(
        results=[_eval_out(result) for result in results],
        failed=sum(1 for result in results if result.status == "fail"),
        unknown=sum(1 for result in results if result.status == "unknown"),
    )


@router.post("/evaluate", response_model=EvaluateResponse, dependencies=READ_DEPS)
async def evaluate_many(
    request: Request,
    body: RulesEvaluateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Every active rule, or just the ones watching one metric."""
    period_start, period_end = _canonical_period(body.period_start, body.period_end)
    results = await evaluate_subject_in_snapshot(
        request,
        metric_id=body.metric_id,
        period_start=period_start,
        period_end=period_end,
        period_label=(body.period_start or body.period_end or "").strip() or None,
    )
    return EvaluateResponse(
        results=[_eval_out(result) for result in results],
        failed=sum(1 for result in results if result.status == "fail"),
        unknown=sum(1 for result in results if result.status == "unknown"),
    )


@router.get("/{rule_id}/events", response_model=EventListResponse, dependencies=READ_DEPS)
async def list_rule_events(
    rule_id: str,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    rule = await _load_rule(db, rule_id)
    items, total = await list_events(db, rule_object_id=rule.id, status=status, limit=limit, offset=offset)
    return EventListResponse(items=[EventOut(**item) for item in items], total=total)


def _eval_out(result: EvalResult) -> EvalOut:
    return EvalOut(
        rule_id=result.rule_id,
        status=result.status,
        values=result.values,
        would_publish=result.would_publish,
        event_id=result.event_id,
        reason=result.reason,
        group=result.group,
    )


# --- alerts -------------------------------------------------------------------------------------


@events_router.get("", response_model=EventListResponse, dependencies=READ_DEPS)
async def list_all_events(
    metric_id: str | None = None,
    rule_id: str | None = None,
    status: str | None = Query(None, pattern="^(open|dismissed|resolved)$"),
    severity: str | None = Query(None, pattern="^P[0-2]$"),
    open_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Alerts, newest first — the tab behind a rule, and behind a metric."""
    items, total = await list_events(
        db,
        subject_id=metric_id,
        rule_id=rule_id,
        status=status,
        severity=severity,
        open_only=open_only,
        limit=limit,
        offset=offset,
    )
    return EventListResponse(items=[EventOut(**item) for item in items], total=total)


@events_router.get("/summary", response_model=list[CountOut], dependencies=READ_DEPS)
async def event_summary(db: AsyncSession = Depends(get_db)):
    """Open/total alerts per metric — one call for a list page's badges."""
    return [CountOut(**row) for row in await counts_by_subject(db, subject_type="metric")]


@events_router.patch("/{event_id}", response_model=EventOut, dependencies=READ_DEPS)
async def patch_event(event_id: str, body: EventPatch, db: AsyncSession = Depends(get_db)):
    """Move an alert's state (resolve / dismiss / reopen) or assign it."""
    event = await db.get(MetricEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    rule_slug = await db.scalar(select(MetricRule.slug).where(MetricRule.id == event.rule_id))
    if body.assignee is None and body.status == "resolved" and event.assignee is None:
        # Resolving without an assignee is fine; the actor is kept in the evidence trail.
        pass
    try:
        outcome = await transition(
            db,
            event,
            status=body.status,
            assignee=body.assignee,
            note=body.note,
            rule_slug=rule_slug,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await db.commit()
    return EventOut(**outcome)


__all__ = ["router", "events_router", "STATUSES"]
