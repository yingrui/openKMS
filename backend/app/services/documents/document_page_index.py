"""Document page_index.json generation and version numbering."""

from __future__ import annotations

import json

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.document import Document
from app.models.document_version import DocumentVersion
from app.services.documents.document_storage import document_object_key
from app.services.storage import upload_object
from app.services.wiki.page_index import md_to_tree_from_markdown


def upload_page_index_from_markdown(doc: Document, markdown: str) -> dict:
    """Build page_index.json from markdown, store it next to the document, and return it."""
    page_index = md_to_tree_from_markdown(markdown, doc_name=doc.name or "document")
    key = document_object_key(doc.file_hash, "page_index.json")
    upload_object(key, json.dumps(page_index).encode("utf-8"), content_type="application/json")
    return page_index


def maybe_upload_page_index_from_markdown(doc: Document, markdown: str | None) -> None:
    """Best-effort rebuild when storage is enabled and markdown is non-empty."""
    if not doc.file_hash or not settings.storage_enabled:
        return
    if not markdown or not markdown.strip():
        return
    try:
        upload_page_index_from_markdown(doc, markdown)
    except Exception:
        pass


async def next_document_version_number(db: AsyncSession, document_id: str) -> int:
    result = await db.execute(
        select(func.coalesce(func.max(DocumentVersion.version_number), 0)).where(
            DocumentVersion.document_id == document_id
        )
    )
    return int(result.scalar_one()) + 1
