"""File dataset versions: open a draft, add files, publish, read.

Separate router because these endpoints have nothing to do with SQL: a file dataset's data lives in
the platform bucket as immutable objects, and every read here is column/row selection over them.

The lifecycle is the contract:

    create draft → add files → publish (freezes, writes the manifest) → deprecated (kept forever)

A draft has no manifest, so nothing can pin it — which is why `publish` is the only way to make a
version readable by a consumer.
"""

from __future__ import annotations

import json

from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.database import get_db
from app.models.dataset import Dataset
from app.schemas.dataset import (
    DatasetVersionCreate,
    DatasetVersionDetailResponse,
    DatasetVersionFileResponse,
    DatasetVersionResponse,
    FileRowsResponse,
)
from app.services.data_layer import file_datasets
from app.services.storage import STORAGE_ERRORS, get_object
from app.services.data_layer.file_datasets import FileDatasetError
from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE

router = APIRouter(
    prefix="/dataset-versions",
    tags=["dataset-versions"],
    dependencies=[Depends(require_auth)],
)

_VIEW = (PERM_DATA_READ,)


def _bad_request(exc: FileDatasetError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


async def _file_dataset(db: AsyncSession, dataset_id: str) -> Dataset:
    dataset = await db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if (dataset.kind or "table") != "file":
        raise HTTPException(
            status_code=400,
            detail="This dataset is backed by a table; versions exist for file datasets only.",
        )
    return dataset


@router.get(
    "/{dataset_id}",
    response_model=list[DatasetVersionResponse],
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def list_versions(dataset_id: str, db: AsyncSession = Depends(get_db)):
    """Every version, oldest first — drafts included, so an unfinished version is visible."""
    await _file_dataset(db, dataset_id)
    return [
        DatasetVersionResponse.model_validate(row)
        for row in await file_datasets.list_versions(db, dataset_id)
    ]


@router.post(
    "/{dataset_id}",
    response_model=DatasetVersionResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def open_version(
    dataset_id: str,
    body: DatasetVersionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Open the next draft, optionally carrying over a previous version's files."""
    dataset = await _file_dataset(db, dataset_id)
    payload = request.state.openkms_jwt_payload
    user = {
        "sub": payload.get("sub") if isinstance(payload.get("sub"), str) else None,
        "name": str(payload.get("preferred_username") or payload.get("name") or "")[:256] or None,
    }
    try:
        version = await file_datasets.open_version(db, dataset, notes=body.notes, user=user)
        if body.from_version is not None:
            await file_datasets.reuse_files(db, dataset, version, body.from_version)
            await db.refresh(version)
    except FileDatasetError as exc:
        await db.rollback()
        raise _bad_request(exc) from exc
    return DatasetVersionResponse.model_validate(version)


@router.get(
    "/{dataset_id}/{version}",
    response_model=DatasetVersionDetailResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def get_version(dataset_id: str, version: int, db: AsyncSession = Depends(get_db)):
    await _file_dataset(db, dataset_id)
    try:
        row = await file_datasets.get_version(db, dataset_id, version)
    except FileDatasetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    files = await file_datasets.version_files(db, row)
    detail = DatasetVersionDetailResponse.model_validate(row)
    detail.files = [DatasetVersionFileResponse.model_validate(f) for f in files]
    return detail


@router.post(
    "/{dataset_id}/{version}/files",
    response_model=DatasetVersionFileResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def add_file(
    dataset_id: str,
    version: int,
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload one file into a draft. Large files should go straight to object storage instead."""
    dataset = await _file_dataset(db, dataset_id)
    try:
        row = await file_datasets.get_version(db, dataset_id, version)
    except FileDatasetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")
    payload = request.state.openkms_jwt_payload
    user = {
        "sub": payload.get("sub") if isinstance(payload.get("sub"), str) else None,
        "name": str(payload.get("preferred_username") or payload.get("name") or "")[:256] or None,
    }
    try:
        saved = await file_datasets.add_file(
            db, dataset, row, name=file.filename or "upload.parquet", content=content, user=user
        )
    except FileDatasetError as exc:
        await db.rollback()
        raise _bad_request(exc) from exc
    return DatasetVersionFileResponse.model_validate(saved)


@router.delete(
    "/{dataset_id}/{version}/files/{name}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def remove_file(dataset_id: str, version: int, name: str, db: AsyncSession = Depends(get_db)):
    """Only a draft's files can be removed; a published version is frozen."""
    await _file_dataset(db, dataset_id)
    try:
        row = await file_datasets.get_version(db, dataset_id, version)
        await file_datasets.remove_file(db, row, name)
    except FileDatasetError as exc:
        await db.rollback()
        raise _bad_request(exc) from exc


@router.delete(
    "/{dataset_id}/{version}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def delete_draft(dataset_id: str, version: int, db: AsyncSession = Depends(get_db)):
    """Delete a draft. Only a draft: nothing can reference a version that was never published."""
    await _file_dataset(db, dataset_id)
    try:
        row = await file_datasets.get_version(db, dataset_id, version)
    except FileDatasetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if row.status != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"v{version} is {row.status}: only a draft can be deleted (deprecate instead)",
        )
    await db.delete(row)
    await db.commit()


@router.post(
    "/{dataset_id}/{version}/publish",
    response_model=DatasetVersionResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def publish_version(dataset_id: str, version: int, db: AsyncSession = Depends(get_db)):
    """Freeze the draft: write its manifest, make it pinnable."""
    dataset = await _file_dataset(db, dataset_id)
    try:
        row = await file_datasets.get_version(db, dataset_id, version)
        row = await file_datasets.publish(db, dataset, row)
    except FileDatasetError as exc:
        await db.rollback()
        raise _bad_request(exc) from exc
    return DatasetVersionResponse.model_validate(row)


@router.post(
    "/{dataset_id}/{version}/deprecate",
    response_model=DatasetVersionResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def deprecate_version(dataset_id: str, version: int, db: AsyncSession = Depends(get_db)):
    """Mark a published version superseded. It stays readable and pinnable, by design."""
    await _file_dataset(db, dataset_id)
    try:
        row = await file_datasets.get_version(db, dataset_id, version)
        row = await file_datasets.deprecate(db, row)
    except FileDatasetError as exc:
        await db.rollback()
        raise _bad_request(exc) from exc
    return DatasetVersionResponse.model_validate(row)


@router.get(
    "/{dataset_id}/{version}/files/{name}/url",
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def file_url(
    dataset_id: str,
    version: int,
    name: str,
    expires_in: int = Query(900, ge=60, le=86400),
    db: AsyncSession = Depends(get_db),
):
    """A presigned download — file bytes never pass through the API."""
    await _file_dataset(db, dataset_id)
    try:
        row = await file_datasets.get_version(db, dataset_id, version)
        return {"url": await file_datasets.download_url(db, row, name, expires_in=expires_in)}
    except FileDatasetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/{dataset_id}/{version}/manifest",
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def manifest(dataset_id: str, version: int, db: AsyncSession = Depends(get_db)):
    """The version's manifest, verbatim — the frozen record of what was published.

    It is written once at publish and never touched again: files with their sha256, row counts, the schema that was
    read from them. Reading it is how someone checks "what exactly is in v2" without trusting a summary.
    """
    await _file_dataset(db, dataset_id)
    try:
        row = await file_datasets.get_version(db, dataset_id, version)
    except FileDatasetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not row.manifest_key:
        raise HTTPException(status_code=404, detail="This version has no manifest: publish it first.")
    try:
        return json.loads(get_object(row.manifest_key))
    except STORAGE_ERRORS as exc:
        # A manifest row without its object means the storage write never happened (a test fixture,
        # a bucket that was wiped). Say that instead of leaking a raw botocore NoSuchKey as a 500.
        raise HTTPException(
            status_code=404,
            detail=(
                f"v{version} is published but its manifest object is missing "
                f"({row.manifest_key}): {type(exc).__name__}"
            ),
        ) from exc
    except FileDatasetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/{dataset_id}/{version}/preview",
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def preview(
    dataset_id: str,
    version: int,
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    await _file_dataset(db, dataset_id)
    try:
        row = await file_datasets.get_version(db, dataset_id, version)
        return await file_datasets.preview(db, row, limit=limit)
    except FileDatasetError as exc:
        raise _bad_request(exc) from exc


@router.get(
    "/{dataset_id}/{version}/rows",
    response_model=FileRowsResponse,
    dependencies=[Depends(require_any_permission(*_VIEW))],
)
async def select_rows(
    dataset_id: str,
    version: int,
    columns: str | None = Query(None, description="Comma-separated column names to keep"),
    start: date | None = Query(None, description="Inclusive lower bound on the date column"),
    end: date | None = Query(None, description="Inclusive upper bound on the date column"),
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Column and row selection across the version's files. Not a join, and not SQL."""
    await _file_dataset(db, dataset_id)
    try:
        row = await file_datasets.get_version(db, dataset_id, version)
        result = await file_datasets.rows(
            db,
            row,
            columns=[c.strip() for c in columns.split(",") if c.strip()] if columns else None,
            start=start,
            end=end,
            limit=limit,
            offset=offset,
        )
    except FileDatasetError as exc:
        raise _bad_request(exc) from exc
    return FileRowsResponse(version=row.version, **result)
