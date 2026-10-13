"""Semantic model export / import (Ossie document).

Export requires `data:read`; import requires `data:write`.
"""
from __future__ import annotations

from typing import Any

import yaml
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.database import get_db
from app.services.data_layer.semantic_model import export_semantic_model, import_semantic_model
from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

router = APIRouter(
    prefix="/semantic-model",
    tags=["semantic-model"],
    dependencies=[Depends(require_auth)],
)
_VIEW = (PERM_DATA_READ,)


@router.get("", dependencies=[Depends(require_any_permission(*_VIEW))])
async def get_semantic_model(
    fmt: str = Query("json", alias="format", pattern="^(json|yaml)$"),
    db: AsyncSession = Depends(get_db),
):
    """Export the data layer as an Ossie document (`?format=json|yaml`)."""
    doc = await export_semantic_model(db)
    if fmt == "yaml":
        return Response(
            content=yaml.safe_dump(doc, sort_keys=False, allow_unicode=True),
            media_type="application/yaml",
        )
    return doc


@router.post("/import", dependencies=[Depends(require_permission(PERM_DATA_WRITE))])
async def import_semantic_model_endpoint(body: dict[str, Any], db: AsyncSession = Depends(get_db)):
    """Upsert relationships / metrics / queries from an Ossie document."""
    if not isinstance(body, dict) or not (
        isinstance(body.get("semantic_model"), dict) or "relationships" in body
    ):
        raise HTTPException(status_code=400, detail="Invalid semantic model document.")
    return await import_semantic_model(db, body)
