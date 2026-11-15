"""Which metrics a rule references — a projection, written whenever the rule is written.

The rule itself stores its operands inside `condition` / `relation` (JSONB) because those are *definitions*:
arbitrary operands, kept next to the rule. But three questions need the reference as a fact rather than a
string to be parsed:

* **which rules touch this metric?** (the metric page's "run the checks on this number", and its result badge)
* **which metrics has no rule touched?** (coverage — "nobody verifies this")
* **may this metric be deleted?** (today it can, and the rules silently become undecidable)

This table is derived, never authored: `sync_rule_refs` rewrites a rule's rows on every write, and a metric
delete inside a transaction checks them first. If the table is empty on startup (first deploy after the
migration), `backfill_rule_refs` rebuilds it from the stored rules.
"""
from __future__ import annotations

import json
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.object_instance import ObjectInstance
from app.models.rule_metric_ref import RuleMetricRef
from app.services.ontology.rules.builtin import builtin_types


def _operand_metrics(operand: object) -> list[str]:
    """Metric ids inside one operand (ratio/diff nest, so this recurses)."""
    if not isinstance(operand, dict):
        return []
    if isinstance(operand.get("metric"), str):
        return [operand["metric"]]
    out: list[str] = []
    for pair_key in ("ratio", "diff"):
        pair = operand.get(pair_key)
        if isinstance(pair, list):
            for entry in pair:
                out.extend(_operand_metrics(entry))
    return out


def _condition_metrics(condition: object) -> list[str]:
    if not isinstance(condition, dict):
        return []
    if isinstance(condition.get("all"), list):
        return [ref for child in condition["all"] for ref in _condition_metrics(child)]
    out = _operand_metrics(condition.get("left"))
    out.extend(_operand_metrics(condition.get("right")))
    return out


def _json(value: object) -> object:
    """Rule fields are stored as JSON *strings* (the object is a JSONB blob); parse what looks like JSON."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


def referenced_metrics(rule_data: dict) -> list[tuple[str, str]]:
    """`(metric_id, role)` pairs for one rule — the deduplicated, ordered reference set."""
    refs: list[tuple[str, str]] = []
    subject = _json(rule_data.get("subject"))
    if isinstance(subject, dict) and subject.get("kind") == "metric" and subject.get("ref"):
        refs.append((str(subject["ref"]), "subject"))
    for metric_id in _condition_metrics(_json(rule_data.get("condition"))):
        refs.append((metric_id, "condition"))
    relation = _json(rule_data.get("relation"))
    if isinstance(relation, dict):
        target = (relation.get("target") or {}).get("metric")
        if target:
            refs.append((str(target), "target"))
        for member in relation.get("members") or []:
            ref = (member or {}).get("metric")
            if ref:
                refs.append((str(ref), "member"))
    # One row per metric: the role records where it first appears, and a metric referenced twice is still
    # "referenced" for coverage and for the delete guard.
    seen: set[str] = set()
    return [ref for ref in refs if not (ref[0] in seen or seen.add(ref[0]))]


async def sync_rule_refs(db: AsyncSession, rule_id: str, rule_data: dict) -> None:
    """Rewrite one rule's references (delete + insert: a rule has a handful)."""
    await db.execute(RuleMetricRef.__table__.delete().where(RuleMetricRef.rule_id == rule_id))
    for metric_id, role in referenced_metrics(rule_data):
        db.add(
            RuleMetricRef(
                id=uuid.uuid4().hex,
                rule_id=rule_id,
                metric_id=metric_id,
                role=role,
            )
        )


async def rules_for_metric(db: AsyncSession, metric_id: str) -> list[str]:
    rows = (
        await db.execute(select(RuleMetricRef.rule_id).where(RuleMetricRef.metric_id == metric_id))
    ).scalars().all()
    return list(dict.fromkeys(rows))


async def metrics_with_rules(db: AsyncSession) -> set[str]:
    rows = (await db.execute(select(RuleMetricRef.metric_id).distinct())).scalars().all()
    return set(rows)


async def backfill_rule_refs(db: AsyncSession) -> int:
    """Rebuild the projection from stored rules — idempotent, run once at startup when rows are missing."""
    rule_type, _event_type = await builtin_types(db)
    if rule_type is None:
        return 0
    rules = (
        await db.execute(select(ObjectInstance).where(ObjectInstance.object_type_id == rule_type.id))
    ).scalars().all()
    known = (await db.execute(select(RuleMetricRef.rule_id).distinct())).scalars().all()
    known_ids = set(known)
    written = 0
    for rule in rules:
        if rule.id in known_ids:
            continue
        await sync_rule_refs(db, rule.id, dict(rule.data or {}))
        written += 1
    await db.commit()
    return written
