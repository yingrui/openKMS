"""Console object storage browser — list and move (metadata only; no download)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.auth import require_auth, require_permission
from app.config import settings
from app.services.permission_catalog import PERM_CONSOLE_STORAGE
from app.services.storage import (
    create_folder_placeholder,
    list_storage_page,
    move_object_key,
    move_prefix,
    validate_storage_key,
    validate_storage_prefix,
)

router = APIRouter(
    prefix="/console/storage",
    tags=["console-storage"],
    dependencies=[Depends(require_auth)],
)


class StorageBucketInfo(BaseModel):
    bucket: str
    storage_enabled: bool


class StorageFolderItem(BaseModel):
    prefix: str


class StorageObjectItem(BaseModel):
    key: str
    size: int
    last_modified: str | None = None


class StorageListResponse(BaseModel):
    prefix: str
    folders: list[StorageFolderItem]
    objects: list[StorageObjectItem]
    next_continuation_token: str | None = None
    truncated: bool = False


class StorageMoveItem(BaseModel):
    type: Literal["prefix", "object"]
    key: str = Field(min_length=1, max_length=2048)


class StorageMoveRequest(BaseModel):
    items: list[StorageMoveItem] = Field(min_length=1, max_length=200)
    destination_prefix: str = Field(min_length=1, max_length=2048)
    delete_source: bool = True


class StorageMoveResponse(BaseModel):
    moved_count: int
    skipped_count: int
    errors: list[str]


class StorageCreateFolderRequest(BaseModel):
    parent_prefix: str = ""
    name: str = Field(min_length=1, max_length=200)


class StorageCreateFolderResponse(BaseModel):
    prefix: str


@router.get("", response_model=StorageBucketInfo, dependencies=[Depends(require_permission(PERM_CONSOLE_STORAGE))])
async def get_storage_info():
    return StorageBucketInfo(
        bucket=settings.aws_bucket_name,
        storage_enabled=settings.storage_enabled,
    )


@router.get("/objects", response_model=StorageListResponse, dependencies=[Depends(require_permission(PERM_CONSOLE_STORAGE))])
async def list_objects(
    prefix: str = "",
    continuation_token: str | None = None,
    max_keys: int = Query(default=100, ge=1, le=200),
):
    if not settings.storage_enabled:
        raise HTTPException(status_code=503, detail="Object storage is not configured")
    try:
        page = list_storage_page(
            prefix,
            continuation_token=continuation_token,
            max_keys=max_keys,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return StorageListResponse(
        prefix=page.prefix,
        folders=[StorageFolderItem(prefix=p) for p in page.folders],
        objects=[
            StorageObjectItem(
                key=o.key,
                size=o.size,
                last_modified=o.last_modified.isoformat() if o.last_modified else None,
            )
            for o in page.objects
        ],
        next_continuation_token=page.next_continuation_token,
        truncated=page.truncated,
    )


@router.post(
    "/folders",
    response_model=StorageCreateFolderResponse,
    dependencies=[Depends(require_permission(PERM_CONSOLE_STORAGE))],
)
async def create_storage_folder(body: StorageCreateFolderRequest):
    """Create a folder placeholder (zero-byte key ending in /) under parent_prefix."""
    if not settings.storage_enabled:
        raise HTTPException(status_code=503, detail="Object storage is not configured")
    try:
        key = create_folder_placeholder(body.parent_prefix, body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return StorageCreateFolderResponse(prefix=key)


@router.post("/move", response_model=StorageMoveResponse, dependencies=[Depends(require_permission(PERM_CONSOLE_STORAGE))])
async def move_storage_objects(body: StorageMoveRequest):
    if not settings.storage_enabled:
        raise HTTPException(status_code=503, detail="Object storage is not configured")
    try:
        dest_prefix = validate_storage_prefix(body.destination_prefix)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if dest_prefix and not dest_prefix.endswith("/"):
        dest_prefix += "/"

    moved = 0
    skipped = 0
    errors: list[str] = []

    for item in body.items:
        try:
            if item.type == "prefix":
                src = validate_storage_prefix(item.key)
                if not src.endswith("/"):
                    src += "/"
                m, s, errs = move_prefix(src, dest_prefix, delete_source=body.delete_source)
                moved += m
                skipped += s
                errors.extend(errs)
            else:
                src_key = validate_storage_key(item.key)
                basename = src_key.rsplit("/", 1)[-1]
                dest_key = f"{dest_prefix}{basename}"
                if move_object_key(src_key, dest_key, delete_source=body.delete_source):
                    moved += 1
                else:
                    skipped += 1
        except ValueError as e:
            errors.append(f"{item.key}: {e}")
            skipped += 1
        except Exception as e:
            errors.append(f"{item.key}: {e}")
            skipped += 1

    return StorageMoveResponse(moved_count=moved, skipped_count=skipped, errors=errors)
