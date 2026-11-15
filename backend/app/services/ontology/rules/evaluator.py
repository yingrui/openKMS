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
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.catalog_scoped import require_model_read
from app.models.metric_definition import MetricDefinition
from app.models.metric_rule import MetricEvent, MetricRule
from app.models.semantic_model import SemanticModel
from app.services.data.dataset_rows import query_dataset_summary
from app.services.ontology.rules.scoping import restricted_models_for_dataset, run_entity_scope
from app.services.data.query import run_query
from app.services.identity.acl.resource_acl_constants import PERM_READ
from app.services.workspace.evaluations.dataset_scope import load_dataset_scoped
from app.services.ontology.rules.relations import (
    RelationError,
    residual,
    tolerance_of,
    validate_relation,
    weight_of,
    within_tolerance,
)
from app.services.ontology.rules.conditions import (
    ConditionError,
    collect_datasets,
    collect_metrics,
    evaluate_groups,
    flatten_operands,
    operand_key,
    validate_condition,
)

#: One run fetches at most this many groups; beyond it the verdict is "cannot decide", never a partial set.
GROUP_LIMIT = 500

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
    group: dict | None = None
    #: Dry runs only: whether this hit carries advice and a publishable severity (so it *would* open one).
    would_publish: bool = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_field(value: Any) -> Any:
    """A rule property that is conceptually JSON but stored in the object's string property."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


def _as_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _rule_group_by(rule_data: dict) -> dict | None:
    """The dimension a rule is evaluated **per**: `{"field": "scenario_id", "label": "方案"}`.

    Palantir's rules are row pipelines: the dimension is a filter or a group-by *inside* the rule. Ours
    produce one verdict per subject, so a dimension the check is computed per is a group-by here too —
    and the run needs no parameter: one run covers every group and reports which ones fail.
    """
    group = _json_field(rule_data.get("group_by"))
    if not isinstance(group, dict) or not str(group.get("field") or "").strip():
        return None
    return group


def period_filters(period_field: str | None, period_start: str, period_end: str) -> list[dict]:
    """`period_field` bound to the run's dates — the one place a period becomes a data scope."""
    if not period_field or not (period_start or period_end):
        return []
    out: list[dict] = []
    if period_start:
        out.append({"field": period_field, "op": ">=", "value": period_start})
    if period_end:
        out.append({"field": period_field, "op": "<=", "value": period_end})
    return out


def period_binding(
    metric: MetricDefinition | None,
    operand_field: str | None,
    period_start: str,
    period_end: str,
) -> tuple[list[dict], str]:
    """`(filters, reason)` — how one operand relates to the run's period.

    Three cases, and the difference between them is the point:

    * **period** — a time dimension carries the period (the operand's own `period_field`, else the metric's
      `time_dimension`): filter this run to those rows;
    * **snapshot** — the number is written by each run (a stored snapshot, e.g. a scenario table's KPIs), so a
      run aimed at a past period is refused (`reason`): it cannot be recomputed, and serving today's value
      under yesterday's label would be worse than saying so;
    * **none** — no time concept: the period is a label on the run, and the alert says so.
    """
    field = (operand_field or "").strip() or (metric.time_dimension if metric else None)
    mode = metric.time_mode if metric and metric.time_mode else ("period" if field else "none")
    if mode == "snapshot":
        if period_end and period_end < _today():
            return [], (
                "this metric is a stored snapshot (written by each run), so it cannot be recomputed for "
                f"{period_start or period_end} — read the record of the run that produced it"
            )
        return [], ""
    if mode == "none" or not field:
        return [], ""
    return period_filters(field, period_start, period_end), ""


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


async def _metric_value(
    db: AsyncSession,
    request: Request,
    metric_id: str,
    filters: list | None = None,
    group_field: str | None = None,
    *,
    period_field: str | None = None,
    period: tuple[str, str] = ("", ""),
) -> tuple[float | None | dict[str, float | None], str]:
    metric = await db.get(MetricDefinition, metric_id)
    if metric is None:
        return None, f"metric {metric_id} not found"
    await require_model_read(metric.semantic_model_id, request, db)
    model = await db.get(SemanticModel, metric.semantic_model_id)
    if model is None:
        return None, f"metric {metric_id} has no semantic model"
    entity_scope, reason = await run_entity_scope(db, request, model)
    if reason:
        return None, reason
    period_scope, period_reason = period_binding(metric, period_field, *period)
    if period_reason:
        return None, period_reason
    filters = [*(filters or []), *period_scope] if period_scope else filters
    _sql, _columns, rows, capped, _ms = await run_query(
        db,
        model_id=metric.semantic_model_id,
        metric=metric_id,
        filters=filters or None,
        group_by=[{"field": group_field}] if group_field else None,
        limit=GROUP_LIMIT if group_field else 1,
        entity_scope=entity_scope,
    )
    if capped:
        return None, f"more than {GROUP_LIMIT} groups — the run cannot decide on a partial set"
    if not rows:
        return None, f"metric {metric_id} returned no rows"
    if group_field:
        return {str(row.get(group_field)): _as_float(row.get("value")) for row in rows}, ""
    return _as_float(rows[0].get("value")), ""


