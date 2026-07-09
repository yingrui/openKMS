"""Execute ontology functions via ontology-function-service."""

from __future__ import annotations

import logging
import time
import uuid

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class FunctionExecutionError(Exception):
    def __init__(self, message: str, *, status: str = "error"):
        super().__init__(message)
        self.status = status


async def execute_in_ofs(
    *,
    source_code: str,
    input_payload: dict,
    api_name: str,
    version: int,
    caller_token: str,
) -> tuple[dict | None, str | None, int]:
    """Call ofs POST /execute. Returns (output, error_message, duration_ms)."""
    url = f"{settings.ontology_function_service_url.rstrip('/')}/execute"
    timeout = settings.ontology_function_timeout_seconds
    body = {
        "source_code": source_code,
        "input": input_payload,
        "api_name": api_name,
        "version": version,
        "backend_url": settings.openkms_backend_url.rstrip("/"),
        "caller_token": caller_token,
    }
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=timeout + 5) as client:
            resp = await client.post(url, json=body)
    except httpx.RequestError as e:
        raise FunctionExecutionError(f"ontology-function-service unavailable: {e}") from e

    duration_ms = int((time.perf_counter() - started) * 1000)

    if resp.status_code >= 400:
        detail = resp.text[:2000]
        try:
            detail = resp.json().get("detail", detail)
        except Exception:
            pass
        raise FunctionExecutionError(str(detail))

    data = resp.json()
    if data.get("status") != "ok":
        return None, data.get("error") or "Execution failed", duration_ms
    return data.get("output"), None, duration_ms


def new_execution_id() -> str:
    return f"exec-{uuid.uuid4().hex[:16]}"
