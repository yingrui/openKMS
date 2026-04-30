"""Articles API: markdown, MinIO bundle, attachments, versions."""

from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import RedirectResponse
from urllib.parse import unquote

from app.api.auth import get_jwt_payload, require_auth
from app.database import get_db
from app.models.article import Article
from app.models.article_attachment import ArticleAttachment
from app.models.article_channel import ArticleChannel
from app.models.article_version import ArticleVersion
from app.schemas.article import (
    ArticleAttachmentOut,
    ArticleCreate,
    ArticleLifecycleUpdateBody,
    ArticleListResponse,
    ArticleMarkdownBody,
    ArticleResponse,
    ArticleUpdate,
    ArticleVersionCreateBody,
    ArticleVersionDetailResponse,
    ArticleVersionListItem,
    ArticleVersionListResponse,
    ArticleVersionRestoreBody,
)
from app.services.article_scope import (
    article_channel_allowed_for_create,
    article_passes_scoped_predicate,
    scoped_article_predicate,
)
from app.services.article_storage import (
    article_object_key,
    is_allowed_article_file_path,
    safe_attachment_filename,
    sync_content_md_to_storage,
)
from app.services.data_scope import scope_applies
from app.services.storage import delete_object, delete_objects_by_prefix, get_redirect_url, object_exists, upload_object
from app.config import settings

router = APIRouter(prefix="/articles", tags=["articles"], dependencies=[Depends(require_auth)])


def _collect_article_channel_and_descendants(channels: list[ArticleChannel], channel_id: str, out: set[str]) -> None:
    out.add(channel_id)
    for c in channels:
        if c.parent_id == channel_id:
            _collect_article_channel_and_descendants(channels, c.id, out)


async def _require_article_in_scope(request: Request, db: AsyncSession, row: Article) -> None:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str):
        return
    if not await article_passes_scoped_predicate(db, p, sub, row):
        raise HTTPException(status_code=404, detail="Article not found")


