"""Document API routes."""

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi.responses import RedirectResponse

from app.api.auth import require_auth
from app.config import settings
from app.database import get_db
from app.models.api_model import ApiModel
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.schemas.document import (
    DocumentInfoUpdateBody,
    DocumentListResponse,
    DocumentResponse,
    MarkdownUpdateBody,
    MetadataUpdateBody,
    ParsingResultResponse,
)
from app.services.metadata_extraction import extract_metadata
from app.services.storage import delete_objects_by_prefix, get_object, get_redirect_url, object_exists, upload_object

router = APIRouter(prefix="/documents", tags=["documents"], dependencies=[Depends(require_auth)])


def _collect_channel_and_descendants(channels: list[DocumentChannel], channel_id: str, out: set[str]) -> None:
    """Collect channel_id and all descendant channel IDs into out."""
    out.add(channel_id)
    for c in channels:
        if c.parent_id == channel_id:
            _collect_channel_and_descendants(channels, c.id, out)


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    channel_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List documents in a channel and its descendants."""
    target = await db.get(DocumentChannel, channel_id)
    if not target:
        raise HTTPException(status_code=404, detail="Channel not found")

    result = await db.execute(select(DocumentChannel).order_by(DocumentChannel.sort_order))
    all_channels = list(result.scalars().all())
    ids_to_include: set[str] = set()
    _collect_channel_and_descendants(all_channels, channel_id, ids_to_include)

    docs_result = await db.execute(
        select(Document).where(Document.channel_id.in_(ids_to_include)).order_by(Document.created_at.desc())
    )
    docs = list(docs_result.scalars().all())
    return DocumentListResponse(items=[DocumentResponse.model_validate(d) for d in docs], total=len(docs))


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    channel_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document: store original to S3, create record. No parsing at upload time."""
    channel = await db.get(DocumentChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    filename = file.filename or "document.pdf"

    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for S3/MinIO.",
        )

    file_hash = hashlib.sha256(content).hexdigest()
    suffix = Path(filename).suffix.lower()
    ext = suffix.lstrip(".") or "bin"

    upload_object(f"{file_hash}/original.{ext}", content)

    initial_status = "uploaded"

    doc = Document(
        id=str(uuid4()),
        name=filename,
        file_type=filename.split(".")[-1].upper() if "." in filename else "PDF",
        size_bytes=len(content),
        channel_id=channel_id,
        file_hash=file_hash,
        status=initial_status,
    )
    db.add(doc)
    await db.flush()

    if channel.auto_process and channel.pipeline_id:
        from app.models.pipeline import Pipeline
        pipeline = await db.get(Pipeline, channel.pipeline_id)
        if pipeline:
            from app.jobs.tasks import run_pipeline
            await run_pipeline.defer_async(
                document_id=doc.id,
                pipeline_id=pipeline.id,
                file_hash=file_hash,
                file_ext=ext,
                command=pipeline.command,
                default_args=pipeline.default_args,
                model_id=pipeline.model_id,
            )
            doc.status = "pending"

    await db.commit()
    await db.refresh(doc)

    return DocumentResponse.model_validate(doc)


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a document and its files from storage."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.file_hash and settings.storage_enabled:
        delete_objects_by_prefix(f"{doc.file_hash}/")

    await db.delete(doc)
    await db.commit()
    