async def _dataset_agg_value(
    db: AsyncSession,
    request: Request,
    spec: dict,
    group_field: str | None = None,
    *,
    period_field: str | None = None,
    period: tuple[str, str] = ("", ""),
) -> tuple[float | None | dict[str, float | None], str]:
    dataset_id = str(spec.get("dataset_id"))
    # Same resource gate as the data grid: a rule may only read what the runner may read.
    await load_dataset_scoped(db, request, dataset_id, PERM_READ)
    restricted = await restricted_models_for_dataset(db, dataset_id)
    if restricted:
        # A dataset aggregate has no row policy (policies live on a model's data resources), so a rule over
        # a restricted model's dataset would read more rows than its author may see.
        return None, (
            "dataset aggregate over a restricted model does not apply row policies — use a metric instead"
        )
    # A dataset aggregate has no declared time semantics; it filters only when the operand names a column.
    period_scope = period_filters(period_field, *period)
    if period_scope:
        spec = {**spec, "filters": [*(spec.get("filters") or []), *period_scope]}
    fn = str(spec.get("fn"))
    column = spec.get("column")
    name = fn if not column else f"{fn}_{column}"
    summary = await query_dataset_summary(
        db,
        dataset_id,
        aggregates=[{"fn": fn, "column": column, "name": name}],
        filters=spec.get("filters") or [],
        group_by=[group_field] if group_field else None,
        limit=GROUP_LIMIT if group_field else 1,
    )
    if summary.capped:
        return None, f"more than {GROUP_LIMIT} groups — the run cannot decide on a partial set"
    if not summary.rows:
        return None, f"dataset {dataset_id} returned no rows"
    if group_field:
        return {str(row.get(group_field)): _as_float(row.get(name)) for row in summary.rows}, ""
    return _as_float(summary.rows[0].get(name)), ""


async def _resolve_operand(
    db: AsyncSession,
    request: Request,
    operand: dict,
    group_field: str | None = None,
    period: tuple[str, str] = ("", ""),
) -> tuple[float | None | dict[str, float | None], str]:
    kind = next(key for key in operand if key not in ("filters", "period_field"))
    operand_period = operand.get("period_field")
    if kind == "metric":
        return await _metric_value(
            db,
            request,
            str(operand["metric"]),
            operand.get("filters") or None,
            group_field,
            period_field=operand_period,
            period=period,
        )
    if kind == "dataset_agg":
        return await _dataset_agg_value(
            db,
            request,
            dict(operand["dataset_agg"]),
            group_field,
            period_field=operand_period,
            period=period,
        )
    pair = (operand[kind][0], operand[kind][1])
    left, left_reason = await _resolve_operand(db, request, pair[0], group_field, period)
    if left is None:
        return None, left_reason
    right, right_reason = await _resolve_operand(db, request, pair[1], group_field, period)
    if right is None:
        return None, right_reason
    if group_field:
        merged: dict[str, float | None] = {}
        for key in {**left, **right}:  # type: ignore[arg-type]
            a = left.get(key)  # type: ignore[union-attr]
            b = right.get(key)  # type: ignore[union-attr]
            if kind == "diff":
                merged[key] = None if a is None or b is None else a - b
            else:
                merged[key] = None if a is None or not b else a / b
        return merged, ""
    if kind == "diff":
        return left - right, ""  # type: ignore[operator]
    if not right:
        return None, "ratio denominator is zero"
    return left / right, ""  # type: ignore[operator]


def _rule_payload(rule: MetricRule) -> dict:
    return rule.payload


def _group_key(value: Any) -> str:
    return "" if value is None else str(value)


