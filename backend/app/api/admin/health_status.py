"""Console health status — dependency checks for operators."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import ensure_permission, require_auth, require_permission
from app.config import settings
from app.database import get_db
from app.models.data_source import DataSource
from app.schemas.health_status import (
    DataSourceHealthItem,
    HealthComponent,
    HealthStatusResponse,
    HealthStatusKind,
)
from app.services.data_source_connection import test_data_source_connection
from app.services.permission_catalog import PERM_CONSOLE_ACCESS, PERM_CONSOLE_DATA_SOURCES

router = APIRouter(
    prefix="/admin",
    tags=["admin-health"],
    dependencies=[Depends(require_auth)],
)


def _overall(*statuses: HealthStatusKind) -> HealthStatusKind:
    if any(s == "error" for s in statuses):
        return "error"
    if any(s == "degraded" for s in statuses):
        return "degraded"
    return "ok"


async def _check_database(db: AsyncSession) -> tuple[HealthStatusKind, str | None, int]:
    start = time.perf_counter()
    try:
        await db.execute(text("SELECT 1"))
        ms = int((time.perf_counter() - start) * 1000)
        return "ok", None, ms
    except Exception as e:
        ms = int((time.perf_counter() - start) * 1000)
        return "error", str(e), ms


async def _check_storage() -> tuple[HealthStatusKind, str | None, int | None]:
    if not settings.storage_enabled:
        return "skipped", "Object storage is not configured", None
    start = time.perf_counter()

    def _head_bucket() -> None:
        from botocore.exceptions import ClientError

        from app.services.storage import _bucket, _client

        client = _client()
        try:
            client.head_bucket(Bucket=_bucket())
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in ("404", "NoSuchBucket"):
                raise RuntimeError(f"Bucket {_bucket()} does not exist") from e
            raise

    try:
        await asyncio.to_thread(_head_bucket)
        ms = int((time.perf_counter() - start) * 1000)
        return "ok", None, ms
    except Exception as e:
        ms = int((time.perf_counter() - start) * 1000)
        return "error", str(e), ms


async def _check_job_queue(db: AsyncSession) -> tuple[HealthStatusKind, str | None, int | None]:
    start = time.perf_counter()
    try:
        result = await db.execute(
            text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'procrastinate_jobs')"
            )
        )
        exists = bool(result.scalar())
        if not exists:
            return "error", "Job queue tables are not initialized", int((time.perf_counter() - start) * 1000)
        ms = int((time.perf_counter() - start) * 1000)
        return "ok", None, ms
    except Exception as e:
        ms = int((time.perf_counter() - start) * 1000)
        return "error", str(e), ms


@router.get(
    "/health-status",
    response_model=HealthStatusResponse,
    dependencies=[Depends(require_permission(PERM_CONSOLE_ACCESS))],
)
async def get_health_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Check API, database, storage, job queue, and optionally registered data sources."""
    components: list[HealthComponent] = [
        HealthComponent(id="api", label="API", status="ok", message="Responding"),
    ]

    db_status, db_msg, db_ms = await _check_database(db)
    components.append(
        HealthComponent(id="database", label="Database", status=db_status, message=db_msg, latency_ms=db_ms)
    )

    storage_status, storage_msg, storage_ms = await _check_storage()
    components.append(
        HealthComponent(
            id="storage",
            label="Object storage",
            status=storage_status,
            message=storage_msg,
            latency_ms=storage_ms,
        )
    )

    queue_status, queue_msg, queue_ms = await _check_job_queue(db)
    components.append(
        HealthComponent(
            id="job_queue",
            label="Background jobs",
            status=queue_status,
            message=queue_msg,
            latency_ms=queue_ms,
        )
    )

    data_sources: list[DataSourceHealthItem] = []
    include_data_sources = False
    try:
        await ensure_permission(request, db, PERM_CONSOLE_DATA_SOURCES)
        include_data_sources = True
    except HTTPException as exc:
        if exc.status_code != 403:
            raise

    if include_data_sources:
        result = await db.execute(select(DataSource).order_by(DataSource.name))
        for ds in result.scalars().all():
            start = time.perf_counter()
            ok, message = await asyncio.to_thread(test_data_source_connection, ds)
            ms = int((time.perf_counter() - start) * 1000)
            data_sources.append(
                DataSourceHealthItem(
                    id=ds.id,
                    name=ds.name,
                    kind=ds.kind,
                    host=ds.host,
                    port=ds.port,
                    status="ok" if ok else "error",
                    message=message if not ok else None,
                    latency_ms=ms,
                )
            )

    component_statuses = [c.status for c in components]
    ds_statuses = [d.status for d in data_sources]
    overall = _overall(*component_statuses, *ds_statuses)

    return HealthStatusResponse(
        checked_at=datetime.now(timezone.utc),
        overall=overall,
        components=components,
        data_sources=data_sources,
    )
