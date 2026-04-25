"""Wiki spaces, pages, and file attachments API."""

from __future__ import annotations

import re
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Annotated
from urllib.parse import unquote

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.models.wiki_models import WikiFile, WikiPage, WikiSpace, WikiSpaceDocument
from app.schemas.wiki import (
    WikiFileListResponse,
    WikiFileResponse,
    WikiPageCreate,
    WikiPageListResponse,
    WikiPageResponse,
    WikiPageUpdate,
    WikiPageUpsertBody,
    WikiSpaceCreate,
    WikiSpaceDocumentLinkCreate,
    WikiSpaceDocumentLinkResponse,
    WikiSpaceDocumentListResponse,
    WikiSpaceListResponse,
    WikiSpaceResponse,
    WikiSpaceUpdate,
    WikiLinkGraphLink,
    WikiLinkGraphNode,
    WikiLinkGraphResponse,
    WikiVaultImportResponse,
    WikiVaultMarkdownFileBody,
    WikiVaultMarkdownImportResponse,
)
from app.services.data_resource_policy import document_passes_scoped_predicate
from app.services.data_scope import effective_wiki_space_ids, scope_applies
from app.services.page_index import md_to_tree_from_markdown
from app.services.permission_catalog import PERM_WIKIS_READ, PERM_WIKIS_WRITE
from app.services.storage import (
    delete_object,
    delete_objects_by_prefix,
    get_object,
    get_redirect_url,
    object_exists,
    object_last_modified,
    upload_object,
)
from app.services.wiki_link_graph import (
    build_link_graph_payload,
    graph_payload_from_json_bytes,
    graph_payload_to_json_bytes,
    link_graph_cache_key,
)
from app.services.wiki_vault_import import (
    delete_wiki_page_markdown_mirror,
    import_markdown_vault_file,
    import_vault_entries,
    iter_zip_vault_entries,
    normalize_vault_entry_path,
    upload_wiki_page_markdown_mirror,
    upsert_vault_mirror_wiki_file,
    vault_mirror_key_fits,
)

router = APIRouter(prefix="/wiki-spaces", tags=["wiki-spaces"])


def normalize_wiki_path(raw: str) -> str:
    p = unquote(raw).strip().strip("/")
    if not p:
        raise HTTPException(status_code=400, detail="Invalid wiki path")
    for seg in p.split("/"):
        if not seg or seg in (".", ".."):
            raise HTTPException(status_code=400, detail="Invalid wiki path segment")
    return p


def _safe_storage_basename(name: str) -> str:
    base = (name.rsplit("/", 1)[-1] or "file").strip() or "file"
    base = re.sub(r"[^a-zA-Z0-9._-]", "_", base)[:200]
    return base or "file"


def _recompute_page_index(page: WikiPage) -> None:
    page.page_index = md_to_tree_from_markdown(page.body or "", doc_name=page.title or page.path)


def _page_to_response(page: WikiPage) -> WikiPageResponse:
    return WikiPageResponse(
        id=page.id,
        wiki_space_id=page.wiki_space_id,
        path=page.path,
        title=page.title,
        body=page.body,
        metadata=page.metadata_,
        created_at=page.created_at,
        updated_at=page.updated_at,
    )


def _dt_to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _wiki_link_graph_from_payload(payload: dict) -> WikiLinkGraphResponse:
    sm = payload.get("source_max_updated_at")
    sm_dt: datetime | None = None
    if isinstance(sm, str):
        try:
            sm_dt = datetime.fromisoformat(sm.replace("Z", "+00:00"))
        except ValueError:
            sm_dt = None
    return WikiLinkGraphResponse(
        nodes=[WikiLinkGraphNode(**n) for n in payload.get("nodes", [])],
        links=[WikiLinkGraphLink(**l) for l in payload.get("links", [])],
        source_max_updated_at=sm_dt,
    )


