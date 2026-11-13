"""Evaluate one rule: resolve operands, compare, then publish or close an event.

Two evaluators, one pipeline. `{metric}` operands go through the data layer's metric engine
(`run_query`), `{dataset_agg}` operands through its dataset summary (`query_dataset_summary`); the
difference/ratio arithmetic and the comparison happen in memory. A rule never composes SQL — that
would make it a second query engine, with its own permission and timeout story.

Publishing rules (from the plan, §5):

* `None` from the condition means **unknown** (an operand could not be computed) — not a failure;
* a condition that stopped holding closes the open event (writes `event_end_time`, `resolved`);
* an event is only published when the rule carries a `suggestion` and `severity` is P0/P1.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.catalog_scoped import require_model_read
from app.models.metric_definition import MetricDefinition
from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType
from app.services.data.dataset_rows import query_dataset_summary
from app.services.data.query import run_query
from app.services.identity.acl.resource_acl_constants import PERM_READ
from app.services.ontology.object_neo4j_store import sync_queue_ids_to_neo4j
from app.services.workspace.evaluations.dataset_scope import load_dataset_scoped
from app.services.ontology.rules.builtin import builtin_types
from app.services.ontology.rules.conditions import (
    ConditionError,
    collect_datasets,
    collect_metrics,
    evaluate_condition,
    flatten_operands,
    operand_key,
    validate_condition,
)
from app.services.ontology.rules.links import link_event_about

#: Severities that are worth a human's attention. P2 is "worth knowing" and stays in last_status.
PUBLISHING_SEVERITIES = ("P0", "P1")

INTENT_BY_SEVERITY = {"P0": "danger", "P1": "warning", "P2": "primary"}


@dataclass
class EvalResult:
    rule_id: str
    status: str  # pass | fail | unknown | skipped
    values: dict[str, float | None] = field(default_factory=dict)
    event_id: str | None = None
    reason: str | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def _metric_value(
    db: AsyncSession, request: Request, metric_id: str, filters: list | None = None
) -> tuple[float | None, str]:
    metric = await db.get(MetricDefinition, metric_id)
    if metric is None:
        return None, f"metric {metric_id} not found"
    await require_model_read(metric.semantic_model_id, request, db)
    _sql, _columns, rows, _capped, _ms = await run_query(
        db, model_id=metric.semantic_model_id, metric=metric_id, filters=filters or None, limit=1
    )
    if not rows:
        return None, f"metric {metric_id} returned no rows"
    return _as_float(rows[0].get("value")), ""


async def _dataset_agg_value(
    db: AsyncSession, request: Request, spec: dict
) -> tuple[float | None, str]:
    dataset_id = str(spec.get("dataset_id"))
    # Same resource gate as the data grid: a rule may only read what the runner may read.
    await load_dataset_scoped(db, request, dataset_id, PERM_READ)
    fn = str(spec.get("fn"))
    column = spec.get("column")
    name = fn if not column else f"{fn}_{column}"
    summary = await query_dataset_summary(
        db,
        dataset_id,
        aggregates=[{"fn": fn, "column": column, "name": name}],
        filters=spec.get("filters") or [],
        limit=1,
    )
    if not summary.rows:
        return None, f"dataset {dataset_id} returned no rows"
    return _as_float(summary.rows[0].get(name)), ""


async def _resolve_operand(
    db: AsyncSession, request: Request, operand: dict
) -> tuple[float | None, str]:
    kind = next(key for key in operand if key != "filters")
    if kind == "metric":
        return await _metric_value(db, request, str(operand["metric"]), operand.get("filters"))
    if kind == "dataset_agg":
        return await _dataset_agg_value(db, request, operand["dataset_agg"])
    left, reason = await _resolve_operand(db, request, operand[kind][0])
    if left is None:
        return None, reason
    right, reason = await _resolve_operand(db, request, operand[kind][1])
    if right is None:
        return None, reason
    if kind == "diff":
        return left - right, ""
    if right == 0:
        return None, "ratio denominator is zero"
    return left / right, ""


def _rule_payload(instance: ObjectInstance) -> dict:
    return dict(instance.data or {})


async def _find_open_event(
    db: AsyncSession, event_type: ObjectType, *, rule_id: str, scope: str, period_start: str, period_end: str
) -> ObjectInstance | None:
    rows = (
        await db.execute(
            select(ObjectInstance).where(
                ObjectInstance.object_type_id == event_type.id,
                ObjectInstance.data["rule_id"].astext == rule_id,
                ObjectInstance.data["scope"].astext == scope,
                ObjectInstance.data["period_start"].astext == period_start,
                ObjectInstance.data["period_end"].astext == period_end,
                ObjectInstance.data["event_end_time"].astext.is_(None),
            )
        )
    ).scalars().all()
    return rows[0] if rows else None


async def _close_open_events(
    db: AsyncSession, event_type: ObjectType, *, rule_id: str, scope: str, period_start: str, period_end: str
) -> int:
    open_event = await _find_open_event(
        db, event_type, rule_id=rule_id, scope=scope, period_start=period_start, period_end=period_end
    )
    if open_event is None:
        return 0
    data = dict(open_event.data or {})
    data.update({"event_end_time": _now(), "status": "resolved", "intent": "success"})
    open_event.data = data
    await db.flush()
    await sync_queue_ids_to_neo4j(db, event_type, upsert_ids=[open_event.id], delete_ids=[])
    return 1


async def _upsert_event(
    db: AsyncSession,
    request: Request,
    *,
    rule: ObjectInstance,
    rule_data: dict,
    event_type: ObjectType,
    scope: str,
    period_start: str,
    period_end: str,
    values: dict[str, float | None],
) -> str:
    existing = await _find_open_event(
        db, event_type, rule_id=rule.id, scope=scope, period_start=period_start, period_end=period_end
    )
    evidence = {
        "rule_id": rule.id,
        "rule_version": rule_data.get("version", 1),
        "values": values,
        "at": _now(),
    }
    if existing is not None:
        data = dict(existing.data or {})
        data["evidence"] = json.dumps(evidence, ensure_ascii=False)
        existing.data = data
        await db.flush()
        await sync_queue_ids_to_neo4j(db, event_type, upsert_ids=[existing.id], delete_ids=[])
        return existing.id

    subject = rule_data.get("subject") or {}
    subject_type = subject.get("kind") if isinstance(subject, dict) else None
    subject_id = subject.get("ref") if isinstance(subject, dict) else None
    severity = str(rule_data.get("severity") or "P1")
    data = {
        "event_id": rule.id + ":" + (period_start or "") + ":" + (scope or ""),
        "title": str(rule_data.get("conclusion") or rule_data.get("name") or "rule hit"),
        "domain": str(rule_data.get("domain") or "metric"),
        "intent": INTENT_BY_SEVERITY.get(severity, "warning"),
        "severity": severity,
        "description": str(rule_data.get("suggestion") or ""),
        "event_start_time": _now(),
        "event_end_time": None,
        "period_start": period_start,
        "period_end": period_end,
        "scope": scope,
        "evidence": json.dumps(evidence, ensure_ascii=False),
        "status": "open",
        "assignee": None,
        "rule_id": rule.id,
        "rule_version": rule_data.get("version", 1),
        "subject_type": subject_type,
        "subject_id": subject_id,
        "dedupe_key": "|".join([rule.id, scope or "", period_start or "", period_end or ""]),
    }
    instance = ObjectInstance(id=__import__("uuid").uuid4().hex, object_type_id=event_type.id, data=data)
    db.add(instance)
    await db.flush()
    await sync_queue_ids_to_neo4j(db, event_type, upsert_ids=[instance.id], delete_ids=[])
    await link_event_about(
        db,
        event_type=event_type,
        event_instance_id=instance.id,
        target_api_name=rule_data.get("about_object_type"),
        scope=scope or None,
    )
    return instance.id


async def evaluate_rule(
    db: AsyncSession,
    request: Request,
    *,
    rule: ObjectInstance,
    period_start: str = "",
    period_end: str = "",
    scope: str = "",
) -> EvalResult:
    rule_data = _rule_payload(rule)
    rule_type, event_type = await builtin_types(db)
    if event_type is None:
        raise RuntimeError("Event object type is missing — restart the backend to run the bootstrap")

    condition = rule_data.get("condition")
    if isinstance(condition, str):
        try:
            condition = json.loads(condition)
        except json.JSONDecodeError as exc:
            raise ConditionError(f"condition is not valid JSON: {exc}") from exc
    validate_condition(condition)

    resolved: dict[str, float | None] = {}
    reasons: list[str] = []
    for operand in flatten_operands(condition):
        value, reason = await _resolve_operand(db, request, operand)
        resolved[operand_key(operand)] = value
        if value is None and reason:
            reasons.append(reason)

    hit = evaluate_condition(condition, resolved)
    values = {operand_key(op): resolved.get(operand_key(op)) for op in flatten_operands(condition)}

    status = "unknown" if hit is None else ("fail" if hit else "pass")
    event_id: str | None = None

    if hit is False:
        await _close_open_events(
            db, event_type, rule_id=rule.id, scope=scope, period_start=period_start, period_end=period_end
        )
    elif hit is True:
        severity = str(rule_data.get("severity") or "P1")
        if rule_data.get("suggestion") and severity in PUBLISHING_SEVERITIES:
            event_id = await _upsert_event(
                db,
                request,
                rule=rule,
                rule_data=rule_data,
                event_type=event_type,
                scope=scope,
                period_start=period_start,
                period_end=period_end,
                values=values,
            )
        else:
            status = "pass"  # hit, but not worth an event: it stays in last_status only

    data = dict(rule.data or {})
    data.update(
        {
            "last_run_at": _now(),
            "last_status": status,
            "last_values": json.dumps(values, ensure_ascii=False, default=str),
            "last_scope": scope,
            "last_period_start": period_start,
            "last_period_end": period_end,
        }
    )
    rule.data = data
    await db.flush()
    if rule_type is not None:
        await sync_queue_ids_to_neo4j(db, rule_type, upsert_ids=[rule.id], delete_ids=[])

    return EvalResult(
        rule_id=rule.id,
        status=status,
        values=values,
        event_id=event_id,
        reason="; ".join(reasons) if reasons else None,
    )


async def evaluate_rules_for_subject(
    db: AsyncSession,
    request: Request,
    *,
    subject_type: str | None = None,
    subject_id: str | None = None,
    period_start: str = "",
    period_end: str = "",
    scope: str = "",
    limit: int = 100,
) -> list[EvalResult]:
    """Every active rule, optionally narrowed to one subject (a metric or a dataset)."""
    rule_type, _event_type = await builtin_types(db)
    if rule_type is None:
        return []
    rows = (
        await db.execute(
            select(ObjectInstance)
            .where(ObjectInstance.object_type_id == rule_type.id)
            .order_by(ObjectInstance.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    results: list[EvalResult] = []
    for rule in rows:
        data = _rule_payload(rule)
        if str(data.get("status") or "active") != "active":
            continue
        subject = data.get("subject") or {}
        if isinstance(subject, str):
            try:
                subject = json.loads(subject)
            except json.JSONDecodeError:
                subject = {}
        if subject_type and str(subject.get("kind")) != subject_type:
            continue
        if subject_id and str(subject.get("ref")) != subject_id:
            continue
        try:
            results.append(
                await evaluate_rule(
                    db, request, rule=rule, period_start=period_start, period_end=period_end, scope=scope
                )
            )
        except ConditionError as exc:
            results.append(EvalResult(rule_id=rule.id, status="skipped", reason=str(exc)))
    return results


__all__ = [
    "EvalResult",
    "PUBLISHING_SEVERITIES",
    "collect_datasets",
    "collect_metrics",
    "evaluate_rule",
    "evaluate_rules_for_subject",
]
