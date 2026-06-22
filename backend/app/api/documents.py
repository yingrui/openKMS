"""Document API routes."""

import hashlib
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import and_, func, not_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.api.auth import get_jwt_payload, require_auth
from app.config import settings
from app.constants import DocumentStatus
from app.database import get_db
from app.i18n.errors import http_error
from app.models.api_model import ApiModel
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.models.document_relationship import DocumentRelationship
from app.models.document_version import DocumentVersion
from app.constants import DocumentRelationType
from app.schemas.document import (
    DocumentInfoUpdateBody,
    DocumentFileUrlResponse,
    DocumentListItemResponse,
    DocumentLifecycleUpdateBody,
    DocumentListResponse,
    DocumentRelationshipCreateBody,
    DocumentRelationshipEdge,
    DocumentRelationshipsResponse,
    DocumentResponse,
    DocumentVersionCreateBody,
    DocumentVersionDetailResponse,
    DocumentVersionListItem,
    DocumentVersionListResponse,
    DocumentVersionRestoreBody,
    ExtractMetadataResponse,
    MarkdownUpdateBody,
    MetadataUpdateBody,
    ParsingResultResponse,
)
from app.services.data_scope import scope_applies
from app.services.channel_scope import require_document_channel_write
from app.services.channel_list_filter import channel_subtree_ids_for_list
from app.services.document_scope import (
    document_list_predicate,
    load_document_scoped,
    require_document_read,
)
from app.services.document_lifecycle import document_current_sql
from app.services.resource_acl_constants import PERM_READ, PERM_WRITE, RT_DOCUMENT_CHANNEL
from app.services.metadata_extraction import extract_metadata, resolve_extraction_schema_for_llm
from app.services.page_index import md_to_tree_from_markdown
from app.services.document_storage import (
    document_object_key,
    document_prefix,
    get_document_object,
    legacy_document_prefix,
    resolve_document_object_key,
)
from app.services.chunked_upload import chunk_count, cleanup, reassemble, store_chunk
from app.services.storage import delete_objects_by_prefix, get_object, get_redirect_url, iter_object_keys, object_exists, upload_object

router = APIRouter(prefix="/documents", tags=["documents"], dependencies=[Depends(require_auth)])


async def _require_document_in_scope(request: Request, db: AsyncSession, doc: Document) -> None:
    try:
        await require_document_read(db, request, doc)
    except HTTPException:
        raise http_error(request, 404, "DOCUMENT_NOT_FOUND") from None


