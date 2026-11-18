"""Whether a column carries time, and which calendar its values belong to.

Two facts, one of them derived:

- **temporal** — a `Date`/`DateTime` column is a point in time; a `String` column is a period only when it
  declares a `time_format` (`2026-W47` has no other way to say "week").
- **kind** — which calendar, derived from the smallest unit the format mentions. `%V` is a week, `%m` a month,
  `%Y` a year; a format with no recognisable unit is `custom`, and a period's own label is all it has.

There is deliberately no `period_kind` input. A stored kind and a stored format can disagree (`%V` labelled
month), and the disagreement has no meaning — so the format is the only thing written down.
"""

from __future__ import annotations

#: Most granular first: `%Y-%m-%d` must read as a day, not as a year.
_FORMAT_UNITS: tuple[tuple[str, str], ...] = (
    ("%d", "day"),
    ("%j", "day"),
    ("%V", "week"),
    ("%W", "week"),
    ("%U", "week"),
    ("%m", "month"),
    ("%B", "month"),
    ("%b", "month"),
    ("%q", "quarter"),
    ("%Y", "year"),
    ("%y", "year"),
)

DATE_DATATYPES = {"date", "datetime", "datetimetz", "timestamp", "timestamptz"}


def is_temporal_datatype(datatype: str | None) -> bool:
    return (datatype or "").strip().lower() in DATE_DATATYPES


def kind_of_format(time_format: str | None) -> str | None:
    """The calendar a format describes, or None when it names no unit (`custom`)."""
    pattern = (time_format or "").strip()
    if not pattern:
        return None
    for unit, kind in _FORMAT_UNITS:
        if unit in pattern:
            return kind
    return "custom"


def resolve_time_role(
    *,
    datatype: str | None,
    time_format: str | None,
    field_dimension: dict | None = None,
) -> tuple[bool, str]:
    """`(is a time axis, which calendar)`.

    The field's `dimension` is an override, not a second source of truth: it may only opt a temporal column
    out (`{"is_time": false}`), which is how an audit timestamp stays out of the time axis.
    """
    dimension = field_dimension or {}
    declared = dimension.get("is_time")
    temporal = is_temporal_datatype(datatype) or bool((time_format or "").strip())
    if declared is False:
        return False, "custom"
    if not temporal:
        return False, "custom"
    kind = kind_of_format(time_format)
    if kind is None:
        # A date column with no format has a calendar by its type; a string period without one has none.
        kind = "day" if is_temporal_datatype(datatype) else "custom"
    elif declared is True and kind == "custom":
        kind = "day" if is_temporal_datatype(datatype) else "custom"
    return True, kind
