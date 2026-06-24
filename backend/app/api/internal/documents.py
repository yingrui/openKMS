"""Internal document routes for pipeline workers (openkms-cli, qa-agent).

System-level updates bypass channel ACL; callers must authenticate as an internal
service client (same trust model as ``/internal-api/models/*``).
"""

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_jwt_payload, require_internal_client
from app.api.documents import _maybe_upload_page_index_from_markdown, _next_document_version_number
from app.database import get_db
from app.models.document import Document
from app.models.document_version import DocumentVersion
from app.schemas.document import (
    DocumentResponse,
    DocumentVersionCreateBody,
    DocumentVersionDetailResponse,
    MarkdownUpdateBody,
    MetadataUpdateBody,
)
from app.services.documents.pipeline_metadata_state import document_metadata_needs_extraction

router = APIRouter(
    prefix="/internal-api/documents",
    tags=["internal-documents"],
    dependencies=[Depends(require_internal_client)],
)


async def _get_document_or_404(db: AsyncSession, document_id: str) -> Document:
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/{document_id}", response_model=DocumentResponse)
async def internal_get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Read document for pipeline decisions (metadata check; no channel read ACL)."""
    doc = await _get_document_or_404(db, document_id)
    return DocumentResponse.model_validate(doc)


@router.get("/{document_id}/metadata-needs-extraction")
async def internal_document_metadata_needs_extraction(
    document_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Whether pipeline should LLM-extract metadata (schema fields all empty)."""
    from app.models.document_channel import DocumentChannel

    doc = await _get_document_or_404(db, document_id)
    schema = None
    if doc.channel_id:
        channel = await db.get(DocumentChannel, doc.channel_id)
        if channel:
            schema = channel.extraction_schema
    needs = document_metadata_needs_extraction(doc.doc_metadata, schema)
    return {"document_id": document_id, "needs_extraction": needs}


@router.put("/{document_id}/markdown", response_model=DocumentResponse)
async def internal_update_document_markdown(
    document_id: str,
    body: MarkdownUpdateBody,
    db: AsyncSession = Depends(get_db),
):
    """Sync parsed markdown during pipeline (no channel write ACL)."""
    doc = await _get_document_or_404(db, document_id)
    doc.markdown = body.markdown
    await db.commit()
    await db.refresh(doc)
    _maybe_upload_page_index_from_markdown(doc, body.markdown)
    return DocumentResponse.model_validate(doc)


@router.put("/{document_id}/metadata", response_model=DocumentResponse)
async def internal_update_document_metadata(
    document_id: str,
    body: MetadataUpdateBody,
    db: AsyncSession = Depends(get_db),
):
    """Merge extracted metadata during pipeline (no channel write ACL)."""
    doc = await _get_document_or_404(db, document_id)
    current = doc.doc_metadata or {}
    doc.doc_metadata = {**current, **body.metadata}
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.post("/{document_id}/versions", response_model=DocumentVersionDetailResponse)
async def internal_create_document_version(
    document_id: str,
    body: DocumentVersionCreateBody,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_jwt_payload),
):
    """Snapshot current markdown and metadata after pipeline (no channel write ACL)."""
    doc = await _get_document_or_404(db, document_id)
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
