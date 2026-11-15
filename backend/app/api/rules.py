"""Rules app API: author rules, run them, read what they produced.

Rules and events are **ontology objects** (`Rule` / `Event`, no dataset), so this router only adds
what the generic object-instance API cannot express: validating a condition, running it, and the
denormalised read the Rules page needs (rule + last run).

Layering: this module belongs to the ontology layer and *calls into* the data layer (metric engine,
dataset summaries) — never the other way round.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.dataset_column import DatasetColumn
from app.models.metric_definition import MetricDefinition
from app.models.object_instance import ObjectInstance
from app.models.semantic_model_field import SemanticModelField
from app.services.identity.permissions.permission_catalog import (
    PERM_CONSOLE_OBJECT_TYPES,
    PERM_DATA_READ,
    PERM_DATA_WRITE,
    PERM_ONTOLOGY_WRITE,
)
from app.api.auth import require_any_permission
from app.services.ontology.object_neo4j_store import sync_queue_ids_to_neo4j
from app.services.ontology.rules.builtin import builtin_types
from app.services.ontology.rules.relations import RelationError, validate_relation
from app.services.ontology.rules.conditions import (
    ConditionError,
    collect_datasets,
    collect_metrics,
    validate_condition,
)
from app.services.ontology.rules.evaluator import (
    EvalResult,
    evaluate_rule,
    evaluate_rules_for_subject,
)
from app.services.ontology.rules.events import (
    STATUSES,
    counts_by_subject,
    list_events,
    transition,
)

router = APIRouter(prefix="/rules", tags=["rules"])
events_router = APIRouter(prefix="/events", tags=["rules"])


# Catalog's own permissions: writing a rule is a data-layer act (analysts do it), while an ontology
# admin may still do it — the objects live in the ontology, the work lives in Catalog.
WRITE_DEPS = [
    Depends(require_any_permission(PERM_DATA_WRITE, PERM_ONTOLOGY_WRITE, PERM_CONSOLE_OBJECT_TYPES))
]
READ_DEPS = [Depends(require_any_permission(PERM_DATA_READ, PERM_DATA_WRITE, PERM_ONTOLOGY_WRITE))]


class RuleSubject(BaseModel):
    kind: str = Field(pattern="^(metric|dataset)$")
    ref: str


class RuleGroup(BaseModel):
    """The dimension a rule is evaluated per: `scenario_id`, called "方案" for a reader."""

    field: str = Field(min_length=1)
    label: str | None = None


SLUG = r"^[a-z][a-z0-9-]{1,63}$"


def _slugify(name: str) -> str:
    """An ASCII slug from a name; a name with no ASCII (e.g. Chinese) gets a stable short fallback."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)[:48].strip("-")
    return slug if len(slug) >= 2 else "rule"


class RuleWrite(BaseModel):
    name: str
    rule_id: str | None = Field(default=None, pattern=SLUG)
    subject: RuleSubject
    #: One of the two, not both: a threshold check, or an identity between metrics.
    condition: dict[str, Any] | None = None
    relation: dict[str, Any] | None = None
    severity: str = Field(default="P1", pattern="^P[0-2]$")
    conclusion: str = ""
    suggestion: str = ""
    domain: str = "metric"
    owner: str | None = None
    ai_context: str | None = None
    about_object_type: str | None = None
    group_by: RuleGroup | None = None
    status: str = Field(default="active", pattern="^(active|paused)$")


class RulePatch(BaseModel):
    name: str | None = None
    rule_id: str | None = Field(default=None, pattern=SLUG)
    subject: RuleSubject | None = None
    condition: dict[str, Any] | None = None
    relation: dict[str, Any] | None = None
    severity: str | None = Field(default=None, pattern="^P[0-2]$")
    conclusion: str | None = None
    suggestion: str | None = None
    owner: str | None = None
    ai_context: str | None = None
    about_object_type: str | None = None
    group_by: RuleGroup | None = None
    status: str | None = Field(default=None, pattern="^(active|paused)$")


class RuleOut(BaseModel):
    object_id: str
    rule_id: str | None = None
    name: str | None = None
    domain: str | None = None
    subject: dict | None = None
    condition: dict | None = None
    relation: dict | None = None
    severity: str | None = None
    conclusion: str | None = None
    suggestion: str | None = None
    owner: str | None = None
    status: str | None = None
    version: int | None = None
    last_run_at: str | None = None
    last_status: str | None = None
    last_values: dict | None = None
    last_groups: int | None = None
    last_failed_groups: list[str] | None = None
    ai_context: str | None = None
    about_object_type: str | None = None
    group_by: dict | None = None


