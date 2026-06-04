"""Stored worker subprocess log for job runs (GET /api/jobs/{id})."""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class JobRunWorkerLog(Base):
    """One row per job run (``procrastinate_jobs.id``); ``log_text`` is PostgreSQL TEXT (unbounded)."""

    __tablename__ = "job_run_worker_logs"

    job_run_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    log_text: Mapped[str] = mapped_column(Text, nullable=False)
    truncated: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    char_limit_applied: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
