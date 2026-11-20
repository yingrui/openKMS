"""What a run of this rule takes: the rule declares its arguments, the run supplies their values.

A rule is a definition; running it means choosing a slice of data. That slice is not only a period — a
dimensional filter (only 线上) and a narrowed set of scopes (only these scenarios) are inputs too, and a rule
that cannot take them forces the author to clone it per slice, which is the definition of bespoke.

So `run_params.arguments` is a list, and a **period is simply one of those arguments** (a filter whose
`role` is `period`), not a separate kind:

```json
{"arguments": [
  {"key": "cycle",   "kind": "filter", "field": "cycle",   "role": "period"},
  {"key": "channel", "kind": "filter", "field": "channel"},
  {"key": "scenario", "kind": "key",   "field": "scenario_id"}
]}
```

* **filter** — a value for one field, applied to every operand. A check over one channel should not need a
  second copy of the rule.
* **`role: period`** — a filter that also **labels the run**: its value names the period the verdict belongs
  to, and the event records that period's interval. Nothing else about it is special — same field, same
  value; the interval comes from the field's calendar (a value whose dates cannot be derived cannot be a
  period). At most one argument may carry the role.
* **key** — narrows the scope: the rule's `group_by.field` must equal it, and only the named groups are
  evaluated. This is also how a run gets past the group cap instead of reporting `unknown` for everything.

This module reads the declaration (defaulting to a single period argument), resolves what a *run* will be
asked for, and applies the values — one implementation, used by the API, the evaluator and the UI.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.metric_definition import MetricDefinition
from app.models.metric_rule import MetricRule
from app.models.semantic_model_field import SemanticModelField
from app.services.ontology.rules.calendars import field_calendar
from app.services.ontology.rules.periods import LABEL_FORMATS

FILTER = "filter"
KEY = "key"
KINDS = (FILTER, KEY)
#: A filter that also labels the run (the period it belongs to). Not a kind: the same field, same value.
PERIOD_ROLE = "period"


def declared_arguments(rule_data: dict) -> list[dict[str, Any]]:
    """The rule's arguments, in the order the author wrote them. A rule may declare none."""
    params = (rule_data or {}).get("run_params")
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except json.JSONDecodeError:
            params = None
    raw = (params or {}).get("arguments") if isinstance(params, dict) else None
    return [a for a in raw if isinstance(a, dict)] if isinstance(raw, list) else []


def period_argument(rule_data: dict) -> dict[str, Any] | None:
    """The argument that labels the run's period — at most one, by construction."""
    for argument in declared_arguments(rule_data):
        if str(argument.get("role") or "") == PERIOD_ROLE:
            return argument
    return None


def run_filters(rule_data: dict, values: dict[str, Any] | None) -> tuple[list[dict], str]:
    """`(filters, reason)` — the filter arguments the run supplied a value for.

    A `filter` without a value is simply not applied: declaring a parameter marks the rule *able* to take a
    slice, it does not require one.
    """
    period = period_argument(rule_data)
    period_key = str((period or {}).get("key") or "")
    filters: list[dict] = []
    for argument in declared_arguments(rule_data):
        if str(argument.get("kind") or "") != FILTER:
            continue
        if period is not None and str(argument.get("key") or "") == period_key:
            # The period argument is compiled by the calendar, not as a plain equality.
            continue
        key = str(argument.get("key") or "")
        value = (values or {}).get(key)
        if value is None or (isinstance(value, str) and not value.strip()):
            if argument.get("required"):
                return [], f"run parameter '{key}' is required"
            continue
        filters.append({"field": str(argument.get("field") or key), "op": "=", "value": value})
    return filters, ""


def scope_filter(rule_data: dict, values: dict[str, Any] | None) -> tuple[list[str] | None, str]:
    """`(allowed scopes, reason)` — `None` when the run narrows nothing."""
    for argument in declared_arguments(rule_data):
        if str(argument.get("kind") or "") != KEY:
            continue
        key = str(argument.get("key") or "")
        raw = (values or {}).get(key)
        if raw is None or (isinstance(raw, str) and not raw.strip()) or raw == []:
            if argument.get("required"):
                return [], f"run parameter '{key}' is required"
            continue
        items = raw if isinstance(raw, list) else str(raw).split(",")
        scopes = [str(item).strip() for item in items if str(item).strip()]
        if scopes:
            return scopes, ""
    return None, ""


def period_value(rule_data: dict, values: dict[str, Any] | None) -> tuple[str, str]:
    """`(label, reason)` — the run's period label; a period argument is always required."""
    argument = period_argument(rule_data)
    if argument is None:
        return "", ""
    key = str(argument.get("key") or "")
    raw = (values or {}).get(key)
    label = str(raw).strip() if raw is not None else ""
    if not label:
        return "", f"run parameter '{key}' is required — it names the period"
    return label, ""


async def describe_run_params(db: AsyncSession, rule: MetricRule) -> dict[str, Any]:
    """`{arguments: [...]}` — what a run will ask for, and what the period argument will mean.

    The period is a filter like any other; what it adds is the *interval* its value names, which comes from
    the field's calendar. A field whose values cannot be mapped to dates (`custom`) can still be filtered,
    but it cannot label a run — the event would have no start or end.
    """
    metric = await db.get(MetricDefinition, rule.metric_id)
    model_id = metric.semantic_model_id if metric else None
    out: list[dict[str, Any]] = []
    for argument in declared_arguments(rule.payload):
        field_name = str(argument.get("field") or "")
        entry: dict[str, Any] = {
            "key": str(argument.get("key") or field_name or argument.get("kind") or ""),
            "kind": str(argument.get("kind") or ""),
            "field": field_name,
            # The author's word for the field ("周期"), so the run dialog does not ask for `cycle`.
            "label": None,
            "required": bool(argument.get("required")),
            "role": argument.get("role") or None,
        }
        field = (
            await db.execute(
                select(SemanticModelField).where(
                    SemanticModelField.semantic_model_id == model_id,
                    SemanticModelField.name == field_name,
                )
            )
        ).scalars().first() if (model_id and field_name) else None
        if field is not None and field.label:
            entry["label"] = field.label
        if str(argument.get("role") or "") == PERIOD_ROLE:
            calendar = await field_calendar(db, field)
            entry.update(
                {
                    "required": True,
                    "dataset_id": field.dataset_id if field else None,
                    "calendar": calendar,
                    "format": LABEL_FORMATS.get(calendar),
                    # A custom calendar has no derivable interval; the field can still be a filter.
                    "has_interval": calendar != "custom",
                }
            )
        out.append(entry)
    # Structured, not prose: the UI composes the sentence in the reader's language.
    return {"arguments": out}
