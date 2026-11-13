"""Rule conditions: validation, operand collection and comparison.

A condition is one comparison or a boolean combination of comparisons:

    {"left": <operand>, "op": ">", "right": {"value": 1}}
    {"all": [<comparison>, ...]}
    {"any": [<comparison>, ...]}

An operand is one of four shapes — the same four for either side of a comparison:

    {"metric": "<metric_id>", "filters": [...]?}          # filters narrow the metric's rows
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
    """Flatten `all` / `any` into the list of comparisons it is made of."""
    if not isinstance(condition, dict):
        raise ConditionError("condition must be an object")
    if "all" in condition or "any" in condition:
        key = "all" if "all" in condition else "any"
        entries = condition.get(key)
        if not isinstance(entries, list) or not entries:
            raise ConditionError(f"condition.{key} must be a non-empty list")
        if len(entries) > MAX_COMPARISONS:
            raise ConditionError(f"too many comparisons ({len(entries)} > {MAX_COMPARISONS})")
        out: list[dict] = []
        for entry in entries:
            out.extend(comparisons(entry))
        return out
    return [condition]


OPERAND_KINDS = ("metric", "dataset_agg", "diff", "ratio")


def _operand_kind(operand: Any) -> str:
    if not isinstance(operand, dict):
        raise ConditionError("an operand must be an object")
    keys = [key for key in operand if key != "filters"]
    if len(keys) != 1:
        raise ConditionError("an operand must have exactly one of metric / dataset_agg / diff / ratio")
    key = keys[0]
    if key not in OPERAND_KINDS:
        raise ConditionError(f"unknown operand '{key}'")
    if "filters" in operand and key not in ("metric", "dataset_agg"):
        raise ConditionError("filters only apply to metric and dataset_agg operands")
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
