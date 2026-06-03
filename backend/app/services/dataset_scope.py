"""Dataset resource ACL helpers."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.services.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, RT_DATASET
from app.services.resource_acl_service import check_resource_access, scope_applies


async def dataset_allowed(
    db: AsyncSession,
    request: Request,
    dataset_id: str,
    required: int,
) -> bool:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    return await check_resource_access(db, p, sub, RT_DATASET, dataset_id, required)


async def require_dataset_read(db: AsyncSession, request: Request, dataset: Dataset) -> Dataset:
    if not await dataset_allowed(db, request, dataset.id, PERM_READ):
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


async def require_dataset_write(db: AsyncSession, request: Request, dataset: Dataset) -> Dataset:
    if not await dataset_allowed(db, request, dataset.id, PERM_WRITE):
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


async def require_dataset_manage(db: AsyncSession, request: Request, dataset: Dataset) -> Dataset:
    if not await dataset_allowed(db, request, dataset.id, PERM_MANAGE):
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset
