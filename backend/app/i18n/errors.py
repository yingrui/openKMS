"""Localized API error bodies (OpenAPI `detail`).

Shape: ``{"code": "<STABLE_CODE>", "message": "<human-readable>"}``.
Clients should display ``message``; ``code`` is optional for analytics or client-side overrides.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request

from app.i18n.catalog import translate


def resolve_locale(request: Request | None) -> str:
    """Pick ``en`` or ``zh_CN`` from ``Accept-Language`` (first tag)."""
    if request is None:
        return "en"
    raw = request.headers.get("accept-language") or ""
    if not raw.strip():
        return "en"
    first = raw.split(",")[0].strip().split(";")[0].strip().lower()
    if first.startswith("zh"):
        return "zh_CN"
    return "en"


def error_detail(request: Request | None, code: str, **params: Any) -> dict[str, str]:
    loc = resolve_locale(request)
    msg = translate(code, loc, **params)
    return {"code": code, "message": msg}


def http_error(request: Request | None, status_code: int, code: str, **params: Any) -> HTTPException:
    return HTTPException(status_code=status_code, detail=error_detail(request, code, **params))


def error_detail_no_request(code: str, **params: Any) -> dict[str, str]:
    """Use when no Request is available (defaults to English)."""
    return error_detail(None, code, **params)
