"""Job runs API – list, create, retry document processing runs."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.constants import DocumentStatus
from app.database import get_db
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.models.job_run_worker_log import JobRunWorkerLog
from app.models.pipeline import Pipeline
from app.schemas.job import JobCreate, JobEvent, JobListResponse, JobResponse
from app.services.job_scope import job_args_allowed, require_job_args_access
from app.services.document_scope import load_document_scoped
from app.services.resource_acl_constants import PERM_WRITE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["job-runs"], dependencies=[Depends(require_auth)])

_STATUS_MAP = {
    "todo": "pending",
    "doing": "running",
    "succeeded": "completed",
    "failed": "failed",
    "cancelled": "cancelled",
    "aborting": "running",
}

_MARK_FAILED_STATUSES = frozenset({"todo", "doing"})

_PROCRASTINATE_STATUSES_FOR_API: dict[str, tuple[str, ...]] = {
    "pending": ("todo",),
    "running": ("doing", "aborting"),
    "completed": ("succeeded",),
    "failed": ("failed",),
    "cancelled": ("cancelled",),
}

_JOBS_LIST_SELECT = (
    "SELECT id, queue_name, task_name, status, args, scheduled_at, attempts "
    "FROM procrastinate_jobs"
)


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


def _jobs_list_filters(
    *,
    document_id: str | None,
    knowledge_base_id: str | None,
    connector_id: str | None,
    status: str | None,
    search: str | None,
) -> tuple[str, dict]:
    clauses: list[str] = []
    params: dict = {}

    if document_id:
        clauses.append("args->>'document_id' = :document_id")
        params["document_id"] = document_id
    if knowledge_base_id:
        clauses.append("args->>'knowledge_base_id' = :knowledge_base_id")
        params["knowledge_base_id"] = knowledge_base_id
    if connector_id:
        clauses.append("args->>'connector_id' = :connector_id")
        params["connector_id"] = connector_id
    if status and (st := status.strip()):
        proc = _PROCRASTINATE_STATUSES_FOR_API.get(st)
        if proc:
            placeholders = ", ".join(f":st_{i}" for i in range(len(proc)))
            clauses.append(f"status IN ({placeholders})")
            for i, v in enumerate(proc):
                params[f"st_{i}"] = v
    if search and (q := search.strip()):
        params["search"] = f"%{q}%"
        clauses.append(
            "(task_name ILIKE :search OR COALESCE(args->>'document_id', '') ILIKE :search "
            "OR COALESCE(args->>'knowledge_base_id', '') ILIKE :search "
            "OR COALESCE(args->>'connector_id', '') ILIKE :search)"
        )

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    return where, params


async def _count_jobs(db: AsyncSession, where: str, params: dict) -> int:
    result = await db.execute(
        text(f"SELECT COUNT(*) FROM procrastinate_jobs{where}"),
        params,
    )
    return int(result.scalar_one() or 0)


async def _fetch_job_rows(
    db: AsyncSession, where: str, params: dict, *, limit: int, offset: int
) -> list:
    qparams = {**params, "limit": limit, "offset": offset}
    result = await db.execute(
        text(f"{_JOBS_LIST_SELECT}{where} ORDER BY id DESC LIMIT :limit OFFSET :offset"),
        qparams,
    )
    return list(result)


async def _list_jobs_visible(
    request: Request,
    db: AsyncSession,
    where: str,
    params: dict,
    *,
    limit: int,
    offset: int,
) -> list[JobResponse]:
    """Page of jobs the caller may read; over-fetches SQL batches when ACL filters rows."""
    visible: list[JobResponse] = []
    sql_offset = offset
    batch_size = min(max(limit * 4, 50), 200)
    scans = 0
    max_scans = 50

    while len(visible) < limit and scans < max_scans:
        rows = await _fetch_job_rows(db, where, params, limit=batch_size, offset=sql_offset)
        if not rows:
            break
        for row in rows:
            if await job_args_allowed(request, db, row.args or {}, require_write=False):
                visible.append(_row_to_response(row))
                if len(visible) >= limit:
                    break
        sql_offset += len(rows)
        scans += 1
        if len(rows) < batch_size:
            break

    return visible


@router.get("", response_model=JobListResponse)
async def list_jobs(
    request: Request,
    document_id: str | None = None,
    knowledge_base_id: str | None = None,
    connector_id: str | None = None,
    status: str | None = Query(None, description="API status: pending, running, completed, failed, cancelled"),
    search: str | None = Query(None),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List jobs from procrastinate_jobs table (paginated)."""
    if not await _procrastinate_table_exists(db):
        return JobListResponse(items=[], total=0, limit=limit, offset=offset)

    where, params = _jobs_list_filters(
        document_id=document_id,
        knowledge_base_id=knowledge_base_id,
        connector_id=connector_id,
        status=status,
        search=search,
    )
    total = await _count_jobs(db, where, params)
    items = await _list_jobs_visible(request, db, where, params, limit=limit, offset=offset)
    return JobListResponse(items=items, total=total, limit=limit, offset=offset)


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
    await require_job_args_access(request, db, row.args or {}, require_write=False)

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

    wl = await db.get(JobRunWorkerLog, job_id)
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

    from app.jobs.defer import defer_task

    if file_ext == "xlsx":
        from app.jobs.tasks import run_spreadsheet_preview

        job_id = await defer_task(
            run_spreadsheet_preview,
            document_id=doc.id,
            file_hash=doc.file_hash or "",
            file_ext=file_ext,
        )
    elif file_ext == "xmind":
        from app.jobs.tasks import run_mindmap_preview

        job_id = await defer_task(
            run_mindmap_preview,
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

        job_id = await defer_task(
            run_pipeline,
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
    await require_job_args_access(request, db, row.args or {}, require_write=True)

    if _STATUS_MAP.get(row.status, row.status) != "failed":
        raise HTTPException(status_code=400, detail="Only failed jobs can be retried")

    args = row.args or {}
    document_id = args.get("document_id")
    task_name = row.task_name or ""

    if task_name == "run_kb_index":
        kb_id = args.get("knowledge_base_id")
        if not kb_id or not isinstance(kb_id, str):
            raise HTTPException(status_code=400, detail="Job has no knowledge_base_id in args")
        from app.jobs.defer import defer_task
        from app.jobs.tasks import run_kb_index

        new_job_id = await defer_task(run_kb_index, knowledge_base_id=kb_id)
        await db.commit()
        return await read_job_response(
            db,
            new_job_id,
            fallback_task_name="run_kb_index",
            fallback_args={"knowledge_base_id": kb_id},
        )

    if task_name == "run_connector_sync":
        cid = args.get("connector_id")
        if not cid or not isinstance(cid, str):
            raise HTTPException(status_code=400, detail="Job has no connector_id in args")
        from app.jobs.defer import defer_task
        from app.jobs.tasks import run_connector_sync

        defer_kwargs: dict[str, str] = {"connector_id": cid}
        for key in ("start_date", "end_date"):
            val = args.get(key)
            if isinstance(val, str) and val.strip():
                defer_kwargs[key] = val.strip()
        new_job_id = await defer_task(run_connector_sync, **defer_kwargs)
        await db.commit()
        return await read_job_response(
            db,
            new_job_id,
            fallback_task_name="run_connector_sync",
            fallback_args=defer_kwargs,
        )

    if not document_id:
        raise HTTPException(status_code=400, detail="Job has no document_id in args")

    from app.jobs.defer import defer_task

    if task_name == "run_spreadsheet_preview":
        from app.jobs.tasks import run_spreadsheet_preview

        new_job_id = await defer_task(
            run_spreadsheet_preview,
            document_id=args.get("document_id", ""),
            file_hash=args.get("file_hash", ""),
            file_ext=args.get("file_ext", "xlsx"),
        )
    elif task_name == "run_mindmap_preview":
        from app.jobs.tasks import run_mindmap_preview

        new_job_id = await defer_task(
            run_mindmap_preview,
            document_id=args.get("document_id", ""),
            file_hash=args.get("file_hash", ""),
            file_ext=args.get("file_ext", "xmind"),
        )
    else:
        from app.jobs.tasks import run_pipeline

        cmd_template = args.get("command", "openkms-cli pipeline run")

        new_job_id = await defer_task(
            run_pipeline,
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
    from app.jobs.defer import ensure_job_app_open

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
    await require_job_args_access(request, db, row.args or {}, require_write=True)

    if row.status not in _MARK_FAILED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Only pending or running jobs can be marked failed",
        )

    try:
        await ensure_job_app_open()
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
    await require_job_args_access(request, db, row.args or {}, require_write=True)

    mapped_status = _STATUS_MAP.get(row.status, row.status)
    if mapped_status == "running":
        raise HTTPException(status_code=400, detail="Cannot delete a running job")

    await db.execute(
        text("DELETE FROM job_run_worker_logs WHERE job_run_id = :job_id"),
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
