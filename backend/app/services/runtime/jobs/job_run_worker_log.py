"""Build truncated worker logs and upsert ``job_run_worker_logs`` rows."""

from __future__ import annotations

import logging

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.job_run_worker_log import JobRunWorkerLog

logger = logging.getLogger(__name__)


def build_job_run_worker_log_text(
    command: str | None,
    stdout: str,
    stderr: str,
    max_chars: int,
) -> tuple[str, bool]:
    """Merge command + stderr + stdout; truncate to ``max_chars`` with a middle marker if needed."""
    cmd = (command or "").strip()
    out = stdout or ""
    err = stderr or ""
    blocks: list[str] = []
    if cmd:
        blocks.append("--- command ---\n" + cmd)
    blocks.append("--- stderr ---\n" + (err if err.strip() else "(empty)"))
    blocks.append("--- stdout ---\n" + (out if out.strip() else "(empty)"))
    full = "\n\n".join(blocks)
    if len(full) <= max_chars:
        return full, False
    marker = (
        f"\n\n... [truncated: total {len(full)} chars → limit {max_chars}; "
        "middle omitted] ...\n\n"
    )
    inner = max_chars - len(marker)
    if inner < 200:
        return full[: max_chars - 40] + "\n...[truncated]\n", True
    head = inner // 2
    tail = inner - head
    return full[:head] + marker + full[-tail:], True


async def upsert_job_run_worker_log(
    session: AsyncSession,
    job_run_id: int,
    log_text: str,
    truncated: bool,
    char_limit_applied: int,
) -> None:
    """Insert or replace log row for this job run id."""
    stmt = pg_insert(JobRunWorkerLog).values(
        job_run_id=job_run_id,
        log_text=log_text,
        truncated=truncated,
        char_limit_applied=char_limit_applied,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[JobRunWorkerLog.job_run_id],
        set_={
            "log_text": stmt.excluded.log_text,
            "truncated": stmt.excluded.truncated,
            "char_limit_applied": stmt.excluded.char_limit_applied,
        },
    )
    await session.execute(stmt)


async def persist_job_run_worker_log_best_effort(
    job_run_id: int,
    command: str | None,
    stdout: str,
    stderr: str,
) -> None:
    """Build truncated text and upsert; swallow errors so task outcome is unchanged."""
    try:
        limit = settings.job_log_max_chars
        text, truncated = build_job_run_worker_log_text(command, stdout, stderr, limit)
        from app.database import async_session_maker

        async with async_session_maker() as session:
            await upsert_job_run_worker_log(session, job_run_id, text, truncated, limit)
            await session.commit()
    except Exception:
        logger.exception("Failed to persist job_run_worker_logs for job_run_id=%s", job_run_id)
