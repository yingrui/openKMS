"""Dataset fields API — the Ossie semantic field layer.

Reads require `data:read`; writes require `data:write`.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.api.datasets import get_dataset_scoped, get_dataset_scoped_write
from app.database import get_db
from app.models.dataset import Dataset
from app.models.dataset_field import DatasetField
from app.schemas.dataset_field import (
    DatasetFieldCreate,
    DatasetFieldListResponse,
    DatasetFieldResponse,
    DatasetFieldUpdate,
)
from app.services.data_layer.fields import (
    FieldValidationError,
    column_expression,
    list_fields,
    pg_columns,
    seed_fields,
    validate_field,
)
from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

router = APIRouter(
    prefix="/datasets",
    tags=["dataset-fields"],
    dependencies=[Depends(require_auth)],
)

_VIEW = (PERM_DATA_READ,)


def _response(field: DatasetField) -> DatasetFieldResponse:
    return DatasetFieldResponse.model_validate(field)


async def _column_names(db: AsyncSession, dataset: Dataset) -> set[str]:
    return {c["column_name"] for c in await pg_columns(db, dataset)}


async def _load_field(db: AsyncSession, dataset_id: str, field_id: str) -> DatasetField:
    field = await db.get(DatasetField, field_id)
    if not field or field.dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Field not found")
    return field


@router.get(
    "/{dataset_id}/fields",
    response_model=DatasetFieldListResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_dataset_fields(
    dataset: Dataset = Depends(get_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    """List a dataset's fields, seeding them from physical columns on first read."""
    fields = await list_fields(db, dataset)
    return DatasetFieldListResponse(items=[_response(f) for f in fields], total=len(fields))


@router.post(
    "/{dataset_id}/fields/sync",
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def sync_dataset_fields(
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    """Mirror physical columns into fields (adds missing ones, refreshes types)."""
    added = await seed_fields(db, dataset)
    return {"added": added}


@router.post(
    "/{dataset_id}/fields",
    response_model=DatasetFieldResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def create_dataset_field(
    request: Request,
    body: DatasetFieldCreate,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    """Create a field (a column reference or a computed expression)."""
    expression = body.expression
    if body.column_name and expression is None:
        expression = column_expression(body.column_name)
    try:
        validate_field(
            name=body.name,
            column_name=body.column_name,
            expression=expression,
            column_names=await _column_names(db, dataset),
        )
    except FieldValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    name = body.name.strip()
    existing = (
        await db.execute(
            select(DatasetField).where(
                DatasetField.dataset_id == dataset.id, DatasetField.name == name
            )
        )
    ).scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail="A field with this name already exists.")

    p = request.state.openkms_jwt_payload
    uname = p.get("preferred_username") or p.get("name")
    field = DatasetField(
        id=str(uuid.uuid4()),
        dataset_id=dataset.id,
        name=name,
        column_name=body.column_name,
        expression=expression,
        datatype=body.datatype,
        dimension=body.dimension,
        ai_context=body.ai_context,
        ordinal=body.ordinal or 0,
        created_by=p.get("sub") if isinstance(p.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(field)
    await db.commit()
    await db.refresh(field)
    return _response(field)


@router.put(
    "/{dataset_id}/fields/{field_id}",
    response_model=DatasetFieldResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def update_dataset_field(
    dataset_id: str,
    field_id: str,
    body: DatasetFieldUpdate,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    field = await _load_field(db, dataset_id, field_id)
    data = body.model_dump(exclude_unset=True)

    new_column = data.get("column_name", field.column_name)
    expression = data.get("expression", field.expression)
    if "column_name" in data and new_column and "expression" not in data:
        expression = column_expression(new_column)
    try:
        validate_field(
            name=data.get("name", field.name),
            column_name=new_column,
            expression=expression,
            column_names=await _column_names(db, dataset),
        )
    except FieldValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if "name" in data:
        data["name"] = data["name"].strip()
    if new_column and "expression" not in data:
        data["expression"] = expression
    for key, value in data.items():
        setattr(field, key, value)
    await db.commit()
    await db.refresh(field)
    return _response(field)


@router.delete(
    "/{dataset_id}/fields/{field_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def delete_dataset_field(
    dataset_id: str,
    field_id: str,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    field = await _load_field(db, dataset_id, field_id)
    await db.delete(field)
