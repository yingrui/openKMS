"""Document policy lifecycle: validity windows and default knowledge-base search/index eligibility."""
from datetime import datetime

from sqlalchemy import and_, func, or_
from sqlalchemy.sql import ColumnElement

from app.constants import DocumentLifecycleStatus
from app.models.document import Document
from app.lifecycle import row_effective_for_rag


def source_current_for_rag_sql(
    document_id_column: ColumnElement,
    at_expr: ColumnElement | None = None,
) -> ColumnElement:
    """Chunks/FAQs with no document_id (e.g. wiki-only) pass; document-backed rows use lifecycle rules."""
    at = at_expr if at_expr is not None else func.now()
    return or_(document_id_column.is_(None), document_current_sql(at))


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


def document_effective_for_rag(row: Document, at: datetime | None = None) -> bool:
    """Is this row in force for retrieval? The rule itself lives in `app.lifecycle`."""
    return row_effective_for_rag(row, at)
