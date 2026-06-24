"""Articles API: markdown, MinIO bundle, attachments, versions, import."""

from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import ValidationError
from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import RedirectResponse
from urllib.parse import unquote

from app.api.auth import get_jwt_payload, require_auth
from app.database import get_db
from app.constants import DocumentRelationType
from app.models.article import Article
from app.models.article_attachment import ArticleAttachment
from app.models.article_channel import ArticleChannel
from app.models.article_relationship import ArticleRelationship
from app.models.article_review import ArticleReview
from app.models.article_version import ArticleVersion
from app.schemas.article import (
    ArticleAttachmentOut,
    ArticleCreate,
    ArticleImportImageResult,
    ArticleImportPayload,
    ArticleImportResponse,
    ArticleLifecycleUpdateBody,
    ArticleListResponse,
    ArticleMarkdownBody,
    ArticleRelationshipCreateBody,
    ArticleRelationshipEdge,
    ArticleRelationshipsResponse,
    ArticleResponse,
    ArticleUpdate,
    ArticleVersionCreateBody,
    ArticleVersionDetailResponse,
    ArticleVersionListItem,
    ArticleVersionListResponse,
    ArticleVersionRestoreBody,
)
from app.schemas.article_review import (
    ArticleReviewListResponse,
    ArticleReviewRequest,
    ArticleReviewResponse,
)
from app.services.articles.article_scope import (
    article_list_predicate,
    load_article_scoped,
    require_article_read,
)
from app.services.channels.channel_list_filter import channel_subtree_ids_for_list
from app.services.channels.channel_scope import require_article_channel_write
from app.services.articles.article_service import (
    ArticleData,
    ImportAttachment,
    ImportImage,
    collect_channel_and_descendants,
    create_article,
    delete_article_assets,
    import_article,
    persist_markdown_to_storage,
    store_article_attachment,
    store_article_image,
    update_article,
)
from app.services.articles.article_storage import article_object_key, is_allowed_article_file_path
from app.services.acl.data_scope import scope_applies
from app.services.acl.resource_acl_constants import PERM_READ, PERM_WRITE, RT_ARTICLE_CHANNEL
from app.services.storage import delete_object, get_redirect_url, object_exists
from app.config import settings

router = APIRouter(prefix="/articles", tags=["articles"], dependencies=[Depends(require_auth)])


async def _require_article_in_scope(request: Request, db: AsyncSession, row: Article) -> None:
    try:
        await require_article_read(db, request, row)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Article not found") from None


