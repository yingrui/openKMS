"""Execute ontology functions via ontology-function-service."""

from __future__ import annotations

import logging
import time
from urllib.parse import urlparse, urlunparse

import httpx

from app.config import settings
from app.services.ontology.constants import (
    CALL_DEPTH_HEADER,
    MAX_FUNCTION_CALL_DEPTH,
    OFS_ERROR_TEXT_LIMIT,
    OFS_HTTP_BUFFER_SECONDS,
)

logger = logging.getLogger(__name__)


class FunctionExecutionError(Exception):
    """Raised when OFS is unavailable or returns HTTP error."""


def _prefer_ipv4_loopback(url: str) -> str:
    """Rewrite localhost → 127.0.0.1 so we do not hit an IPv6-only Docker bind."""
    parsed = urlparse(url.strip())
    if parsed.hostname == "localhost":
        host = "127.0.0.1"
        netloc = f"{host}:{parsed.port}" if parsed.port else host
        if parsed.username or parsed.password:
            user = parsed.username or ""
            if parsed.password:
                user = f"{user}:{parsed.password}"
            netloc = f"{user}@{netloc}"
        return urlunparse(parsed._replace(netloc=netloc))
    return url


def function_client_base_url() -> str:
    """URL injected into ofs so Client can call the openKMS API."""
    configured = (settings.ontology_function_client_base_url or "").strip()
    base = configured or settings.openkms_backend_url
    return _prefer_ipv4_loopback(base).rstrip("/")


def ontology_function_service_base_url() -> str:
    return _prefer_ipv4_loopback(settings.ontology_function_service_url).rstrip("/")


async def execute_in_ofs(
    *,
    source_code: str,
    input_payload: dict,
    api_name: str,
    version: int,
    entrypoint: str = "execute",
    caller_token: str,
    call_depth: int = 0,
    call_stack: list[str] | None = None,
) -> tuple[dict | None, str | None, int]:
    """Call ofs POST /execute. Returns (output, error_message, duration_ms)."""
    if call_depth >= MAX_FUNCTION_CALL_DEPTH:
        raise FunctionExecutionError(f"Function call depth exceeded ({MAX_FUNCTION_CALL_DEPTH})")

    url = f"{ontology_function_service_base_url()}/execute"
    timeout = settings.ontology_function_timeout_seconds
    stack = list(call_stack or [])
    body = {
        "source_code": source_code,
        "input": input_payload,
        "api_name": api_name,
        "version": version,
        "entrypoint": entrypoint,
        "backend_url": function_client_base_url(),
        "caller_token": caller_token,
        "call_depth": call_depth,
        "call_stack": stack,
    }
    headers = {CALL_DEPTH_HEADER: str(call_depth)}
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=timeout + OFS_HTTP_BUFFER_SECONDS) as client:
            resp = await client.post(url, json=body, headers=headers)
    except httpx.RequestError as e:
        raise FunctionExecutionError(f"ontology-function-service unavailable: {e}") from e

    duration_ms = int((time.perf_counter() - started) * 1000)

    if resp.status_code >= 400:
        detail = resp.text[:OFS_ERROR_TEXT_LIMIT]
        try:
            detail = resp.json().get("detail", detail)
        except (ValueError, TypeError):
            pass
        raise FunctionExecutionError(str(detail))

    data = resp.json()
    if data.get("status") != "ok":
        return None, data.get("error") or "Execution failed", duration_ms
    return data.get("output"), None, duration_ms
