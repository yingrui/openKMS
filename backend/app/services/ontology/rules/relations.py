"""A metric relation: an identity between metrics, checked with weights and a tolerance.

The condition language answers "is this number in range?" and a relation answers a different question:
"do these numbers agree?" — `分货额度 (明细) = 方案累计额度 (方案表)`, both computed from their own
source, within a tolerance. That is the shape of a reconciliation, not of an alert:

* `target` is the metric that must be explained;
* `members` are the metrics that explain it, each with a `weight` (a decomposition has +1 members, an
  additive check has one with −1);
* `tolerance` says how far apart the two sides may be: `{abs: 1}` (rows, currency units) or `{rel: 0.001}`
  (a share of the target).

Two kinds, because the arithmetic of "agree" differs:

* ``decompose`` (default) — ``target = Σ weight × member``. Additive: a total against its parts, or two
  sources of the same number (one member, weight −1).
* ``ratio`` — ``target = numerator / denominator``, exactly two members. A rate is not additive, so the
  identity cannot be a weighted sum, and checking it needs the division.

Why it lives on a rule instead of a type of its own: a relation nobody runs is a comment. The rule already
owns severity, advice, the publish gate, the period argument, grouping and the event lifecycle; the
relation only replaces *how the verdict is computed*. Promote it to its own asset when it has a second
consumer; `solve()` below is the first one — an identity that is checked can also **infer** the one number
it did not receive, which is what turns reconciliation into an application (填充缺失口径) rather than an
alarm.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.object_instance import ObjectInstance
from app.services.ontology.rules.builtin import builtin_types

#: A relation that deviates more than this is a finding; an exact identity is `abs: 0`.
DEFAULT_TOLERANCE = {"abs": 0.0}
KINDS = ("decompose", "ratio")


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
    unknown = set(relation) - {"target", "members", "tolerance", "note", "kind"}
    if unknown:
        raise RelationError(f"relation has unknown keys: {', '.join(sorted(unknown))}.")
    _as_operand(relation.get("target"), "relation.target")
    kind = relation.get("kind") or "decompose"
    if kind not in KINDS:
        raise RelationError(f"relation.kind must be one of: {', '.join(KINDS)}.")
    members = relation.get("members")
    if not isinstance(members, list) or not members:
        raise RelationError("relation.members must be a non-empty list.")
    if kind == "ratio" and len(members) != 2:
        raise RelationError("A ratio relation needs exactly two members: numerator, then denominator.")
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


def kind_of(relation: dict) -> str:
    return str(relation.get("kind") or "decompose")


def weight_of(member: dict) -> float:
    weight = member.get("weight")
    return 1.0 if weight is None else float(weight)


def tolerance_of(relation: dict) -> dict[str, float]:
    return {**DEFAULT_TOLERANCE, **(relation.get("tolerance") or {})}


def residual(target: float, members: list[tuple[float, float]], *, kind: str = "decompose") -> float:
    """Zero when the identity holds: `target − Σ(w·member)`, or `target − numerator/denominator`."""
    if kind == "ratio":
        (num_w, num), (_den_w, den) = members if len(members) == 2 else ((0.0, 0.0), (0.0, 0.0))
        if not den:
            return float("nan")
        return float(target) - (num_w or 1.0) * num / den
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


async def list_relation_rules(
    db: AsyncSession, metric_ids: list[str]
) -> list[dict[str, Any]]:
    """Relation-bearing rules whose subject is one of these metrics — the graph's assertion edges.

    One query, not one per metric: the graph is a read path and must stay cheap enough to open.
    """
    if not metric_ids:
        return []
    rule_type, _event_type = await builtin_types(db)
    if rule_type is None:
        return []
    wanted = set(metric_ids)
    rows = (
        await db.execute(
            select(ObjectInstance).where(ObjectInstance.object_type_id == rule_type.id)
        )
    ).scalars().all()
    out: list[dict[str, Any]] = []
    for row in rows:
        data = dict(row.data or {})
        relation = data.get("relation")
        if isinstance(relation, str):
            try:
                relation = json.loads(relation)
            except json.JSONDecodeError:
                continue
        if not isinstance(relation, dict):
            continue
        subject = data.get("subject")
        if isinstance(subject, str):
            try:
                subject = json.loads(subject)
            except json.JSONDecodeError:
                subject = None
        refs = {(relation.get("target") or {}).get("metric")}
        refs.update((member or {}).get("metric") for member in relation.get("members") or [])
        if not (refs & wanted) and (subject or {}).get("ref") not in wanted:
            continue
        out.append(
            {
                "object_id": row.id,
                "rule_id": data.get("rule_id"),
                "relation": relation,
                "last_status": data.get("last_status"),
            }
        )
    return out


def solve(relation: dict, known: dict[str, float]) -> dict[str, Any]:
    """Infer the one metric a relation did not receive — the point of a *checked* identity.

    `known` maps metric refs to observed values. Exactly one ref from `target` + `members` must be missing.
    Three outcomes, and the middle one matters: an identity can also be **contradictory** — every number
    present and not agreeing — in which case there is nothing to infer, only a discrepancy to report.
    """
    kind = kind_of(relation)
    target_ref = relation["target"]["metric"]
    member_refs = [m["metric"] for m in relation["members"]]
    refs = [target_ref, *member_refs]
    missing = [ref for ref in refs if ref not in known]

    if not missing:
        members = [(weight_of(m), float(known[m["metric"]])) for m in relation["members"]]
        drift = residual(float(known[target_ref]), members, kind=kind)
        return {"status": "contradictory", "residual": None if drift != drift else drift}
    if len(missing) > 1:
        return {"status": "undetermined", "missing": missing}

    unknown = missing[0]
    try:
        if kind == "ratio":
            # Read the two members that exist; the missing one is what we are solving for.
            numerator = float(known[member_refs[0]]) if member_refs[0] in known else None
            denominator = float(known[member_refs[1]]) if member_refs[1] in known else None
            if unknown == target_ref:
                value = numerator / denominator
            elif unknown == member_refs[0]:
                value = float(known[target_ref]) * denominator
            else:
                value = numerator / float(known[target_ref])
        else:
            measured = [
                (weight_of(m), float(known[m["metric"]]))
                for m in relation["members"]
                if m["metric"] in known
            ]
            if unknown == target_ref:
                value = sum(weight * number for weight, number in measured)
            else:
                weight = weight_of(next(m for m in relation["members"] if m["metric"] == unknown))
                if not weight:
                    return {"status": "undetermined", "missing": missing}
                value = (float(known[target_ref]) - sum(w * n for w, n in measured)) / weight
    except ZeroDivisionError:
        return {"status": "undetermined", "missing": missing}

    if value != value or value in (float("inf"), float("-inf")):
        return {"status": "undetermined", "missing": missing}
    return {
        "status": "inferred",
        "metric": unknown,
        "value": value,
        "kind": kind,
        "known": {ref: known[ref] for ref in refs if ref in known},
        "assumption": "every other number in the identity is measured and the identity holds within tolerance",
    }
