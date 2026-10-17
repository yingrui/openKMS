"""Every quality rule is one SQL query.

There are **several ways to configure** a rule and **exactly one way to execute** one.

The five declarative types are the normal way: a form with a column and a threshold. They are
implemented as **generators** — a `not_null` rule *is* `count(*) FILTER (WHERE col IS NULL)`, a `range`
rule *is* a `BETWEEN` — because they only choose *which query to write*, not *how it runs*. The sixth
type, `sql`, is the same contract written by hand, for the constraints that are business-specific ("the
high price can never be below the low", "the share of null P/E is under 30%") and that no form can
anticipate. The declarative types stay: filling a form beats writing SQL, and nothing is lost by it.

What the single execution path buys:

- **one contract** — read-only transaction, statement timeout, bound parameters, and "how many rows
  *break* this rule", `> 0` fails. A `not_null` rule and a hand-written query cannot drift apart;
- **every rule is inspectable** — the SQL a run used is stored in `detail.sql` for *every* type, so the
  UI can show what actually ran (and a reader can copy it into the Playground). A declarative rule is no
  longer a black box that reports a number;
- **a new configuration style is cheap** — it only has to produce a query, not a runner.

If a rule type can be expressed only by bypassing this module, that is a bug here, not a feature of the
type.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

RULE_TYPES = ("not_null", "unique", "range", "referential", "freshness", "sql")

#: Longer than this is not a rule, it is a script — and it is stored in `config` and shown in a form.
MAX_RULE_SQL = 4000
#: A rule that takes longer than this is not a rule either (the runner also bounds the statement).
RULE_SQL_TIMEOUT_MS = 20_000

#: How to read a result: `number` = one column (an author's query); `rows` = `checked` + `failed`;
#: `freshness` = those plus `latest`.
Shape = Literal["number", "rows", "freshness"]

#: What an author's number *means*. A count is not always a count of problems:
#:
#: - `zero` (the default) — the number is how many rows **break** the rule; `> 0` fails. "PE above 100".
#: - `nonzero` — the number is how many rows **satisfy** a requirement; `0` fails. "Are there rows for
#:   today?" A coverage check has no violating row to count: the absence *is* the violation.
Expect = Literal["zero", "nonzero"]


class QualityError(ValueError):
    """Raised when a rule cannot run; surfaced as HTTP 400."""


@dataclass(frozen=True)
class RuleQuery:
    """A rule's query, ready to execute."""

    sql: str
    shape: Shape
    params: dict[str, Any] = field(default_factory=dict)
    #: Only `number` (an author's query) reads this: whether the number counts problems or coverage.
    expect: Expect = "zero"
    #: Context a run should record beside the measurement (the threshold it was judged against).
    detail: dict[str, Any] = field(default_factory=dict)


def _quote(identifier: str) -> str:
    """Identifiers are validated by the caller (``is_valid_identifier``), then quoted here."""
    return f'"{identifier}"'


def render_rule_sql(body: str, table: str, col: str | None) -> str:
    """Fill `{{table}}` / `{{column}}` in an author's query. `table` arrives quoted and validated."""
    rendered = body.replace("{{table}}", table)
    if col:
        rendered = rendered.replace("{{column}}", _quote(col))
    else:
        rendered = rendered.replace("{{column}}", "NULL")
    return rendered


def normalize_rule_sql(sql: str) -> str:
    """Check the shape of an author's query and return the statement to run.

    Deliberately a shape check, not a parser: the guarantee that nothing is written comes from the
    read-only transaction, and this exists so the mistake (a `DELETE`, a second statement) is a clear
    message instead of a database error.
    """
    body = (sql or "").strip().rstrip(";").strip()
    if not body:
        raise QualityError("A SQL rule needs a query.")
    if len(body) > MAX_RULE_SQL:
        raise QualityError(f"A SQL rule must be under {MAX_RULE_SQL} characters.")
    if ";" in body:
        raise QualityError("A SQL rule must be a single statement.")
    head = body.lstrip("(").split(None, 1)[0].lower() if body.strip() else ""
    if head not in ("select", "with"):
        raise QualityError("A SQL rule must be a SELECT (or a WITH … SELECT).")
    if "{{table}}" not in body:
        raise QualityError("A SQL rule must read {{table}}, so it is a rule about this dataset.")
    return body


