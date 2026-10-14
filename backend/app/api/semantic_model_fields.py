"""Semantic-model fields API — the model's own fields (column refs + computed).

Reads require `data:read`; writes require `data:write`.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.database import get_db
from app.models.dataset import Dataset
from app.models.semantic_model import SemanticModel
from app.models.semantic_model_field import SemanticModelField
from app.schemas.semantic_model_field import (
    SemanticModelFieldCreate,
    SemanticModelFieldListResponse,
    SemanticModelFieldResponse,
    SemanticModelFieldUpdate,
)
from app.services.data_layer.columns import ColumnError, pg_columns
from app.services.data_layer.semantic_model_fields import (
    FieldError,
    column_expression,
    list_fields,
    validate_field,
)
from app.services.data_layer.semantic_models import member_ids
from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

router = APIRouter(
    prefix="/semantic-models", tags=["semantic-model-fields"], dependencies=[Depends(require_auth)]
)
_VIEW = (PERM_DATA_READ,)


async def _load_model(db: AsyncSession, model_id: str) -> SemanticModel:
    model = await db.get(SemanticModel, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Semantic model not found")
    return model


async def _load_field(db: AsyncSession, model_id: str, field_id: str) -> SemanticModelField:
    field = await db.get(SemanticModelField, field_id)
    if not field or field.semantic_model_id != model_id:
        raise HTTPException(status_code=404, detail="Field not found")
    return field


async def _dataset_columns(db: AsyncSession, model_id: str, dataset_id: str) -> set[str]:
    if dataset_id not in set(await member_ids(db, model_id)):
        raise HTTPException(status_code=400, detail="The dataset is not in this semantic model.")
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=400, detail="Dataset not found")
    try:
        return {c["column_name"] for c in await pg_columns(db, dataset)}
    except ColumnError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(
    "/{model_id}/fields",
    response_model=SemanticModelFieldListResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_model_fields(model_id: str, db: AsyncSession = Depends(get_db)):
    """List a model's fields, seeded from its datasets' columns on first read."""
    model = await _load_model(db, model_id)
    fields = await list_fields(db, model)
    return SemanticModelFieldListResponse(
        items=[SemanticModelFieldResponse.model_validate(f) for f in fields], total=len(fields)
    )


@router.post(
    "/{model_id}/fields",
    response_model=SemanticModelFieldResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def create_model_field(
    request: Request,
    model_id: str,
    body: SemanticModelFieldCreate,
    db: AsyncSession = Depends(get_db),
):
    await _load_model(db, model_id)
    columns = await _dataset_columns(db, model_id, body.dataset_id)
    expression = body.expression
    if body.column_name and expression is None:
        expression = column_expression(body.column_name)
    try:
        validate_field(
            name=body.name,
            column_name=body.column_name,
            expression=expression,
            column_names=columns,
        )
    except FieldError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    name = body.name.strip()
    exists = (
        await db.execute(
            select(SemanticModelField).where(
                SemanticModelField.semantic_model_id == model_id,
                SemanticModelField.dataset_id == body.dataset_id,
                SemanticModelField.name == name,
            )
        )
    ).scalars().first()
    if exists:
        raise HTTPException(status_code=400, detail="A field with this name already exists.")

    p = request.state.openkms_jwt_payload
    uname = p.get("preferred_username") or p.get("name")
    field = SemanticModelField(
        id=str(uuid.uuid4()),
        semantic_model_id=model_id,
        dataset_id=body.dataset_id,
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
    return SemanticModelFieldResponse.model_validate(field)


@router.put(
    "/{model_id}/fields/{field_id}",
    response_model=SemanticModelFieldResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def update_model_field(
    model_id: str,
    field_id: str,
    body: SemanticModelFieldUpdate,
    db: AsyncSession = Depends(get_db),
):
    field = await _load_field(db, model_id, field_id)
    columns = await _dataset_columns(db, model_id, field.dataset_id)
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
            column_names=columns,
        )
    except FieldError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if "name" in data:
        data["name"] = data["name"].strip()
    if new_column and "expression" not in data:
        data["expression"] = expression
    for key, value in data.items():
        setattr(field, key, value)
    await db.commit()
    await db.refresh(field)
    return SemanticModelFieldResponse.model_validate(field)


@router.delete(
    "/{model_id}/fields/{field_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def delete_model_field(model_id: str, field_id: str, db: AsyncSession = Depends(get_db)):
    field = await _load_field(db, model_id, field_id)
    await db.delete(field)
