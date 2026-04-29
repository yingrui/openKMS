"""S3 keys for article bundles: articles/{article_id}/..."""

from __future__ import annotations

import re

from app.config import settings
from app.services.storage import upload_object

_ARTICLE_PREFIX = "articles"


def article_bundle_prefix(article_id: str) -> str:
    if ".." in article_id or "/" in article_id:
        raise ValueError("Invalid article_id")
    return f"{_ARTICLE_PREFIX}/{article_id}"


def article_object_key(article_id: str, relative_path: str) -> str:
    """Build S3 key under articles/{id}/. Rejects traversal."""
    rel = relative_path.lstrip("/")
    if not rel or ".." in rel:
        raise ValueError("Invalid path")
    base = article_bundle_prefix(article_id)
    return f"{base}/{rel}"


def article_content_md_key(article_id: str) -> str:
    return article_object_key(article_id, "content.md")


_ALLOWED_FILE_PREFIXES = ("images/", "attachments/")
_ALLOWED_ROOT_FILES = frozenset({"content.md", "origin.html"})


def is_allowed_article_file_path(path: str) -> bool:
    """Paths allowed for authenticated GET .../files/{path}."""
    p = path.lstrip("/")
    if ".." in p or not p:
        return False
    low = p.lower()
    if any(low.startswith(pref) for pref in _ALLOWED_FILE_PREFIXES):
        return True
    seg = p.split("/", 1)[0]
    return seg in _ALLOWED_ROOT_FILES


def safe_attachment_filename(name: str) -> str:
    base = name.rsplit("/", 1)[-1].strip() or "file"
    base = re.sub(r"[^\w.\-()+ ]", "_", base)[:200]
    return base or "file"


def sync_content_md_to_storage(article_id: str, markdown: str | None) -> None:
    """Write working copy to MinIO when storage is enabled."""
    if not settings.storage_enabled:
        return
    body = (markdown or "").encode("utf-8")
    upload_object(article_content_md_key(article_id), body, content_type="text/markdown; charset=utf-8")
