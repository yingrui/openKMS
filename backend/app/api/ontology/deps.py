"""Shared FastAPI helpers for ontology function and action routes."""

from __future__ import annotations

import re

from fastapi import HTTPException, Request

API_NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*$")


def jwt_user_from_request(request: Request) -> tuple[str | None, str | None]:
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    uid = payload.get("sub")
    name = payload.get("preferred_username") or payload.get("name")
    return uid, name


def require_caller_token(request: Request) -> str:
    """Return bearer token set by auth middleware (required for OFS execution)."""
    token = getattr(request.state, "openkms_auth_token", None)
    if not token:
        raise HTTPException(status_code=401, detail="Missing auth token for function execution")
    return token


def validate_api_name(api_name: str) -> None:
    if not API_NAME_RE.match(api_name):
        raise HTTPException(status_code=400, detail="api_name must be a valid identifier")
