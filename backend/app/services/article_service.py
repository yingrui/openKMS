"""Reusable article CRUD + asset helpers.

Keeps API routes thin and gives the import endpoint and any future bulk loaders
a single place to create/update articles, register attachments and store images
under MinIO/S3.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Iterable
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.article import Article
from app.models.article_attachment import ArticleAttachment
from app.models.article_channel import ArticleChannel
from app.services.article_storage import (
    article_object_key,
    safe_attachment_filename,
    safe_image_filename,
    sync_content_md_to_storage,
)
from app.services.storage import delete_objects_by_prefix, upload_object


# ----------------------------- channel helpers -----------------------------


def collect_channel_and_descendants(
    channels: list[ArticleChannel], channel_id: str, out: set[str]
) -> None:
    """Populate `out` with `channel_id` and every descendant channel id."""
    out.add(channel_id)
    for c in channels:
        if c.parent_id == channel_id:
            collect_channel_and_descendants(channels, c.id, out)


# ----------------------------- article CRUD --------------------------------


@dataclass
class ArticleData:
    """Serialisable article fields the service understands.

    Anything `None` is treated as "do not change" on update; on create,
    fields with sensible defaults stay unset.
    """

    channel_id: str | None = None
    name: str | None = None
    slug: str | None = None
    markdown: str | None = None
    metadata: dict[str, Any] | None = None
    series_id: str | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    lifecycle_status: str | None = None
    origin_article_id: str | None = None
    last_synced_at: datetime | None = None


_FIELD_ATTR = {
    "channel_id": "channel_id",
    "name": "name",
    "slug": "slug",
    "markdown": "markdown",
    "metadata": "article_metadata",
    "series_id": "series_id",
    "effective_from": "effective_from",
    "effective_to": "effective_to",
    "lifecycle_status": "lifecycle_status",
    "origin_article_id": "origin_article_id",
    "last_synced_at": "last_synced_at",
}


async def create_article(
    db: AsyncSession,
    *,
    channel_id: str,
    name: str,
    data: ArticleData | None = None,
    article_id: str | None = None,
) -> Article:
    """Insert a new article. `data` may override defaults for optional fields."""
    if not name or not name.strip():
        raise ValueError("name is required")
    new_id = article_id or str(uuid4())
    payload = data or ArticleData()
    series = payload.series_id or new_id
    row = Article(
        id=new_id,
        channel_id=channel_id,
        name=name,
        slug=payload.slug,
        markdown=payload.markdown,
        article_metadata=payload.metadata,
        series_id=series,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        lifecycle_status=payload.lifecycle_status,
        origin_article_id=payload.origin_article_id,
        last_synced_at=payload.last_synced_at,
    )
    db.add(row)
    await db.flush()
    return row


async def update_article(
    db: AsyncSession, row: Article, fields: dict[str, Any]
) -> Article:
    """Apply only present keys (`exclude_unset` style) to the row."""
    for key, value in fields.items():
        attr = _FIELD_ATTR.get(key)
        if attr is None:
            continue
        setattr(row, attr, value)
    await db.flush()
    return row


async def find_article_by_origin(
    db: AsyncSession, origin_article_id: str
) -> Article | None:
    """Return the most recent article with the given external `origin_article_id`."""
    if not origin_article_id:
        return None
    res = await db.execute(
        select(Article)
        .where(Article.origin_article_id == origin_article_id)
        .order_by(Article.created_at.desc())
    )
    return res.scalars().first()


def persist_markdown_to_storage(article: Article) -> None:
    """Mirror the working markdown to MinIO when storage is enabled."""
    sync_content_md_to_storage(article.id, article.markdown)


def delete_article_assets(article_id: str) -> None:
    """Drop the entire `articles/{id}/` prefix from object storage if enabled."""
    if not settings.storage_enabled:
        return
    delete_objects_by_prefix(f"articles/{article_id}/")


# -------------------------- image / attachment ------------------------------


@dataclass
class StoredImage:
    path: str  # relative to article root, e.g. "images/abcd-foo.png"
    filename: str  # safe filename only
    size_bytes: int
    content_type: str


@dataclass
class StoredAttachment:
    record: ArticleAttachment
    path: str  # relative, e.g. "attachments/report.pdf"


def store_article_image(
    article_id: str,
    content: bytes,
    *,
    filename: str | None,
    content_type: str | None,
) -> StoredImage:
    """Upload bytes under `articles/{id}/images/<unique>-<safe>` and return the relative path."""
    if not settings.storage_enabled:
        raise RuntimeError("Storage not configured")
    if not content:
        raise ValueError("Empty image")
    ct = (content_type or "").lower()
    if not ct.startswith("image/"):
        raise ValueError("File is not an image")
    safe = safe_image_filename(filename, ct)
    unique = f"{uuid4().hex[:8]}-{safe}"
    rel = f"images/{unique}"
    upload_object(article_object_key(article_id, rel), content, content_type=ct)
    return StoredImage(path=rel, filename=safe, size_bytes=len(content), content_type=ct)


async def store_article_attachment(
    db: AsyncSession,
    article_id: str,
    content: bytes,
    *,
    filename: str | None,
    content_type: str | None,
) -> StoredAttachment:
    """Upload bytes under `articles/{id}/attachments/<safe>` and register an `ArticleAttachment` row."""
    if not settings.storage_enabled:
        raise RuntimeError("Storage not configured")
    if not content:
        raise ValueError("Empty attachment")
    safe = safe_attachment_filename(filename or "attachment")
    rel = f"attachments/{safe}"
    upload_object(article_object_key(article_id, rel), content, content_type=content_type)
    att = ArticleAttachment(
        id=str(uuid4()),
        article_id=article_id,
        storage_path=rel,
        original_filename=filename or safe,
        size_bytes=len(content),
        content_type=content_type,
    )
    db.add(att)
    await db.flush()
    return StoredAttachment(record=att, path=rel)


# ----------------------------- markdown rewrite -----------------------------


_MD_LINK_RE = re.compile(r"(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(\s+\"[^\"]*\")?\s*\)")


def rewrite_markdown_links(markdown: str | None, mapping: dict[str, str]) -> str | None:
    """Rewrite Markdown link/image targets whose basename matches a key in `mapping`.

    Used by the import endpoint so a client can write
        ![logo](logo.png)
    and we transparently rewrite to
        ![logo](images/abcd-logo.png)
    once the file is uploaded under that path.
    """
    if not markdown or not mapping:
        return markdown

    norm = {k.lower(): v for k, v in mapping.items()}

    def replace(match: re.Match[str]) -> str:
        bang, alt, href, title = match.group(1), match.group(2), match.group(3), match.group(4) or ""
        # Skip absolute URLs and anchors
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", href) or href.startswith(("#", "mailto:", "data:")):
            return match.group(0)
        candidate = href.split("?", 1)[0].split("#", 1)[0]
        candidate_basename = candidate.rsplit("/", 1)[-1].lstrip("./").lower()
        if not candidate_basename:
            return match.group(0)
        new_path = norm.get(candidate_basename) or norm.get(candidate.lower())
        if not new_path:
            return match.group(0)
        return f"{bang}[{alt}]({new_path}{title})"

    return _MD_LINK_RE.sub(replace, markdown)


# ------------------------------ import flow --------------------------------


@dataclass
class ImportImage:
    content: bytes
    filename: str | None
    content_type: str | None


@dataclass
class ImportAttachment:
    content: bytes
    filename: str | None
    content_type: str | None


@dataclass
class ImportResult:
    article: Article
    created: bool
    images: list[StoredImage] = field(default_factory=list)
    attachments: list[StoredAttachment] = field(default_factory=list)


async def import_article(
    db: AsyncSession,
    *,
    channel_id: str,
    name: str,
    data: ArticleData,
    images: Iterable[ImportImage] = (),
    attachments: Iterable[ImportAttachment] = (),
    upsert: bool = False,
    rewrite_links: bool = True,
) -> ImportResult:
    """Create or upsert an article together with its inline images and attachments.

    - `upsert=True` matches an existing article by `data.origin_article_id` and
      updates it instead of inserting a duplicate.
    - When `rewrite_links` is true, markdown references whose basename matches an
      uploaded image/attachment filename are rewritten to the stored relative path.
    - Storage operations require `OPENKMS_*` to be configured; if storage is
      disabled the image/attachment lists are skipped silently.
    """
    if not channel_id:
        raise ValueError("channel_id is required")
    if not name or not name.strip():
        raise ValueError("name is required")

    existing: Article | None = None
    if upsert and data.origin_article_id:
        existing = await find_article_by_origin(db, data.origin_article_id)

    if existing is not None:
        # Apply provided fields and overwrite name/channel where given.
        update_fields: dict[str, Any] = {"name": name, "channel_id": channel_id}
        for key in (
            "slug",
            "markdown",
            "metadata",
            "series_id",
            "effective_from",
            "effective_to",
            "lifecycle_status",
            "origin_article_id",
            "last_synced_at",
        ):
            value = getattr(data, key)
            if value is not None:
                update_fields[key] = value
        await update_article(db, existing, update_fields)
        article = existing
        created = False
    else:
        article = await create_article(
            db, channel_id=channel_id, name=name, data=data
        )
        created = True

    image_results: list[StoredImage] = []
    attachment_results: list[StoredAttachment] = []
    if settings.storage_enabled:
        for img in images:
            if not img.content:
                continue
            try:
                image_results.append(
                    store_article_image(
                        article.id,
                        img.content,
                        filename=img.filename,
                        content_type=img.content_type,
                    )
                )
            except (ValueError, RuntimeError):
                continue
        for att in attachments:
            if not att.content:
                continue
            try:
                attachment_results.append(
                    await store_article_attachment(
                        db,
                        article.id,
                        att.content,
                        filename=att.filename,
                        content_type=att.content_type,
                    )
                )
            except (ValueError, RuntimeError):
                continue

    if rewrite_links and article.markdown:
        mapping: dict[str, str] = {}
        for img in image_results:
            mapping[img.filename] = img.path
        for att in attachment_results:
            mapping[att.record.original_filename] = att.path
        rewritten = rewrite_markdown_links(article.markdown, mapping)
        if rewritten != article.markdown:
            article.markdown = rewritten
            await db.flush()

    persist_markdown_to_storage(article)
    return ImportResult(
        article=article,
        created=created,
        images=image_results,
        attachments=attachment_results,
    )
