"""Metric reconciliation rules and their alerts — plain tables, plain CRUD.

A rule watches one metric and states what must hold: one or more identities between metrics (`identities`) or a threshold
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
from app.services.ontology.rules.periods import kind_of_dimension
from app.services.ontology.rules.refs import referenced_metric_ids, sync_rule_refs
from app.services.ontology.rules.run_params import describe_run_params
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


class RuleArgument(BaseModel):
    """One declared run parameter.

    A `filter` narrows every operand by a field of the subject; a `key` narrows the scopes to the groups the
    run names. `role: period` marks a filter whose value *names the period* — same field, same value; what it
    adds is that the run's verdict belongs to that period, and its interval is recorded on the event.
    """

    key: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$")
    kind: str = Field(pattern="^(filter|key)$")
    field: str | None = None
    role: str | None = Field(default=None, pattern="^period$")
    required: bool = False


class RuleRunParams(BaseModel):
    arguments: list[RuleArgument] = []


class RuleWrite(BaseModel):
    name: str
    description: str = ""
    rule_id: str | None = Field(default=None, pattern=SLUG)
    #: The metric this rule watches.
    metric_id: str
    condition: dict[str, Any] | None = None
    identities: list[dict[str, Any]] | None = None
    severity: str = Field(default="P1", pattern="^P[0-2]$")
    conclusion: str = ""
    suggestion: str = ""
    owner: str | None = None
    group_by: RuleGroup | None = None
    run_params: RuleRunParams | None = None
    status: str = Field(default="active", pattern="^(active|paused)$")


class RulePatch(BaseModel):
    name: str | None = None
    description: str | None = None
    rule_id: str | None = Field(default=None, pattern=SLUG)
    metric_id: str | None = None
    condition: dict[str, Any] | None = None
    identities: list[dict[str, Any]] | None = None
    severity: str | None = Field(default=None, pattern="^P[0-2]$")
    conclusion: str | None = None
    suggestion: str | None = None
    owner: str | None = None
    group_by: RuleGroup | None = None
    run_params: RuleRunParams | None = None
    status: str | None = Field(default=None, pattern="^(active|paused)$")


class RuleOut(BaseModel):
    id: str
    rule_id: str | None = None
    name: str | None = None
    description: str | None = None
    metric_id: str | None = None
    condition: dict | None = None
    identities: list[dict] | None = None
    severity: str | None = None
    conclusion: str | None = None
    suggestion: str | None = None
    owner: str | None = None
    status: str | None = None
    version: int | None = None
    group_by: dict | None = None
    last_run_at: str | None = None
    last_status: str | None = None
    last_period_start: str | None = None
    last_period_end: str | None = None
    last_reason: str | None = None
    #: Metric ids this rule references — lets a metric list answer "covered" without N calls.
    metric_ids: list[str] = []
    #: What pressing 运行 will ask for, derived from the metrics this rule reads.
    run_params: dict | None = None


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
    dry_run: bool = False
    #: Values for the rule's declared arguments, by key — including the period, if the rule declares one
    #: (`{"cycle": "2026-W46", "channel": "线上", "scenario": ["S1"]}`).
    values: dict[str, Any] = {}


class RulesEvaluateRequest(BaseModel):
    metric_id: str | None = None
    values: dict[str, Any] = {}


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


def _rule_out(rule: MetricRule) -> RuleOut:
    return RuleOut(
        id=rule.id,
        rule_id=rule.slug,
        name=rule.name,
        description=rule.description,
        metric_id=rule.metric_id,
        condition=rule.condition,
        identities=rule.identities,
        severity=rule.severity,
        conclusion=rule.conclusion,
        suggestion=rule.suggestion,
        owner=rule.owner,
        status=rule.status,
        version=rule.version,
        group_by=rule.group_by,
        run_params=rule.run_params,
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


async def _validate_metric_refs(
    db: AsyncSession, condition: dict | None, identities: list[dict] | None
) -> None:
    """Every operand names a metric by id; an unknown one is a 400, not a foreign-key error at insert time."""
    refs = referenced_metric_ids({"condition": condition, "identities": identities})
    for metric_id in refs:
        if await db.get(MetricDefinition, metric_id) is None:
            raise HTTPException(status_code=400, detail=f"unknown metric '{metric_id}'")


async def _validate_run_params(
    db: AsyncSession, metric_id: str, params: RuleRunParams, group_field: str | None
) -> None:
    """Every declared argument must be satisfiable, or it is a 400 now instead of an `unknown` later."""
    keys = [argument.key for argument in params.arguments]
    if len(keys) != len(set(keys)):
        raise HTTPException(status_code=400, detail="run parameter keys must be unique")
    periods = [a for a in params.arguments if a.role == "period"]
    if len(periods) > 1:
        raise HTTPException(status_code=400, detail="only one run parameter can be the period")
    for argument in periods:
        if argument.kind != "filter":
            # A key narrows the scopes; it cannot also label the run.
            raise HTTPException(status_code=400, detail="the period must be a `filter` argument")

    metric = await _metric_or_400(db, metric_id)

    async def model_field(name: str):
        return (
            await db.execute(
                select(SemanticModelField).where(
                    SemanticModelField.semantic_model_id == metric.semantic_model_id,
                    SemanticModelField.name == name,
                )
            )
        ).scalars().first()

    for argument in params.arguments:
        name = (argument.field or "").strip()
        if not name:
            raise HTTPException(
                status_code=400, detail=f"'{argument.key}' needs the field it narrows."
            )
        field = await model_field(name)
        if field is None:
            raise HTTPException(status_code=400, detail=f"'{name}' is not a field of this model.")
        if argument.kind == "key":
            if not group_field:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{argument.key}' narrows the scopes — the rule needs a group field first.",
                )
            if name != group_field:
                # One meaning: a key argument selects groups, so it must name the group field itself.
                raise HTTPException(
                    status_code=400,
                    detail=f"'{argument.key}' must name the group field ('{group_field}').",
                )
        if argument.role == "period":
            calendar = kind_of_dimension(field.dimension, field.datatype)
            if calendar == "custom":
                # The value names no interval, and an event without a period is not a period event.
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"'{name}' has a custom calendar: its value does not name an interval, so it "
                        "cannot label a run — declare it as a plain filter instead."
                    ),
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
    """Exactly one of condition / identities, structurally valid; returns the pair to store."""
    data = payload if isinstance(payload, dict) else payload.model_dump()
    condition = data.get("condition")
    identities = data.get("identities")
    if bool(condition) == bool(identities):
        raise HTTPException(
            status_code=400,
            detail=(
                "A rule needs exactly one of `condition` (a threshold) and `identities` "
                "(one or more equalities)."
            ),
        )
    if condition:
        try:
            validate_condition(condition)
        except ConditionError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid condition: {exc}") from exc
    if identities is not None:
        if not isinstance(identities, list) or not identities:
            raise HTTPException(status_code=400, detail="`identities` needs at least one equality.")
        targets: set[str] = set()
        for identity in identities:
            try:
                validate_relation(identity)
            except RelationError as exc:
                raise HTTPException(status_code=400, detail=f"Invalid identity: {exc}") from exc
            target = str((identity.get("target") or {}).get("metric") or "")
            if target in targets:
                # The evidence names each identity's residual after its target; two identities on the
                # same target would overwrite each other's number in the alert.
                raise HTTPException(
                    status_code=400,
                    detail="Two identities cannot explain the same target metric — merge them.",
                )
            targets.add(target)
    return condition, identities


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
    condition, identities = _validate_definition(body)
    await _validate_metric_refs(db, condition, identities)
    await _validate_group_by(db, metric, body.group_by)
    if body.run_params is not None:
        await _validate_run_params(
            db, metric.id, body.run_params, body.group_by.field if body.group_by else None
        )

    slug = (body.rule_id or "").strip() or _slugify(body.name)
    if await _slug_taken(db, slug):
        raise HTTPException(status_code=409, detail=f"rule_id '{slug}' is taken")
    payload = request.state.openkms_jwt_payload
    uname = payload.get("preferred_username") or payload.get("name")
    rule = MetricRule(
        id=uuid.uuid4().hex,
        slug=slug,
        name=body.name.strip(),
        description=body.description.strip(),
        metric_id=metric.id,
        condition=condition,
        identities=identities,
        severity=body.severity,
        conclusion=body.conclusion,
        suggestion=body.suggestion,
        owner=body.owner or (str(uname) if uname else None),
        status=body.status,
        version=1,
        group_by=body.group_by.model_dump() if body.group_by else None,
        run_params=body.run_params.model_dump() if body.run_params else None,
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
    rule = await _load_rule(db, rule_id)
    return _rule_out(rule).model_copy(update={"run_params": await describe_run_params(db, rule)})


@router.patch("/{rule_id}", response_model=RuleOut, dependencies=WRITE_DEPS)
async def update_rule(rule_id: str, body: RulePatch, db: AsyncSession = Depends(get_db)):
    rule = await _load_rule(db, rule_id)
    data = body.model_dump(exclude_unset=True)
    # `version` is the record's revision: every accepted change is a new one, and the alert records which
    # revision fired. A no-op save stays put — the page saves one card at a time and must not inflate it.
    changed = False

    if body.metric_id is not None:
        metric_id = (await _metric_or_400(db, body.metric_id)).id
        changed = changed or metric_id != rule.metric_id
        rule.metric_id = metric_id
    if body.condition is not None or body.identities is not None:
        condition, identities = _validate_definition(
            {"condition": body.condition, "identities": body.identities}
        )
        await _validate_metric_refs(db, condition, identities)
        changed = changed or condition != rule.condition or identities != rule.identities
        rule.condition = condition
        rule.identities = identities
    if body.run_params is not None:
        effective_group = (
            body.group_by.field
            if body.group_by is not None
            else (rule.group_by or {}).get("field")
        )
        await _validate_run_params(db, rule.metric_id, body.run_params, effective_group)
        stored = body.run_params.model_dump()
        changed = changed or stored != (rule.run_params or {})
        rule.run_params = stored
    if body.group_by is not None or "group_by" in body.model_fields_set:
        metric = await _metric_or_400(db, rule.metric_id)
        await _validate_group_by(db, metric, body.group_by)
        stored_group = body.group_by.model_dump() if body.group_by else None
        changed = changed or stored_group != rule.group_by
        rule.group_by = stored_group

    if body.rule_id is not None and body.rule_id != rule.slug:
        if await _slug_taken(db, body.rule_id, exclude=rule.id):
            raise HTTPException(status_code=409, detail=f"rule_id '{body.rule_id}' is taken")
        changed = True
        rule.slug = body.rule_id
    for field_name in (
        "name",
        "description",
        "severity",
        "conclusion",
        "suggestion",
        "owner",
        "status",
    ):
        if field_name in data and data[field_name] is not None:
            changed = changed or getattr(rule, field_name) != data[field_name]
            setattr(rule, field_name, data[field_name])
    if changed:
        rule.version += 1
    await db.flush()
    await sync_rule_refs(db, rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_out(rule).model_copy(update={"run_params": await describe_run_params(db, rule)})


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
    try:
        results = await evaluate_rule_in_snapshot(
            request,
            rule_id=rule.id,
            dry_run=body.dry_run,
            values=body.values,
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
    results = await evaluate_subject_in_snapshot(
        request,
        metric_id=body.metric_id,
        values=body.values,
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
