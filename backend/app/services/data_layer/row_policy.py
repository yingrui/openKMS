"""Row policy: a structured predicate set attached to a Catalog resource.

A policy is **not** SQL text. It is a list of `column op value` conditions ANDed together,
where a value may be a literal or a claim binding (`{"claim": "org_id"}`) resolved from the
caller's token. The data layer renders them as parameterized conditions in front of the
engine, so a caller can never widen or drop them.

Kept deliberately small: the operator vocabulary is the one the grid and Playground already
use (`sql_build.VALID_OPS`), and identifiers are validated before they touch SQL.
"""

from __future__ import annotations

from typing import Any

from app.services.data_layer.query_errors import REQUEST, QueryFailure
from app.services.data_layer.sql_build import build_conditions
from app.services.ontology.dataset_tables import is_valid_identifier

#: Ops a resource policy may use. `not_in` is excluded on purpose: a deny-list row filter
#: silently includes NULLs and new values, which is the wrong default for data access.
POLICY_OPS = frozenset(
    {"=", "!=", ">", ">=", "<", "<=", "like", "in", "between", "is_null", "is_not_null"}
)

MAX_POLICY_CONDITIONS = 10


class RowPolicyError(ValueError):
    """A policy the definition or the caller got wrong; carries a stable code."""

    def __init__(self, message: str, failure: QueryFailure | None = None) -> None:
        super().__init__(message)
        self.failure = failure or QueryFailure("ROW_POLICY_INVALID", REQUEST)


def _claim_value(claim_path: str, claims: dict[str, Any]) -> Any:
    """Resolve `a.b` against the caller's claims; missing → raise (never skip a predicate)."""
    cur: Any = claims
    for part in claim_path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            raise RowPolicyError(
                f"Row policy needs claim '{claim_path}', which this caller does not carry.",
                QueryFailure(
                    "ROW_POLICY_CLAIM_MISSING",
                    REQUEST,
                    claim_path,
                    params={"claim": claim_path},
                ),
            )
        cur = cur[part]
    return cur


def validate_policy(raw: Any) -> list[dict[str, Any]]:
    """Normalize a stored policy into `[{column, op, value|claim}]`; raise on anything else."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise RowPolicyError("A row policy must be a list of conditions.")
    if len(raw) > MAX_POLICY_CONDITIONS:
        raise RowPolicyError(
            f"A row policy may hold at most {MAX_POLICY_CONDITIONS} conditions."
        )
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            raise RowPolicyError("Each row policy condition must be an object.")
        column = item.get("column")
        op = item.get("op")
        if not isinstance(column, str) or not is_valid_identifier(column):
            raise RowPolicyError(f"Invalid policy column: {column!r}")
        if op not in POLICY_OPS:
            raise RowPolicyError(f"Unsupported policy operator: {op!r}")
        condition: dict[str, Any] = {"column": column, "op": op}
        if op in ("is_null", "is_not_null"):
            out.append(condition)
            continue
        if "claim" in item:
            claim = item.get("claim")
            if not isinstance(claim, str) or not claim.strip():
                raise RowPolicyError("A claim binding needs a non-empty claim name.")
            condition["claim"] = claim.strip()
        elif "value" in item:
            condition["value"] = item.get("value")
        else:
            # `region = NULL` never matches; an explicit `is_null` is the way to say it.
            raise RowPolicyError("A policy condition needs a value or a claim binding.")
        out.append(condition)
    return out


def policy_conditions(
    policy: Any,
    *,
    alias: str | None,
    claims: dict[str, Any],
    key_prefix: str = "rp",
) -> tuple[list[str], dict[str, Any]]:
    """Render a policy as SQL conditions against `alias` (or unqualified when None)."""
    conditions = validate_policy(policy)
    rendered: list[tuple[str, str, Any]] = []
    for condition in conditions:
        expr = (
            f'{alias}."{condition["column"]}"' if alias else f'"{condition["column"]}"'
        )
        value = condition["value"] if "value" in condition else _claim_value(
            condition["claim"], claims
        )
        rendered.append((expr, condition["op"], value))
    try:
        return build_conditions(rendered, key_prefix=key_prefix)
    except Exception as exc:  # SqlBuildError
        raise RowPolicyError(str(exc)) from exc


def policy_fingerprint(policy: Any) -> str:
    """Stable, short id of the effective policy (audit: which constraint ran)."""
    import hashlib
    import json

    canonical = json.dumps(validate_policy(policy), sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