async def get_scoped_article(
    article_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Article:
    return await load_article_scoped(db, request, article_id, PERM_READ)


async def get_scoped_article_write(
    article_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Article:
    return await load_article_scoped(db, request, article_id, PERM_WRITE)


@router.get("/stats")
async def article_stats(request: Request, db: AsyncSession = Depends(get_db)):
    scope_pred = await article_list_predicate(db, request)
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
    scope_pred = await article_list_predicate(db, request)

    if channel_id:
        try:
            ids_to_include = await channel_subtree_ids_for_list(
                db,
                request,
                channel_id=channel_id,
                channel_model=ArticleChannel,
                rt_channel=RT_ARTICLE_CHANNEL,
                collect_descendants=collect_channel_and_descendants,
                not_found_detail="Channel not found",
            )
        except HTTPException:
            raise HTTPException(status_code=404, detail="Channel not found") from None
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


async def _ensure_channel_writable(db: AsyncSession, request: Request, channel_id: str) -> None:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        await require_article_channel_write(request, db, channel_id)
    ch = await db.get(ArticleChannel, channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")


@router.post("", response_model=ArticleResponse)
async def create_article_endpoint(
    body: ArticleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _ensure_channel_writable(db, request, body.channel_id)
    row = await create_article(
        db,
        channel_id=body.channel_id,
        name=body.name,
        data=ArticleData(
            slug=body.slug,
            markdown=body.markdown,
            metadata=body.metadata,
            series_id=body.series_id,
            effective_from=body.effective_from,
            effective_to=body.effective_to,
            lifecycle_status=body.lifecycle_status,
            origin_article_id=body.origin_article_id,
        ),
    )
    await db.commit()
    await db.refresh(row)
    persist_markdown_to_storage(row)
    return ArticleResponse.model_validate(row)


@router.post("/import", response_model=ArticleImportResponse)
async def import_article_endpoint(
    request: Request,
    payload: str = Form(..., description="JSON-encoded ArticleImportPayload"),
    images: list[UploadFile] = File(default=[]),
    attachments: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Single multipart endpoint to create or upsert an article with its images and attachments.

    The `payload` form field carries the article metadata as a JSON string (so files
    can be attached in the same request). When `payload.upsert=true` and
    `payload.origin_article_id` matches an existing article, that article is updated
    instead of a new one being created. When `payload.rewrite_links=true` (default),
    bare-filename references in the markdown (e.g. `![logo](logo.png)`) are rewritten
    to the stored relative paths after upload.
    """
    try:
        decoded = ArticleImportPayload.model_validate_json(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    await _ensure_channel_writable(db, request, decoded.channel_id)

    image_inputs: list[ImportImage] = []
    for f in images or []:
        content = await f.read()
        if not content:
            continue
        image_inputs.append(
            ImportImage(content=content, filename=f.filename, content_type=f.content_type)
        )

    if decoded.image_urls:
        fetched = await _fetch_remote_images(decoded.image_urls)
        image_inputs.extend(fetched)

    attachment_inputs: list[ImportAttachment] = []
    for f in attachments or []:
        content = await f.read()
        if not content:
            continue
        attachment_inputs.append(
            ImportAttachment(content=content, filename=f.filename, content_type=f.content_type)
        )

    data = ArticleData(
        slug=decoded.slug,
        markdown=decoded.markdown,
        metadata=decoded.metadata,
        series_id=decoded.series_id,
        effective_from=decoded.effective_from,
        effective_to=decoded.effective_to,
        lifecycle_status=decoded.lifecycle_status,
        origin_article_id=decoded.origin_article_id,
        last_synced_at=decoded.last_synced_at,
    )

    try:
        result = await import_article(
            db,
            channel_id=decoded.channel_id,
            name=decoded.name,
            data=data,
            images=image_inputs,
            attachments=attachment_inputs,
            upsert=decoded.upsert,
            rewrite_links=decoded.rewrite_links,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await db.commit()
    await db.refresh(result.article)

    return ArticleImportResponse(
        article=ArticleResponse.model_validate(result.article),
        created=result.created,
        images=[
            ArticleImportImageResult(
                path=i.path,
                filename=i.filename,
                size_bytes=i.size_bytes,
                content_type=i.content_type,
            )
            for i in result.images
        ],
        attachments=[ArticleAttachmentOut.model_validate(a.record) for a in result.attachments],
    )


async def _fetch_remote_images(urls: list[str]) -> list[ImportImage]:
    """Best-effort fetch for `image_urls` in the import payload. Failures are skipped silently."""
    import asyncio

    import httpx

    results: list[ImportImage] = []

    async def _one(client: httpx.AsyncClient, url: str) -> ImportImage | None:
        try:
            resp = await client.get(url, follow_redirects=True, timeout=15.0)
            if resp.status_code != 200 or not resp.content:
                return None
            ct = resp.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if not ct.startswith("image/"):
                return None
            name = url.rsplit("/", 1)[-1].split("?", 1)[0] or None
            return ImportImage(content=resp.content, filename=name, content_type=ct)
        except Exception:
            return None

    async with httpx.AsyncClient() as client:
        gathered = await asyncio.gather(*[_one(client, u) for u in urls if u])
    for item in gathered:
        if item is not None:
            results.append(item)
    return results


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
    row: Article = Depends(get_scoped_article_write),
    db: AsyncSession = Depends(get_db),
):
    if body.channel_id is not None:
        await _ensure_channel_writable(db, request, body.channel_id)

    fields = body.model_dump(exclude_unset=True)
    await update_article(db, row, fields)
    await db.commit()
    await db.refresh(row)
    persist_markdown_to_storage(row)
    return ArticleResponse.model_validate(row)


@router.put("/{article_id}/markdown", response_model=ArticleResponse)
async def put_article_markdown(
    article_id: str,
    body: ArticleMarkdownBody,
    row: Article = Depends(get_scoped_article_write),
    db: AsyncSession = Depends(get_db),
):
    await update_article(db, row, {"markdown": body.markdown})
    await db.commit()
    await db.refresh(row)
    persist_markdown_to_storage(row)
    return ArticleResponse.model_validate(row)


@router.patch("/{article_id}/lifecycle", response_model=ArticleResponse)
async def patch_article_lifecycle(
    article_id: str,
    body: ArticleLifecycleUpdateBody,
    row: Article = Depends(get_scoped_article_write),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return ArticleResponse.model_validate(row)


@router.get("/{article_id}/relationships", response_model=ArticleRelationshipsResponse)
async def list_article_relationships(
    article_id: str,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
):
    """List edges where this article is source (outgoing) or target (incoming)."""
    out_result = await db.execute(
        select(ArticleRelationship, Article.name)
        .join(Article, ArticleRelationship.target_article_id == Article.id)
        .where(ArticleRelationship.source_article_id == article_id)
        .order_by(ArticleRelationship.created_at.desc())
    )
    outgoing: list[ArticleRelationshipEdge] = []
    for rel, peer_name in out_result.all():
        outgoing.append(
            ArticleRelationshipEdge(
                id=rel.id,
                relation_type=rel.relation_type,
                peer_article_id=rel.target_article_id,
                peer_article_name=peer_name,
                note=rel.note,
                created_at=rel.created_at,
            )
        )

    inc_result = await db.execute(
        select(ArticleRelationship, Article.name)
        .join(Article, ArticleRelationship.source_article_id == Article.id)
        .where(ArticleRelationship.target_article_id == article_id)
        .order_by(ArticleRelationship.created_at.desc())
    )
    incoming: list[ArticleRelationshipEdge] = []
    for rel, peer_name in inc_result.all():
        incoming.append(
            ArticleRelationshipEdge(
                id=rel.id,
                relation_type=rel.relation_type,
                peer_article_id=rel.source_article_id,
                peer_article_name=peer_name,
                note=rel.note,
                created_at=rel.created_at,
            )
        )

    return ArticleRelationshipsResponse(outgoing=outgoing, incoming=incoming)


@router.post("/{article_id}/relationships", response_model=ArticleRelationshipEdge)
async def create_article_relationship(
    article_id: str,
    body: ArticleRelationshipCreateBody,
    request: Request,
    row: Article = Depends(get_scoped_article_write),
    db: AsyncSession = Depends(get_db),
):
    """Create a directed edge from this article to the target (e.g. supersedes, amends)."""
    if body.target_article_id == article_id:
        raise HTTPException(status_code=400, detail="Cannot relate an article to itself")
    try:
        DocumentRelationType(body.relation_type)
    except ValueError:
        allowed = ", ".join(sorted(x.value for x in DocumentRelationType))
        raise HTTPException(status_code=400, detail=f"relation_type must be one of: {allowed}")

    peer = await db.get(Article, body.target_article_id)
    if not peer:
        raise HTTPException(status_code=404, detail="Target article not found")
    await _require_article_in_scope(request, db, peer)

    rel = ArticleRelationship(
        id=str(uuid4()),
        source_article_id=article_id,
        target_article_id=body.target_article_id,
        relation_type=body.relation_type,
        note=body.note,
    )
    db.add(rel)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A relationship of this type between these articles already exists",
        ) from None
    await db.refresh(rel)
    return ArticleRelationshipEdge(
        id=rel.id,
        relation_type=rel.relation_type,
        peer_article_id=rel.target_article_id,
        peer_article_name=peer.name,
        note=rel.note,
        created_at=rel.created_at,
    )


@router.delete("/{article_id}/relationships/{relationship_id}", status_code=204)
async def delete_article_relationship(
    article_id: str,
    relationship_id: str,
    row: Article = Depends(get_scoped_article_write),
    db: AsyncSession = Depends(get_db),
):
    """Delete an outgoing relationship (source must be this article)."""
    rel = await db.get(ArticleRelationship, relationship_id)
    if not rel or rel.source_article_id != article_id:
        raise HTTPException(status_code=404, detail="Relationship not found")
    await db.delete(rel)
    await db.commit()


@router.delete("/{article_id}", status_code=204)
async def delete_article(
    article_id: str,
    row: Article = Depends(get_scoped_article_write),
    db: AsyncSession = Depends(get_db),
):
    delete_article_assets(row.id)
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


def _require_storage_enabled() -> None:
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for S3/MinIO.",
        )


@router.post("/{article_id}/attachments", response_model=ArticleAttachmentOut)
async def upload_article_attachment(
    article_id: str,
    file: UploadFile = File(...),
    row: Article = Depends(get_scoped_article_write),
    db: AsyncSession = Depends(get_db),
):
    _require_storage_enabled()
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        stored = await store_article_attachment(
            db, row.id, content, filename=file.filename, content_type=file.content_type
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await db.commit()
    await db.refresh(stored.record)
    return ArticleAttachmentOut.model_validate(stored.record)


@router.post("/{article_id}/images", response_model=ArticleImportImageResult)
async def upload_article_image(
    article_id: str,
    file: UploadFile = File(...),
    row: Article = Depends(get_scoped_article_write),
):
    """Upload an inline image under articles/{id}/images/. Returns markdown-friendly path."""
    _require_storage_enabled()
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        stored = store_article_image(
            row.id, content, filename=file.filename, content_type=file.content_type
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ArticleImportImageResult(
        path=stored.path,
        filename=stored.filename,
        size_bytes=stored.size_bytes,
        content_type=stored.content_type,
    )


@router.delete("/{article_id}/attachments/{attachment_id}", status_code=204)
async def delete_article_attachment(
    article_id: str,
    attachment_id: str,
    row: Article = Depends(get_scoped_article_write),
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
    row: Article = Depends(get_scoped_article_write),
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
    row: Article = Depends(get_scoped_article_write),
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
    persist_markdown_to_storage(row)
    return ArticleResponse.model_validate(row)


@router.post("/{article_id}/review", response_model=ArticleReviewResponse)
async def review_article(
    article_id: str,
    body: ArticleReviewRequest,
    request: Request,
    row: Article = Depends(get_scoped_article_write),
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_jwt_payload),
):
    """Run an LLM content review using the article channel's review configuration."""
    from app.models.api_model import ApiModel
    from app.services.articles.article_review import run_article_review
    from sqlalchemy.orm import selectinload

    channel = await db.get(ArticleChannel, row.channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Article channel not found")

    model_id = body.model_id or channel.review_model_id
    if not model_id:
        raise HTTPException(
            status_code=400,
            detail="No review model configured. Set a review model on the article channel or pass model_id.",
        )

    model_result = await db.execute(
        select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == model_id)
    )
    model = model_result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    model_config = {
        "base_url": model.provider_rel.base_url,
        "api_key": model.provider_rel.api_key,
        "model_name": model.model_name or model.name,
    }

    effective_prompt = body.prompt if body.prompt is not None else channel.review_prompt
    try:
        result = await run_article_review(
            title=row.name,
            markdown=row.markdown or "",
            model_config=model_config,
            custom_prompt=effective_prompt,
            criteria=channel.review_criteria,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    sub = claims.get("sub")
    uname = claims.get("preferred_username") or claims.get("name")
    review = ArticleReview(
        id=str(uuid4()),
        article_id=article_id,
        review_model_id=model_id,
        result=result,
        created_by=sub if isinstance(sub, str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return ArticleReviewResponse.model_validate(review)


@router.get("/{article_id}/reviews", response_model=ArticleReviewListResponse)
async def list_article_reviews(
    article_id: str,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
):
    limit = max(1, min(limit, 50))
    result = await db.execute(
        select(ArticleReview)
        .where(ArticleReview.article_id == article_id)
        .order_by(ArticleReview.created_at.desc())
        .limit(limit)
    )
    rows = list(result.scalars().all())
    return ArticleReviewListResponse(items=[ArticleReviewResponse.model_validate(r) for r in rows])


@router.get("/{article_id}/reviews/latest", response_model=ArticleReviewResponse)
async def get_latest_article_review(
    article_id: str,
    row: Article = Depends(get_scoped_article),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ArticleReview)
        .where(ArticleReview.article_id == article_id)
        .order_by(ArticleReview.created_at.desc())
        .limit(1)
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="No review found")
    return ArticleReviewResponse.model_validate(review)
