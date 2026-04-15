"""Document policy lifecycle: validity windows and default knowledge-base search/index eligibility."""
from datetime import datetime, timezone

from sqlalchemy import and_, or_
from sqlalchemy.sql import ColumnElement

from app.constants import DocumentLifecycleStatus
from app.models.document import Document


def document_current_sql(at_expr: ColumnElement) -> ColumnElement:
    """SQL predicate: document row is currently applicable for default KB search/index at ``at_expr`` (timestamptz)."""
    return or_(
        Document.lifecycle_status.is_(None),
        and_(
            Document.lifecycle_status == DocumentLifecycleStatus.IN_FORCE.value,
            or_(Document.effective_from.is_(None), Document.effective_from <= at_expr),
            or_(Document.effective_to.is_(None), Document.effective_to >= at_expr),
        ),
    )


def document_effective_for_rag(doc: Document, at: datetime | None = None) -> bool:
    """
    Whether a document is currently applicable for default KB indexing and semantic search.

    Legacy rows (lifecycle_status is None) are treated as applicable so existing deployments
    behave unchanged. draft / superseded / withdrawn are excluded. in_force requires
    optional effective_from / effective_to bounds.
    """
    at = at if at is not None else datetime.now(timezone.utc)
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)

    if doc.lifecycle_status is None:
        return True

    ls = doc.lifecycle_status
    if ls in (
        DocumentLifecycleStatus.DRAFT.value,
        DocumentLifecycleStatus.SUPERSEDED.value,
        DocumentLifecycleStatus.WITHDRAWN.value,
    ):
        return False
    if ls != DocumentLifecycleStatus.IN_FORCE.value:
        return False

    if doc.effective_from is not None and at < doc.effective_from:
        return False
    if doc.effective_to is not None and at > doc.effective_to:
        return False
    return True
