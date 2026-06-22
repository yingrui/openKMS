"""Media assets API: upload, CRUD, file serving, AI generation."""

from __future__ import annotations

import mimetypes
import os
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import unquote

from app.api.auth import require_auth
from app.database import get_db
from app.models.api_model import ApiModel
from app.models.api_provider import ApiProvider
from app.models.media_asset import MediaAsset
from app.models.media_channel import MediaChannel
from app.schemas.media_asset import (
    MediaAssetListResponse,
    MediaAssetResponse,
    MediaAssetUpdate,
    MediaGenerateRequest,
    MediaGenerateResponse,
)
from app.services.channel_list_filter import channel_subtree_ids_for_list
from app.services.channel_scope import require_media_channel_write
from app.services.data_scope import scope_applies
from app.services.feature_toggles import require_media_feature
from app.services.media_scope import (
    load_media_scoped,
    media_list_predicate,
)
from app.services.media_service import collect_media_channel_and_descendants
from app.services.media_storage import (
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_VIDEO_EXTENSIONS,
    MEDIA_KIND_IMAGE,
    MEDIA_KIND_VIDEO,
    media_original_key,
    media_prefix,
)
from app.services.resource_acl_constants import PERM_READ, PERM_WRITE, RT_MEDIA_CHANNEL
from app.services.chunked_upload import chunk_count, cleanup, reassemble, store_chunk
from app.services.storage import delete_objects_by_prefix, get_redirect_url, upload_object

router = APIRouter(
    prefix="/media",
    tags=["media"],
    dependencies=[Depends(require_auth), Depends(require_media_feature)],
)


def _guess_media_kind(filename: str, content_type: str | None) -> str | None:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in ALLOWED_IMAGE_EXTENSIONS or (content_type or "").startswith("image/"):
        return MEDIA_KIND_IMAGE
    if ext in ALLOWED_VIDEO_EXTENSIONS or (content_type or "").startswith("video/"):
        return MEDIA_KIND_VIDEO
    return None


def _safe_ext(filename: str, media_kind: str) -> str:
    ext = os.path.splitext(filename or "")[1].lower().lstrip(".")
    if media_kind == MEDIA_KIND_IMAGE and f".{ext}" in ALLOWED_IMAGE_EXTENSIONS:
        return ext or "jpg"
    if media_kind == MEDIA_KIND_VIDEO and f".{ext}" in ALLOWED_VIDEO_EXTENSIONS:
        return ext or "mp4"
    return "jpg" if media_kind == MEDIA_KIND_IMAGE else "mp4"


def _asset_response(row: MediaAsset) -> MediaAssetResponse:
    return MediaAssetResponse.model_validate(row)


