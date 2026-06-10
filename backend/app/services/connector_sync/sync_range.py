"""Parse optional sync date bounds passed into connector sync jobs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.services.connector_sync.pg import ymd_to_date


@dataclass(frozen=True, slots=True)
class SyncDateRange:
    """Explicit bounds when the caller sets both dates; otherwise connector-defined."""

    start: date | None
    end: date | None

    @property
    def is_explicit(self) -> bool:
        return self.start is not None and self.end is not None


def parse_sync_date_range(
    start_date: date | str | None = None,
    end_date: date | str | None = None,
) -> SyncDateRange:
    """Validate job args. Omit both dates so each connector kind picks its own window."""
    if start_date is None and end_date is None:
        return SyncDateRange(None, None)
    if start_date is None or end_date is None:
        raise ValueError("start_date and end_date must both be provided or both omitted.")
    start = ymd_to_date(start_date)
    end = ymd_to_date(end_date)
    if not start or not end:
        raise ValueError("Invalid date; use YYYY-MM-DD or YYYYMMDD.")
    if start > end:
        raise ValueError("start_date must be on or before end_date.")
    return SyncDateRange(start, end)