async def get_scoped_document(
    document_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Document:
    try:
        return await load_document_scoped(db, request, document_id, PERM_READ)
    except HTTPException:
        raise http_error(request, 404, "DOCUMENT_NOT_FOUND") from None


async def get_scoped_document_write(
    document_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Document:
    try:
        return await load_document_scoped(db, request, document_id, PERM_WRITE)
    except HTTPException:
        raise http_error(request, 404, "DOCUMENT_NOT_FOUND") from None


def _maybe_upload_page_index_from_markdown(doc: Document, markdown: str | None) -> None:
    """Rebuild and store page_index.json when storage is enabled and markdown is non-empty."""
    if not doc.file_hash or not settings.storage_enabled:
        return
    if not markdown or not markdown.strip():
        return
    try:
        page_index = md_to_tree_from_markdown(markdown, doc_name=doc.name or "document")
        key = document_object_key(doc.file_hash, "page_index.json")
        upload_object(key, json.dumps(page_index).encode("utf-8"), content_type="application/json")
    except Exception:
        pass


async def _next_document_version_number(db: AsyncSession, document_id: str) -> int:
    result = await db.execute(
        select(func.coalesce(func.max(DocumentVersion.version_number), 0)).where(
            DocumentVersion.document_id == document_id
        )
    )
    m = result.scalar_one()
    return int(m) + 1


def _collect_channel_and_descendants(channels: list[DocumentChannel], channel_id: str, out: set[str]) -> None:
    """Collect channel_id and all descendant channel IDs into out."""
    out.add(channel_id)
    for c in channels:
        if c.parent_id == channel_id:
            _collect_channel_and_descendants(channels, c.id, out)


@router.get("/stats")
async def get_document_stats(request: Request, db: AsyncSession = Depends(get_db)):
    """Return document counts for the documents index (e.g. total)."""
    scope_pred = await document_list_predicate(db, request)
    q = select(func.count(Document.id))
    if scope_pred is not None:
        q = q.where(scope_pred)
    result = await db.execute(q)
    total = result.scalar_one()
    return {"total": total}


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    request: Request,
    db: AsyncSession = Depends(get_db),
    channel_id: str | None = None,
    search: str | None = None,
    status: str | None = None,
    applicable: bool | None = None,
    offset: int = 0,
    limit: int = 200,
):
    """List documents, optionally filtered by channel, name search, status, or applicability. Supports pagination."""
    base_query = select(Document).options(
        load_only(
            Document.id,
            Document.name,
            Document.file_type,
            Document.size_bytes,
            Document.channel_id,
            Document.file_hash,
            Document.status,
            Document.series_id,
            Document.effective_from,
            Document.effective_to,
            Document.lifecycle_status,
            Document.created_at,
            Document.updated_at,
        )
    )
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    scope_pred = await document_list_predicate(db, request)

    if channel_id:
        try:
            ids_to_include = await channel_subtree_ids_for_list(
                db,
                request,
                channel_id=channel_id,
                channel_model=DocumentChannel,
                rt_channel=RT_DOCUMENT_CHANNEL,
                collect_descendants=_collect_channel_and_descendants,
                not_found_detail="Channel not found",
            )
        except HTTPException:
            raise http_error(request, 404, "DOCUMENT_CHANNEL_NOT_FOUND") from None
        if not ids_to_include:
            return DocumentListResponse(items=[], total=0)
        if scope_pred is not None:
            base_query = base_query.where(
                and_(Document.channel_id.in_(ids_to_include), scope_pred)
            )
        else:
            base_query = base_query.where(Document.channel_id.in_(ids_to_include))
    elif scope_pred is not None:
        base_query = base_query.where(scope_pred)

    if search:
        base_query = base_query.where(Document.name.ilike(f"%{search}%"))

    if status:
        status_val = status.strip().lower()
        try:
            DocumentStatus(status_val)
        except ValueError as e:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid status {status!r}; expected one of: {', '.join(s.value for s in DocumentStatus)}",
            ) from e
        base_query = base_query.where(Document.status == status_val)

    if applicable is not None:
        at_expr = func.now()
        current = document_current_sql(at_expr)
        base_query = base_query.where(current if applicable else not_(current))

    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one() or 0

    query = base_query.order_by(Document.created_at.desc()).offset(offset).limit(limit)
    docs_result = await db.execute(query)
    docs = list(docs_result.scalars().all())
    return DocumentListResponse(items=[DocumentListItemResponse.model_validate(d) for d in docs], total=total)


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    channel_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document: store original to S3, create record. No parsing at upload time."""
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        try:
            await require_document_channel_write(request, db, channel_id)
        except HTTPException:
            raise http_error(request, 404, "DOCUMENT_CHANNEL_NOT_FOUND") from None
    channel = await db.get(DocumentChannel, channel_id)
    if not channel:
        raise http_error(request, 404, "DOCUMENT_CHANNEL_NOT_FOUND")

    content = await file.read()
    if not content:
        raise http_error(request, 400, "DOCUMENT_EMPTY_FILE")

    filename = file.filename or "document.pdf"

    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for S3/MinIO.",
        )

    file_hash = hashlib.sha256(content).hexdigest()
    suffix = Path(filename).suffix.lower()
    ext = suffix.lstrip(".") or "bin"

    upload_object(document_object_key(file_hash, f"original.{ext}"), content)

    new_id = str(uuid4())
    doc = Document(
        id=new_id,
        name=filename,
        file_type=filename.split(".")[-1].upper() if "." in filename else "PDF",
        size_bytes=len(content),
        channel_id=channel_id,
        file_hash=file_hash,
        status=DocumentStatus.UPLOADED,
        series_id=new_id,
    )
    db.add(doc)
    await db.flush()

    ext_lower = ext.lower()
    if ext_lower == "xlsx":
        import asyncio

        from app.services.spreadsheet_preview import build_xlsx_preview

        try:
            preview, md = await asyncio.to_thread(build_xlsx_preview, content, file_hash=file_hash)
            doc.parsing_result = preview
            doc.markdown = md
            doc.status = DocumentStatus.COMPLETED
            _maybe_upload_page_index_from_markdown(doc, md)
        except Exception:
            doc.parsing_result = {
                "document_kind": "spreadsheet",
                "file_hash": file_hash,
                "error": "Could not read this workbook. The file may be corrupt or not a valid .xlsx.",
            }
            doc.status = DocumentStatus.FAILED
    elif ext_lower == "xmind":
        import asyncio

        from app.services.mindmap_preview import build_xmind_preview

        try:
            preview, md = await asyncio.to_thread(build_xmind_preview, content, file_hash=file_hash)
            doc.parsing_result = preview
            doc.markdown = md
            doc.status = DocumentStatus.COMPLETED
            _maybe_upload_page_index_from_markdown(doc, md)
        except Exception:
            doc.parsing_result = {
                "document_kind": "mindmap",
                "file_hash": file_hash,
                "error": "Could not read this mind map. The file may be corrupt or not a valid .xmind.",
            }
            doc.status = DocumentStatus.FAILED
    elif channel.auto_process and channel.pipeline_id:
        from app.models.pipeline import Pipeline
        pipeline = await db.get(Pipeline, channel.pipeline_id)
        if pipeline:
            from app.jobs.defer import defer_task
            from app.jobs.tasks import run_pipeline

            await defer_task(
                run_pipeline,
                document_id=doc.id,
                pipeline_id=pipeline.id,
                file_hash=file_hash,
                file_ext=ext,
                command=pipeline.command,
                default_args=pipeline.default_args,
                model_id=pipeline.model_id,
            )
            doc.status = DocumentStatus.PENDING

    await db.commit()
    await db.refresh(doc)

    return DocumentResponse.model_validate(doc)


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
):
    """Delete a document and its files from storage."""
    if doc.file_hash and settings.storage_enabled:
        delete_objects_by_prefix(f"{document_prefix(doc.file_hash)}/")
        delete_objects_by_prefix(f"{legacy_document_prefix(doc.file_hash)}/")

    await db.delete(doc)
    await db.commit()
    

@router.post("/{document_id}/reset-status", response_model=DocumentResponse)
async def reset_document_status(
    document_id: str,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
):
    """Reset document status to 'uploaded' if no active jobs exist for it."""
    if doc.status == DocumentStatus.UPLOADED:
        raise HTTPException(status_code=400, detail="Document is already uploaded")
    if doc.status not in (
        DocumentStatus.PENDING,
        DocumentStatus.FAILED,
        DocumentStatus.COMPLETED,
        DocumentStatus.RUNNING,
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reset document with status '{doc.status}'",
        )

    has_table = await db.execute(
        text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'procrastinate_jobs')")
    )
    if has_table.scalar():
        active = await db.execute(
            text(
                "SELECT COUNT(*) FROM procrastinate_jobs "
                "WHERE args->>'document_id' = :doc_id "
                "AND status IN ('todo', 'doing')"
            ),
            {"doc_id": document_id},
        )
        if active.scalar_one() > 0:
            raise HTTPException(
                status_code=400,
                detail="Document has active jobs. Cancel or wait for them to finish.",
            )

    doc.status = DocumentStatus.UPLOADED
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    doc: Document = Depends(get_scoped_document),
):
    """Get document by ID."""
    return DocumentResponse.model_validate(doc)


@router.patch("/{document_id}/lifecycle", response_model=DocumentResponse)
async def patch_document_lifecycle(
    document_id: str,
    body: DocumentLifecycleUpdateBody,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
):
    """Update policy lifecycle fields (series, validity window, lifecycle status)."""
    data = body.model_dump(exclude_unset=True)
    if "series_id" in data and data["series_id"] is not None:
        sid = (data["series_id"] or "").strip()
        if not sid:
            raise HTTPException(status_code=400, detail="series_id cannot be empty")
        doc.series_id = sid
    if "effective_from" in data:
        doc.effective_from = data["effective_from"]
    if "effective_to" in data:
        doc.effective_to = data["effective_to"]
    if "lifecycle_status" in data:
        doc.lifecycle_status = data["lifecycle_status"]
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.get("/{document_id}/relationships", response_model=DocumentRelationshipsResponse)
async def list_document_relationships(
    document_id: str,
    doc: Document = Depends(get_scoped_document),
    db: AsyncSession = Depends(get_db),
):
    """List edges where this document is source (outgoing) or target (incoming)."""
    out_result = await db.execute(
        select(DocumentRelationship, Document.name)
        .join(Document, DocumentRelationship.target_document_id == Document.id)
        .where(DocumentRelationship.source_document_id == document_id)
        .order_by(DocumentRelationship.created_at.desc())
    )
    outgoing: list[DocumentRelationshipEdge] = []
    for rel, peer_name in out_result.all():
        outgoing.append(
            DocumentRelationshipEdge(
                id=rel.id,
                relation_type=rel.relation_type,
                peer_document_id=rel.target_document_id,
                peer_document_name=peer_name,
                note=rel.note,
                created_at=rel.created_at,
            )
        )

    inc_result = await db.execute(
        select(DocumentRelationship, Document.name)
        .join(Document, DocumentRelationship.source_document_id == Document.id)
        .where(DocumentRelationship.target_document_id == document_id)
        .order_by(DocumentRelationship.created_at.desc())
    )
    incoming: list[DocumentRelationshipEdge] = []
    for rel, peer_name in inc_result.all():
        incoming.append(
            DocumentRelationshipEdge(
                id=rel.id,
                relation_type=rel.relation_type,
                peer_document_id=rel.source_document_id,
                peer_document_name=peer_name,
                note=rel.note,
                created_at=rel.created_at,
            )
        )

    return DocumentRelationshipsResponse(outgoing=outgoing, incoming=incoming)


@router.post("/{document_id}/relationships", response_model=DocumentRelationshipEdge)
async def create_document_relationship(
    document_id: str,
    body: DocumentRelationshipCreateBody,
    request: Request,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
):
    """Create a directed edge from this document to the target (e.g. supersedes, amends)."""
    if body.target_document_id == document_id:
        raise HTTPException(status_code=400, detail="Cannot relate a document to itself")
    try:
        DocumentRelationType(body.relation_type)
    except ValueError:
        allowed = ", ".join(sorted(x.value for x in DocumentRelationType))
        raise HTTPException(status_code=400, detail=f"relation_type must be one of: {allowed}")

    peer = await db.get(Document, body.target_document_id)
    if not peer:
        raise HTTPException(status_code=404, detail="Target document not found")
    await _require_document_in_scope(request, db, peer)

    rel = DocumentRelationship(
        id=str(uuid4()),
        source_document_id=document_id,
        target_document_id=body.target_document_id,
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
            detail="A relationship of this type between these documents already exists",
        ) from None
    await db.refresh(rel)
    return DocumentRelationshipEdge(
        id=rel.id,
        relation_type=rel.relation_type,
        peer_document_id=rel.target_document_id,
        peer_document_name=peer.name,
        note=rel.note,
        created_at=rel.created_at,
    )


@router.delete("/{document_id}/relationships/{relationship_id}", status_code=204)
async def delete_document_relationship(
    document_id: str,
    relationship_id: str,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
):
    """Delete an outgoing relationship (source must be this document)."""
    rel = await db.get(DocumentRelationship, relationship_id)
    if not rel or rel.source_document_id != document_id:
        raise HTTPException(status_code=404, detail="Relationship not found")
    await db.delete(rel)
    await db.commit()


@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: str,
    body: DocumentInfoUpdateBody,
    request: Request,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
):
    """Update document info (e.g. name, channel)."""
    if body.name is not None:
        doc.name = body.name.strip() or doc.name
    if body.channel_id is not None:
        p = request.state.openkms_jwt_payload
        sub = p.get("sub")
        if isinstance(sub, str) and scope_applies(p, sub):
            try:
                await require_document_channel_write(request, db, body.channel_id)
            except HTTPException:
                raise http_error(request, 404, "DOCUMENT_CHANNEL_NOT_FOUND") from None
        channel = await db.get(DocumentChannel, body.channel_id)
        if not channel:
            raise http_error(request, 404, "DOCUMENT_CHANNEL_NOT_FOUND")
        doc.channel_id = body.channel_id
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.put("/{document_id}/markdown", response_model=DocumentResponse)
async def update_document_markdown(
    document_id: str,
    body: MarkdownUpdateBody,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
):
    """Update document markdown in database and rebuild page index from updated content."""
    doc.markdown = body.markdown
    await db.commit()
    await db.refresh(doc)

    _maybe_upload_page_index_from_markdown(doc, body.markdown)

    return DocumentResponse.model_validate(doc)


@router.post("/{document_id}/restore-markdown", response_model=DocumentResponse)
async def restore_document_markdown(
    document_id: str,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
):
    """Restore markdown from object storage (original parsed content)."""
    if not doc.file_hash:
        raise HTTPException(status_code=400, detail="Document has no file hash; restore not available")
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
        )
    try:
        markdown = get_document_object(doc.file_hash, "markdown.md").decode("utf-8")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Markdown file not found in storage") from None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read markdown: {e}") from e
    doc.markdown = markdown
    await db.commit()
    await db.refresh(doc)

    _maybe_upload_page_index_from_markdown(doc, markdown)

    return DocumentResponse.model_validate(doc)


@router.post("/{document_id}/rebuild-page-index")
async def rebuild_page_index(
    document_id: str,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
):
    """Rebuild page index from current document markdown (DB or S3) and store in S3."""
    if not doc.file_hash:
        raise HTTPException(
            status_code=400,
            detail="Document has no file hash; page index not available",
        )
    if doc.status != DocumentStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail=f"Document must be fully parsed (status=completed). Current: {doc.status}",
        )
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
        )
    markdown = _get_document_markdown(doc)
    if not markdown:
        raise HTTPException(status_code=404, detail="Document has no markdown content")
    page_index = md_to_tree_from_markdown(markdown, doc_name=doc.name or "document")
    key = document_object_key(doc.file_hash, "page_index.json")
    upload_object(key, json.dumps(page_index).encode("utf-8"), content_type="application/json")
    return {
        "structure": page_index.get("structure", []),
        "doc_name": page_index.get("doc_name"),
    }


@router.get("/{document_id}/page-index")
async def get_document_page_index(
    document_id: str,
    doc: Document = Depends(get_scoped_document),
    db: AsyncSession = Depends(get_db),
):
    """Return PageIndex tree structure for document. Built during pipeline; served from S3."""
    if not doc.file_hash:
        raise HTTPException(
            status_code=400,
            detail="Document has no file hash; page index not available",
        )
    if doc.status != DocumentStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail=f"Document must be fully parsed (status=completed). Current: {doc.status}",
        )
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
        )
    key = resolve_document_object_key(doc.file_hash, "page_index.json")
    if not key:
        raise HTTPException(status_code=404, detail="Page index not found (re-process document to build)")
    try:
        from app.services.storage import get_object

        content = get_object(key)
        data = json.loads(content.decode("utf-8"))
        return {
            "structure": data.get("structure", []),
            "doc_name": data.get("doc_name"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read page index: {e}") from e


def _get_document_markdown(doc: Document) -> str:
    """Get document markdown from DB or S3. Raises HTTPException if not available."""
    if doc.markdown and doc.markdown.strip():
        return doc.markdown
    if not doc.file_hash or not settings.storage_enabled:
        return ""
    try:
        return get_document_object(doc.file_hash, "markdown.md").decode("utf-8")
    except FileNotFoundError:
        return ""


@router.get("/{document_id}/section")
async def get_document_section(
    document_id: str,
    start_line: int,
    end_line: int,
    doc: Document = Depends(get_scoped_document),
    db: AsyncSession = Depends(get_db),
):
    """Return a section of document markdown by line range (1-based, inclusive).
    Use with page-index structure line_num to extract specific sections."""
    if start_line < 1 or end_line < 1 or start_line > end_line:
        raise HTTPException(status_code=400, detail="Invalid start_line or end_line (must be 1-based, start <= end)")
    if end_line - start_line + 1 > 500:
        raise HTTPException(status_code=400, detail="Section too large (max 500 lines)")
    if doc.status != DocumentStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail=f"Document must be fully parsed (status=completed). Current: {doc.status}",
        )
    markdown = _get_document_markdown(doc)
    if not markdown:
        raise HTTPException(status_code=404, detail="Document has no markdown content")
    lines = markdown.split("\n")
    start_idx = max(0, start_line - 1)
    end_idx = min(len(lines), end_line)
    section = "\n".join(lines[start_idx:end_idx])
    return {"content": section, "start_line": start_line, "end_line": end_idx}


@router.post("/{document_id}/versions", response_model=DocumentVersionDetailResponse)
async def create_document_version(
    document_id: str,
    body: DocumentVersionCreateBody,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_jwt_payload),
):
    """Snapshot current markdown and metadata as a new explicit version."""
    vn = await _next_document_version_number(db, document_id)
    sub = claims.get("sub")
    uname = claims.get("preferred_username") or claims.get("name")
    dv = DocumentVersion(
        id=str(uuid4()),
        document_id=document_id,
        version_number=vn,
        tag=body.tag,
        note=body.note,
        markdown=doc.markdown,
        version_metadata=dict(doc.doc_metadata) if doc.doc_metadata else None,
        created_by_sub=sub if isinstance(sub, str) else None,
        created_by_name=uname if isinstance(uname, str) else None,
    )
    db.add(dv)
    await db.commit()
    await db.refresh(dv)
    return DocumentVersionDetailResponse.model_validate(dv)


@router.get("/{document_id}/versions", response_model=DocumentVersionListResponse)
async def list_document_versions(
    document_id: str,
    doc: Document = Depends(get_scoped_document),
    db: AsyncSession = Depends(get_db),
):
    """List explicit versions (no full markdown in list)."""
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
    )
    rows = list(result.scalars().all())
    return DocumentVersionListResponse(items=[DocumentVersionListItem.model_validate(r) for r in rows])


@router.get("/{document_id}/versions/{version_id}", response_model=DocumentVersionDetailResponse)
async def get_document_version(
    document_id: str,
    version_id: str,
    doc: Document = Depends(get_scoped_document),
    db: AsyncSession = Depends(get_db),
):
    """Full version snapshot for preview or restore confirmation."""
    dv = await db.get(DocumentVersion, version_id)
    if not dv or dv.document_id != document_id:
        raise HTTPException(status_code=404, detail="Version not found")
    return DocumentVersionDetailResponse.model_validate(dv)


@router.post("/{document_id}/versions/{version_id}/restore", response_model=DocumentResponse)
async def restore_document_version(
    document_id: str,
    version_id: str,
    body: DocumentVersionRestoreBody,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_jwt_payload),
):
    """Restore working copy markdown and metadata from a version."""
    dv = await db.get(DocumentVersion, version_id)
    if not dv or dv.document_id != document_id:
        raise HTTPException(status_code=404, detail="Version not found")

    if body.save_current_as_version:
        vn = await _next_document_version_number(db, document_id)
        sub = claims.get("sub")
        uname = claims.get("preferred_username") or claims.get("name")
        pre = DocumentVersion(
            id=str(uuid4()),
            document_id=document_id,
            version_number=vn,
            tag=body.tag,
            note=body.note,
            markdown=doc.markdown,
            version_metadata=dict(doc.doc_metadata) if doc.doc_metadata else None,
            created_by_sub=sub if isinstance(sub, str) else None,
            created_by_name=uname if isinstance(uname, str) else None,
        )
        db.add(pre)

    doc.markdown = dv.markdown
    doc.doc_metadata = dict(dv.version_metadata) if dv.version_metadata else None

    await db.commit()
    await db.refresh(doc)

    _maybe_upload_page_index_from_markdown(doc, doc.markdown)

    return DocumentResponse.model_validate(doc)


@router.put("/{document_id}/metadata", response_model=DocumentResponse)
async def update_document_metadata(
    document_id: str,
    body: MetadataUpdateBody,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
):
    """Update document metadata (partial merge)."""
    current = doc.doc_metadata or {}
    merged = {**current, **body.metadata}
    doc.doc_metadata = merged
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.post("/{document_id}/extract-metadata", response_model=ExtractMetadataResponse)
async def extract_document_metadata(
    document_id: str,
    doc: Document = Depends(get_scoped_document_write),
    db: AsyncSession = Depends(get_db),
):
    """Extract metadata from document markdown using channel's LLM."""
    if not doc.markdown or not doc.markdown.strip():
        raise HTTPException(
            status_code=400,
            detail="Document has no markdown content to extract from",
        )
    if doc.status != DocumentStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail=f"Document must be fully parsed (status=completed). Current: {doc.status}",
        )

    channel = await db.get(DocumentChannel, doc.channel_id)
    if not channel:
        raise http_error(request, 404, "DOCUMENT_CHANNEL_NOT_FOUND")

    model_id = channel.extraction_model_id or settings.extraction_model_id
    if not model_id:
        raise HTTPException(
            status_code=400,
            detail="No extraction model configured. Set extraction_model_id on the channel or OPENKMS_EXTRACTION_MODEL_ID.",
        )

    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == model_id)
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Extraction model not found")
    if model.api_kind != "chat-completions":
        raise HTTPException(status_code=400, detail="Extraction model must use api_kind chat-completions")

    schema = channel.extraction_schema if channel.extraction_schema else None
    resolved_schema, warnings = await resolve_extraction_schema_for_llm(schema, channel, db)

    try:
        extracted = await extract_metadata(doc.markdown, model, resolved_schema)
    except ValueError as e:
        msg = str(e)
        if "HTTP 401" in msg or "401" in msg:
            raise HTTPException(
                status_code=401,
                detail="LLM API authorization failed. Check the extraction model's API key in model settings.",
            )
        if "HTTP 403" in msg or "403" in msg:
            raise HTTPException(
                status_code=403,
                detail="LLM API access forbidden. Check the extraction model's API key and permissions.",
            )
        raise HTTPException(
            status_code=502,
            detail=f"Extraction failed: {msg}",
        )

    now = datetime.now(timezone.utc).isoformat()
    current = doc.doc_metadata or {}
    merged = {**current, **extracted, "extracted_at": now, "extraction_model_id": model_id}
    doc.doc_metadata = merged
    await db.commit()
    await db.refresh(doc)
    return ExtractMetadataResponse(document=DocumentResponse.model_validate(doc), warnings=warnings)


