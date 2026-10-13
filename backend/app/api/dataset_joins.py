"""Dataset relationships API — Ossie foreign keys between datasets (many → one).

Reads: `data:read`. Writes: `data:write`. (Table keeps the historical name `dataset_joins`.)
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.database import get_db
from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.schemas.dataset_join import (
    DatasetJoinCreate,
    DatasetJoinListResponse,
    DatasetJoinResponse,
    DatasetJoinUpdate,
)
from app.services.data_layer.joins import JoinValidationError, validate_join
from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

router = APIRouter(
    prefix="/dataset-joins",
    tags=["dataset-joins"],
    dependencies=[Depends(require_auth)],
)

_VIEW = (PERM_DATA_READ,)


async def _name_map(db: AsyncSession, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    result = await db.execute(select(Dataset).where(Dataset.id.in_(ids)))
    names: dict[str, str] = {}
    for d in result.scalars().all():
        names[d.id] = d.display_name or f"{d.schema_name}.{d.table_name}"
    return names


def _join_response(j: DatasetJoin, names: dict[str, str]) -> DatasetJoinResponse:
    return DatasetJoinResponse(
        id=j.id,
        name=j.name,
        from_dataset_id=j.from_dataset_id,
        from_dataset_name=names.get(j.from_dataset_id),
        to_dataset_id=j.to_dataset_id,
        to_dataset_name=names.get(j.to_dataset_id),
        from_columns=j.from_columns or [],
        to_columns=j.to_columns or [],
        join_type=j.join_type,
        ai_context=j.ai_context,
        description=j.description,
        created_by_name=j.created_by_name,
        created_at=j.created_at,
        updated_at=j.updated_at,
    )


@router.get(
    "",
    response_model=DatasetJoinListResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_dataset_joins(
    dataset_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List relationships, optionally only those touching a dataset (either side)."""
    query = select(DatasetJoin).order_by(DatasetJoin.created_at.desc())
    if dataset_id:
        query = query.where(
            or_(
                DatasetJoin.from_dataset_id == dataset_id,
                DatasetJoin.to_dataset_id == dataset_id,
            )
        )
    result = await db.execute(query)
    joins = list(result.scalars().all())
    names = await _name_map(
        db, {j.from_dataset_id for j in joins} | {j.to_dataset_id for j in joins}
    )
    return DatasetJoinListResponse(
        items=[_join_response(j, names) for j in joins],
        total=len(joins),
    )


@router.post(
    "",
    response_model=DatasetJoinResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def create_dataset_join(
    request: Request,
    body: DatasetJoinCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a relationship (validated against both datasets' live columns)."""
    try:
        await validate_join(
            db,
            from_dataset_id=body.from_dataset_id,
            to_dataset_id=body.to_dataset_id,
            from_columns=body.from_columns,
            to_columns=body.to_columns,
            join_type=body.join_type,
        )
    except JoinValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payload = request.state.openkms_jwt_payload
    uname = payload.get("preferred_username") or payload.get("name")
    join = DatasetJoin(
        id=str(uuid.uuid4()),
        name=body.name,
        from_dataset_id=body.from_dataset_id,
        to_dataset_id=body.to_dataset_id,
        from_columns=body.from_columns,
        to_columns=body.to_columns,
        join_type=body.join_type,
        ai_context=body.ai_context,
        description=body.description,
        created_by=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(join)
    await db.commit()
    await db.refresh(join)
    names = await _name_map(db, {join.from_dataset_id, join.to_dataset_id})
    return _join_response(join, names)


@router.get(
    "/{join_id}",
    response_model=DatasetJoinResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def get_dataset_join(join_id: str, db: AsyncSession = Depends(get_db)):
    j = await db.get(DatasetJoin, join_id)
    if not j:
        raise HTTPException(status_code=404, detail="Relationship not found")
    names = await _name_map(db, {j.from_dataset_id, j.to_dataset_id})
    return _join_response(j, names)


@router.put(
    "/{join_id}",
    response_model=DatasetJoinResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def update_dataset_join(
    join_id: str,
    body: DatasetJoinUpdate,
    db: AsyncSession = Depends(get_db),
):
    j = await db.get(DatasetJoin, join_id)
    if not j:
        raise HTTPException(status_code=404, detail="Relationship not found")

    data = body.model_dump(exclude_unset=True)
    new_from_cols = data.get("from_columns", j.from_columns or [])
    new_to_cols = data.get("to_columns", j.to_columns or [])
    new_join_type = data.get("join_type", j.join_type)
    try:
        await validate_join(
            db,
            from_dataset_id=j.from_dataset_id,
            to_dataset_id=j.to_dataset_id,
            from_columns=new_from_cols,
            to_columns=new_to_cols,
            join_type=new_join_type,
        )
    except JoinValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    for field in ("name", "from_columns", "to_columns", "join_type", "ai_context", "description"):
        if field in data:
            setattr(j, field, data[field])
    await db.commit()
    await db.refresh(j)
    names = await _name_map(db, {j.from_dataset_id, j.to_dataset_id})
    return _join_response(j, names)


@router.delete(
    "/{join_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def delete_dataset_join(join_id: str, db: AsyncSession = Depends(get_db)):
    j = await db.get(DatasetJoin, join_id)
    if not j:
        raise HTTPException(status_code=404, detail="Relationship not found")
    await db.delete(j)