async def get_scoped_media_read(
    asset_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MediaAsset:
    return await load_media_scoped(db, request, asset_id, PERM_READ)


async def get_scoped_media_write(
    asset_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MediaAsset:
    return await load_media_scoped(db, request, asset_id, PERM_WRITE)


@router.get("/stats")
async def media_stats(request: Request, db: AsyncSession = Depends(get_db)):
    scope_pred = await media_list_predicate(db, request)
    q = select(func.count(MediaAsset.id))
    if scope_pred is not None:
        q = q.where(scope_pred)
    result = await db.execute(q)
    return {"total": result.scalar_one()}


@router.get("", response_model=MediaAssetListResponse)
async def list_media_assets(
    request: Request,
    db: AsyncSession = Depends(get_db),
    channel_id: str | None = None,
    media_kind: str | None = None,
    search: str | None = None,
    offset: int = 0,
    limit: int = 200,
):
    base_query = select(MediaAsset)
    scope_pred = await media_list_predicate(db, request)

    if channel_id:
        try:
            ids_to_include = await channel_subtree_ids_for_list(
                db,
                request,
                channel_id=channel_id,
                channel_model=MediaChannel,
                rt_channel=RT_MEDIA_CHANNEL,
                collect_descendants=collect_media_channel_and_descendants,
                not_found_detail="Channel not found",
            )
        except HTTPException:
            raise HTTPException(status_code=404, detail="Channel not found") from None
        if not ids_to_include:
            return MediaAssetListResponse(items=[], total=0)
        if scope_pred is not None:
            base_query = base_query.where(and_(MediaAsset.channel_id.in_(ids_to_include), scope_pred))
        else:
            base_query = base_query.where(MediaAsset.channel_id.in_(ids_to_include))
    elif scope_pred is not None:
        base_query = base_query.where(scope_pred)

    if media_kind:
        base_query = base_query.where(MediaAsset.media_kind == media_kind)

    if search and search.strip():
        term = f"%{search.strip()}%"
        base_query = base_query.where(
            or_(MediaAsset.title.ilike(term), MediaAsset.description.ilike(term))
        )

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one() or 0

    query = base_query.order_by(MediaAsset.updated_at.desc()).offset(offset).limit(limit)
    rows = list((await db.execute(query)).scalars().all())
    return MediaAssetListResponse(items=[_asset_response(r) for r in rows], total=total)


@router.get("/{asset_id}", response_model=MediaAssetResponse)
async def get_media_asset(row: MediaAsset = Depends(get_scoped_media_read)):
    return _asset_response(row)


@router.patch("/{asset_id}", response_model=MediaAssetResponse)
async def update_media_asset(
    body: MediaAssetUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    row: MediaAsset = Depends(get_scoped_media_write),
):
    data = body.model_dump(exclude_unset=True)
    if "metadata" in data:
        row.asset_metadata = data.pop("metadata")
    if "channel_id" in data and data["channel_id"]:
        await require_media_channel_write(request, db, data["channel_id"])
        ch = await db.get(MediaChannel, data["channel_id"])
        if not ch:
            raise HTTPException(status_code=404, detail="Channel not found")
    for key, value in data.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return _asset_response(row)


@router.delete("/{asset_id}", status_code=204)
async def delete_media_asset(
    db: AsyncSession = Depends(get_db),
    row: MediaAsset = Depends(get_scoped_media_write),
):
    delete_objects_by_prefix(media_prefix(row.id))
    await db.delete(row)
    await db.commit()


@router.post("/upload", response_model=MediaAssetResponse)
async def upload_media_asset(
    request: Request,
    db: AsyncSession = Depends(get_db),
    channel_id: str = Form(...),
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
):
    await require_media_channel_write(request, db, channel_id)
    ch = await db.get(MediaChannel, channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    filename = file.filename or "upload"
    content_type = file.content_type or mimetypes.guess_type(filename)[0]
    media_kind = _guess_media_kind(filename, content_type)
    if not media_kind:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload an image or video.")

    body = await file.read()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file")

    asset_id = f"ma_{uuid4().hex[:12]}"
    ext = _safe_ext(filename, media_kind)
    storage_key = media_original_key(asset_id, ext)
    upload_object(storage_key, body, content_type=content_type)

    asset = MediaAsset(
        id=asset_id,
        channel_id=channel_id,
        media_kind=media_kind,
        title=(title or os.path.splitext(filename)[0] or "Untitled")[:512],
        description=description,
        storage_key=storage_key,
        content_type=content_type,
        provenance="uploaded",
        series_id=asset_id,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)

    from app.jobs.defer import defer_task
    from app.jobs.tasks import generate_media_derivatives

    await defer_task(generate_media_derivatives, asset_id=asset_id)

    return _asset_response(asset)


@router.get("/{asset_id}/files/{file_path:path}")
async def get_media_file(
    file_path: str,
    url_only: bool = Query(default=False),
    row: MediaAsset = Depends(get_scoped_media_read),
):
    decoded = unquote(file_path)
    expected_prefix = media_prefix(row.id)
    if not decoded.startswith(expected_prefix):
        raise HTTPException(status_code=404, detail="File not found")
    url = get_redirect_url(decoded)
    if url_only:
        return {"url": url}
    return RedirectResponse(url=url, status_code=302)


@router.post("/generate", response_model=MediaGenerateResponse)
async def generate_media_asset(
    body: MediaGenerateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await require_media_channel_write(request, db, body.channel_id)
    ch = await db.get(MediaChannel, body.channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    model = await db.get(ApiModel, body.model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    expected_kind = "image-generate" if body.media_kind == "image" else "video-generate"
    if model.api_kind != expected_kind:
        raise HTTPException(status_code=400, detail=f"Model must have api_kind {expected_kind}")

    provider = await db.get(ApiProvider, model.provider_id)
    if not provider or not provider.api_key:
        raise HTTPException(status_code=400, detail="Provider credentials not configured")

    from app.jobs.defer import defer_task
    from app.jobs.tasks import run_media_generation

    job_id = await defer_task(
        run_media_generation,
        channel_id=body.channel_id,
        media_kind=body.media_kind,
        model_id=body.model_id,
        prompt=body.prompt,
        title=body.title,
        size=body.size,
        quality=body.quality,
        duration=body.duration,
        image_url=body.image_url,
        params=body.params,
    )
    return MediaGenerateResponse(job_id=job_id, provider_task_id="pending")


@router.post("/upload-chunk", response_model=MediaAssetResponse)
async def upload_media_chunked(
    request: Request,
    db: AsyncSession = Depends(get_db),
    channel_id: str = Form(...),
    file_chunk: UploadFile = File(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    filename: str = Form(...),
    content_type: str = Form(default=""),
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
):
    """Chunked media upload. When the last chunk arrives, reassemble and process like /upload."""
    from app.services.media_scope import require_media_channel_write

    await require_media_channel_write(request, db, channel_id)
    ch = await db.get(MediaChannel, channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    if chunk_index < 0 or total_chunks < 1 or chunk_index >= total_chunks:
        raise HTTPException(status_code=400, detail="Invalid chunk_index or total_chunks")

    data = await file_chunk.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty chunk")

    session_id = f"media-upload-{channel_id}"
    store_chunk(session_id, chunk_index, data)

    if chunk_count(session_id) < total_chunks:
        return {"id": "pending"}

    raw = reassemble(session_id, total_chunks)
    cleanup(session_id)

    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    fname = filename or "upload"
    ct = content_type or mimetypes.guess_type(fname)[0]
    media_kind = _guess_media_kind(fname, ct)
    if not media_kind:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload an image or video.")

    asset_id = f"ma_{uuid4().hex[:12]}"
    ext = _safe_ext(fname, media_kind)
    storage_key = media_original_key(asset_id, ext)
    upload_object(storage_key, raw, content_type=ct)

    asset = MediaAsset(
        id=asset_id,
        channel_id=channel_id,
        media_kind=media_kind,
        title=(title or os.path.splitext(fname)[0] or "Untitled")[:512],
        description=description,
        storage_key=storage_key,
        content_type=ct,
        provenance="uploaded",
        series_id=asset_id,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)

    from app.jobs.defer import defer_task
    from app.jobs.tasks import generate_media_derivatives
    await defer_task(generate_media_derivatives, asset_id=asset_id)

    return _asset_response(asset)