@router.get("/{document_id}/parsing", response_model=ParsingResultResponse)
async def get_parsing_result(
    document_id: str,
    doc: Document = Depends(get_scoped_document),
    db: AsyncSession = Depends(get_db),
):
    """Get document parsing result (result.json format for frontend)."""
    if not doc.parsing_result:
        raise HTTPException(status_code=404, detail="Parsing result not available")
    return ParsingResultResponse(**doc.parsing_result)


def _storage_key(file_hash: str, path: str) -> str:
    """Resolve S3 key for a logical document file path (new prefix, then legacy)."""
    key = resolve_document_object_key(file_hash, path)
    if not key:
        raise ValueError("Invalid path")
    return key


@router.get(
    "/{document_id}/files/{file_hash}/{file_path:path}",
    response_model=None,
)
async def get_document_file(
    request: Request,
    document_id: str,
    file_hash: str,
    file_path: str,
    url_only: bool = False,
    doc: Document = Depends(get_scoped_document),
):
    """Redirect to presigned S3 URL, or return that URL as JSON when url_only=true."""
    from urllib.parse import unquote

    path = unquote(file_path).lstrip("/")
    if ".." in path or not path:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not doc.file_hash or doc.file_hash.lower() != file_hash.lower():
        raise http_error(request, 404, "DOCUMENT_NOT_FOUND")

    try:
        key = _storage_key(file_hash, path)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not object_exists(key):
        raise HTTPException(status_code=404, detail="File not found")

    url = get_redirect_url(key)
    if url_only:
        return DocumentFileUrlResponse(url=url)
    return RedirectResponse(url=url, status_code=302)


