"""Periods: a label, a calendar, and the two dates it covers.

A **time dimension** is a field, and it declares *which calendar* its values belong to (`period_kind`): a day,
a week, a month, a quarter, a year, or `custom` — a calendar we do not interpret, where the field's own labels
*are* the periods (`cycle` = "2026-W46", a season, a settlement round). A **period** is one instance of that
calendar, written the way the field writes it.

That distinction decides how a run filters:

* a date-typed field with a day/week/month/quarter/year calendar → the label is parsed into two dates and the
  filter is `field >= start AND field <= end` (a week is Monday…Sunday, ISO);
* a field that stores its period as a key (`cycle` as text, `202611` as an integer) → the filter is equality on
  the label itself; the label is *not* converted, because "2026-11-09" is not comparable to "2026-W46";
* `custom` is equality, and we never guess: no previous period, no arithmetic.

Every label is validated against the calendar before it reaches SQL, so "W46" against a day calendar is a 422
that names the expected format rather than an empty result.
"""
from __future__ import annotations

from app.services.data.time_role import resolve_time_role

import re
from datetime import date, timedelta

#: The calendars a time dimension may declare.
PERIOD_KINDS = ("day", "week", "month", "quarter", "year", "custom")

#: What a label must look like, per calendar (used in error messages).
LABEL_FORMATS = {
    "day": "YYYY-MM-DD",
    "week": "YYYY-Www",
    "month": "YYYY-MM",
    "quarter": "YYYY-Qn",
    "year": "YYYY",
    "custom": "the field's own period key",
}

WEEK = re.compile(r"^(\d{4})-W(\d{2})$")
MONTH = re.compile(r"^(\d{4})-(\d{2})$")
QUARTER = re.compile(r"^(\d{4})-Q([1-4])$")
YEAR = re.compile(r"^(\d{4})$")
DAY = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")

#: Ossie datatypes whose values are comparable to a date range.
DATE_DATATYPES = {"date", "datetime", "datetimetz", "timestamp", "timestamptz"}


#: The formats the retired `period_kind` values imply, so existing rows keep working without a rewrite.
_FORMAT_FOR_KIND = {
    "day": "%Y-%m-%d",
    "week": "%G-W%V",
    "month": "%Y-%m",
    "quarter": "%Y-Q%q",
    "half": "%Y-H",
    "year": "%Y",
}


class PeriodError(ValueError):
    """The label is not a period of this calendar."""


def kind_of_dimension(dimension: dict | None, datatype: str | None) -> str:
    """The calendar a time dimension holds, derived from its value's format.

    The format is the only source: `period_kind` used to be stored beside it, and the two could disagree. A
    field that predates `time_format` is read through its old `period_kind` once, by turning it into the format
    it implies.
    """
    declared = (dimension or {}).get("period_kind")
    time_format = (dimension or {}).get("time_format") or _FORMAT_FOR_KIND.get(str(declared or ""))
    is_time, kind = resolve_time_role(
        datatype=datatype, time_format=time_format, field_dimension=dimension
    )
    if not is_time:
        return "custom"
    if isinstance(declared, str) and declared in PERIOD_KINDS and not (dimension or {}).get("time_format"):
        return declared
    return kind