class RuleEvaluateRequest(BaseModel):
    period_start: str = ""
    period_end: str = ""
    #: 试算 — compute the numbers, publish nothing, keep `last_*` untouched.
    dry_run: bool = False


class RulesEvaluateRequest(RuleEvaluateRequest):
    subject_type: str | None = Field(default=None, pattern="^(metric|dataset)$")
    subject_id: str | None = None


class EvalOut(BaseModel):
    rule_id: str
    status: str
    values: dict[str, float | None] = {}
    event_id: str | None = None
    reason: str | None = None
    group: dict | None = None
    would_publish: bool = False


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
    scope: str | None = None
    description: str | None = None
    evidence: str | None = None
    rule_id: str | None = None
    rule_object_id: str | None = None
    rule_version: int | None = None
    subject_type: str | None = None
    subject_id: str | None = None
    assignee: str | None = None


class EventListResponse(BaseModel):
    items: list[EventOut]
    total: int


class EventCount(BaseModel):
    subject_id: str
    total: int
    open: int


class EventTransition(BaseModel):
    status: str | None = Field(default=None, pattern="^(open|acknowledged|dismissed|resolved)$")
    assignee: str | None = None
    note: str | None = None


class EvaluateResponse(BaseModel):
    results: list[EvalOut]
    failed: int = 0
    unknown: int = 0


def _parse_maybe_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


def _rule_out(instance: ObjectInstance) -> RuleOut:
    data = dict(instance.data or {})
    return RuleOut(
        object_id=instance.id,
        rule_id=data.get("rule_id"),
        name=data.get("name"),
        domain=data.get("domain"),
        subject=_parse_maybe_json(data.get("subject")),
        condition=_parse_maybe_json(data.get("condition")),
        relation=_parse_maybe_json(data.get("relation")),
        severity=data.get("severity"),
        conclusion=data.get("conclusion"),
        suggestion=data.get("suggestion"),
        owner=data.get("owner"),
        status=data.get("status"),
        version=int(data.get("version") or 1),
        last_run_at=data.get("last_run_at"),
        last_status=data.get("last_status"),
        last_values=_parse_maybe_json(data.get("last_values")),
        last_groups=int(data["last_groups"]) if data.get("last_groups") is not None else None,
        last_failed_groups=_parse_maybe_json(data.get("last_failed_groups")),
        ai_context=data.get("ai_context"),
        about_object_type=data.get("about_object_type"),
        group_by=_parse_maybe_json(data.get("group_by")) if data.get("group_by") else None,
    )


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


async def _rule_type_or_409(db: AsyncSession):
    rule_type, event_type = await builtin_types(db)
    if rule_type is None or event_type is None:
        raise HTTPException(
            status_code=409,
            detail="Rule/Event object types are missing; restart the backend to run the ontology bootstrap",
        )
    return rule_type, event_type


async def _load_rule(db: AsyncSession, rule_id: str, rule_type) -> ObjectInstance:
    instance = await db.get(ObjectInstance, rule_id)
    if instance is None or instance.object_type_id != rule_type.id:
        raise HTTPException(status_code=404, detail="Rule not found")
    return instance


async def _group_field_known(
    db: AsyncSession, subject: dict | None, field: str
) -> tuple[bool, list[str]]:
    """Is `group_by.field` something the subject can actually group by?

    A metric rule asks its model; a dataset rule asks the dataset's columns. An unknown field used to
    surface at run time as "条件无法判断" (a `None` operand), which reads like a data problem rather than
    a typo — so it is a save-time 400 with the names that do exist.
    """
    kind = (subject or {}).get("kind")
    ref = (subject or {}).get("ref")
    if kind == "metric" and ref:
        metric = await db.get(MetricDefinition, str(ref))
        if metric is None:
            metric = (
                await db.execute(
                    select(MetricDefinition).where(
                        MetricDefinition.semantic_model_id == str(ref),
                        MetricDefinition.name == str(ref),
                    )
                )
            ).scalars().first()
        if metric is not None:
            rows = (
                await db.execute(
                    select(SemanticModelField.name, SemanticModelField.column_name).where(
                        SemanticModelField.semantic_model_id == metric.semantic_model_id
                    )
                )
            ).all()
            names = sorted({str(n) for name_col in rows for n in name_col if n})
            return field in names, names
    if kind == "dataset" and ref:
        rows = (
            await db.execute(
                select(DatasetColumn.column_name).where(DatasetColumn.dataset_id == str(ref))
            )
        ).scalars().all()
        names = sorted({str(n) for n in rows if n})
        return field in names, names
    # An unresolvable subject is not this check's business — the evaluate step reports it.
    return True, []