@router.post("/{document_id}/reset-status", response_model=DocumentResponse)
async def reset_document_status(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Reset document status to 'uploaded' if no active jobs exist for it."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.status not in ("pending", "failed"):
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

    doc.status = "uploaded"
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get document by ID."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse.model_validate(doc)


@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: str,
    body: DocumentInfoUpdateBody,
    db: AsyncSession = Depends(get_db),
):
    """Update document info (e.g. name)."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if body.name is not None:
        doc.name = body.name.strip() or doc.name
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.put("/{document_id}/markdown", response_model=DocumentResponse)
async def update_document_markdown(
    document_id: str,
    body: MarkdownUpdateBody,
    db: AsyncSession = Depends(get_db),
):
    """Update document markdown in database."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.markdown = body.markdown
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.post("/{document_id}/restore-markdown", response_model=DocumentResponse)
async def restore_document_markdown(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Restore markdown from object storage (original parsed content)."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.file_hash:
        raise HTTPException(status_code=400, detail="Document has no file hash; restore not available")
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
        )
    key = f"{doc.file_hash}/markdown.md"
    if not object_exists(key):
        raise HTTPException(status_code=404, detail="Markdown file not found in storage")
    try:
        content = get_object(key)
        markdown = content.decode("utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read markdown: {e}") from e
    doc.markdown = markdown
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.put("/{document_id}/metadata", response_model=DocumentResponse)
async def update_document_metadata(
    document_id: str,
    body: MetadataUpdateBody,
    db: AsyncSession = Depends(get_db),
):
    """Update document metadata (partial merge)."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    current = doc.doc_metadata or {}
    merged = {**current, **body.metadata}
    doc.doc_metadata = merged
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.post("/{document_id}/extract-metadata", response_model=DocumentResponse)
async def extract_document_metadata(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Extract metadata from document markdown using channel's LLM."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.markdown or not doc.markdown.strip():
        raise HTTPException(
            status_code=400,
            detail="Document has no markdown content to extract from",
        )
    if doc.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Document must be fully parsed (status=completed). Current: {doc.status}",
        )

    channel = await db.get(DocumentChannel, doc.channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    model_id = channel.extraction_model_id or settings.extraction_model_id
    if not model_id:
        raise HTTPException(
            status_code=400,
            detail="No extraction model configured. Set extraction_model_id on the channel or OPENKMS_EXTRACTION_MODEL_ID.",
        )

    model = await db.get(ApiModel, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Extraction model not found")
    if model.category != "llm":
        raise HTTPException(status_code=400, detail="Extraction model must be category=llm")

    schema = channel.extraction_schema if channel.extraction_schema else None
    try:
        extracted = await extract_metadata(doc.markdown, model, schema)
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
    return DocumentResponse.model_validate(doc)


@router.get("/{document_id}/parsing", response_model=ParsingResultResponse)
async def get_parsing_result(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get document parsing result (result.json format for frontend)."""
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.parsing_result:
        raise HTTPException(status_code=404, detail="Parsing result not available")
    return ParsingResultResponse(**doc.parsing_result)


def _storage_key(file_hash: str, path: str) -> str:
    """Build S3 key. Rejects path traversal.
    Supports both formats: 'layout_det_0.png' (relative) and '{file_hash}/layout_det_0.png' (tmp style).
    Path should be URL-decoded and stripped of leading slash before calling.
    """
    if ".." in path or path.startswith("/"):
        raise ValueError("Invalid path")
    # Path may already include file_hash (e.g. from tmp-style result.json)
    # Use case-insensitive match for hex hash prefix
    prefix = file_hash + "/"
    if path.lower().startswith(prefix.lower()):
        return path
    # Relative path: prepend file_hash
    return f"{file_hash}/{path}"


async def _document_file_hash_matches(db: AsyncSession, document_id: str, file_hash: str) -> bool:
    """Lightweight verification: document exists and file_hash matches. No full document load."""
    stmt = (
        select(1)
        .where(Document.id == document_id)
        .where(Document.file_hash.ilike(file_hash))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


@router.get("/{document_id}/files/{file_hash}/{file_path:path}")
async def get_document_file(
    document_id: str,
    file_hash: str,
    file_path: str,
    db: AsyncSession = Depends(get_db),
):
    """Redirect to presigned S3 URL. Verifies document_id+file_hash match; frontend fetches directly from S3."""
    from urllib.parse import unquote

    path = unquote(file_path).lstrip("/")
    if ".." in path or not path:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not await _document_file_hash_matches(db, document_id, file_hash):
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        key = _storage_key(file_hash, path)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not object_exists(key):
        raise HTTPException(status_code=404, detail="File not found")

    url = get_redirect_url(key)

    return RedirectResponse(url=url, status_code=302)