async def get_wiki_space_scoped(
    space_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> WikiSpace:
    ws = await db.get(WikiSpace, space_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Wiki space not found")
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        allowed = await effective_wiki_space_ids(db, sub)
        if allowed is not None and space_id not in allowed:
            raise HTTPException(status_code=404, detail="Wiki space not found")
    return ws


async def _page_count(db: AsyncSession, space_id: str) -> int:
    q = await db.execute(select(func.count()).select_from(WikiPage).where(WikiPage.wiki_space_id == space_id))
    return int(q.scalar_one())


def _space_to_response(ws: WikiSpace, page_count: int) -> WikiSpaceResponse:
    return WikiSpaceResponse(
        id=ws.id,
        name=ws.name,
        description=ws.description,
        created_at=ws.created_at,
        updated_at=ws.updated_at,
        page_count=page_count,
    )


@router.get("", response_model=WikiSpaceListResponse, dependencies=[Depends(require_permission(PERM_WIKIS_READ))])
async def list_wiki_spaces(request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WikiSpace).order_by(WikiSpace.created_at.desc()))
    spaces = list(result.scalars().all())
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        allowed = await effective_wiki_space_ids(db, sub)
        if allowed is not None:
            if not allowed:
                return WikiSpaceListResponse(items=[], total=0)
            spaces = [s for s in spaces if s.id in allowed]
    items = []
    for s in spaces:
        items.append(_space_to_response(s, await _page_count(db, s.id)))
    return WikiSpaceListResponse(items=items, total=len(items))


@router.post(
    "",
    response_model=WikiSpaceResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def create_wiki_space(body: WikiSpaceCreate, db: AsyncSession = Depends(get_db)):
    ws = WikiSpace(
        id=str(uuid.uuid4()),
        name=body.name.strip(),
        description=body.description.strip() if body.description else None,
    )
    db.add(ws)
    await db.flush()
    await db.refresh(ws)
    return _space_to_response(ws, 0)


@router.get(
    "/{space_id}",
    response_model=WikiSpaceResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def get_wiki_space(
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    return _space_to_response(space, await _page_count(db, space.id))


@router.patch(
    "/{space_id}",
    response_model=WikiSpaceResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def patch_wiki_space(
    body: WikiSpaceUpdate,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    if body.name is not None:
        space.name = body.name.strip()
    if body.description is not None:
        space.description = body.description.strip() if body.description else None
    await db.flush()
    await db.refresh(space)
    return _space_to_response(space, await _page_count(db, space.id))


@router.delete(
    "/{space_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def delete_wiki_space(
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    prefix = f"wiki/{space.id}/"
    await db.delete(space)
    await db.flush()
    if settings.storage_enabled:
        delete_objects_by_prefix(prefix)


def _linked_doc_to_response(link: WikiSpaceDocument, doc: Document) -> WikiSpaceDocumentLinkResponse:
    return WikiSpaceDocumentLinkResponse(
        id=link.id,
        document_id=doc.id,
        name=doc.name,
        file_type=doc.file_type,
        channel_id=doc.channel_id,
        linked_at=link.created_at,
        updated_at=doc.updated_at,
    )


@router.get(
    "/{space_id}/documents",
    response_model=WikiSpaceDocumentListResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def list_wiki_space_linked_documents(
    request: Request,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    result = await db.execute(
        select(WikiSpaceDocument, Document)
        .join(Document, WikiSpaceDocument.document_id == Document.id)
        .where(WikiSpaceDocument.wiki_space_id == space.id)
        .order_by(Document.name)
    )
    rows = list(result.all())
    items: list[WikiSpaceDocumentLinkResponse] = []
    for link, doc in rows:
        if isinstance(sub, str) and await document_passes_scoped_predicate(db, p, sub, doc):
            items.append(_linked_doc_to_response(link, doc))
    return WikiSpaceDocumentListResponse(items=items, total=len(items))


@router.post(
    "/{space_id}/documents",
    response_model=WikiSpaceDocumentLinkResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def link_document_to_wiki_space(
    request: Request,
    body: WikiSpaceDocumentLinkCreate,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    doc = await db.get(Document, body.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not isinstance(sub, str) or not await document_passes_scoped_predicate(db, p, sub, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    link = WikiSpaceDocument(
        id=str(uuid.uuid4()),
        wiki_space_id=space.id,
        document_id=doc.id,
    )
    dup = await db.execute(
        select(WikiSpaceDocument).where(
            WikiSpaceDocument.wiki_space_id == space.id,
            WikiSpaceDocument.document_id == doc.id,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Document is already linked to this wiki space")
    db.add(link)
    await db.flush()
    await db.refresh(link)
    return _linked_doc_to_response(link, doc)


@router.delete(
    "/{space_id}/documents/{document_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def unlink_document_from_wiki_space(
    document_id: str,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WikiSpaceDocument).where(
            WikiSpaceDocument.wiki_space_id == space.id,
            WikiSpaceDocument.document_id == document_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.delete(link)


@router.get(
    "/{space_id}/pages",
    response_model=WikiPageListResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def list_pages(
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
    path_prefix: str | None = Query(None),
    limit: int | None = Query(None, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    filters = [WikiPage.wiki_space_id == space.id]
    if path_prefix:
        pfx = normalize_wiki_path(path_prefix)
        filters.append(or_(WikiPage.path == pfx, WikiPage.path.startswith(pfx + "/")))
    count_stmt = select(func.count()).select_from(WikiPage).where(*filters)
    total = int((await db.execute(count_stmt)).scalar_one())
    q = select(WikiPage).where(*filters).order_by(WikiPage.path)
    if limit is not None:
        q = q.offset(offset).limit(limit)
    result = await db.execute(q)
    pages = list(result.scalars().all())
    return WikiPageListResponse(
        items=[_page_to_response(p) for p in pages],
        total=total,
        limit=limit,
        offset=offset if limit is not None else 0,
    )


@router.post(
    "/{space_id}/pages",
    response_model=WikiPageResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def create_page(
    body: WikiPageCreate,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    path = normalize_wiki_path(body.path)
    existing = await db.execute(
        select(WikiPage).where(WikiPage.wiki_space_id == space.id, WikiPage.path == path)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Page path already exists in this space")
    page = WikiPage(
        id=str(uuid.uuid4()),
        wiki_space_id=space.id,
        path=path,
        title=body.title.strip(),
        body=body.body or "",
        metadata_=body.metadata,
    )
    _recompute_page_index(page)
    db.add(page)
    await db.flush()
    await db.refresh(page)
    upload_wiki_page_markdown_mirror(
        space.id, page.path, page.body or "", storage_enabled=settings.storage_enabled
    )
    return _page_to_response(page)


async def _get_page_in_space(db: AsyncSession, space_id: str, page_id: str) -> WikiPage:
    page = await db.get(WikiPage, page_id)
    if not page or page.wiki_space_id != space_id:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    return page


@router.get(
    "/{space_id}/pages/by-path/{page_path:path}",
    response_model=WikiPageResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def get_page_by_path(
    page_path: str,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    path = normalize_wiki_path(page_path)
    result = await db.execute(select(WikiPage).where(WikiPage.wiki_space_id == space.id, WikiPage.path == path))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    return _page_to_response(page)


@router.put(
    "/{space_id}/pages/by-path/{page_path:path}",
    response_model=WikiPageResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def upsert_page_by_path(
    page_path: str,
    body: WikiPageUpsertBody,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    path = normalize_wiki_path(page_path)
    result = await db.execute(select(WikiPage).where(WikiPage.wiki_space_id == space.id, WikiPage.path == path))
    page = result.scalar_one_or_none()
    if page:
        page.title = body.title.strip()
        page.body = body.body or ""
        page.metadata_ = body.metadata
        _recompute_page_index(page)
    else:
        page = WikiPage(
            id=str(uuid.uuid4()),
            wiki_space_id=space.id,
            path=path,
            title=body.title.strip(),
            body=body.body or "",
            metadata_=body.metadata,
        )
        _recompute_page_index(page)
        db.add(page)
    await db.flush()
    await db.refresh(page)
    upload_wiki_page_markdown_mirror(
        space.id, page.path, page.body or "", storage_enabled=settings.storage_enabled
    )
    return _page_to_response(page)


@router.delete(
    "/{space_id}/pages/by-path/{page_path:path}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def delete_page_by_path(
    page_path: str,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    path = normalize_wiki_path(page_path)
    result = await db.execute(select(WikiPage).where(WikiPage.wiki_space_id == space.id, WikiPage.path == path))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    wiki_path = page.path
    await db.delete(page)
    await db.flush()
    delete_wiki_page_markdown_mirror(space.id, wiki_path, storage_enabled=settings.storage_enabled)


@router.get(
    "/{space_id}/pages/{page_id}",
    response_model=WikiPageResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def get_page(
    page_id: str,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    page = await _get_page_in_space(db, space.id, page_id)
    return _page_to_response(page)


@router.patch(
    "/{space_id}/pages/{page_id}",
    response_model=WikiPageResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def patch_page(
    page_id: str,
    body: WikiPageUpdate,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    page = await _get_page_in_space(db, space.id, page_id)
    if body.title is not None:
        page.title = body.title.strip()
    if body.body is not None:
        page.body = body.body
    if body.metadata is not None:
        page.metadata_ = body.metadata
    _recompute_page_index(page)
    await db.flush()
    await db.refresh(page)
    if body.body is not None:
        upload_wiki_page_markdown_mirror(
            space.id, page.path, page.body or "", storage_enabled=settings.storage_enabled
        )
    return _page_to_response(page)


@router.delete(
    "/{space_id}/pages/{page_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def delete_page(
    page_id: str,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    page = await _get_page_in_space(db, space.id, page_id)
    wiki_path = page.path
    await db.delete(page)
    await db.flush()
    delete_wiki_page_markdown_mirror(space.id, wiki_path, storage_enabled=settings.storage_enabled)


@router.get(
    "/{space_id}/pages/{page_id}/page-index",
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def get_page_index(
    page_id: str,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    page = await _get_page_in_space(db, space.id, page_id)
    if page.page_index is not None:
        return page.page_index
    return md_to_tree_from_markdown(page.body or "", doc_name=page.title or page.path)


@router.get(
    "/{space_id}/graph",
    response_model=WikiLinkGraphResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def get_wiki_link_graph(
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Directed page graph for Graph View. Cached in S3 when storage is enabled."""
    result = await db.execute(select(WikiPage).where(WikiPage.wiki_space_id == space.id))
    pages = list(result.scalars().all())
    max_u = max((p.updated_at for p in pages), default=None) if pages else None

    cache_key = link_graph_cache_key(space.id)
    if settings.storage_enabled and pages and max_u is not None:
        lm = object_last_modified(cache_key)
        if lm is not None and _dt_to_utc(lm) >= _dt_to_utc(max_u):
            try:
                raw = get_object(cache_key)
                payload = graph_payload_from_json_bytes(raw)
                return _wiki_link_graph_from_payload(payload)
            except Exception:
                pass

    payload = build_link_graph_payload(pages)
    if settings.storage_enabled and pages:
        upload_object(cache_key, graph_payload_to_json_bytes(payload), content_type="application/json")
    return _wiki_link_graph_from_payload(payload)


@router.get(
    "/{space_id}/files",
    response_model=WikiFileListResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def list_files(
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WikiFile).where(WikiFile.wiki_space_id == space.id).order_by(WikiFile.created_at.desc())
    )
    rows = list(result.scalars().all())
    items = [
        WikiFileResponse(
            id=f.id,
            wiki_space_id=f.wiki_space_id,
            wiki_page_id=f.wiki_page_id,
            filename=f.filename,
            content_type=f.content_type,
            size_bytes=f.size_bytes,
            created_at=f.created_at,
        )
        for f in rows
    ]
    return WikiFileListResponse(items=items, total=len(items))


@router.post(
    "/{space_id}/files",
    response_model=WikiFileResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def upload_wiki_file(
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
    wiki_page_id: str | None = Form(default=None),
):
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if wiki_page_id:
        await _get_page_in_space(db, space.id, wiki_page_id)

    fid = str(uuid.uuid4())
    orig_name = (file.filename or "upload").replace("\\", "/")
    norm = normalize_vault_entry_path(orig_name)
    content_type = file.content_type

    if norm and vault_mirror_key_fits(space.id, norm):
        wf = await upsert_vault_mirror_wiki_file(
            db, space.id, norm, raw, content_type=content_type, wiki_page_id=wiki_page_id
        )
    else:
        safe = _safe_storage_basename(orig_name)
        key = f"wiki/{space.id}/files/{fid}/{safe}"
        filename_for_db = orig_name
        upload_object(key, raw, content_type=content_type)
        wf = WikiFile(
            id=fid,
            wiki_space_id=space.id,
            wiki_page_id=wiki_page_id,
            storage_key=key,
            filename=filename_for_db,
            content_type=content_type,
            size_bytes=len(raw),
        )
        db.add(wf)
    await db.flush()
    await db.refresh(wf)
    return WikiFileResponse(
        id=wf.id,
        wiki_space_id=wf.wiki_space_id,
        wiki_page_id=wf.wiki_page_id,
        filename=wf.filename,
        content_type=wf.content_type,
        size_bytes=wf.size_bytes,
        created_at=wf.created_at,
    )


async def _get_file_in_space(db: AsyncSession, space_id: str, file_id: str) -> WikiFile:
    f = await db.get(WikiFile, file_id)
    if not f or f.wiki_space_id != space_id:
        raise HTTPException(status_code=404, detail="File not found")
    return f


@router.get(
    "/{space_id}/files/{file_id}/content",
    dependencies=[Depends(require_permission(PERM_WIKIS_READ))],
)
async def get_wiki_file_content(
    file_id: str,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    wf = await _get_file_in_space(db, space.id, file_id)
    if not object_exists(wf.storage_key):
        raise HTTPException(status_code=404, detail="File not found in storage")
    url = get_redirect_url(wf.storage_key)
    return RedirectResponse(url=url, status_code=302)


@router.delete(
    "/{space_id}/files/{file_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def delete_wiki_file(
    file_id: str,
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
):
    wf = await _get_file_in_space(db, space.id, file_id)
    if settings.storage_enabled and object_exists(wf.storage_key):
        delete_object(wf.storage_key)
    await db.delete(wf)


@router.post(
    "/{space_id}/import/vault/markdown-file",
    response_model=WikiVaultMarkdownImportResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def import_vault_markdown_file(
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
    payload: WikiVaultMarkdownFileBody = Body(...),
):
    """Import one vault .md after binaries are uploaded; rewrites links using WikiFile rows in this space."""
    try:
        wiki_path, warns = await import_markdown_vault_file(
            db,
            space.id,
            payload.vault_path,
            payload.body,
            storage_enabled=settings.storage_enabled,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return WikiVaultMarkdownImportResponse(wiki_path=wiki_path, warnings=warns)


@router.post(
    "/{space_id}/import/vault",
    response_model=WikiVaultImportResponse,
    dependencies=[Depends(require_permission(PERM_WIKIS_WRITE))],
)
async def import_obsidian_vault(
    space: WikiSpace = Depends(get_wiki_space_scoped),
    db: AsyncSession = Depends(get_db),
    archive: Annotated[UploadFile | None, File()] = None,
    files: Annotated[list[UploadFile] | None, File()] = None,
):
    """
    Import an Obsidian vault folder or zip: `.md` → wiki pages (path = relative path without `.md`);
    other files → space attachments. Skips `.obsidian/`, `.trash/`, `.git/`, `__MACOSX/`.
    Send either a zip as `archive` or repeated `files` with vault-relative paths as filenames.
    """
    entries: list[tuple[str, bytes]] = []
    if archive is not None and (archive.filename or "").strip():
        raw = await archive.read()
        if raw:
            try:
                entries = iter_zip_vault_entries(raw)
            except zipfile.BadZipFile as e:
                raise HTTPException(status_code=400, detail=f"Invalid zip: {e}") from e
    if not entries and files:
        for uf in files:
            raw = await uf.read()
            fn = uf.filename or ""
            norm = normalize_vault_entry_path(fn)
            if not norm:
                continue
            entries.append((norm, raw))
    if not entries:
        raise HTTPException(
            status_code=400,
            detail="No files to import: provide a non-empty zip as 'archive' or multipart 'files' with paths.",
        )

    try:
        r = await import_vault_entries(
            db,
            space.id,
            entries,
            storage_enabled=settings.storage_enabled,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return WikiVaultImportResponse(
        pages_upserted=r.pages_upserted,
        files_uploaded=r.files_uploaded,
        skipped=r.skipped,
        warnings=r.warnings,
    )