async def _validate_group_by(db: AsyncSession, subject: dict | None, group: RuleGroup | None) -> None:
    if group is None:
        return
    ok, names = await _group_field_known(db, subject, group.field)
    if ok:
        return
    hint = ", ".join(names[:12]) if names else "nothing is declared"
    raise HTTPException(
        status_code=400,
        detail=f"group_by.field '{group.field}' is not a field of this subject (known: {hint}).",
    )


async def _rule_id_taken(db: AsyncSession, rule_type, rule_id: str, *, exclude: str | None = None) -> bool:
    rows = (
        await db.execute(
            select(ObjectInstance.id).where(
                ObjectInstance.object_type_id == rule_type.id,
                ObjectInstance.data["rule_id"].astext == rule_id,
            )
        )
    ).scalars().all()
    return any(row != exclude for row in rows)


def _validate_relation_refs(relation: dict) -> None:
    """Every member names a metric — the evaluator resolves it, and a typo is a 400, not an `unknown`."""
    refs = [relation["target"]["metric"], *(m["metric"] for m in relation["members"])]
    for ref in refs:
        if not str(ref).strip():
            raise RelationError("relation references an empty metric.")


def _write_values(payload: RuleWrite, request: Request) -> dict[str, Any]:
    if bool(payload.condition) == bool(payload.relation):
        raise HTTPException(
            status_code=400,
            detail="A rule needs exactly one of `condition` (a threshold) and `relation` (an identity).",
        )
    if payload.condition:
        try:
            validate_condition(payload.condition)
        except ConditionError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid condition: {exc}") from exc
    if payload.relation:
        try:
            validate_relation(payload.relation)
            _validate_relation_refs(payload.relation)
        except RelationError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid relation: {exc}") from exc
    p = request.state.openkms_jwt_payload
    uname = p.get("preferred_username") or p.get("name")
    rule_id = (payload.rule_id or "").strip() or _slugify(payload.name)
    return {
        "rule_id": rule_id,
        "name": payload.name.strip(),
        "domain": payload.domain,
        "subject": json.dumps(payload.subject.model_dump(), ensure_ascii=False),
        "condition": (
            json.dumps(payload.condition, ensure_ascii=False) if payload.condition else None
        ),
        "relation": (
            json.dumps(payload.relation, ensure_ascii=False) if payload.relation else None
        ),
        "severity": payload.severity,
        "conclusion": payload.conclusion,
        "suggestion": payload.suggestion,
        "owner": payload.owner or (str(uname) if uname else None),
        "status": payload.status,
        "version": 1,
        "about_object_type": payload.about_object_type,
        "group_by": json.dumps(payload.group_by.model_dump(), ensure_ascii=False) if payload.group_by else None,
        "ai_context": payload.ai_context,
        "created_by_name": str(uname) if uname else None,
    }


