"""Reconcile document processing status from procrastinate job rows (no job-service coupling)."""
from __future__ import annotations

from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import DocumentStatus
from app.models.document import Document

_ACTIVE_JOB_STATUSES = frozenset({"todo", "doing", "aborting"})
_SUCCESS_JOB_STATUSES = frozenset({"succeeded"})
_TERMINAL_FAILURE_JOB_STATUSES = frozenset({"failed", "cancelled"})


def derive_document_processing_status(
    current: DocumentStatus,
    procrastinate_job_statuses: list[str],
) -> DocumentStatus | None:
    """Return a new document status when jobs imply a change; otherwise None."""
    if not procrastinate_job_statuses:
        return None

    statuses = set(procrastinate_job_statuses)
    if statuses & _ACTIVE_JOB_STATUSES:
        if statuses & {"doing", "aborting"}:
            derived = DocumentStatus.RUNNING
        else:
            derived = DocumentStatus.PENDING
    elif statuses & _SUCCESS_JOB_STATUSES:
        derived = DocumentStatus.COMPLETED
    elif statuses <= _TERMINAL_FAILURE_JOB_STATUSES:
        derived = DocumentStatus.FAILED
    else:
        return None

    if derived == current:
        return None
    if current == DocumentStatus.COMPLETED and derived == DocumentStatus.FAILED:
        return None
    return derived


async def sync_document_processing_status_from_jobs(
    db: AsyncSession,
    document_id: str,
) -> bool:
    """Update document processing status from all jobs for ``document_id``; return True if updated."""
    table_exists = await db.execute(
        text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_name = 'procrastinate_jobs')"
        )
    )
    if not table_exists.scalar():
        return False

    doc = await db.get(Document, document_id)
    if doc is None:
        return False

    result = await db.execute(
        text(
            "SELECT status FROM procrastinate_jobs "
            "WHERE args->>'document_id' = :document_id"
        ),
        {"document_id": document_id},
    )
    job_statuses = [row.status for row in result]
    derived = derive_document_processing_status(doc.status, job_statuses)
    if derived is None:
        return False

    await db.execute(
        update(Document).where(Document.id == document_id).values(status=derived)
    )
    return True
