"""Article lifecycle: same applicability rules as documents for future KB use."""

from datetime import datetime, timezone

from app.constants import DocumentLifecycleStatus
from app.models.article import Article


def article_effective_for_rag(row: Article, at: datetime | None = None) -> bool:
    at = at if at is not None else datetime.now(timezone.utc)
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)

    if row.lifecycle_status is None:
        return True

    ls = row.lifecycle_status
    if ls in (
        DocumentLifecycleStatus.DRAFT.value,
        DocumentLifecycleStatus.SUPERSEDED.value,
        DocumentLifecycleStatus.WITHDRAWN.value,
    ):
        return False
    if ls != DocumentLifecycleStatus.IN_FORCE.value:
        return False

    if row.effective_from is not None and at < row.effective_from:
        return False
    if row.effective_to is not None and at > row.effective_to:
        return False
    return True
