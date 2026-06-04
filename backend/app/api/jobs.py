"""Jobs API – list, create, retry document processing jobs."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.constants import DocumentStatus
from app.database import get_db
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.models.job_worker_log import JobWorkerLog
from app.models.pipeline import Pipeline
from app.schemas.job import JobCreate, JobEvent, JobListResponse, JobResponse
from app.services.document_scope import load_document_scoped, require_document_by_id_read
from app.services.kb_scope import load_knowledge_base_scoped
from app.services.resource_acl_constants import PERM_READ, PERM_WRITE
from app.services.resource_acl_service import channel_allowed_for_document_upload, scope_applies

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"], dependencies=[Depends(require_auth)])

_STATUS_MAP = {
    "todo": "pending",
    "doing": "running",
    "succeeded": "completed",
    "failed": "failed",
    "cancelled": "cancelled",
    "aborting": "running",
}

_MARK_FAILED_STATUSES = frozenset({"todo", "doing"})


def _row_to_response(row) -> JobResponse:
    return JobResponse(
        id=row.id,
        queue_name=row.queue_name or "default",
        task_name=row.task_name,
        status=_STATUS_MAP.get(row.status, row.status),
        args=row.args or {},
        scheduled_at=row.scheduled_at,
        started_at=row.started_at if hasattr(row, "started_at") else None,
        attempts=row.attempts,
        created_at=row.scheduled_at,
    )


async def read_job_response(
    db: AsyncSession,
    job_id: int,
    *,
    fallback_task_name: str,
    fallback_args: dict,
) -> JobResponse:
    """Load a procrastinate job row as JobResponse, or a minimal placeholder if the row is missing."""
    result = await db.execute(
        text(
            "SELECT id, queue_name, task_name, status, args, scheduled_at, attempts "
            "FROM procrastinate_jobs WHERE id = :job_id"
        ),
        {"job_id": job_id},
    )
    row = result.first()
    if not row:
        return JobResponse(
            id=job_id,
            queue_name="default",
            task_name=fallback_task_name,
            status="pending",
            args=fallback_args,
            attempts=0,
        )
    return _row_to_response(row)


async def _procrastinate_table_exists(db: AsyncSession) -> bool:
    result = await db.execute(
        text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'procrastinate_jobs')")
    )
    return result.scalar()


async def _job_args_allowed(
    request: Request,
    db: AsyncSession,
    args: dict,
    *,
    require_write: bool = False,
) -> bool:
    """Return whether the caller may access a job by its args (document or KB)."""
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    doc_id = args.get("document_id")
    kb_id = args.get("knowledge_base_id")
    if doc_id and isinstance(doc_id, str):
        doc = await db.get(Document, doc_id)
        if not doc:
            return False
        if require_write:
            return bool(
                doc.channel_id
                and await channel_allowed_for_document_upload(db, p, sub, doc.channel_id)
            )
        try:
            await require_document_by_id_read(db, request, doc_id)
            return True
        except HTTPException:
            return False
    if kb_id and isinstance(kb_id, str):
        perm = PERM_WRITE if require_write else PERM_READ
        try:
            await load_knowledge_base_scoped(db, request, kb_id, perm)
            return True
        except HTTPException:
            return False
    return False


async def _require_job_access(
    request: Request,
    db: AsyncSession,
    args: dict,
    *,
    require_write: bool = False,
) -> None:
    if not await _job_args_allowed(request, db, args, require_write=require_write):
        raise HTTPException(status_code=404, detail="Job not found")


@router.get("", response_model=JobListResponse)
async def list_jobs(
    request: Request,
    document_id: str | None = None,
    knowledge_base_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List jobs from procrastinate_jobs table."""
    if not await _procrastinate_table_exists(db):
        return JobListResponse(items=[], total=0)

    where_clauses: list[str] = []
    params: dict = {"limit": limit, "offset": offset}

    if document_id:
        where_clauses.append("args->>'document_id' = :document_id")
        params["document_id"] = document_id
    if knowledge_base_id:
        where_clauses.append("args->>'knowledge_base_id' = :knowledge_base_id")
        params["knowledge_base_id"] = knowledge_base_id

    where = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    result = await db.execute(
        text(
            f"SELECT id, queue_name, task_name, status, args, scheduled_at, attempts "
            f"FROM procrastinate_jobs {where} "
            f"ORDER BY id DESC LIMIT :limit OFFSET :offset"
        ),
        params,
    )
    rows = list(result)
    visible = [
        r for r in rows
        if await _job_args_allowed(request, db, r.args or {}, require_write=False)
    ]
    return JobListResponse(items=[_row_to_response(r) for r in visible], total=len(visible))


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Get a specific job by ID with lifecycle events."""
    result = await db.execute(
        text(
            "SELECT id, queue_name, task_name, status, args, scheduled_at, attempts "
            "FROM procrastinate_jobs WHERE id = :job_id"
        ),
        {"job_id": job_id},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    await _require_job_access(request, db, row.args or {}, require_write=False)

    events_result = await db.execute(
        text(
            "SELECT type, at FROM procrastinate_events "
            "WHERE job_id = :job_id ORDER BY at"
        ),
        {"job_id": job_id},
    )
    events = [JobEvent(type=e.type, at=e.at) for e in events_result]

    resp = _row_to_response(row)
    resp.events = events

    for ev in events:
        if ev.type == "started" and ev.at:
            resp.started_at = ev.at
        if ev.type in ("succeeded", "failed", "cancelled") and ev.at:
            resp.finished_at = ev.at

    wl = await db.get(JobWorkerLog, job_id)
    if wl is not None:
        resp.worker_log = wl.log_text
        resp.worker_log_truncated = wl.truncated
        resp.worker_log_char_limit = wl.char_limit_applied

    return resp


@router.post("", response_model=JobResponse, status_code=201)
async def create_job(
    body: JobCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a processing job for a document."""
    doc = await db.get(Document, body.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        doc = await load_document_scoped(db, request, body.document_id, PERM_WRITE)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Document not found") from None

    file_ext = doc.name.rsplit(".", 1)[-1].lower() if "." in doc.name else "pdf"

    if file_ext == "xlsx":
        from app.jobs.tasks import run_spreadsheet_preview

        job_id = await run_spreadsheet_preview.defer_async(
            document_id=doc.id,
            file_hash=doc.file_hash or "",
            file_ext=file_ext,
        )
    elif file_ext == "xmind":
        from app.jobs.tasks import run_mindmap_preview

        job_id = await run_mindmap_preview.defer_async(
            document_id=doc.id,
            file_hash=doc.file_hash or "",
            file_ext=file_ext,
        )
    else:
        pipeline_id = body.pipeline_id
        if not pipeline_id:
            channel = await db.get(DocumentChannel, doc.channel_id)
            if channel and channel.pipeline_id:
                pipeline_id = channel.pipeline_id

        if not pipeline_id:
            raise HTTPException(
                status_code=400,
                detail="No pipeline specified and channel has no default pipeline",
            )

        pipeline = await db.get(Pipeline, pipeline_id)
        if not pipeline:
            raise HTTPException(status_code=404, detail="Pipeline not found")
        if not pipeline.is_active:
            raise HTTPException(status_code=400, detail="Pipeline is disabled")

        from app.jobs.tasks import run_pipeline

        job_id = await run_pipeline.defer_async(
            document_id=doc.id,
            pipeline_id=pipeline.id,
            file_hash=doc.file_hash or "",
            file_ext=file_ext,
            command=pipeline.command,
            default_args=pipeline.default_args,
            model_id=pipeline.model_id,
            force_reparse=body.force_reparse,
        )

    from sqlalchemy import update
    await db.execute(
        update(Document).where(Document.id == doc.id).values(status=DocumentStatus.PENDING)
    )
    await db.commit()

    return await read_job_response(
        db,
        job_id,
        fallback_task_name="run_pipeline",
        fallback_args={"document_id": doc.id},
    )


@router.post("/{job_id}/retry", response_model=JobResponse)
async def retry_job(job_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Retry a failed job by creating a new job with the same arguments."""
    result = await db.execute(
        text(
            "SELECT id, queue_name, task_name, status, args, scheduled_at, attempts "
            "FROM procrastinate_jobs WHERE id = :job_id"
        ),
        {"job_id": job_id},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    await _require_job_access(request, db, row.args or {}, require_write=True)

    if _STATUS_MAP.get(row.status, row.status) != "failed":
        raise HTTPException(status_code=400, detail="Only failed jobs can be retried")

    args = row.args or {}
    document_id = args.get("document_id")
    task_name = row.task_name or ""

    if task_name == "run_kb_index":
        kb_id = args.get("knowledge_base_id")
        if not kb_id or not isinstance(kb_id, str):
            raise HTTPException(status_code=400, detail="Job has no knowledge_base_id in args")
        from app.jobs.tasks import run_kb_index

        new_job_id = await run_kb_index.defer_async(knowledge_base_id=kb_id)
        await db.commit()
        return await read_job_response(
            db,
            new_job_id,
            fallback_task_name="run_kb_index",
            fallback_args={"knowledge_base_id": kb_id},
        )

    if not document_id:
        raise HTTPException(status_code=400, detail="Job has no document_id in args")

    if task_name == "run_spreadsheet_preview":
        from app.jobs.tasks import run_spreadsheet_preview

        new_job_id = await run_spreadsheet_preview.defer_async(
            document_id=args.get("document_id", ""),
            file_hash=args.get("file_hash", ""),
            file_ext=args.get("file_ext", "xlsx"),
        )
    elif task_name == "run_mindmap_preview":
        from app.jobs.tasks import run_mindmap_preview

        new_job_id = await run_mindmap_preview.defer_async(
            document_id=args.get("document_id", ""),
            file_hash=args.get("file_hash", ""),
            file_ext=args.get("file_ext", "xmind"),
        )
    else:
        from app.jobs.tasks import run_pipeline

        cmd_template = args.get("command", "openkms-cli pipeline run")

        new_job_id = await run_pipeline.defer_async(
            document_id=args.get("document_id", ""),
            pipeline_id=args.get("pipeline_id", ""),
            file_hash=args.get("file_hash", ""),
            file_ext=args.get("file_ext", "pdf"),
            command=cmd_template,
            default_args=args.get("default_args"),
            model_id=args.get("model_id"),
            force_reparse=True,
        )

    from sqlalchemy import update
    from app.models.document import Document
    await db.execute(
        update(Document).where(Document.id == document_id).values(status=DocumentStatus.PENDING)
    )
    await db.commit()

    return await read_job_response(
        db,
        new_job_id,
        fallback_task_name="run_pipeline",
        fallback_args=dict(args),
    )


@router.post("/{job_id}/mark-failed", response_model=JobResponse)
async def mark_job_failed(job_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Mark a stale in-flight job failed when the worker stopped without finishing."""
    from procrastinate.jobs import Status

    from app.jobs import job_app

    result = await db.execute(
        text(
            "SELECT id, queue_name, task_name, status, args, scheduled_at, attempts "
            "FROM procrastinate_jobs WHERE id = :job_id"
        ),
        {"job_id": job_id},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    await _require_job_access(request, db, row.args or {}, require_write=True)

    if row.status not in _MARK_FAILED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Only pending or running jobs can be marked failed",
        )

    try:
        async with job_app.open_async():
            await job_app.job_manager.finish_job_by_id_async(
                job_id=job_id,
                status=Status.FAILED,
                delete_job=False,
            )
    except Exception as exc:
        logger.exception("mark_job_failed: procrastinate finish_job failed for job_id=%s", job_id)
        raise HTTPException(
            status_code=400,
            detail="Job could not be marked failed; it may already be finished",
        ) from exc

    args = row.args or {}
    document_id = args.get("document_id")
    if document_id:
        from app.services.document_processing_status import sync_document_processing_status_from_jobs

        await sync_document_processing_status_from_jobs(db, document_id)
    await db.commit()

    return await get_job(job_id, request, db)


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Delete a job. Running jobs cannot be deleted."""
    result = await db.execute(
        text(
            "SELECT id, status, args FROM procrastinate_jobs WHERE id = :job_id"
        ),
        {"job_id": job_id},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    await _require_job_access(request, db, row.args or {}, require_write=True)

    mapped_status = _STATUS_MAP.get(row.status, row.status)
    if mapped_status == "running":
        raise HTTPException(status_code=400, detail="Cannot delete a running job")

    await db.execute(
        text("DELETE FROM job_worker_logs WHERE procrastinate_job_id = :job_id"),
        {"job_id": job_id},
    )
    await db.execute(
        text("DELETE FROM procrastinate_events WHERE job_id = :job_id"),
        {"job_id": job_id},
    )
    await db.execute(
        text("DELETE FROM procrastinate_jobs WHERE id = :job_id"),
        {"job_id": job_id},
    )
    await db.commit()
