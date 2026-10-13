"""Dataset joins API — registered equi-joins between datasets (the ER model).

Reads: `console:datasets` or `ontology:read`. Writes: `console:datasets`.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
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
from app.services.permissions.permission_catalog import PERM_CONSOLE_DATASETS, PERM_DATA_READ, PERM_DATA_WRITE, PERM_ONTOLOGY_READ

router = APIRouter(
    prefix="/dataset-joins",
    tags=["dataset-joins"],
    dependencies=[Depends(require_auth)],
)

_VIEW = (PERM_CONSOLE_DATASETS, PERM_DATA_READ, PERM_ONTOLOGY_READ)


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
        source_dataset_id=j.source_dataset_id,
        source_dataset_name=names.get(j.source_dataset_id),
        target_dataset_id=j.target_dataset_id,
        target_dataset_name=names.get(j.target_dataset_id),
        cardinality=j.cardinality,
        join_columns=j.join_columns or [],
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
    """List joins, optionally only those touching a dataset (either side)."""
    query = select(DatasetJoin).order_by(DatasetJoin.created_at.desc())
    if dataset_id:
        query = query.where(
            (DatasetJoin.source_dataset_id == dataset_id)
            | (DatasetJoin.target_dataset_id == dataset_id)
        )
    result = await db.execute(query)
    joins = list(result.scalars().all())
    names = await _name_map(
        db, {j.source_dataset_id for j in joins} | {j.target_dataset_id for j in joins}
    )
    return DatasetJoinListResponse(
        items=[_join_response(j, names) for j in joins],
        total=len(joins),
    )


@router.post(
    "",
    response_model=DatasetJoinResponse,
    status_code=201,
    dependencies=[Depends(require_any_permission(PERM_CONSOLE_DATASETS, PERM_DATA_WRITE))],
)
async def create_dataset_join(
    request: Request,
    body: DatasetJoinCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a join (validated against both datasets' live columns)."""
    pairs = [{"source": c.source, "target": c.target} for c in body.join_columns]
    try:
        await validate_join(
            db,
            source_dataset_id=body.source_dataset_id,
            target_dataset_id=body.target_dataset_id,
            cardinality=body.cardinality,
            join_columns=pairs,
        )
    except JoinValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payload = request.state.openkms_jwt_payload
    uname = payload.get("preferred_username") or payload.get("name")
    join = DatasetJoin(
        id=str(uuid.uuid4()),
        name=body.name,
        source_dataset_id=body.source_dataset_id,
        target_dataset_id=body.target_dataset_id,
        cardinality=body.cardinality,
        join_columns=pairs,
        description=body.description,
        created_by=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(join)
    await db.commit()
    await db.refresh(join)
    names = await _name_map(db, {join.source_dataset_id, join.target_dataset_id})
    return _join_response(join, names)


@router.get(
    "/{join_id}",
    response_model=DatasetJoinResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def get_dataset_join(join_id: str, db: AsyncSession = Depends(get_db)):
    j = await db.get(DatasetJoin, join_id)
    if not j:
        raise HTTPException(status_code=404, detail="Join not found")
    names = await _name_map(db, {j.source_dataset_id, j.target_dataset_id})
    return _join_response(j, names)


@router.put(
    "/{join_id}",
    response_model=DatasetJoinResponse,
    dependencies=[Depends(require_any_permission(PERM_CONSOLE_DATASETS, PERM_DATA_WRITE))],
)
async def update_dataset_join(
    join_id: str,
    body: DatasetJoinUpdate,
    db: AsyncSession = Depends(get_db),
):
    j = await db.get(DatasetJoin, join_id)
    if not j:
        raise HTTPException(status_code=404, detail="Join not found")

    data = body.model_dump(exclude_unset=True)
    new_cardinality = data.get("cardinality", j.cardinality)
    if "join_columns" in data:
        pairs = [{"source": p["source"], "target": p["target"]} for p in data["join_columns"]]
    else:
        pairs = j.join_columns or []
    try:
        await validate_join(
            db,
            source_dataset_id=j.source_dataset_id,
            target_dataset_id=j.target_dataset_id,
            cardinality=new_cardinality,
            join_columns=pairs,
        )
    except JoinValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if "name" in data:
        j.name = data["name"]
    if "cardinality" in data:
        j.cardinality = data["cardinality"]
    if "join_columns" in data:
        j.join_columns = pairs
    if "description" in data:
        j.description = data["description"]
    await db.commit()
    await db.refresh(j)
    names = await _name_map(db, {j.source_dataset_id, j.target_dataset_id})
    return _join_response(j, names)


@router.delete(
    "/{join_id}",
    status_code=204,
    dependencies=[Depends(require_any_permission(PERM_CONSOLE_DATASETS, PERM_DATA_WRITE))],
)
async def delete_dataset_join(join_id: str, db: AsyncSession = Depends(get_db)):
    j = await db.get(DatasetJoin, join_id)
    if not j:
        raise HTTPException(status_code=404, detail="Join not found")
    await db.delete(j)
