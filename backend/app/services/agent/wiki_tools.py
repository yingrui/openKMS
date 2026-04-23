"""LangChain tools for the wiki-space agent (read + optional upsert; server-side auth)."""

from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import unquote

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import jwt_payload_is_admin
from app.config import settings
from app.models.document import Document
from app.models.wiki_models import WikiPage, WikiSpace, WikiSpaceDocument
from app.services.data_resource_policy import document_passes_scoped_predicate
from app.services.data_scope import effective_wiki_space_ids, scope_applies
from app.services.page_index import md_to_tree_from_markdown
from app.services.permission_catalog import PERM_ALL, PERM_WIKIS_WRITE
from app.services.permission_resolution import resolve_oidc_permission_keys, resolve_user_permission_keys
from app.services.wiki_vault_import import upload_wiki_page_markdown_mirror


def _recompute_page_index(page: WikiPage) -> None:
    page.page_index = md_to_tree_from_markdown(page.body or "", doc_name=page.title or page.path)


def _normalize_wiki_path_for_tool(raw: str) -> tuple[str | None, str | None]:
    p = unquote(raw).strip().strip("/")
    if not p:
        return None, "Path is empty."
    for seg in p.split("/"):
        if not seg or seg in (".", ".."):
            return None, f"Invalid path segment: {seg!r}"
    return p, None


async def user_can_upsert_wiki_pages(db: AsyncSession, jwt_payload: dict[str, Any]) -> bool:
    """True if this JWT may mutate wiki pages (mirrors require_permission wikis:write logic for agent tools)."""
    if jwt_payload_is_admin(jwt_payload):
        return True
    sub = jwt_payload.get("sub")
    if sub == "local-cli":
        return True
    if not isinstance(sub, str):
        return False
    if settings.auth_mode == "local":
        perms = await resolve_user_permission_keys(db, sub)
    else:
        perms = await resolve_oidc_permission_keys(db, jwt_payload)
    if PERM_ALL in perms or PERM_WIKIS_WRITE in perms:
        return True
    return False


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


MAX_UPSERT_BODY = 500_000


async def make_wiki_tools(
    db: AsyncSession, space_id: str, jwt_payload: dict[str, Any]
) -> tuple[list[StructuredTool], bool]:
    can_write = await user_can_upsert_wiki_pages(db, jwt_payload)

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

    class _UpsertPage(BaseModel):
        page_path: str = Field(
            description="Wiki page path, e.g. `topics/my-topic` or `wiki/pages/ingest-foo` — from list_wiki_pages or a new path the user approved (no leading slash).",
        )
        title: str = Field(description="Page title to store.")
        body: str = Field(
            description="**Full** markdown for the page (replaces existing body if the path already exists).",
        )

    async def upsert_wiki_page(page_path: str, title: str, body: str) -> str:
        if not await _wiki_space_readable(db, space_id, jwt_payload):
            return "Error: wiki space not found or not accessible."
        if not can_write:
            return (
                "Error: this session has no **wikis:write** — cannot create or update pages. "
                "Use the wiki UI, openkms-cli, or a role with wikis:write."
            )
        p, err = _normalize_wiki_path_for_tool(page_path)
        if err or not p:
            return f"Error: {err or 'invalid path'}"
        if len(body) > MAX_UPSERT_BODY:
            return f"Error: body is too long (max {MAX_UPSERT_BODY} characters)."

        r = await db.execute(select(WikiPage).where(WikiPage.wiki_space_id == space_id, WikiPage.path == p))
        page = r.scalar_one_or_none()
        t = (title or "").strip() or p.split("/")[-1]
        if page:
            page.title = t
            page.body = body or ""
            _recompute_page_index(page)
        else:
            page = WikiPage(
                id=str(uuid.uuid4()),
                wiki_space_id=space_id,
                path=p,
                title=t,
                body=body or "",
                metadata_=None,
            )
            _recompute_page_index(page)
            db.add(page)
        await db.flush()
        await db.refresh(page)
        upload_wiki_page_markdown_mirror(
            space_id, page.path, page.body or "", storage_enabled=settings.storage_enabled
        )
        return f"OK: saved page `{p}` (id `{page.id}`). {len(page.body or '')} characters. Refresh the wiki editor to see changes."

    t1 = StructuredTool.from_function(
        name="list_wiki_pages",
        description="List wiki pages: path, title, and id. Use before reading a page body or choosing a path for upsert.",
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
    tools: list[StructuredTool] = [t1, t2, t3]
    if can_write:
        t4 = StructuredTool.from_function(
            name="upsert_wiki_page",
            description=(
                "Create or **replace** a page at the given openKMS `page_path` with the given `title` and full markdown `body`. "
                "Requires wikis:write. Replaces the entire page body. Use only after the user requests applying changes."
            ),
            coroutine=upsert_wiki_page,
            args_schema=_UpsertPage,
        )
        tools.append(t4)
    return tools, can_write
