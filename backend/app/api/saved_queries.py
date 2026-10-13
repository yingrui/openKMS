"""Saved queries API — model-level Ossie saved queries.

Reads require `data:read`; writes require `data:write`.
"""
from __future__ import annotations

import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.database import get_db
from app.models.dataset import Dataset
from app.models.saved_query import SavedQuery
from app.models.semantic_model import SemanticModel
from app.services.data_layer.semantic_models import member_ids
from app.schemas.saved_query import (
    SavedQueryCreate,
    SavedQueryListResponse,
    SavedQueryResponse,
    SavedQueryRunResponse,
    SavedQueryUpdate,
)
from app.services.data_layer.queries import QueryError, run_saved_query
from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

router = APIRouter(prefix="/queries", tags=["saved-queries"], dependencies=[Depends(require_auth)])
_VIEW = (PERM_DATA_READ,)


async def _name_map(db: AsyncSession, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    rows = (await db.execute(select(Dataset).where(Dataset.id.in_(ids)))).scalars().all()
    return {d.id: (d.display_name or f"{d.schema_name}.{d.table_name}") for d in rows}


def _response(q: SavedQuery, base_name: str | None) -> SavedQueryResponse:
    return SavedQueryResponse(
        id=q.id,
        semantic_model_id=q.semantic_model_id,
        base_dataset_id=q.base_dataset_id,
        base_dataset_name=base_name,
        name=q.name,
        description=q.description,
        metrics=q.metrics or [],
        group_by=q.group_by or [],
        joins=q.joins or [],
        filters=q.filters,
        exports=q.exports or [],
        ai_context=q.ai_context,
        created_by_name=q.created_by_name,
        created_at=q.created_at,
        updated_at=q.updated_at,
    )


async def _load(db: AsyncSession, query_id: str) -> SavedQuery:
    q = await db.get(SavedQuery, query_id)
    if not q:
        raise HTTPException(status_code=404, detail="Saved query not found")
    return q


@router.get(
    "",
    response_model=SavedQueryListResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_saved_queries(
    semantic_model_id: str | None = None,
    base_dataset_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(SavedQuery).order_by(SavedQuery.created_at.desc())
    if semantic_model_id:
        query = query.where(SavedQuery.semantic_model_id == semantic_model_id)
    if base_dataset_id:
        query = query.where(SavedQuery.base_dataset_id == base_dataset_id)
    rows = (await db.execute(query)).scalars().all()
    names = await _name_map(db, {q.base_dataset_id for q in rows})
    return SavedQueryListResponse(
        items=[_response(q, names.get(q.base_dataset_id)) for q in rows], total=len(rows)
    )


@router.post(
    "",
    response_model=SavedQueryResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def create_saved_query(
    request: Request,
    body: SavedQueryCreate,
    db: AsyncSession = Depends(get_db),
):
    base = await db.get(Dataset, body.base_dataset_id)
    if not base:
        raise HTTPException(status_code=400, detail="Base dataset not found")
    if not await db.get(SemanticModel, body.semantic_model_id):
        raise HTTPException(status_code=400, detail="Semantic model not found")
    if body.base_dataset_id not in set(await member_ids(db, body.semantic_model_id)):
        raise HTTPException(
            status_code=400, detail="The base dataset is not in this semantic model."
        )
    if not body.metrics and not body.group_by:
        raise HTTPException(status_code=400, detail="A saved query needs a metric or a field.")

    p = request.state.openkms_jwt_payload
    uname = p.get("preferred_username") or p.get("name")
    query = SavedQuery(
        id=str(uuid.uuid4()),
        semantic_model_id=body.semantic_model_id,
        base_dataset_id=body.base_dataset_id,
        name=body.name.strip(),
        description=body.description,
        metrics=[m.model_dump() for m in body.metrics],
        group_by=body.group_by,
        joins=body.joins,
        filters=[f.model_dump() for f in body.filters] if body.filters else None,
        exports=body.exports,
        ai_context=body.ai_context,
        created_by=p.get("sub") if isinstance(p.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(query)
    await db.commit()
    await db.refresh(query)
    names = await _name_map(db, {query.base_dataset_id})
    return _response(query, names.get(query.base_dataset_id))


@router.get(
    "/{query_id}",
    response_model=SavedQueryResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def get_saved_query(query_id: str, db: AsyncSession = Depends(get_db)):
    q = await _load(db, query_id)
    names = await _name_map(db, {q.base_dataset_id})
    return _response(q, names.get(q.base_dataset_id))


@router.put(
    "/{query_id}",
    response_model=SavedQueryResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def update_saved_query(
    query_id: str,
    body: SavedQueryUpdate,
    db: AsyncSession = Depends(get_db),
):
    q = await _load(db, query_id)
    data = body.model_dump(exclude_unset=True)
    if "base_dataset_id" in data and not await db.get(Dataset, data["base_dataset_id"]):
        raise HTTPException(status_code=400, detail="Base dataset not found")
    new_model_id = data.get("semantic_model_id", q.semantic_model_id)
    new_base_id = data.get("base_dataset_id", q.base_dataset_id)
    if not await db.get(SemanticModel, new_model_id):
        raise HTTPException(status_code=400, detail="Semantic model not found")
    if new_base_id not in set(await member_ids(db, new_model_id)):
        raise HTTPException(
            status_code=400, detail="The base dataset is not in this semantic model."
        )
    if "name" in data:
        data["name"] = data["name"].strip()
    if "filters" in data:
        data["filters"] = data["filters"] or None
    for field in (
        "name",
        "semantic_model_id",
        "base_dataset_id",
        "description",
        "metrics",
        "group_by",
        "joins",
        "filters",
        "exports",
        "ai_context",
    ):
        if field in data:
            setattr(q, field, data[field])
    await db.commit()
    await db.refresh(q)
    names = await _name_map(db, {q.base_dataset_id})
    return _response(q, names.get(q.base_dataset_id))


@router.delete(
    "/{query_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def delete_saved_query(query_id: str, db: AsyncSession = Depends(get_db)):
    q = await _load(db, query_id)
    await db.delete(q)


@router.get(
    "/{query_id}/run",
    response_model=SavedQueryRunResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def run_saved_query_endpoint(query_id: str, db: AsyncSession = Depends(get_db)):
    """Run a saved query read-only (statement timeout + row cap)."""
    q = await _load(db, query_id)
    start = time.perf_counter()
    try:
        columns, rows = await run_saved_query(db, q)
    except QueryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    duration = int((time.perf_counter() - start) * 1000)
    return SavedQueryRunResponse(query_id=q.id, columns=columns, rows=rows, duration_ms=duration)
