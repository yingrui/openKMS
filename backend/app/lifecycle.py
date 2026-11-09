"""Validity windows: is a document or article in force at a given moment?

Pure, and deliberately **below** both `app/schemas` and `app/services`: a response field that says "this row is searchable"
and the retrieval query that decides the same thing must not be able to disagree — and a schema may not import a service to
find out. The service-side wrappers (`document_effective_for_rag`, `article_effective_for_rag`) delegate here, so the rule
has one implementation and no direction problem.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.constants import DocumentLifecycleStatus

#: `draft`, `superseded` and `withdrawn` are never in force; anything unrecognised is treated as out.
_INACTIVE = frozenset(
    {
        DocumentLifecycleStatus.DRAFT.value,
        DocumentLifecycleStatus.SUPERSEDED.value,
        DocumentLifecycleStatus.WITHDRAWN.value,
    }
)


def row_effective_for_rag(row: object, at: datetime | None = None) -> bool:
    """The rule applied to anything carrying the three fields — a `Document`, an `Article`, or a schema's `data`."""
    return effective_for_rag(
        lifecycle_status=getattr(row, "lifecycle_status", None),
        effective_from=getattr(row, "effective_from", None),
        effective_to=getattr(row, "effective_to", None),
        at=at,
    )


def effective_for_rag(
    *,
    lifecycle_status: str | None,
    effective_from: datetime | None,
    effective_to: datetime | None,
    at: datetime | None = None,
) -> bool:
    """Whether a row is applicable for default KB indexing and semantic search at ``at``.

    A row with no lifecycle status is legacy and stays applicable, so existing deployments behave unchanged. `in_force`
    additionally requires the optional validity window to contain ``at`` (inclusive on both ends).
    """
    moment = at if at is not None else datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)

    if lifecycle_status is None:
        return True
    if lifecycle_status in _INACTIVE or lifecycle_status != DocumentLifecycleStatus.IN_FORCE.value:
        return False
    if effective_from is not None and moment < effective_from:
        return False
    if effective_to is not None and moment > effective_to:
        return False
    return True
