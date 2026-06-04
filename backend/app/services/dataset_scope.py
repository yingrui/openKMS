"""Dataset resource ACL — thin aliases over ``resource_guard``."""

from __future__ import annotations

from app.models.dataset import Dataset
from app.services.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, RT_DATASET
from app.services.resource_guard import (
    load_scoped_resource,
    require_manage,
    require_read,
    require_write,
    resource_allowed,
)

__all__ = [
    "dataset_allowed",
    "load_dataset_scoped",
    "require_dataset_manage",
    "require_dataset_read",
    "require_dataset_write",
]


async def dataset_allowed(db, request, dataset_id: str, required: int) -> bool:
    return await resource_allowed(db, request, RT_DATASET, dataset_id, required)


async def require_dataset_read(db, request, dataset: Dataset) -> Dataset:
    return await require_read(db, request, RT_DATASET, dataset)


async def require_dataset_write(db, request, dataset: Dataset) -> Dataset:
    return await require_write(db, request, RT_DATASET, dataset)


async def require_dataset_manage(db, request, dataset: Dataset) -> Dataset:
    return await require_manage(db, request, RT_DATASET, dataset)


async def load_dataset_scoped(db, request, dataset_id: str, required: int = PERM_READ) -> Dataset:
    return await load_scoped_resource(db, request, RT_DATASET, dataset_id, required)