async def get_scoped_article(
    article_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Article:
    row = await db.get(Article, article_id)
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")
    await _require_article_in_scope(request, db, row)
    return row


@router.get("/stats")
async def article_stats(request: Request, db: AsyncSession = Depends(get_db)):
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    scope_pred = await scoped_article_predicate(db, p, sub) if isinstance(sub, str) else None
    q = select(func.count(Article.id))
    if scope_pred is not None:
        q = q.where(scope_pred)
    result = await db.execute(q)
    return {"total": result.scalar_one()}


@router.get("", response_model=ArticleListResponse)
async def list_articles(
    request: Request,
    db: AsyncSession = Depends(get_db),
    channel_id: str | None = None,
    search: str | None = None,
    offset: int = 0,
    limit: int = 200,
):
    base_query = select(Article)
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    scope_pred = await scoped_article_predicate(db, p, sub) if isinstance(sub, str) else None

    if channel_id:
        ch_result = await db.execute(select(ArticleChannel).order_by(ArticleChannel.sort_order))
        all_channels = list(ch_result.scalars().all())
        target = next((c for c in all_channels if c.id == channel_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="Channel not found")
        ids_to_include: set[str] = set()
        _collect_article_channel_and_descendants(all_channels, channel_id, ids_to_include)
        if not ids_to_include:
            return ArticleListResponse(items=[], total=0)
        if scope_pred is not None:
            base_query = base_query.where(and_(Article.channel_id.in_(ids_to_include), scope_pred))
        else:
            base_query = base_query.where(Article.channel_id.in_(ids_to_include))
    elif scope_pred is not None:
        base_query = base_query.where(scope_pred)

    if search:
        base_query = base_query.where(Article.name.ilike(f"%{search}%"))

    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one() or 0

    query = base_query.order_by(Article.updated_at.desc()).offset(offset).limit(limit)
    rows_result = await db.execute(query)
    rows = list(rows_result.scalars().all())
    return ArticleListResponse(items=[ArticleResponse.model_validate(r) for r in rows], total=total)


@router.post("", response_model=ArticleResponse)
async def create_article(
    body: ArticleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        if not await article_channel_allowed_for_create(db, sub, body.channel_id):
            raise HTTPException(status_code=404, detail="Channel not found")

    ch = await db.get(ArticleChannel, body.channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    new_id = str(uuid4())
    series = body.series_id or new_id
    row = Article(
        id=new_id,
        channel_id=body.channel_id,
        name=body.name,
        slug=body.slug,
        markdown=body.markdown,
        article_metadata=body.metadata,
        series_id=series,
        effective_from=body.effective_from,
        effective_to=body.effective_to,
        lifecycle_status=body.lifecycle_status,
        origin_article_id=body.origin_article_id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    sync_content_md_to_storage(row.id, row.markdown)
    return ArticleResponse.model_validate(row)


@router.get("/{article_id}", response_model=ArticleResponse)
async def get_article(
    article_id: str,
    row: Article = Depends(get_scoped_article),
):
    return ArticleResponse.model_validate(row)


@router.patch("/{article_id}", response_model=ArticleResponse)
async def patch_article(
    article_id: str,
    body: ArticleUpdate,
    request: Request,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
):
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if body.channel_id is not None:
        if isinstance(sub, str) and scope_applies(p, sub):
            if not await article_channel_allowed_for_create(db, sub, body.channel_id):
                raise HTTPException(status_code=404, detail="Channel not found")
        ch = await db.get(ArticleChannel, body.channel_id)
        if not ch:
            raise HTTPException(status_code=404, detail="Channel not found")

    data = body.model_dump(exclude_unset=True)
    if "metadata" in data:
        row.article_metadata = data.pop("metadata")
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    sync_content_md_to_storage(row.id, row.markdown)
    return ArticleResponse.model_validate(row)


@router.put("/{article_id}/markdown", response_model=ArticleResponse)
async def put_article_markdown(
    article_id: str,
    body: ArticleMarkdownBody,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
):
    row.markdown = body.markdown
    await db.commit()
    await db.refresh(row)
    sync_content_md_to_storage(row.id, row.markdown)
    return ArticleResponse.model_validate(row)


@router.patch("/{article_id}/lifecycle", response_model=ArticleResponse)
async def patch_article_lifecycle(
    article_id: str,
    body: ArticleLifecycleUpdateBody,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return ArticleResponse.model_validate(row)


@router.delete("/{article_id}", status_code=204)
async def delete_article(
    article_id: str,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
):
    if settings.storage_enabled:
        delete_objects_by_prefix(f"articles/{row.id}/")
    await db.delete(row)
    await db.commit()


@router.get("/{article_id}/files/{file_path:path}")
async def get_article_file(
    article_id: str,
    file_path: str,
    row: Article = Depends(get_scoped_article),
):
    path = unquote(file_path).lstrip("/")
    if not is_allowed_article_file_path(path):
        raise HTTPException(status_code=400, detail="Invalid path")
    key = article_object_key(row.id, path)
    if not object_exists(key):
        raise HTTPException(status_code=404, detail="File not found")
    url = get_redirect_url(key)
    return RedirectResponse(url=url, status_code=302)


@router.get("/{article_id}/attachments", response_model=list[ArticleAttachmentOut])
async def list_article_attachments(
    article_id: str,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(ArticleAttachment).where(ArticleAttachment.article_id == row.id).order_by(ArticleAttachment.created_at)
    )
    return [ArticleAttachmentOut.model_validate(x) for x in r.scalars().all()]


@router.post("/{article_id}/attachments", response_model=ArticleAttachmentOut)
async def upload_article_attachment(
    article_id: str,
    file: UploadFile = File(...),
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
):
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for S3/MinIO.",
        )
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    fname = safe_attachment_filename(file.filename or "attachment")
    rel = f"attachments/{fname}"
    key = article_object_key(row.id, rel)
    upload_object(key, content, content_type=file.content_type)

    att = ArticleAttachment(
        id=str(uuid4()),
        article_id=row.id,
        storage_path=rel,
        original_filename=file.filename or fname,
        size_bytes=len(content),
        content_type=file.content_type,
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)
    return ArticleAttachmentOut.model_validate(att)


@router.delete("/{article_id}/attachments/{attachment_id}", status_code=204)
async def delete_article_attachment(
    article_id: str,
    attachment_id: str,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
):
    att = await db.get(ArticleAttachment, attachment_id)
    if not att or att.article_id != row.id:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if settings.storage_enabled:
        try:
            delete_object(article_object_key(row.id, att.storage_path))
        except Exception:
            pass
    await db.delete(att)
    await db.commit()


async def _next_article_version_number(db: AsyncSession, article_id: str) -> int:
    result = await db.execute(
        select(func.coalesce(func.max(ArticleVersion.version_number), 0)).where(ArticleVersion.article_id == article_id)
    )
    return int(result.scalar_one()) + 1


@router.post("/{article_id}/versions", response_model=ArticleVersionDetailResponse)
async def create_article_version(
    article_id: str,
    body: ArticleVersionCreateBody,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_jwt_payload),
):
    vn = await _next_article_version_number(db, article_id)
    sub = claims.get("sub")
    uname = claims.get("preferred_username") or claims.get("name")
    av = ArticleVersion(
        id=str(uuid4()),
        article_id=article_id,
        version_number=vn,
        tag=body.tag,
        note=body.note,
        markdown=row.markdown,
        version_metadata=dict(row.article_metadata) if row.article_metadata else None,
        created_by_sub=sub if isinstance(sub, str) else None,
        created_by_name=uname if isinstance(uname, str) else None,
    )
    db.add(av)
    await db.commit()
    await db.refresh(av)
    return ArticleVersionDetailResponse.model_validate(av)


@router.get("/{article_id}/versions", response_model=ArticleVersionListResponse)
async def list_article_versions(
    article_id: str,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ArticleVersion)
        .where(ArticleVersion.article_id == article_id)
        .order_by(ArticleVersion.version_number.desc())
    )
    rows = list(result.scalars().all())
    return ArticleVersionListResponse(items=[ArticleVersionListItem.model_validate(r) for r in rows])


@router.get("/{article_id}/versions/{version_id}", response_model=ArticleVersionDetailResponse)
async def get_article_version(
    article_id: str,
    version_id: str,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
):
    av = await db.get(ArticleVersion, version_id)
    if not av or av.article_id != article_id:
        raise HTTPException(status_code=404, detail="Version not found")
    return ArticleVersionDetailResponse.model_validate(av)


@router.post("/{article_id}/versions/{version_id}/restore", response_model=ArticleResponse)
async def restore_article_version(
    article_id: str,
    version_id: str,
    body: ArticleVersionRestoreBody,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_jwt_payload),
):
    av = await db.get(ArticleVersion, version_id)
    if not av or av.article_id != article_id:
        raise HTTPException(status_code=404, detail="Version not found")

    if body.save_current_as_version:
        vn = await _next_article_version_number(db, article_id)
        sub = claims.get("sub")
        uname = claims.get("preferred_username") or claims.get("name")
        pre = ArticleVersion(
            id=str(uuid4()),
            article_id=article_id,
            version_number=vn,
            tag=body.tag,
            note=body.note,
            markdown=row.markdown,
            version_metadata=dict(row.article_metadata) if row.article_metadata else None,
            created_by_sub=sub if isinstance(sub, str) else None,
            created_by_name=uname if isinstance(uname, str) else None,
        )
        db.add(pre)

    row.markdown = av.markdown
    row.article_metadata = dict(av.version_metadata) if av.version_metadata else None
    await db.commit()
    await db.refresh(row)
    sync_content_md_to_storage(row.id, row.markdown)
    return ArticleResponse.model_validate(row)
