"""Period labels: one spelling, one derivation of start/end.

A rule run is always "for a period". Until there is a period object, the label *is* the key used by events,
dedupe and the run display, so it has to be canonical: a typo would otherwise create two parallel histories
for the same week.

Accepted labels:

* ``2026-W46`` — ISO week (weeks start Monday), derived with ``date.fromisocalendar``
* ``2026-11``   — calendar month
* ``2026-11-15`` — a single day

Anything else is a 422 with the accepted forms, because "unknown period" must be an input error now rather
than an unexplained "cannot decide" later.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

WEEK = re.compile(r"^(\d{4})-W(\d{2})$")
MONTH = re.compile(r"^(\d{4})-(\d{2})$")
DAY = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


class PeriodError(ValueError):
    """The label is not a period this system can reason about."""


def parse_period(label: str) -> tuple[str, str]:
    """`2026-W46` → (`2026-11-09`, `2026-11-15`) — inclusive dates, as stored on events."""
    text_label = (label or "").strip()
    if not text_label:
        return "", ""

    week = WEEK.match(text_label)
    if week:
        year, number = int(week.group(1)), int(week.group(2))
        try:
            monday = date.fromisocalendar(year, number, 1)
        except ValueError as exc:
            raise PeriodError(f"'{text_label}' is not a week of {year}.") from exc
        return monday.isoformat(), (monday + timedelta(days=6)).isoformat()

    month = MONTH.match(text_label)
    if month:
        year, number = int(month.group(1)), int(month.group(2))
        if not 1 <= number <= 12:
            raise PeriodError(f"'{text_label}' is not a month.")
        start = date(year, number, 1)
        end = date(year + 1, 1, 1) - timedelta(days=1) if number == 12 else date(year, number + 1, 1) - timedelta(days=1)
        return start.isoformat(), end.isoformat()

    day = DAY.match(text_label)
    if day:
        try:
            single = date(int(day.group(1)), int(day.group(2)), int(day.group(3)))
        except ValueError as exc:
            raise PeriodError(f"'{text_label}' is not a date.") from exc
        return single.isoformat(), single.isoformat()

    raise PeriodError(
        f"'{text_label}' is not a period — use YYYY-Www (2026-W46), YYYY-MM (2026-11) or YYYY-MM-DD."
    )


def period_key(start: str, end: str) -> str:
    """A stable key for the pair, so events and runs can be matched without re-parsing."""
    return f"{start}..{end}" if start or end else ""
