"""Document API routes."""

from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.schemas.document import DocumentResponse, ParsingResultResponse
from app.services.document_parser import parse_document

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    channel_id: str = "dc1a",
    db: AsyncSession = Depends(get_db),
):
    """Upload a document and parse it using the VLM server."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    filename = file.filename or "document.pdf"

    # Parse via VLM
    try:
        parsing_result = await parse_document(content, filename)
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


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get document by ID."""
    from sqlalchemy import select

    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse.model_validate(doc)


@router.get("/{document_id}/parsing", response_model=ParsingResultResponse)
async def get_parsing_result(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get document parsing result (result.json format for frontend)."""
    from sqlalchemy import select

    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.parsing_result:
        raise HTTPException(status_code=404, detail="Parsing result not available")
    return ParsingResultResponse(**doc.parsing_result)