@router.get("/{document_id}/export")
async def export_document_parsing(
    document_id: str,
    doc: Document = Depends(get_scoped_document),
):
    """Export all stored parsing files for a document as a zip archive."""
    if not doc.file_hash:
        raise HTTPException(status_code=400, detail="Document has no stored files")
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
        )

    new_prefix = f"{document_prefix(doc.file_hash)}/"
    legacy_prefix = f"{legacy_document_prefix(doc.file_hash)}/"

    all_keys: list[str] = []
    all_keys.extend(iter_object_keys(new_prefix))
    all_keys.extend(k for k in iter_object_keys(legacy_prefix) if k not in all_keys)

    if not all_keys:
        raise HTTPException(status_code=404, detail="No stored files found for this document")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for key in all_keys:
            try:
                content = get_object(key)
            except Exception:
                continue
            if key.startswith(new_prefix):
                arcname = key[len(new_prefix):]
            elif key.startswith(legacy_prefix):
                arcname = key[len(legacy_prefix):]
            else:
                arcname = key.rsplit("/", 1)[-1] if "/" in key else key
            if not arcname:
                continue
            zf.writestr(arcname, content)

    zip_buffer.seek(0)
    safe_name = doc.name or "document"
    safe_filename = "".join(c if c.isalnum() or c in "._-" else "_" for c in safe_name).rstrip("_") or "document"

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}-parsing.zip"'},
    )


