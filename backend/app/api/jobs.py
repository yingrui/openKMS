"""Jobs API – list, create, retry document processing jobs."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.api_model import ApiModel
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.models.pipeline import Pipeline
from app.schemas.job import JobCreate, JobEvent, JobListResponse, JobResponse

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


async def _procrastinate_table_exists(db: AsyncSession) -> bool:
    result = await db.execute(
        text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'procrastinate_jobs')")
    )
    return result.scalar()


@router.get("", response_model=JobListResponse)
async def list_jobs(
    document_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List jobs from procrastinate_jobs table."""
    if not await _procrastinate_table_exists(db):
        return JobListResponse(items=[], total=0)

    where = ""
    params: dict = {"limit": limit, "offset": offset}

    if document_id:
        where = "WHERE args->>'document_id' = :document_id"
        params["document_id"] = document_id

    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM procrastinate_jobs {where}"), params
    )
    total = count_result.scalar_one()

    result = await db.execute(
        text(
            f"SELECT id, queue_name, task_name, status, args, scheduled_at, attempts "
            f"FROM procrastinate_jobs {where} "
            f"ORDER BY id DESC LIMIT :limit OFFSET :offset"
        ),
        params,
    )
    items = [_row_to_response(r) for r in result]
    return JobListResponse(items=items, total=total)


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
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

    return resp


@router.post("", response_model=JobResponse, status_code=201)
async def create_job(body: JobCreate, db: AsyncSession = Depends(get_db)):
    """Create a processing job for a document."""
    doc = await db.get(Document, body.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

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

    file_ext = doc.name.rsplit(".", 1)[-1].lower() if "." in doc.name else "pdf"

    from app.jobs.tasks import run_pipeline, render_command

    model_base_url: str | None = None
    model_name_val: str | None = None
    if pipeline.model_id:
        linked_model = await db.get(ApiModel, pipeline.model_id)
        if linked_model:
            model_base_url = linked_model.base_url
            model_name_val = linked_model.model_name

    rendered_command = render_command(
        pipeline.command, doc.id, doc.file_hash or "", file_ext,
        model_base_url=model_base_url, model_name=model_name_val,
    )

    job_id = await run_pipeline.defer_async(
        document_id=doc.id,
        pipeline_id=pipeline.id,
        file_hash=doc.file_hash or "",
        file_ext=file_ext,
        command=pipeline.command,
        default_args=pipeline.default_args,
        rendered_command=rendered_command,
        model_id=pipeline.model_id,
    )

    from sqlalchemy import update
    await db.execute(
        update(Document).where(Document.id == doc.id).values(status="pending")
    )
    await db.commit()

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
            id=job_id, queue_name="default", task_name="run_pipeline",
            status="pending", args={}, attempts=0,
        )
    return _row_to_response(row)


@router.post("/{job_id}/retry", response_model=JobResponse)
async def retry_job(job_id: int, db: AsyncSession = Depends(get_db)):
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

    if _STATUS_MAP.get(row.status, row.status) != "failed":
        raise HTTPException(status_code=400, detail="Only failed jobs can be retried")

    args = row.args or {}
    document_id = args.get("document_id")
    if not document_id:
        raise HTTPException(status_code=400, detail="Job has no document_id in args")

    from app.jobs.tasks import run_pipeline, render_command

    cmd_template = args.get("command", "openkms-cli pipeline run")
    retry_model_id = args.get("model_id")

    retry_model_base_url: str | None = None
    retry_model_name: str | None = None
    if retry_model_id:
        retry_model = await db.get(ApiModel, retry_model_id)
        if retry_model:
            retry_model_base_url = retry_model.base_url
            retry_model_name = retry_model.model_name

    rendered = render_command(
        cmd_template,
        args.get("document_id", ""),
        args.get("file_hash", ""),
        args.get("file_ext", "pdf"),
        model_base_url=retry_model_base_url,
        model_name=retry_model_name,
    )

    new_job_id = await run_pipeline.defer_async(
        document_id=args.get("document_id", ""),
        pipeline_id=args.get("pipeline_id", ""),
        file_hash=args.get("file_hash", ""),
        file_ext=args.get("file_ext", "pdf"),
        command=cmd_template,
        default_args=args.get("default_args"),
        rendered_command=rendered,
        model_id=retry_model_id,
    )

    from sqlalchemy import update
    from app.models.document import Document
    await db.execute(
        update(Document).where(Document.id == document_id).values(status="pending")
    )
    await db.commit()

    new_result = await db.execute(
        text(
            "SELECT id, queue_name, task_name, status, args, scheduled_at, attempts "
            "FROM procrastinate_jobs WHERE id = :job_id"
        ),
        {"job_id": new_job_id},
    )
    new_row = new_result.first()
    if not new_row:
        return JobResponse(
            id=new_job_id, queue_name="default", task_name="run_pipeline",
            status="pending", args=args, attempts=0,
        )
    return _row_to_response(new_row)


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a job. Running jobs cannot be deleted."""
    result = await db.execute(
        text(
            "SELECT id, status FROM procrastinate_jobs WHERE id = :job_id"
        ),
        {"job_id": job_id},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    mapped_status = _STATUS_MAP.get(row.status, row.status)
    if mapped_status == "running":
        raise HTTPException(status_code=400, detail="Cannot delete a running job")

    await db.execute(
        text("DELETE FROM procrastinate_events WHERE job_id = :job_id"),
        {"job_id": job_id},
    )
    await db.execute(
        text("DELETE FROM procrastinate_jobs WHERE id = :job_id"),
        {"job_id": job_id},
    )
    await db.commit()