def parse_period(label: str, kind: str = "week") -> tuple[str, str]:
    """`2026-W46` + `week` → (`2026-11-09`, `2026-11-15`); `custom` keeps the label as both bounds."""
    text = (label or "").strip()
    if not text:
        return "", ""
    if kind not in PERIOD_KINDS:
        raise PeriodError(f"unknown period kind '{kind}'")
    if kind == "custom":
        # The field's own key: nothing to derive, and pretending to derive it would filter the wrong rows.
        return text, text

    if kind == "day":
        match = DAY.match(text)
        if not match:
            raise PeriodError(_format_error(text, kind))
        try:
            single = date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        except ValueError as exc:
            raise PeriodError(f"'{text}' is not a date.") from exc
        return single.isoformat(), single.isoformat()

    if kind == "week":
        match = WEEK.match(text)
        if not match:
            raise PeriodError(_format_error(text, kind))
        try:
            monday = date.fromisocalendar(int(match.group(1)), int(match.group(2)), 1)
        except ValueError as exc:
            raise PeriodError(f"'{text}' is not a week.") from exc
        return monday.isoformat(), (monday + timedelta(days=6)).isoformat()

    if kind == "month":
        match = MONTH.match(text)
        if not match:
            raise PeriodError(_format_error(text, kind))
        year, month = int(match.group(1)), int(match.group(2))
        if not 1 <= month <= 12:
            raise PeriodError(f"'{text}' is not a month.")
        start = date(year, month, 1)
        end = (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)) - timedelta(days=1)
        return start.isoformat(), end.isoformat()

    if kind == "quarter":
        match = QUARTER.match(text)
        if not match:
            raise PeriodError(_format_error(text, kind))
        year, quarter = int(match.group(1)), int(match.group(2))
        start = date(year, 3 * quarter - 2, 1)
        end = (date(year + 1, 1, 1) if quarter == 4 else date(year, 3 * quarter + 1, 1)) - timedelta(days=1)
        return start.isoformat(), end.isoformat()

    match = YEAR.match(text)
    if not match:
        raise PeriodError(_format_error(text, kind))
    year = int(match.group(1))
    return date(year, 1, 1).isoformat(), date(year, 12, 31).isoformat()


def shift_period(kind: str, label: str, start: str, end: str, offset: int) -> tuple[str, str, str]:
    """The same calendar position `offset` periods earlier (`-1` = previous period).

    Only a date-backed calendar can be shifted: `2026-W46` minus one week is arithmetic, but a custom
    cycle's previous key is not derivable — it needs a calendar table, so callers must refuse it.
    """
    if not offset:
        return label, start, end
    if kind == "custom" or not start:
        raise PeriodError("a custom cycle has no previous period — offset needs a dated time dimension")
    first = date.fromisoformat(start)
    if kind == "day":
        shifted_start = first + timedelta(days=offset)
        return shifted_start.isoformat(), shifted_start.isoformat(), shifted_start.isoformat()
    if kind == "week":
        shifted_start = first + timedelta(weeks=offset)
        return (
            f"{shifted_start.isocalendar().year}-W{shifted_start.isocalendar().week:02d}",
            shifted_start.isoformat(),
            (shifted_start + timedelta(days=6)).isoformat(),
        )
    months = {"month": 1, "quarter": 3, "year": 12}.get(kind)
    if months is None:
        raise PeriodError(f"offset is not supported for a {kind} calendar")
    total = first.year * 12 + (first.month - 1) + months * offset
    end_total = total + months
    year, month_index = divmod(total, 12)
    end_year, end_month_index = divmod(end_total, 12)
    shifted_start = date(year, month_index + 1, 1)
    shifted_end = date(end_year, end_month_index + 1, 1) - timedelta(days=1)
    if kind == "month":
        shifted_label = f"{shifted_start.year}-{shifted_start.month:02d}"
    elif kind == "quarter":
        shifted_label = f"{shifted_start.year}-Q{shifted_start.month // 3 + 1}"
    else:
        shifted_label = str(shifted_start.year)
    return shifted_label, shifted_start.isoformat(), shifted_end.isoformat()


def filter_for_period(
    field: str,
    *,
    datatype: str | None,
    kind: str,
    label: str,
    start: str,
    end: str,
) -> list[dict]:
    """How the run's period reaches SQL for one field.

    A date column ranges over the period's two dates; a key column (text/int) matches the label. Using dates
    against a `cycle` column would compare incomparable values and quietly return nothing.
    """
    if not field or not (label or start or end):
        return []
    key_like = kind == "custom" or (datatype or "").strip().lower() not in DATE_DATATYPES
    if key_like:
        return [{"field": field, "op": "=", "value": label or start}]
    if kind == "day":
        return [{"field": field, "op": "=", "value": start or label}]
    return [
        {"field": field, "op": ">=", "value": start},
        {"field": field, "op": "<=", "value": end},
    ]


def _format_error(label: str, kind: str) -> str:
    expected = LABEL_FORMATS.get(kind, "a period")
    return f"'{label}' is not a {kind} period — use {expected} (e.g. 2026-W46, 2026-11, 2026-Q4, 2026, 2026-11-09)."
