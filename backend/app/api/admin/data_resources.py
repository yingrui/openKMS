"""CRUD for named data resources (ABAC-style filters granted via access groups)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.database import get_db
from app.models.data_resource import DataResource
from app.services.data_resource_policy import ALLOWED_RESOURCE_KINDS, validate_data_resource_payload
from app.services.permission_catalog import PERM_CONSOLE_GROUPS

router = APIRouter(prefix="/admin/data-resources", tags=["admin-data-resources"])


class DataResourceOut(BaseModel):
    id: str
    name: str
    description: str | None
    resource_kind: str
    attributes: dict
    anchor_channel_id: str | None
    anchor_knowledge_base_id: str | None


class DataResourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    description: str | None = None
    resource_kind: str = Field(min_length=1, max_length=64)
    attributes: dict = Field(default_factory=dict)
    anchor_channel_id: str | None = None
    anchor_knowledge_base_id: str | None = None


class DataResourceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None
    resource_kind: str | None = Field(default=None, min_length=1, max_length=64)
    attributes: dict | None = None
    anchor_channel_id: str | None = None
    anchor_knowledge_base_id: str | None = None


def _to_out(row: DataResource) -> DataResourceOut:
    return DataResourceOut(
        id=row.id,
        name=row.name,
        description=row.description,
        resource_kind=row.resource_kind,
        attributes=dict(row.attributes or {}),
        anchor_channel_id=row.anchor_channel_id,
        anchor_knowledge_base_id=row.anchor_knowledge_base_id,
    )


@router.get("", response_model=list[DataResourceOut])
async def list_data_resources(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    r = await db.execute(select(DataResource).order_by(DataResource.name))
    return [_to_out(x) for x in r.scalars().all()]


@router.post("", response_model=DataResourceOut, status_code=201)
async def create_data_resource(
    body: DataResourceCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    validate_data_resource_payload(
        body.resource_kind.strip(),
        body.attributes,
        body.anchor_channel_id,
        body.anchor_knowledge_base_id,
    )
    row = DataResource(
        name=body.name.strip(),
        description=body.description,
        resource_kind=body.resource_kind.strip(),
        attributes=dict(body.attributes),
        anchor_channel_id=body.anchor_channel_id,
        anchor_knowledge_base_id=body.anchor_knowledge_base_id,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Data resource name already exists") from None
    await db.refresh(row)
    return _to_out(row)


@router.get("/kinds", response_model=list[str])
async def list_resource_kinds(
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    return sorted(ALLOWED_RESOURCE_KINDS)


@router.get("/{resource_id}", response_model=DataResourceOut)
async def get_data_resource(
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    row = await db.get(DataResource, resource_id)
    if not row:
        raise HTTPException(status_code=404, detail="Data resource not found")
    return _to_out(row)


@router.patch("/{resource_id}", response_model=DataResourceOut)
async def patch_data_resource(
    resource_id: str,
    body: DataResourceUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    row = await db.get(DataResource, resource_id)
    if not row:
        raise HTTPException(status_code=404, detail="Data resource not found")
    updates = body.model_dump(exclude_unset=True)
    kind = updates.get("resource_kind", row.resource_kind)
    if "resource_kind" in updates and isinstance(kind, str):
        kind = kind.strip()
    attrs = dict(updates["attributes"]) if "attributes" in updates else dict(row.attributes or {})
    ach = row.anchor_channel_id if "anchor_channel_id" not in updates else updates["anchor_channel_id"]
    akb = (
        row.anchor_knowledge_base_id
        if "anchor_knowledge_base_id" not in updates
        else updates["anchor_knowledge_base_id"]
    )
    validate_data_resource_payload(kind, attrs, ach, akb)
    if "name" in updates and updates["name"] is not None:
        row.name = str(updates["name"]).strip()
    if "description" in updates:
        row.description = updates["description"]
    if "resource_kind" in updates:
        row.resource_kind = kind
    if "attributes" in updates:
        row.attributes = attrs
    if "anchor_channel_id" in updates:
        row.anchor_channel_id = updates["anchor_channel_id"]
    if "anchor_knowledge_base_id" in updates:
        row.anchor_knowledge_base_id = updates["anchor_knowledge_base_id"]
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Data resource name already exists") from None
    await db.refresh(row)
    return _to_out(row)


@router.delete("/{resource_id}", status_code=204)
async def delete_data_resource(
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    row = await db.get(DataResource, resource_id)
    if not row:
        raise HTTPException(status_code=404, detail="Data resource not found")
    await db.delete(row)
    await db.flush()
