"""A metric relation: an identity between metrics, checked with weights and a tolerance.

The condition language answers "is this number in range?" and a relation answers a different question:
"do these numbers agree?" — `分货额度 (明细) = 方案累计额度 (方案表)`, both computed from their own
source, within a tolerance. That is the shape of a reconciliation, not of an alert:

* `target` is the metric that must be explained;
* `members` are the metrics that explain it, each with a `weight` (a decomposition has +1 members, an
  additive check has one with −1);
* `tolerance` says how far apart the two sides may be: `{abs: 1}` (rows, currency units) or `{rel: 0.001}`
  (a share of the target).

Why it lives on a rule instead of a type of its own: a relation nobody runs is a comment. The rule already
owns severity, advice, the publish gate, the period argument, grouping and the event lifecycle; the
relation only replaces *how the verdict is computed*. Promote it to its own asset when it has a second
consumer (inference, drill-down); not before.
"""
from __future__ import annotations

from typing import Any

#: A relation that deviates more than this is a finding; an exact identity is `abs: 0`.
DEFAULT_TOLERANCE = {"abs": 0.0}


class RelationError(ValueError):
    """A relation that cannot be checked as written."""


def _as_operand(value: Any, what: str) -> dict:
    if isinstance(value, str):
        value = {"metric": value}
    if not isinstance(value, dict) or "metric" not in value:
        raise RelationError(f"{what} must be a metric reference (`{{metric: <id|name>}}`).")
    if not isinstance(value.get("metric"), str) or not value["metric"].strip():
        raise RelationError(f"{what} needs a metric id or name.")
    others = [key for key in value if key not in ("metric", "filters", "group_field", "weight")]
    if others:
        raise RelationError(f"{what} must be a metric; `{others[0]}` is a condition operand.")
    return value


def validate_relation(relation: Any) -> None:
    """Structural checks only — computability is the engine's job (and becomes `unknown`)."""
    if not isinstance(relation, dict):
        raise RelationError("relation must be an object.")
    unknown = set(relation) - {"target", "members", "tolerance", "note"}
    if unknown:
        raise RelationError(f"relation has unknown keys: {', '.join(sorted(unknown))}.")
    _as_operand(relation.get("target"), "relation.target")
    members = relation.get("members")
    if not isinstance(members, list) or not members:
        raise RelationError("relation.members must be a non-empty list.")
    for index, member in enumerate(members, start=1):
        if not isinstance(member, dict):
            raise RelationError(f"relation.members[{index}] must be an object.")
        _as_operand(member, f"relation.members[{index}]")
        weight = member.get("weight")
        if weight is None:
            continue
        if not isinstance(weight, (int, float)) or isinstance(weight, bool):
            raise RelationError(f"relation.members[{index}].weight must be a number.")
    tolerance = relation.get("tolerance")
    if tolerance is None:
        return
    if not isinstance(tolerance, dict):
        raise RelationError("relation.tolerance must be an object ({abs} or {rel}).")
    unknown_tol = set(tolerance) - {"abs", "rel"}
    if unknown_tol:
        raise RelationError(f"relation.tolerance has unknown keys: {', '.join(sorted(unknown_tol))}.")
    if not tolerance:
        raise RelationError("relation.tolerance needs `abs` or `rel`.")
    for key, value in tolerance.items():
        if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
            raise RelationError(f"relation.tolerance.{key} must be a non-negative number.")


def weight_of(member: dict) -> float:
    weight = member.get("weight")
    return 1.0 if weight is None else float(weight)


def tolerance_of(relation: dict) -> dict[str, float]:
    return {**DEFAULT_TOLERANCE, **(relation.get("tolerance") or {})}


def residual(target: float, members: list[tuple[float, float]]) -> float:
    """`target − Σ(weight × member)` — zero when the identity holds."""
    return float(target) - sum(weight * value for weight, value in members)


def within_tolerance(residual_value: float, target: float, tolerance: dict[str, float]) -> bool:
    """`abs` is absolute; `rel` is a share of the target (never of the residual, which can be zero)."""
    if abs(residual_value) <= tolerance.get("abs", 0.0):
        return True
    limit = abs(target) * tolerance.get("rel", 0.0)
    return abs(residual_value) <= limit


def explain(relation: dict, labels: list[str]) -> str:
    """The identity as a sentence fragment: `分货额度 = 方案累计额度 × 1（±1）`."""
    target = labels[0] if labels else "target"
    parts = [
        f"{name} × {weight:g}" if weight != 1 else name
        for name, weight in zip(
            labels[1:], (weight_of(m) for m in relation["members"]), strict=False
        )
    ]
    tolerance = tolerance_of(relation)
    tail = []
    if tolerance.get("abs"):
        tail.append(f"±{tolerance['abs']:g}")
    if tolerance.get("rel"):
        tail.append(f"±{tolerance['rel'] * 100:g}%")
    return f"{target} = {' + '.join(parts)}" + (f"（{'，'.join(tail)}）" if tail else "")
