"""Document API routes."""

from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi.responses import RedirectResponse

from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.schemas.document import (
    DocumentListResponse,
    DocumentResponse,
    ParsingResultResponse,
)
from app.services.document_storage import parse_and_store
from app.services.storage import delete_objects_by_prefix, get_redirect_url, object_exists

router = APIRouter(prefix="/documents", tags=["documents"])


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
    """Upload a document and parse it using the VLM server."""
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

    # Parse and store to bucket (original, images, result.json, markdown) under file_hash
    try:
        parsing_result = await parse_and_store(content, filename)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"VLM parsing failed: {str(e)}. Ensure vlm-server is running at {settings.vlm_server_url}",
        )

    # Create document record
    doc = Document(
        id=str(uuid4()),
        name=filename,
        file_type=filename.split(".")[-1].upper() if "." in filename else "PDF",
        size_bytes=len(content),
        channel_id=channel_id,
        file_hash=parsing_result.get("file_hash", ""),
        parsing_result=parsing_result,
        markdown=parsing_result.get("markdown", ""),
    )
    db.add(doc)
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

