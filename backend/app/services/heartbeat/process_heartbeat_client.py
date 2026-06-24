"""POST process heartbeats to the API from worker / scheduler."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings
from app.services.internal_service_auth import build_internal_service_request_auth
from app.services.heartbeat.process_heartbeat_registry import ProcessRole

logger = logging.getLogger(__name__)


async def report_process_heartbeat(
    role: ProcessRole,
    instance_id: str,
    *,
    message: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    base = (settings.openkms_backend_url or "").strip().rstrip("/")
    if not base:
        logger.warning("OPENKMS_BACKEND_URL unset; skipping process heartbeat")
        return

    url = f"{base}/internal-api/process-heartbeat"
    payload = {
        "role": role,
        "instance_id": instance_id,
        "message": message,
        "meta": meta or {},
    }

    try:
        headers, auth = build_internal_service_request_auth()
    except ValueError as exc:
        logger.warning("Process heartbeat auth not configured for %s/%s: %s", role, instance_id, exc)
        return

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload, headers=headers, auth=auth)
        if response.status_code >= 400:
            logger.warning(
                "Process heartbeat failed for %s/%s: HTTP %s %s",
                role,
                instance_id,
                response.status_code,
                response.text[:200],
            )
    except Exception:
        logger.exception("Process heartbeat request failed for %s/%s", role, instance_id)
