"""Which metrics a rule references — a real table with real foreign keys.

The rule's own definition lives in `condition` / `identities` (JSONB): arbitrary operands belong next to the
rule. But three questions need the reference as a fact:

* which rules touch this metric? (metric page's run-the-checks and its badge)
* which metrics has no rule touched? (coverage)
* may this metric be deleted? (the FK says no — RESTRICT)

`sync_rule_refs` rewrites a rule's rows on every write; a metric delete inside a transaction is then refused
by the database, and the API turns that into a readable 409.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.metric_rule import MetricRule, MetricRuleRef


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


def referenced_metrics(rule: MetricRule) -> list[tuple[str, str]]:
    """`(metric_id, role)` pairs for one rule — one entry per metric, role = where it first appears."""
    refs: list[tuple[str, str]] = [(rule.metric_id, "subject")]
    for metric_id in _condition_metrics(rule.condition):
        refs.append((metric_id, "condition"))
    for identity in rule.identities or []:
        if not isinstance(identity, dict):
            continue
        target = (identity.get("target") or {}).get("metric")
        if target:
            refs.append((str(target), "target"))
        for member in identity.get("members") or []:
            ref = (member or {}).get("metric")
            if ref:
                refs.append((str(ref), "member"))
    seen: set[str] = set()
    return [ref for ref in refs if not (ref[0] in seen or seen.add(ref[0]))]


def referenced_metric_ids(payload: dict) -> list[str]:
    """Every distinct metric id a `{condition, identities}` definition names (the subject is a column)."""
    ids = _condition_metrics(payload.get("condition"))
    for identity in payload.get("identities") or []:
        if not isinstance(identity, dict):
            continue
        target = (identity.get("target") or {}).get("metric")
        if target:
            ids.append(str(target))
        ids.extend(
            str((m or {}).get("metric"))
            for m in identity.get("members") or []
            if (m or {}).get("metric")
        )
    seen: set[str] = set()
    return [m for m in ids if not (m in seen or seen.add(m))]


async def sync_rule_refs(db: AsyncSession, rule: MetricRule) -> None:
    await db.execute(MetricRuleRef.__table__.delete().where(MetricRuleRef.rule_id == rule.id))
    for metric_id, role in referenced_metrics(rule):
        db.add(
            MetricRuleRef(
                id=uuid.uuid4().hex,
                rule_id=rule.id,
                metric_id=metric_id,
                role=role,
                is_subject=role == "subject",
            )
        )


async def rules_for_metric(db: AsyncSession, metric_id: str) -> list[str]:
    rows = (
        await db.execute(select(MetricRuleRef.rule_id).where(MetricRuleRef.metric_id == metric_id))
    ).scalars().all()
    return list(dict.fromkeys(rows))


async def metrics_with_rules(db: AsyncSession) -> set[str]:
    rows = (await db.execute(select(MetricRuleRef.metric_id).distinct())).scalars().all()
    return set(rows)
