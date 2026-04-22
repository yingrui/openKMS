"""LangChain tools for the wiki-space agent (read-only; server-side auth)."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.wiki_models import WikiPage, WikiSpace, WikiSpaceDocument
from app.services.data_resource_policy import document_passes_scoped_predicate
from app.services.data_scope import effective_wiki_space_ids, scope_applies


async def _wiki_space_readable(db: AsyncSession, space_id: str, jwt_payload: dict[str, Any]) -> bool:
    ws = await db.get(WikiSpace, space_id)
    if not ws:
        return False
    sub = jwt_payload.get("sub")
    if isinstance(sub, str) and scope_applies(jwt_payload, sub):
        allowed = await effective_wiki_space_ids(db, sub)
        if allowed is not None and space_id not in allowed:
            return False
    return True


def make_wiki_tools(db: AsyncSession, space_id: str, jwt_payload: dict[str, Any]) -> list[StructuredTool]:
    async def list_wiki_pages() -> str:
        if not await _wiki_space_readable(db, space_id, jwt_payload):
            return "Error: wiki space not found or not accessible."
        r = await db.execute(
            select(WikiPage).where(WikiPage.wiki_space_id == space_id).order_by(WikiPage.path).limit(500)
        )
        pages = list(r.scalars().all())
        if not pages:
            return "No pages in this space."
        lines = [f"- `{p.path}` — {p.title} (page id: `{p.id}`)" for p in pages]
        return "Pages in this wiki space:\n" + "\n".join(lines)

    class _GetPage(BaseModel):
        page_id: str = Field(description="Wiki page id from list_wiki_pages")

    async def get_wiki_page(page_id: str) -> str:
        if not await _wiki_space_readable(db, space_id, jwt_payload):
            return "Error: wiki space not found or not accessible."
        page = await db.get(WikiPage, page_id)
        if not page or page.wiki_space_id != space_id:
            return f"No page with id `{page_id}` in this space."
        body = page.body or ""
        if len(body) > 14_000:
            body = body[:14_000] + "\n\n[…truncated for length…]"
        return f"**{page.title}** (`{page.path}`)\n\n{body}"

    async def list_linked_channel_documents() -> str:
        if not await _wiki_space_readable(db, space_id, jwt_payload):
            return "Error: wiki space not found or not accessible."
        r = await db.execute(
            select(WikiSpaceDocument, Document)
            .join(Document, WikiSpaceDocument.document_id == Document.id)
            .where(WikiSpaceDocument.wiki_space_id == space_id)
            .order_by(Document.name)
        )
        rows = list(r.all())
        sub = jwt_payload.get("sub")
        out: list[str] = []
        for _link, doc in rows:
            if isinstance(sub, str) and await document_passes_scoped_predicate(db, jwt_payload, sub, doc):
                out.append(f"- {doc.name} (document_id=`{doc.id}`, type={doc.file_type})")
        if not out:
            return "No linked channel documents, or none visible with your data scope."
        return "Channel documents linked to this wiki space:\n" + "\n".join(out)

    t1 = StructuredTool.from_function(
        name="list_wiki_pages",
        description="List wiki pages: path, title, and id. Use before reading a page body.",
        coroutine=list_wiki_pages,
    )
    t2 = StructuredTool.from_function(
        name="get_wiki_page",
        description="Load markdown body of a page by `page_id` (uuid from list_wiki_pages).",
        coroutine=get_wiki_page,
        args_schema=_GetPage,
    )
    t3 = StructuredTool.from_function(
        name="list_linked_channel_documents",
        description="List channel documents linked to this wiki space (ids for cross-reference; body not loaded here).",
        coroutine=list_linked_channel_documents,
    )
    return [t1, t2, t3]
