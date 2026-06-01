"""Legacy data resources — read-only migration report; mutations deprecated."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.database import get_db
from app.models.data_resource import DataResource
from app.services.permission_catalog import PERM_CONSOLE_GROUPS

router = APIRouter(prefix="/admin/data-resources", tags=["admin-data-resources"])

_DEPRECATED_MSG = (
    "Data resources are deprecated. Use per-resource sharing (resource ACL) on each channel, "
    "wiki space, or other item instead."
)


class DataResourceOut(BaseModel):
    id: str
    name: str
    description: str | None
    resource_kind: str
    attributes: dict
    anchor_channel_id: str | None
    anchor_knowledge_base_id: str | None


class DataResourceMigrationReportOut(BaseModel):
    deprecated: bool = True
    message: str
    row_count: int
    rows: list[DataResourceOut]


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


@router.get("/migration-report", response_model=DataResourceMigrationReportOut)
async def data_resources_migration_report(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    """Read-only list of leftover legacy data resource rows (no longer enforced)."""
    r = await db.execute(select(DataResource).order_by(DataResource.name))
    rows = [_to_out(x) for x in r.scalars().all()]
    return DataResourceMigrationReportOut(
        message=_DEPRECATED_MSG,
        row_count=len(rows),
        rows=rows,
    )


@router.get("", response_model=list[DataResourceOut])
async def list_data_resources(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    """Deprecated: use GET /migration-report. Kept for backward-compatible reads."""
    r = await db.execute(select(DataResource).order_by(DataResource.name))
    return [_to_out(x) for x in r.scalars().all()]


@router.get("/kinds", response_model=list[str])
async def list_resource_kinds(
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    raise HTTPException(status_code=410, detail=_DEPRECATED_MSG)


@router.post("", status_code=410)
async def create_data_resource(
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    raise HTTPException(status_code=410, detail=_DEPRECATED_MSG)


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


@router.patch("/{resource_id}", status_code=410)
async def patch_data_resource(
    resource_id: str,
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    raise HTTPException(status_code=410, detail=_DEPRECATED_MSG)


@router.delete("/{resource_id}", status_code=410)
async def delete_data_resource(
    resource_id: str,
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    raise HTTPException(status_code=410, detail=_DEPRECATED_MSG)
