"""Rule conditions: validation, operand collection and comparison.

A condition is **one comparison, or a list of comparisons that must all hold**:

    {"left": <operand>, "op": ">", "right": {"value": 1}}
    {"all": [<comparison>, ...]}

No nesting and no `any`: in practice rules are one comparison, or two that must both hold, and the removed
combinations doubled both the editor and the validation surface without a single rule using them. Conditions
stored before this narrowing are still *read* fine (the flattening below is generic); new writes are rejected.

An operand is one of four shapes — the same four for either side of a comparison:

    {"metric": "<metric_id>", "filters": [...]?}
    {"dataset_agg": {"dataset_id": "...", "fn": "count", "column": null, "filters": [...]}}
    {"diff": [<operand>, <operand>]}
    {"ratio": [<operand>, <operand>]}

`filters` is the data layer's own filter vocabulary (`{field|column, op, value}`), so a rule can be
scoped to one scenario / one month without inventing a second filter language.

Pure functions only: everything that needs a database lives in `evaluator.py`.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

OPS = ("<", "<=", ">", ">=", "==", "!=")
AGGREGATE_FNS = ("count", "sum", "avg", "min", "max")
MAX_COMPARISONS = 12


class ConditionError(ValueError):
    """The condition is structurally invalid — reported as 400, never silently ignored."""


def comparisons(condition: Any) -> list[dict]:
    """The comparisons a condition is made of. Flattens `all`; rejects `any` and nesting on write."""
    if not isinstance(condition, dict):
        raise ConditionError("condition must be an object")
    if "any" in condition:
        raise ConditionError("conditions are combined with `all` only — `any` is not supported")
    if "all" in condition:
        entries = condition.get("all")
        if not isinstance(entries, list) or not entries:
            raise ConditionError("condition.all must be a non-empty list")
        if len(entries) > MAX_COMPARISONS:
            raise ConditionError(f"too many comparisons ({len(entries)} > {MAX_COMPARISONS})")
        out: list[dict] = []
        for entry in entries:
            if isinstance(entry, dict) and ("all" in entry or "any" in entry):
                raise ConditionError("conditions cannot be nested — list the comparisons in one `all`")
            out.extend(comparisons(entry))
        return out
    return [condition]


OPERAND_KINDS = ("metric", "dataset_agg", "diff", "ratio")


def _operand_kind(operand: Any) -> str:
    if not isinstance(operand, dict):
        raise ConditionError("an operand must be an object")
    # `filters` is an operand modifier, not an operand kind. The run parameter is declared on the rule.
    keys = [key for key in operand if key != "filters"]
    if len(keys) != 1:
        raise ConditionError("an operand must have exactly one of metric / dataset_agg / diff / ratio")
    key = keys[0]
    if key not in OPERAND_KINDS:
        raise ConditionError(f"unknown operand '{key}'")
    if "filters" in operand and key not in ("metric", "dataset_agg"):
        raise ConditionError("filters only apply to metric and dataset_agg operands")
    if "scope_field" in operand or "scope_label" in operand:
        raise ConditionError(
            "declare the run parameter on the rule (`param`), not on an operand — one rule, one value"
        )
    return key


def validate_condition(condition: Any) -> None:
    """Reject malformed conditions at write time (never let a bad rule reach the evaluator)."""
    for comparison in comparisons(condition):
        op = comparison.get("op")
        if op not in OPS:
            raise ConditionError(f"unsupported operator '{op}'")
        right = comparison.get("right")
        if not isinstance(right, dict) or "value" not in right:
            raise ConditionError("right must be {\"value\": <number>}")
        if not isinstance(right["value"], (int, float, Decimal)) or isinstance(right["value"], bool):
            raise ConditionError("right.value must be a number")
        _validate_operand(comparison.get("left"))


def _validate_operand(operand: Any) -> None:
    kind = _operand_kind(operand)
    value = operand[kind]
    if kind == "metric":
        if not isinstance(value, str) or not value.strip():
            raise ConditionError("metric operand needs a metric id")
        return
    if kind == "dataset_agg":
        if not isinstance(value, dict):
            raise ConditionError("dataset_agg operand must be an object")
        if not value.get("dataset_id"):
            raise ConditionError("dataset_agg needs dataset_id")
        if value.get("fn") not in AGGREGATE_FNS:
            raise ConditionError(f"dataset_agg.fn must be one of {AGGREGATE_FNS}")
        if value.get("fn") != "count" and not value.get("column"):
            raise ConditionError(f"dataset_agg.{value.get('fn')} needs a column")
        return
    pair = value
    if not isinstance(pair, list) or len(pair) != 2:
        raise ConditionError(f"{kind} needs exactly two operands")
    for item in pair:
        _validate_operand(item)


def collect_metrics(condition: Any) -> list[str]:
    """Metric ids referenced anywhere in the condition (deduplicated, order preserved)."""
    out: list[str] = []

    def walk(operand: Any) -> None:
        kind = _operand_kind(operand)
        value = operand[kind]
        if kind == "metric":
            if value not in out:
                out.append(value)
        elif kind == "dataset_agg":
            return
        else:
            for item in value:
                walk(item)

    for comparison in comparisons(condition):
        walk(comparison.get("left"))
    return out


def collect_datasets(condition: Any) -> list[str]:
    """Dataset ids referenced anywhere in the condition (deduplicated, order preserved)."""
    out: list[str] = []

    def walk(operand: Any) -> None:
        kind = _operand_kind(operand)
        value = operand[kind]
        if kind == "dataset_agg":
            dataset_id = str(value.get("dataset_id"))
            if dataset_id not in out:
                out.append(dataset_id)
        elif kind == "metric":
            return
        else:
            for item in value:
                walk(item)

    for comparison in comparisons(condition):
        walk(comparison.get("left"))
    return out


def operand_key(operand: Any) -> str:
    """Canonical id of an operand, so a resolved value can be looked up regardless of ordering."""
    return json.dumps(operand, sort_keys=True, ensure_ascii=False)


def flatten_operands(condition: Any) -> list[dict]:
    """Every distinct operand in the condition, in first-seen order."""
    seen: dict[str, dict] = {}

    def walk(operand: Any) -> None:
        key = operand_key(operand)
        if key in seen:
            return
        seen[key] = operand
        kind = _operand_kind(operand)
        if kind in ("diff", "ratio"):
            for item in operand[kind]:
                walk(item)

    for comparison in comparisons(condition):
        walk(comparison.get("left"))
    return list(seen.values())


def evaluate_groups(
    condition: Any,
    resolved: dict[str, float | None | dict[str, float | None]],
    group_field: str | None,
) -> list[tuple[str | None, bool | None, dict[str, float | None]]]:
    """Evaluate the condition per group (or once, when `group_field` is None).

    `resolved` maps an operand key to either one value or one value per group value. The union of the
    group keys is used, so a group that one operand knows and another does not becomes `None` — an
    undecidable group, never a silently smaller number.

    Pure: the querying happens in `evaluator.py`, so this part is testable without a database.
    """
    group_values: list[str | None] = [None]
    if group_field:
        keys: set[str] = set()
        for value in resolved.values():
            if isinstance(value, dict):
                keys.update(key for key in value if key is not None)
        group_values = sorted(keys)

    out: list[tuple[str | None, bool | None, dict[str, float | None]]] = []
    for group_value in group_values:
        values = {
            key: (value.get(group_value) if isinstance(value, dict) else value)
            for key, value in resolved.items()
        }
        out.append((group_value, evaluate_condition(condition, values), values))
    return out


def compare(left: float, op: str, right: float) -> bool:
    if op == "<":
        return left < right
    if op == "<=":
        return left <= right
    if op == ">":
        return left > right
    if op == ">=":
        return left >= right
    if op == "==":
        return left == right
    return left != right


def evaluate_condition(condition: Any, resolved: dict[str, float | None]) -> bool | None:
    """Walk the condition tree; None means "could not be decided" (an operand was unresolvable)."""
    undecided = False

    def value_of(operand: Any) -> float | None:
        nonlocal undecided
        value = resolved.get(operand_key(operand))
        if value is None:
            undecided = True
        return value

    def walk(node: Any) -> bool:
        if "all" in node:
            results = [walk(entry) for entry in node["all"]]
            return all(results) and not undecided
        if "any" in node:
            results = [walk(entry) for entry in node["any"]]
            return any(results) and not undecided
        left = value_of(node["left"])
        right = float(node["right"]["value"])
        if left is None:
            return False
        return compare(left, node["op"], right)

    hit = walk(condition)
    return None if undecided else hit
