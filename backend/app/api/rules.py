"""Rules app API: author rules, run them, read what they produced.

Rules and events are **ontology objects** (`Rule` / `Event`, no dataset), so this router only adds
what the generic object-instance API cannot express: validating a condition, running it, and the
denormalised read the Rules page needs (rule + last run).

Layering: this module belongs to the ontology layer and *calls into* the data layer (metric engine,
dataset summaries) — never the other way round.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.object_instance import ObjectInstance
from app.services.identity.permissions.permission_catalog import (
    PERM_CONSOLE_OBJECT_TYPES,
    PERM_ONTOLOGY_WRITE,
)
from app.api.auth import require_any_permission, require_auth
from app.services.ontology.object_neo4j_store import sync_queue_ids_to_neo4j
from app.services.ontology.rules.builtin import builtin_types
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

router = APIRouter(prefix="/rules", tags=["rules"])

WRITE_DEPS = [Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE))]


class RuleSubject(BaseModel):
    kind: str = Field(pattern="^(metric|dataset)$")
    ref: str


class RuleWrite(BaseModel):
    name: str
    subject: RuleSubject
    condition: dict[str, Any]
    severity: str = Field(default="P1", pattern="^P[0-2]$")
    conclusion: str = ""
    suggestion: str = ""
    domain: str = "metric"
    owner: str | None = None
    ai_context: str | None = None
    about_object_type: str | None = None
    status: str = Field(default="active", pattern="^(active|paused)$")


class RulePatch(BaseModel):
    name: str | None = None
    subject: RuleSubject | None = None
    condition: dict[str, Any] | None = None
    severity: str | None = Field(default=None, pattern="^P[0-2]$")
    conclusion: str | None = None
    suggestion: str | None = None
    owner: str | None = None
    ai_context: str | None = None
    about_object_type: str | None = None
    status: str | None = Field(default=None, pattern="^(active|paused)$")


class RuleOut(BaseModel):
    object_id: str
    name: str | None = None
    domain: str | None = None
    subject: dict | None = None
    condition: dict | None = None
    severity: str | None = None
    conclusion: str | None = None
    suggestion: str | None = None
    owner: str | None = None
    status: str | None = None
    version: int | None = None
    last_run_at: str | None = None
    last_status: str | None = None
    last_values: dict | None = None
    ai_context: str | None = None
    about_object_type: str | None = None


class RuleEvaluateRequest(BaseModel):
    period_start: str = ""
    period_end: str = ""
    scope: str = ""


class RulesEvaluateRequest(RuleEvaluateRequest):
    subject_type: str | None = Field(default=None, pattern="^(metric|dataset)$")
    subject_id: str | None = None


class EvalOut(BaseModel):
    rule_id: str
    status: str
    values: dict[str, float | None] = {}
    event_id: str | None = None
    reason: str | None = None


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
        name=data.get("name"),
        domain=data.get("domain"),
        subject=_parse_maybe_json(data.get("subject")),
        condition=_parse_maybe_json(data.get("condition")),
        severity=data.get("severity"),
        conclusion=data.get("conclusion"),
        suggestion=data.get("suggestion"),
        owner=data.get("owner"),
        status=data.get("status"),
        version=int(data.get("version") or 1),
        last_run_at=data.get("last_run_at"),
        last_status=data.get("last_status"),
        last_values=_parse_maybe_json(data.get("last_values")),
        ai_context=data.get("ai_context"),
        about_object_type=data.get("about_object_type"),
    )


def _eval_out(result: EvalResult) -> EvalOut:
    return EvalOut(
        rule_id=result.rule_id,
        status=result.status,
        values=result.values,
        event_id=result.event_id,
        reason=result.reason,
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


def _write_values(payload: RuleWrite, request: Request) -> dict[str, Any]:
    try:
        validate_condition(payload.condition)
    except ConditionError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid condition: {exc}") from exc
    p = request.state.openkms_jwt_payload
    uname = p.get("preferred_username") or p.get("name")
    return {
        "id": uuid.uuid4().hex,
        "name": payload.name.strip(),
        "domain": payload.domain,
        "subject": json.dumps(payload.subject.model_dump(), ensure_ascii=False),
        "condition": json.dumps(payload.condition, ensure_ascii=False),
        "severity": payload.severity,
        "conclusion": payload.conclusion,
        "suggestion": payload.suggestion,
        "owner": payload.owner or (str(uname) if uname else None),
        "status": payload.status,
        "version": 1,
        "about_object_type": payload.about_object_type,
        "ai_context": payload.ai_context,
        "created_by_name": str(uname) if uname else None,
    }


@router.get("", response_model=list[RuleOut], dependencies=[Depends(require_auth)])
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
    instance = ObjectInstance(id=data.pop("id"), object_type_id=rule_type.id, data=data)
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
    changed_condition = body.condition is not None
    if changed_condition:
        try:
            validate_condition(body.condition)
        except ConditionError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid condition: {exc}") from exc
        data["condition"] = json.dumps(body.condition, ensure_ascii=False)
    for field_name in ("name", "severity", "conclusion", "suggestion", "owner", "ai_context", "status"):
        value = getattr(body, field_name)
        if value is not None:
            data[field_name] = value
    if body.subject is not None:
        data["subject"] = json.dumps(body.subject.model_dump(), ensure_ascii=False)
        data["domain"] = body.subject.kind
    if body.about_object_type is not None:
        data["about_object_type"] = body.about_object_type
    if changed_condition:
        data["version"] = int(data.get("version") or 1) + 1
    instance.data = data
    await db.flush()
    await sync_queue_ids_to_neo4j(db, rule_type, upsert_ids=[instance.id], delete_ids=[])
    await db.commit()
    await db.refresh(instance)
    return _rule_out(instance)


@router.post("/{rule_id}/evaluate", response_model=EvalOut, dependencies=[Depends(require_auth)])
async def evaluate_one(
    rule_id: str,
    request: Request,
    body: RuleEvaluateRequest,
    db: AsyncSession = Depends(get_db),
):
    rule_type, _event_type = await _rule_type_or_409(db)
    instance = await _load_rule(db, rule_id, rule_type)
    try:
        result = await evaluate_rule(
            db,
            request,
            rule=instance,
            period_start=body.period_start,
            period_end=body.period_end,
            scope=body.scope,
        )
    except ConditionError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid condition: {exc}") from exc
    await db.commit()
    return _eval_out(result)


@router.post("/evaluate", response_model=EvaluateResponse, dependencies=[Depends(require_auth)])
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
        scope=body.scope,
    )
    await db.commit()
    return EvaluateResponse(
        results=[_eval_out(result) for result in results],
        failed=sum(1 for result in results if result.status == "fail"),
        unknown=sum(1 for result in results if result.status == "unknown"),
    )


__all__ = ["router", "collect_datasets", "collect_metrics"]