@router.get("", response_model=list[RuleOut], dependencies=READ_DEPS)
async def list_rules(
    request: Request,
    subject_type: str | None = Query(None, pattern="^(metric|dataset)$"),
    subject_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Every rule, optionally narrowed to one subject (a metric or a dataset)."""
    rule_type, _event_type = await _rule_type_or_409(db)
    rows = (
        await db.execute(
            select(ObjectInstance)
            .where(ObjectInstance.object_type_id == rule_type.id)
            .order_by(ObjectInstance.created_at.desc())
        )
    ).scalars().all()
    out: list[RuleOut] = []
    for instance in rows:
        item = _rule_out(instance)
        if subject_type and (item.subject or {}).get("kind") != subject_type:
            continue
        if subject_id and (item.subject or {}).get("ref") != subject_id:
            continue
        out.append(item)
    return out


@router.post("", response_model=RuleOut, status_code=201, dependencies=WRITE_DEPS)
async def create_rule(request: Request, body: RuleWrite, db: AsyncSession = Depends(get_db)):
    rule_type, event_type = await _rule_type_or_409(db)
    data = _write_values(body, request)
    await _validate_group_by(db, body.subject.model_dump(), body.group_by)
    if await _rule_id_taken(db, rule_type, data["rule_id"]):
        raise HTTPException(status_code=409, detail=f"rule_id '{data['rule_id']}' is taken")
    instance = ObjectInstance(id=uuid.uuid4().hex, object_type_id=rule_type.id, data=data)
    db.add(instance)
    await db.flush()
    await sync_queue_ids_to_neo4j(db, rule_type, upsert_ids=[instance.id], delete_ids=[])
    await db.commit()
    await db.refresh(instance)
    return _rule_out(instance)


@router.patch("/{rule_id}", response_model=RuleOut, dependencies=WRITE_DEPS)
async def update_rule(
    rule_id: str, request: Request, body: RulePatch, db: AsyncSession = Depends(get_db)
):
    rule_type, _event_type = await _rule_type_or_409(db)
    instance = await _load_rule(db, rule_id, rule_type)
    data = dict(instance.data or {})
    changed_condition = body.condition is not None or body.relation is not None
    if body.condition is not None and body.relation is not None:
        raise HTTPException(
            status_code=400,
            detail="A rule needs exactly one of `condition` (a threshold) and `relation` (an identity).",
        )
    if body.condition is not None:
        try:
            validate_condition(body.condition)
        except ConditionError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid condition: {exc}") from exc
        data["condition"] = json.dumps(body.condition, ensure_ascii=False)
        data["relation"] = None
    if body.relation is not None:
        try:
            validate_relation(body.relation)
            _validate_relation_refs(body.relation)
        except RelationError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid relation: {exc}") from exc
        data["relation"] = json.dumps(body.relation, ensure_ascii=False)
        data["condition"] = None
    for field_name in ("name", "severity", "conclusion", "suggestion", "owner", "ai_context", "status"):
        value = getattr(body, field_name)
        if value is not None:
            data[field_name] = value
    if body.subject is not None:
        data["subject"] = json.dumps(body.subject.model_dump(), ensure_ascii=False)
        data["domain"] = body.subject.kind
    if body.about_object_type is not None:
        data["about_object_type"] = body.about_object_type
    if body.rule_id is not None and body.rule_id != data.get("rule_id"):
        if await _rule_id_taken(db, rule_type, body.rule_id, exclude=rule_id):
            raise HTTPException(status_code=409, detail=f"rule_id '{body.rule_id}' is taken")
        data["rule_id"] = body.rule_id
    if "group_by" in body.model_fields_set:
        subject = (
            body.subject.model_dump() if body.subject else _parse_maybe_json(data.get("subject"))
        )
        await _validate_group_by(db, subject if isinstance(subject, dict) else None, body.group_by)
        data["group_by"] = (
            json.dumps(body.group_by.model_dump(), ensure_ascii=False) if body.group_by else None
        )
    if changed_condition:
        data["version"] = int(data.get("version") or 1) + 1
    instance.data = data
    await db.flush()
    await sync_queue_ids_to_neo4j(db, rule_type, upsert_ids=[instance.id], delete_ids=[])
    await db.commit()
    await db.refresh(instance)
    return _rule_out(instance)


@router.get("/{rule_id}", response_model=RuleOut, dependencies=READ_DEPS)
async def get_rule(rule_id: str, db: AsyncSession = Depends(get_db)):
    rule_type, _event_type = await _rule_type_or_409(db)
    return _rule_out(await _load_rule(db, rule_id, rule_type))


@router.delete("/{rule_id}", status_code=204, dependencies=WRITE_DEPS)
async def delete_rule(rule_id: str, db: AsyncSession = Depends(get_db)):
    """Delete the rule object. Its events stay: they are history, not a cascade."""
    rule_type, _event_type = await _rule_type_or_409(db)
    instance = await _load_rule(db, rule_id, rule_type)
    await db.delete(instance)
    await db.commit()


@router.get("/{rule_id}/events", response_model=EventListResponse, dependencies=READ_DEPS)
async def list_rule_events(
    rule_id: str,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    rule_type, event_type = await _rule_type_or_409(db)
    await _load_rule(db, rule_id, rule_type)
    # The path id is the rule's object id; events point at it through `rule_object_id`.
    items, total = await list_events(
        db, event_type, rule_object_id=rule_id, status=status, limit=limit, offset=offset
    )
    return EventListResponse(items=[EventOut(**item) for item in items], total=total)


@router.post("/{rule_id}/evaluate", response_model=EvaluateResponse, dependencies=READ_DEPS)
async def evaluate_one(
    rule_id: str,
    request: Request,
    body: RuleEvaluateRequest,
    db: AsyncSession = Depends(get_db),
):
    rule_type, _event_type = await _rule_type_or_409(db)
    instance = await _load_rule(db, rule_id, rule_type)
    try:
        results = await evaluate_rule(
            db,
            request,
            rule=instance,
            period_start=body.period_start,
            period_end=body.period_end,
            dry_run=body.dry_run,
        )
    except ConditionError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid condition: {exc}") from exc
    await db.commit()
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
    await _rule_type_or_409(db)
    results = await evaluate_rules_for_subject(
        db,
        request,
        subject_type=body.subject_type,
        subject_id=body.subject_id,
        period_start=body.period_start,
        period_end=body.period_end,
    )
    await db.commit()
    return EvaluateResponse(
        results=[_eval_out(result) for result in results],
        failed=sum(1 for result in results if result.status == "fail"),
        unknown=sum(1 for result in results if result.status == "unknown"),
    )


@events_router.get("", response_model=EventListResponse, dependencies=READ_DEPS)
async def list_all_events(
    subject_type: str | None = Query(None, pattern="^(metric|dataset)$"),
    subject_id: str | None = None,
    rule_id: str | None = None,
    status: str | None = Query(None, pattern="^(open|acknowledged|dismissed|resolved)$"),
    severity: str | None = Query(None, pattern="^P[0-2]$"),
    open_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Events, newest first — the tab behind a rule, and behind a metric or a dataset."""
    _rule_type, event_type = await _rule_type_or_409(db)
    items, total = await list_events(
        db,
        event_type,
        subject_type=subject_type,
        subject_id=subject_id,
        rule_id=rule_id,
        status=status,
        severity=severity,
        open_only=open_only,
        limit=limit,
        offset=offset,
    )
    return EventListResponse(items=[EventOut(**item) for item in items], total=total)


@events_router.get("/summary", response_model=list[EventCount], dependencies=READ_DEPS)
async def event_summary(
    subject_type: str | None = Query(None, pattern="^(metric|dataset)$"),
    db: AsyncSession = Depends(get_db),
):
    """Open/total events per subject, for a badge on a metric or dataset row."""
    _rule_type, event_type = await _rule_type_or_409(db)
    rows = await counts_by_subject(db, event_type, subject_type=subject_type)
    return [EventCount(**row) for row in rows]


@events_router.patch("/{event_id}", response_model=EventOut, dependencies=READ_DEPS)
async def transition_event(event_id: str, body: EventTransition, request: Request, db: AsyncSession = Depends(get_db)):
    """Acknowledge / dismiss / resolve / reopen. Closing writes an end time; reopening clears it."""
    _rule_type, event_type = await _rule_type_or_409(db)
    instance = await db.get(ObjectInstance, event_id)
    if instance is None or instance.object_type_id != event_type.id:
        raise HTTPException(status_code=404, detail="Event not found")
    payload = body.model_dump(exclude_unset=True)
    if payload.get("status") is None and "assignee" not in payload and payload.get("note") is None:
        raise HTTPException(status_code=400, detail="Nothing to change")
    if payload.get("assignee") is None and body.status in ("acknowledged", "resolved"):
        p = request.state.openkms_jwt_payload
        uname = p.get("preferred_username") or p.get("name")
        payload["assignee"] = str(uname) if uname else None
    try:
        data = await transition(
            db,
            instance,
            status=payload.get("status"),
            assignee=payload.get("assignee"),
            note=payload.get("note"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await sync_queue_ids_to_neo4j(db, event_type, upsert_ids=[instance.id], delete_ids=[])
    await db.commit()
    return EventOut(**data)


__all__ = ["router", "events_router", "collect_datasets", "collect_metrics", "STATUSES"]