async def _find_open_event(
    db: AsyncSession, *, rule: str, scope: str, period_start: str, period_end: str
) -> MetricEvent | None:
    rows = (
        await db.execute(
            select(MetricEvent).where(
                MetricEvent.rule_id == rule,
                MetricEvent.scope == scope,
                MetricEvent.period_start == period_start,
                MetricEvent.period_end == period_end,
                MetricEvent.event_end_time.is_(None),
            )
        )
    ).scalars().all()
    return rows[0] if rows else None


def _close(event: MetricEvent) -> None:
    event.event_end_time = _now()
    event.status = "resolved"
    event.intent = "success"


async def _close_open_events(
    db: AsyncSession, *, rule: str, scopes: list[str], period_start: str, period_end: str
) -> int:
    """Close the alerts of `rule` whose scope is not among `scopes` (or every one when empty)."""
    rows = (
        await db.execute(
            select(MetricEvent).where(
                MetricEvent.rule_id == rule,
                MetricEvent.period_start == period_start,
                MetricEvent.period_end == period_end,
                MetricEvent.event_end_time.is_(None),
            )
        )
    ).scalars().all()
    closed = 0
    for event in rows:
        if scopes and event.scope in scopes:
            continue
        _close(event)
        closed += 1
    if closed:
        await db.flush()
    return closed


def _event_title(rule_data: dict, group: dict | None) -> str:
    """`方案 a97503a9… · <conclusion>` — the group first, because it is what the reader scans for."""
    conclusion = str(rule_data.get("conclusion") or rule_data.get("name") or "rule hit")
    label = str((group or {}).get("label") or "")
    raw_value = str((group or {}).get("value") or "")
    # A group value is often a UUID: eight characters identify it in a title, thirty-six drown it.
    value = raw_value if len(raw_value) <= 14 else f"{raw_value[:8]}…"
    return f"{label} {value} · {conclusion}".strip(" ·") if label else conclusion


async def _upsert_event(
    db: AsyncSession,
    *,
    rule: MetricRule,
    rule_data: dict,
    scope: str,
    group: dict | None,
    period_start: str,
    period_end: str,
    period_label: str | None,
    values: dict[str, float | None],
) -> str:
    # Two runs of the same rule for the same scope and period must not both "find nothing" and insert:
    # a transaction-scoped lock on the dedupe key serialises them (the run owns its transaction).
    key = "|".join([rule.slug, scope, period_start, period_end])
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": key})
    existing = await _find_open_event(
        db, rule=rule.id, scope=scope, period_start=period_start, period_end=period_end
    )
    evidence = {
        "rule_id": rule.slug,
        "rule_object_id": rule.id,
        "rule_version": rule.version,
        "group": group,
        "values": values,
        "at": _now(),
    }
    title = _event_title(rule_data, group)
    description = str(rule_data.get("suggestion") or "")
    if existing is not None:
        # The rule's wording may have changed since the alert opened; refresh what the reader sees.
        existing.evidence = evidence
        existing.title = title
        existing.description = description
        existing.period_label = period_label
        await db.flush()
        return existing.id

    severity = rule.severity or "P1"
    event = MetricEvent(
        id=__import__("uuid").uuid4().hex,
        rule_id=rule.id,
        metric_id=rule.metric_id,
        event_id="|".join([rule.slug, scope, period_start]),
        dedupe_key=key,
        title=title,
        description=description,
        severity=severity,
        intent=INTENT_BY_SEVERITY.get(severity, "warning"),
        status="open",
        scope=scope,
        group_field=(group or {}).get("field"),
        period_start=period_start,
        period_end=period_end,
        period_label=period_label,
        evidence=evidence,
        event_start_time=_now(),
        rule_version=rule.version,
    )
    db.add(event)
    await db.flush()
    return event.id