async def _process_import_zip(
    db: AsyncSession,
    doc: Document,
    raw: bytes,
) -> Document:
    try:
        with zipfile.ZipFile(io.BytesIO(raw), "r") as zf:
            entries = [(info.filename, zf.read(info.filename)) for info in zf.infolist() if not info.is_dir()]
    except zipfile.BadZipFile as e:
        raise HTTPException(status_code=400, detail=f"Invalid zip: {e}") from e

    if not entries:
        raise HTTPException(status_code=400, detail="Zip archive is empty")

    imported_markdown: str | None = None
    imported_parsing: dict | None = None

    for filename, content in entries:
        key = document_object_key(doc.file_hash, filename)
        upload_object(key, content)
        if filename == "markdown.md":
            try:
                imported_markdown = content.decode("utf-8")
            except UnicodeDecodeError:
                pass
        elif filename == "result.json":
            try:
                imported_parsing = json.loads(content.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

    if imported_markdown:
        doc.markdown = imported_markdown
    if imported_parsing:
        doc.parsing_result = imported_parsing
    doc.status = DocumentStatus.COMPLETED

    await db.commit()
    await db.refresh(doc)

    _maybe_upload_page_index_from_markdown(doc, imported_markdown or doc.markdown)

    return doc


@router.post("/{document_id}/import", response_model=DocumentResponse)
async def import_document_parsing(
    document_id: str,
    archive: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    doc: Document = Depends(get_scoped_document_write),
):
    """Import a previously exported parsing zip, restoring stored files and document state."""
    if not doc.file_hash:
        raise HTTPException(status_code=400, detail="Document has no file hash. Upload a file first.")
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
        )

    raw = await archive.read()
    doc = await _process_import_zip(db, doc, raw)
    return DocumentResponse.model_validate(doc)


