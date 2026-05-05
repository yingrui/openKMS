"""Unified global search API (metadata: documents, articles, wiki spaces, knowledge bases)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.config import settings
from app.database import get_db
from app.schemas.global_search import GlobalSearchResponse
from app.services.global_search import allowed_types_from_permissions, parse_types_param, run_global_search
from app.services.permission_resolution import resolve_oidc_permission_keys, resolve_user_permission_keys

router = APIRouter(prefix="/search", tags=["search"], dependencies=[Depends(require_auth)])


def _parse_optional_dt(raw: str | None, label: str) -> datetime | None:
    if raw is None or not raw.strip():
        return None
    s = raw.strip()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Invalid {label}: use ISO 8601 datetime") from e


async def _resolve_perms(request: Request, db: AsyncSession) -> frozenset[str]:
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    if settings.auth_mode == "local":
        if not isinstance(sub, str):
            return frozenset()
        return frozenset(await resolve_user_permission_keys(db, sub))
    return frozenset(await resolve_oidc_permission_keys(db, payload))


def _forbidden_if_no_overlap(requested: set[str], allowed: set[str]) -> None:
    if not requested:
        return
    if not (requested & allowed):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to search the requested resource types.",
        )


@router.get("", response_model=GlobalSearchResponse)
async def global_search(
    request: Request,
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(None, description="Substring match on name/title (case-insensitive)"),
    types: str | None = Query("all", description="all | documents | articles | wiki_spaces | knowledge_bases (comma-separated)"),
    document_channel_id: str | None = None,
    article_channel_id: str | None = None,
    updated_after: str | None = None,
    updated_before: str | None = None,
    limit: int = Query(30, ge=1, le=100),
):
    perms = await _resolve_perms(request, db)
    requested = parse_types_param(types)
    allowed = allowed_types_from_permissions(perms)
    _forbidden_if_no_overlap(requested, allowed)

    sub = request.state.openkms_jwt_payload.get("sub")
    sub_str = sub if isinstance(sub, str) else None

    ua = _parse_optional_dt(updated_after, "updated_after")
    ub = _parse_optional_dt(updated_before, "updated_before")

    out, err = await run_global_search(
        db,
        jwt_payload=request.state.openkms_jwt_payload,
        sub=sub_str,
        perms=perms,
        types_param=types,
        q=q,
        document_channel_id=document_channel_id,
        article_channel_id=article_channel_id,
        updated_after=ua,
        updated_before=ub,
        limit=limit,
    )
    if err == "forbidden":
        raise HTTPException(status_code=403, detail="You do not have permission to search the requested resource types.")
    if err == "document_channel_not_found":
        raise HTTPException(status_code=404, detail="Document channel not found")
    if err == "article_channel_not_found":
        raise HTTPException(status_code=404, detail="Article channel not found")
    assert out is not None
    return out


@router.head("")
async def global_search_head(
    request: Request,
    db: AsyncSession = Depends(get_db),
    types: str | None = Query("all"),
):
    """Validate auth and search permissions without returning a body."""
    perms = await _resolve_perms(request, db)
    requested = parse_types_param(types)
    allowed = allowed_types_from_permissions(perms)
    _forbidden_if_no_overlap(requested, allowed)
    return Response(status_code=200)