async def evaluate_rule(
    db: AsyncSession,
    request: Request,
    *,
    rule: MetricRule,
    period_start: str = "",
    period_end: str = "",
    period_label: str | None = None,
    dry_run: bool = False,
) -> list[EvalResult]:
    """Evaluate one rule — once per group when it declares `group_by`, otherwise once.

    A grouped rule asks "for each scenario, does this hold?" and answers per scenario, so one run shows
    *which* groups are broken instead of the caller having to pick one and run again.

    ``dry_run`` is the 试算: same numbers, same guardrails, but it publishes nothing, closes nothing and
    leaves the rule untouched. Writing a condition is iterative; the first three tries are wrong, and none
    of them should reach the inbox.
    """
    rule_data = _rule_payload(rule)

    relation = rule_data.get("relation")
    if isinstance(relation, str):
        try:
            relation = json.loads(relation)
        except json.JSONDecodeError as exc:
            raise ConditionError(f"relation is not valid JSON: {exc}") from exc
    if relation:
        return await _evaluate_relation(
            db,
            request,
            rule=rule,
            rule_data={**rule_data, "relation": relation},
            period_start=period_start,
            period_end=period_end,
            period_label=period_label,
            dry_run=dry_run,
        )

    condition = rule_data.get("condition")
    if isinstance(condition, str):
        try:
            condition = json.loads(condition)
        except json.JSONDecodeError as exc:
            raise ConditionError(f"condition is not valid JSON: {exc}") from exc
    validate_condition(condition)

    group = _rule_group_by(rule_data)
    group_field = str(group["field"]) if group else None
    period = (period_start, period_end)
    operands = flatten_operands(condition)

    resolved_by_operand: dict[str, float | None | dict[str, float | None]] = {}
    reasons: list[str] = []
    for operand in operands:
        value, reason = await _resolve_operand(db, request, operand, group_field, period)
        resolved_by_operand[operand_key(operand)] = value
        if value is None and reason:
            reasons.append(reason)

    grouped = evaluate_groups(condition, resolved_by_operand, group_field)
    return await _finish(
        db,
        request,
        rule=rule,
        rule_data=rule_data,
        grouped=grouped,
        reasons=reasons,
        group=group,
        group_field=group_field,
        period_start=period_start,
        period_end=period_end,
        period_label=period_label,
        dry_run=dry_run,
    )


async def _finish(
    db: AsyncSession,
    request: Request,
    *,
    rule: MetricRule,
    rule_data: dict,
    grouped: list[tuple[Any, bool | None, dict[str, Any]]],
    reasons: list[str],
    group: dict | None,
    group_field: str | None,
    period_start: str,
    period_end: str,
    period_label: str | None,
    dry_run: bool,
) -> list[EvalResult]:
    """Turn per-group verdicts into results, events and `last_*` — the part every check shares.

    `grouped` is `(group value, hit, values)`: the condition history and a metric relation both end here,
    which is what keeps the publish gate, the dedupe and the closing rule in one place.
    """
    results: list[EvalResult] = []
    failing_scopes: list[str] = []
    statuses: list[str] = []
    for group_value, hit, resolved in grouped:
        statuses.append("unknown" if hit is None else ("fail" if hit else "pass"))
        results.append(
            EvalResult(
                rule_id=rule.id,
                status=statuses[-1],
                values=resolved,
                group=({"field": group_field, "value": group_value} if group_field else None),
                reason="; ".join(reasons) if reasons else None,
            )
        )
        if hit is True and dry_run:
            # A trial reports the verdict it *would* have published, and stops there.
            results[-1].would_publish = bool(
                rule_data.get("suggestion")
                and str(rule_data.get("severity") or "P1") in PUBLISHING_SEVERITIES
            )
        elif hit is True:
            severity = str(rule_data.get("severity") or "P1")
            scope_value = _group_key(group_value)
            if rule_data.get("suggestion") and severity in PUBLISHING_SEVERITIES:
                failing_scopes.append(scope_value)
                results[-1].event_id = await _upsert_event(
                    db,
                    rule=rule,
                    rule_data=rule_data,
                    scope=scope_value,
                    group=({"field": group_field, "label": (group or {}).get("label"), "value": group_value}
                           if group_field else None),
                    period_start=period_start,
                    period_end=period_end,
                    period_label=period_label,
                    values=resolved,
                )
            else:
                results[-1].status = "pass"  # a hit without advice is not an event

    # A run that decided at least one group says which events no longer hold — grouped or not. A run
    # where every operand was uncomputable decides nothing and must not close anything.
    if not dry_run and any(status in ("pass", "fail") for status in statuses):
        await _close_open_events(
            db,
            rule=rule.id,
            scopes=failing_scopes,
            period_start=period_start,
            period_end=period_end,
        )

    overall = "fail" if "fail" in statuses else ("unknown" if "unknown" in statuses else "pass")
    if dry_run:
        return results

    data: dict[str, Any] = {
        "last_run_at": _now(),
        "last_status": overall,
        "last_period_start": period_start,
        "last_period_end": period_end,
        # Why a run could not decide (`unknown`), or a one-line note for a failure. Empty on pass:
        # the numbers themselves stay in the alert's evidence, not on the rule.
        "last_reason": "; ".join(reasons) if reasons else None,
    }
    rule.apply_payload(data)
    await db.flush()
    return results