@router.post("/{document_id}/import-chunk", response_model=DocumentResponse)
async def import_document_parsing_chunked(
    document_id: str,
    archive: UploadFile = File(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    db: AsyncSession = Depends(get_db),
    doc: Document = Depends(get_scoped_document_write),
):
    """Chunked import: upload a single chunk of a previously exported parsing zip. When the last chunk arrives, reassemble and process."""
    if not doc.file_hash:
        raise HTTPException(status_code=400, detail="Document has no file hash. Upload a file first.")
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
        )
    if chunk_index < 0 or total_chunks < 1 or chunk_index >= total_chunks:
        raise HTTPException(status_code=400, detail="Invalid chunk_index or total_chunks")

    data = await archive.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty chunk")

    store_chunk(document_id, chunk_index, data)

    if chunk_count(document_id) < total_chunks:
        return DocumentResponse.model_validate(doc)

    raw = reassemble(document_id, total_chunks)
    cleanup(document_id)
    doc = await _process_import_zip(db, doc, raw)
    return DocumentResponse.model_validate(doc)


@router.post("/upload-chunk", response_model=DocumentResponse)
async def upload_document_chunked(
    request: Request,
    file_chunk: UploadFile = File(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    channel_id: str = Form(...),
    filename: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Chunked document upload. When the last chunk arrives, reassemble and process like /upload."""
    from app.services.channel_scope import require_document_channel_write

    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        try:
            await require_document_channel_write(request, db, channel_id)
        except HTTPException:
            raise http_error(request, 404, "DOCUMENT_CHANNEL_NOT_FOUND") from None

    channel = await db.get(DocumentChannel, channel_id)
    if not channel:
        raise http_error(request, 404, "DOCUMENT_CHANNEL_NOT_FOUND")
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
        )
    if chunk_index < 0 or total_chunks < 1 or chunk_index >= total_chunks:
        raise HTTPException(status_code=400, detail="Invalid chunk_index or total_chunks")

    data = await file_chunk.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty chunk")

    chunk_session_id = f"doc-upload-{chunk_index}-{total_chunks}-{channel_id}"
    # Use channel_id as session root so parallel uploads to different channels don't conflict
    session_dir = f"doc-upload-{channel_id}"
    store_chunk(session_dir, chunk_index, data)

    if chunk_count(session_dir) < total_chunks:
        return {"id": "pending"}

    raw = reassemble(session_dir, total_chunks)
    cleanup(session_dir)

    if not raw:
        raise http_error(request, 400, "DOCUMENT_EMPTY_FILE")

    file_hash = hashlib.sha256(raw).hexdigest()
    suffix = Path(filename or "document.pdf").suffix.lower()
    ext = suffix.lstrip(".") or "bin"

    upload_object(document_object_key(file_hash, f"original.{ext}"), raw)

    new_id = str(uuid4())
    doc = Document(
        id=new_id,
        name=filename or "document",
        file_type=(filename or "document.pdf").split(".")[-1].upper() if "." in (filename or "") else "PDF",
        size_bytes=len(raw),
        channel_id=channel_id,
        file_hash=file_hash,
        status=DocumentStatus.UPLOADED,
        series_id=new_id,
    )
    db.add(doc)
    await db.flush()

    ext_lower = ext.lower()
    if ext_lower == "xlsx":
        import asyncio
        from app.services.spreadsheet_preview import build_xlsx_preview
        try:
            preview, md = await asyncio.to_thread(build_xlsx_preview, raw, file_hash=file_hash)
            doc.parsing_result = preview
            doc.markdown = md
            doc.status = DocumentStatus.COMPLETED
            _maybe_upload_page_index_from_markdown(doc, md)
        except Exception:
            doc.parsing_result = {
                "document_kind": "spreadsheet",
                "file_hash": file_hash,
                "error": "Could not read this workbook. The file may be corrupt or not a valid .xlsx.",
            }
            doc.status = DocumentStatus.FAILED
    elif ext_lower == "xmind":
        import asyncio
        from app.services.mindmap_preview import build_xmind_preview
        try:
            preview, md = await asyncio.to_thread(build_xmind_preview, raw, file_hash=file_hash)
            doc.parsing_result = preview
            doc.markdown = md
            doc.status = DocumentStatus.COMPLETED
            _maybe_upload_page_index_from_markdown(doc, md)
        except Exception:
            doc.parsing_result = {
                "document_kind": "mindmap",
                "file_hash": file_hash,
                "error": "Could not read this mind map. The file may be corrupt or not a valid .xmind.",
            }
            doc.status = DocumentStatus.FAILED
    elif channel.auto_process and channel.pipeline_id:
        from app.models.pipeline import Pipeline
        pipeline = await db.get(Pipeline, channel.pipeline_id)
        if pipeline:
            from app.jobs.defer import defer_task
            from app.jobs.tasks import run_pipeline
            await defer_task(
                run_pipeline,
                document_id=doc.id,
                pipeline_id=pipeline.id,
                file_hash=file_hash,
                file_ext=ext,
                command=pipeline.command,
                default_args=pipeline.default_args,
                model_id=pipeline.model_id,
            )
            doc.status = DocumentStatus.PENDING

    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)