def build_rule_query(
    rule_type: str,
    *,
    table: str,
    column: str | None,
    config: dict[str, Any],
    ref_table: str | None = None,
) -> RuleQuery:
    """The SQL for a rule type — the same query, however it was expressed.

    `table` and `ref_table` arrive quoted and validated; values (min, max, max_age_days) are **bound**
    as parameters, never interpolated — the declarative types used to paste them into the string.
    """
    col = _quote(column) if column else None

    def require_col() -> str:
        if col is None:
            raise QualityError("A valid column is required.")
        return col

    if rule_type == "not_null":
        c = require_col()
        return RuleQuery(
            sql=f"SELECT count(*) AS checked, count(*) FILTER (WHERE {c} IS NULL) AS failed FROM {table}",
            shape="rows",
        )

    if rule_type == "unique":
        # Nulls are not duplicates — SQL's UNIQUE allows many of them, and `range` reads `checked` as
        # the non-null rows; counting nulls here made every nullable column fail with mostly nulls.
        c = require_col()
        return RuleQuery(
            sql=(
                f"SELECT count(*) FILTER (WHERE {c} IS NOT NULL) AS checked, "
                f"count(*) FILTER (WHERE {c} IS NOT NULL) - count(DISTINCT {c}) AS failed FROM {table}"
            ),
            shape="rows",
        )

    if rule_type == "range":
        c = require_col()
        low, high = config.get("min"), config.get("max")
        if low is None and high is None:
            raise QualityError("A range rule needs a min or a max.")
        bounds = " AND ".join(
            part
            for part in (
                f"{c} >= :min" if low is not None else "",
                f"{c} <= :max" if high is not None else "",
            )
            if part
        )
        return RuleQuery(
            sql=(
                f"SELECT count(*) FILTER (WHERE {c} IS NOT NULL) AS checked, "
                f"count(*) FILTER (WHERE {c} IS NOT NULL AND NOT ({bounds})) AS failed FROM {table}"
            ),
            shape="rows",
            params={k: v for k, v in (("min", low), ("max", high)) if v is not None},
        )

    if rule_type == "referential":
        c = require_col()
        ref_col = config.get("ref_column")
        if not ref_table or not isinstance(ref_col, str):
            raise QualityError("A referential rule needs a target dataset and column.")
        return RuleQuery(
            sql=(
                f"SELECT count(*) FILTER (WHERE t.{c} IS NOT NULL) AS checked, "
                f"count(*) FILTER (WHERE t.{c} IS NOT NULL AND NOT EXISTS ("
                f"SELECT 1 FROM {ref_table} r WHERE r.{_quote(ref_col)} = t.{c})) AS failed "
                f"FROM {table} t"
            ),
            shape="rows",
        )

    if rule_type == "freshness":
        c = require_col()
        max_age = int(config.get("max_age_days") or 1)
        # `current_date - integer` is date arithmetic, as the Python this replaced did; both sides are
        # dates, so a timestamp column is compared by its day.
        return RuleQuery(
            sql=(
                f"SELECT 1 AS checked, "
                f"CASE WHEN max({c}) IS NULL OR max({c})::date < current_date - :max_age "
                f"THEN 1 ELSE 0 END AS failed, "
                f"max({c})::text AS latest FROM {table}"
            ),
            shape="freshness",
            params={"max_age": max_age},
            # A run stores the threshold it was judged against — "latest 2026-10-09" alone cannot
            # explain why that passed 30 days later.
            detail={"max_age_days": max_age},
        )

    if rule_type == "sql":
        body = normalize_rule_sql(str(config.get("sql") or ""))
        expect = config.get("expect", "zero")
        if expect not in ("zero", "nonzero"):
            raise QualityError("`expect` must be `zero` (rows that break it) or `nonzero` (rows found).")
        return RuleQuery(
            sql=render_rule_sql(body, table, column), shape="number", expect=expect
        )

    raise QualityError(f"Unknown rule type '{rule_type}'.")


def interpret(
    shape: Shape,
    names: list[str],
    rows: list[list[Any]],
    *,
    expect: Expect = "zero",
) -> dict[str, Any]:
    """Turn a rule query's result into the run's verdict — pure, so every branch has a test.

    One row is the contract for all three shapes: a rule answers a single question.
    """
    if len(rows) != 1:
        raise QualityError("A rule must return exactly one row.")
    row = dict(zip(names, rows[0], strict=True))

    if shape == "number":
        if len(names) != 1:
            raise QualityError(
                "A SQL rule must return exactly one row with one number: the count of violating rows."
            )
        value = rows[0][0]
        if value is None or isinstance(value, bool):
            raise QualityError("A SQL rule's number cannot be null or a boolean.")
        try:
            failed = int(float(value))
        except (TypeError, ValueError) as exc:
            raise QualityError("A SQL rule must return a number (the count of violating rows).") from exc
        if expect == "nonzero":
            # The number is coverage, not violations: finding nothing is the failure. `failed_count` is
            # the verdict (0 or 1), and the number itself is kept as what the query found.
            return {
                "status": "passed" if failed > 0 else "failed",
                "checked_count": None,
                "failed_count": 0 if failed > 0 else 1,
                "detail": {"value": failed, "expect": "nonzero"},
            }
        return {
            "status": "failed" if failed else "passed",
            # An arbitrary query does not say how many rows it looked at; 0 would be a lie.
            "checked_count": None,
            "failed_count": failed,
            "detail": {"value": failed, "expect": "zero"},
        }

    if "failed" not in row:
        raise QualityError(f"A rule query must return a `failed` column, not {sorted(row)}.")
    failed = int(row["failed"] or 0)
    checked = int(row["checked"] or 0) if "checked" in row else None
    detail: dict[str, Any] = {}
    if shape == "freshness":
        detail = {"latest": row.get("latest")}
    return {
        "status": "failed" if failed else "passed",
        "checked_count": checked,
        "failed_count": failed,
        "detail": detail,
    }