async def _evaluate_relation(
    db: AsyncSession,
    request: Request,
    *,
    rule: MetricRule,
    rule_data: dict,
    period_start: str,
    period_end: str,
    period_label: str | None,
    dry_run: bool,
) -> list[EvalResult]:
    """Check an identity: `target` vs the weighted sum of its `members`, within a tolerance."""
    relation = rule_data["relation"]
    try:
        validate_relation(relation)
    except RelationError as exc:
        raise ConditionError(str(exc)) from exc

    group = _rule_group_by(rule_data)
    group_field = str(group["field"]) if group else None
    period = (period_start, period_end)
    tolerance = tolerance_of(relation)

    target = dict(relation["target"])
    target_group = target.pop("group_field", None) or group_field
    target_value, reason = await _resolve_operand(db, request, target, target_group, period)
    reasons = [reason] if (target_value is None and reason) else []

    resolved_members: list[tuple[dict, Any]] = []
    for raw in relation["members"]:
        member = dict(raw)
        member_group = member.pop("group_field", None) or group_field
        value, member_reason = await _resolve_operand(db, request, member, member_group, period)
        if value is None and member_reason:
            reasons.append(member_reason)
        resolved_members.append((raw, value))

    keys: list[Any] = [None]
    if group_field:
        seen: set[str] = set()
        for value in [target_value, *(value for _member, value in resolved_members)]:
            if isinstance(value, dict):
                seen.update(key for key in value if key is not None)
        keys = sorted(seen)

    grouped: list[tuple[Any, bool | None, dict[str, Any]]] = []
    for key in keys:
        target_at = target_value.get(key) if isinstance(target_value, dict) else target_value
        member_at: list[tuple[float, float]] = []
        missing = target_at is None
        for raw, value in resolved_members:
            member_value = value.get(key) if isinstance(value, dict) else value
            if member_value is None:
                missing = True
                break
            member_at.append((weight_of(raw), float(member_value)))
        values: dict[str, Any] = {"target": None if target_at is None else float(target_at)}
        for raw, value in resolved_members:
            values[str(raw["metric"])] = (
                value.get(key) if isinstance(value, dict) else value
            )
        if missing or target_at is None:
            values["residual"] = None
            grouped.append((key, None, values))
            continue
        residual_value = residual(float(target_at), member_at)
        limit = max(tolerance.get("abs", 0.0), abs(float(target_at)) * tolerance.get("rel", 0.0))
        values["residual"] = residual_value
        values["tolerance"] = limit
        grouped.append((key, not within_tolerance(residual_value, float(target_at), tolerance), values))

    return await _finish(
        db,
        request,
        rule=rule,
        rule_data=rule_data,
        grouped=grouped,
        reasons=reasons,
        group=group,
        group_field=group_field,
        period_start=period_start,
        period_end=period_end,
        period_label=period_label,
        dry_run=dry_run,
    )


async def evaluate_rules_for_subject(
    db: AsyncSession,
    request: Request,
    *,
    subject_type: str | None = None,
    subject_id: str | None = None,
    period_start: str = "",
    period_end: str = "",
    period_label: str | None = None,
    limit: int = 100,
) -> list[EvalResult]:
    """Every active rule, optionally narrowed to one metric."""
    query = select(MetricRule).where(MetricRule.status == "active").order_by(MetricRule.created_at.desc())
    if subject_id:
        query = query.where(MetricRule.metric_id == subject_id)
    elif subject_type and subject_type != "metric":
        # Alerts are about metrics only; a dataset filter matches nothing.
        return []
    rules = (await db.execute(query.limit(limit))).scalars().all()
    results: list[EvalResult] = []
    for rule in rules:
        try:
            results.extend(
                await evaluate_rule(
                    db,
                    request,
                    rule=rule,
                    period_start=period_start,
                    period_end=period_end,
                    period_label=period_label,
                )
            )
        except ConditionError as exc:
            results.append(EvalResult(rule_id=rule.id, status="skipped", reason=str(exc)))
    return results


__all__ = [
    "EvalResult",
    "collect_datasets",
    "collect_metrics",
    "evaluate_rule",
    "evaluate_rules_for_subject",
]
