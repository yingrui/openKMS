"""Shared FastAPI route dependencies."""

from __future__ import annotations

from fastapi import HTTPException, Request


def get_jwt_sub(request: Request) -> str:
    """Return authenticated user id from JWT middleware payload."""
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sub
