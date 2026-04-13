"""Knowledge base management API."""
import base64
import json
import logging
import struct
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, func, select, update
from sqlalchemy import cast
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only
from sqlalchemy.dialects.postgresql import JSONB

from app.api.auth import require_auth
from app.database import get_db
from app.services.data_scope import effective_knowledge_base_ids, scope_applies
from app.models.chunk import Chunk
from app.models.document import Document
from app.models.faq import FAQ
from app.models.kb_document import KBDocument
from app.models.knowledge_base import KnowledgeBase
from app.schemas.knowledge_base import (
    AskRequest,
    AskResponse,
    ChunkBatchCreateRequest,
    ChunkListResponse,
    ChunkResponse,
    ChunkUpdate,
    FAQBatchEmbeddingsRequest,
    FAQBatchCreateRequest,
    FAQCreate,
    FAQGenerateRequest,
    FAQGenerateResult,
    FAQListResponse,
    FAQResponse,
    FAQUpdate,
    KBDocumentAdd,
    KBDocumentResponse,
    KnowledgeBaseCreate,
    KnowledgeBaseListResponse,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
    SearchRequest,
    SearchResponse,
    SearchResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/knowledge-bases",
    tags=["knowledge-bases"],
    dependencies=[Depends(require_auth)],
)


async def get_kb_scoped(
    kb_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> KnowledgeBase:
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        allowed = await effective_knowledge_base_ids(db, sub)
        if allowed is not None and kb_id not in allowed:
            raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


def _propagate_metadata(doc_metadata: dict | None, metadata_keys: list | None) -> dict | None:
    """Filter document metadata by KB config. Returns filtered doc_metadata."""
    if not metadata_keys:
        return None
    filtered = {k: v for k, v in (doc_metadata or {}).items() if k in metadata_keys}
    return filtered if filtered else None


async def _kb_stats(db: AsyncSession, kb_id: str) -> dict[str, int]:
    doc_count = (await db.execute(
        select(func.count()).select_from(KBDocument).where(KBDocument.knowledge_base_id == kb_id)
    )).scalar_one()
    faq_count = (await db.execute(
        select(func.count()).select_from(FAQ).where(FAQ.knowledge_base_id == kb_id)
    )).scalar_one()
    chunk_count = (await db.execute(
        select(func.count()).select_from(Chunk).where(Chunk.knowledge_base_id == kb_id)
    )).scalar_one()
    return {"document_count": doc_count, "faq_count": faq_count, "chunk_count": chunk_count}


def _kb_to_response(kb: KnowledgeBase, stats: dict[str, int]) -> KnowledgeBaseResponse:
    return KnowledgeBaseResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        embedding_model_id=kb.embedding_model_id,
        judge_model_id=kb.judge_model_id,
        agent_url=kb.agent_url,
        chunk_config=kb.chunk_config,
        faq_prompt=kb.faq_prompt,
        metadata_keys=kb.metadata_keys,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
        **stats,
    )


# --- Knowledge Base CRUD ---

@router.get("", response_model=KnowledgeBaseListResponse)
async def list_knowledge_bases(request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase).order_by(KnowledgeBase.created_at.desc()))
    kbs = list(result.scalars().all())
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        allowed = await effective_knowledge_base_ids(db, sub)
        if allowed is not None:
            if not allowed:
                return KnowledgeBaseListResponse(items=[], total=0)
            kbs = [kb for kb in kbs if kb.id in allowed]
    items = []
    for kb in kbs:
        stats = await _kb_stats(db, kb.id)
        items.append(_kb_to_response(kb, stats))
    return KnowledgeBaseListResponse(items=items, total=len(items))


@router.post("", response_model=KnowledgeBaseResponse, status_code=201)
async def create_knowledge_base(body: KnowledgeBaseCreate, db: AsyncSession = Depends(get_db)):
    kb = KnowledgeBase(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        embedding_model_id=body.embedding_model_id,
        judge_model_id=body.judge_model_id,
        agent_url=body.agent_url,
        chunk_config=body.chunk_config,
        faq_prompt=body.faq_prompt,
        metadata_keys=body.metadata_keys,
    )
    db.add(kb)
    await db.flush()
    await db.refresh(kb)
    stats = await _kb_stats(db, kb.id)
    return _kb_to_response(kb, stats)


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
async def get_knowledge_base(
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    stats = await _kb_stats(db, kb.id)
    return _kb_to_response(kb, stats)


@router.put("/{kb_id}", response_model=KnowledgeBaseResponse)
async def update_knowledge_base(
    kb_id: str,
    body: KnowledgeBaseUpdate,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(kb, field, value)
    await db.flush()
    await db.refresh(kb)
    stats = await _kb_stats(db, kb.id)
    return _kb_to_response(kb, stats)


@router.delete("/{kb_id}", status_code=204)
async def delete_knowledge_base(
    kb_id: str,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(Chunk).where(Chunk.knowledge_base_id == kb_id))
    await db.execute(delete(FAQ).where(FAQ.knowledge_base_id == kb_id))
    await db.execute(delete(KBDocument).where(KBDocument.knowledge_base_id == kb_id))
    await db.delete(kb)


# --- KB Documents ---

@router.get("/{kb_id}/documents", response_model=list[KBDocumentResponse])
async def list_kb_documents(
    kb_id: str,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KBDocument, Document)
        .join(Document, KBDocument.document_id == Document.id)
        .where(KBDocument.knowledge_base_id == kb_id)
        .order_by(KBDocument.created_at.desc())
    )
    items = []
    for kbd, doc in result.all():
        items.append(KBDocumentResponse(
            id=kbd.id,
            knowledge_base_id=kbd.knowledge_base_id,
            document_id=kbd.document_id,
            document_name=doc.name,
            document_file_type=doc.file_type,
            document_status=doc.status,
            created_at=kbd.created_at,
        ))
    return items


@router.post("/{kb_id}/documents", response_model=KBDocumentResponse, status_code=201)
async def add_kb_document(
    kb_id: str,
    body: KBDocumentAdd,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, body.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    existing = await db.execute(
        select(KBDocument).where(
            KBDocument.knowledge_base_id == kb_id,
            KBDocument.document_id == body.document_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Document already in knowledge base")
    kbd = KBDocument(
        id=str(uuid.uuid4()),
        knowledge_base_id=kb_id,
        document_id=body.document_id,
    )
    db.add(kbd)
    await db.flush()
    await db.refresh(kbd)
    return KBDocumentResponse(
        id=kbd.id,
        knowledge_base_id=kbd.knowledge_base_id,
        document_id=kbd.document_id,
        document_name=doc.name,
        document_file_type=doc.file_type,
        document_status=doc.status,
        created_at=kbd.created_at,
    )


@router.delete("/{kb_id}/documents/{document_id}", status_code=204)
async def remove_kb_document(
    kb_id: str,
    document_id: str,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KBDocument).where(
            KBDocument.knowledge_base_id == kb_id,
            KBDocument.document_id == document_id,
        )
    )
    kbd = result.scalar_one_or_none()
    if not kbd:
        raise HTTPException(status_code=404, detail="Document not in knowledge base")
    await db.delete(kbd)


# --- FAQs ---

@router.get("/{kb_id}/faqs", response_model=FAQListResponse)
async def list_faqs(
    kb_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(
        select(func.count()).select_from(FAQ).where(FAQ.knowledge_base_id == kb_id)
    )).scalar_one()
    # Exclude embedding column to avoid pgvector dependency when extension is not installed
    result = await db.execute(
        select(FAQ, Document.name)
        .options(load_only(FAQ.id, FAQ.knowledge_base_id, FAQ.document_id, FAQ.question, FAQ.answer, FAQ.doc_metadata, FAQ.created_at, FAQ.updated_at))
        .outerjoin(Document, FAQ.document_id == Document.id)
        .where(FAQ.knowledge_base_id == kb_id)
        .order_by(FAQ.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.all()
    items = [
        FAQResponse(
            id=f.id,
            knowledge_base_id=f.knowledge_base_id,
            document_id=f.document_id,
            document_name=doc_name,
            question=f.question,
            answer=f.answer,
            doc_metadata=f.doc_metadata,
            has_embedding=False,  # Embedding column excluded to avoid pgvector; install pgvector for accurate value
            created_at=f.created_at,
            updated_at=f.updated_at,
        )
        for f, doc_name in rows
    ]
    return FAQListResponse(items=items, total=total)


@router.post("/{kb_id}/faqs", response_model=FAQResponse, status_code=201)
async def create_faq(
    kb_id: str,
    body: FAQCreate,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    faq = FAQ(
        id=str(uuid.uuid4()),
        knowledge_base_id=kb_id,
        document_id=body.document_id,
        question=body.question,
        answer=body.answer,
        doc_metadata=body.doc_metadata,
    )
    db.add(faq)
    await db.flush()
    await db.refresh(faq)
    return FAQResponse(
        id=faq.id,
        knowledge_base_id=faq.knowledge_base_id,
        document_id=faq.document_id,
        question=faq.question,
        answer=faq.answer,
        doc_metadata=faq.doc_metadata,
        has_embedding=False,
        created_at=faq.created_at,
        updated_at=faq.updated_at,
    )


@router.put("/{kb_id}/faqs/batch-embeddings", status_code=204)
async def update_faqs_embeddings_batch(
    kb_id: str,
    body: FAQBatchEmbeddingsRequest,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Bulk update FAQ embeddings (base64-encoded). Used by kb-index pipeline. Optionally updates doc_metadata."""
    for item in body.items:
        faq = await db.get(FAQ, item.id)
        if not faq or faq.knowledge_base_id != kb_id:
            continue
        faq.embedding = _base64_to_floats(item.embedding)
        if item.doc_metadata is not None:
            faq.doc_metadata = item.doc_metadata
    await db.commit()


@router.put("/{kb_id}/faqs/{faq_id}", response_model=FAQResponse)
async def update_faq(
    kb_id: str,
    faq_id: str,
    body: FAQUpdate,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    faq = await db.get(FAQ, faq_id)
    if not faq or faq.knowledge_base_id != kb_id:
        raise HTTPException(status_code=404, detail="FAQ not found")
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(faq, field, value)
    await db.flush()
    await db.refresh(faq)
    return FAQResponse(
        id=faq.id,
        knowledge_base_id=faq.knowledge_base_id,
        document_id=faq.document_id,
        question=faq.question,
        answer=faq.answer,
        doc_metadata=faq.doc_metadata,
        has_embedding=faq.embedding is not None,
        created_at=faq.created_at,
        updated_at=faq.updated_at,
    )


@router.delete("/{kb_id}/faqs/{faq_id}", status_code=204)
async def delete_faq(
    kb_id: str,
    faq_id: str,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    faq = await db.get(FAQ, faq_id)
    if not faq or faq.knowledge_base_id != kb_id:
        raise HTTPException(status_code=404, detail="FAQ not found")
    await db.delete(faq)


@router.post("/{kb_id}/faqs/generate", response_model=list[FAQGenerateResult])
async def generate_faqs(
    kb_id: str,
    body: FAQGenerateRequest,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Generate FAQ pairs from documents using an LLM. Returns preview only; use batch save to persist."""
    from app.models.api_model import ApiModel
    from sqlalchemy.orm import selectinload

    model_result = await db.execute(
        select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == body.model_id)
    )
    model = model_result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    model_config = {
        "base_url": model.provider_rel.base_url,
        "api_key": model.provider_rel.api_key,
        "model_name": model.model_name or model.name,
    }

    from app.services.faq_generation import generate_faq_pairs

    effective_prompt = body.prompt or kb.faq_prompt
    results = []
    for doc_id in body.document_ids:
        doc = await db.get(Document, doc_id)
        if not doc or not doc.markdown:
            continue
        pairs = await generate_faq_pairs(doc.markdown, model_config, custom_prompt=effective_prompt)
        doc_meta = _propagate_metadata(doc.doc_metadata, kb.metadata_keys)
        for pair in pairs:
            results.append(FAQGenerateResult(
                document_id=doc_id,
                document_name=doc.name,
                question=pair["question"],
                answer=pair["answer"],
                doc_metadata=doc_meta,
            ))
    return results


@router.post("/{kb_id}/faqs/batch", response_model=list[FAQResponse])
async def create_faqs_batch(
    kb_id: str,
    body: FAQBatchCreateRequest,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Save selected FAQ pairs to the knowledge base."""
    created = []
    for item in body.items:
        doc_meta = item.doc_metadata
        if doc_meta is None and item.document_id:
            doc = await db.get(Document, item.document_id)
            if doc:
                doc_meta = _propagate_metadata(doc.doc_metadata, kb.metadata_keys)
        faq = FAQ(
            id=str(uuid.uuid4()),
            knowledge_base_id=kb_id,
            document_id=item.document_id,
            question=item.question,
            answer=item.answer,
            doc_metadata=doc_meta,
        )
        db.add(faq)
        await db.flush()
        await db.refresh(faq)
        created.append(FAQResponse(
            id=faq.id,
            knowledge_base_id=faq.knowledge_base_id,
            document_id=faq.document_id,
            question=faq.question,
            answer=faq.answer,
            doc_metadata=faq.doc_metadata,
            has_embedding=False,
            created_at=faq.created_at,
            updated_at=faq.updated_at,
        ))
    return created


# --- Chunks ---

@router.get("/{kb_id}/chunks", response_model=ChunkListResponse)
async def list_chunks(
    kb_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(
        select(func.count()).select_from(Chunk).where(Chunk.knowledge_base_id == kb_id)
    )).scalar_one()
    # Exclude embedding column from load to avoid transferring vector data; check IS NOT NULL for has_embedding
    result = await db.execute(
        select(
            Chunk,
            Document.name,
            Chunk.embedding.isnot(None).label("has_embedding"),
        )
        .options(load_only(
            Chunk.id, Chunk.knowledge_base_id, Chunk.document_id, Chunk.content,
            Chunk.chunk_index, Chunk.token_count, Chunk.chunk_metadata,
            Chunk.doc_metadata, Chunk.created_at
        ))
        .join(Document, Chunk.document_id == Document.id)
        .where(Chunk.knowledge_base_id == kb_id)
        .order_by(Chunk.document_id, Chunk.chunk_index)
        .offset(offset)
        .limit(limit)
    )
    items = []
    for chunk, doc_name, has_emb in result.all():
        items.append(ChunkResponse(
            id=chunk.id,
            knowledge_base_id=chunk.knowledge_base_id,
            document_id=chunk.document_id,
            document_name=doc_name,
            content=chunk.content,
            chunk_index=chunk.chunk_index,
            token_count=chunk.token_count,
            has_embedding=bool(has_emb),
            chunk_metadata=chunk.chunk_metadata,
            doc_metadata=chunk.doc_metadata,
            created_at=chunk.created_at,
        ))
    return ChunkListResponse(items=items, total=total)


@router.delete("/{kb_id}/chunks", status_code=204)
async def delete_all_chunks(
    kb_id: str,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(Chunk).where(Chunk.knowledge_base_id == kb_id))


@router.put("/{kb_id}/chunks/{chunk_id}", response_model=ChunkResponse)
async def update_chunk(
    kb_id: str,
    chunk_id: str,
    body: ChunkUpdate,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Update chunk content, labels, or doc_metadata."""
    chunk = await db.get(Chunk, chunk_id)
    if not chunk or chunk.knowledge_base_id != kb_id:
        raise HTTPException(status_code=404, detail="Chunk not found")
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(chunk, field, value)
    await db.flush()
    await db.refresh(chunk)
    doc_result = await db.execute(select(Document.name).where(Document.id == chunk.document_id))
    doc_name = doc_result.scalar_one_or_none()
    return ChunkResponse(
        id=chunk.id,
        knowledge_base_id=chunk.knowledge_base_id,
        document_id=chunk.document_id,
        document_name=doc_name,
        content=chunk.content,
        chunk_index=chunk.chunk_index,
        token_count=chunk.token_count,
        has_embedding=chunk.embedding is not None,
        chunk_metadata=chunk.chunk_metadata,
        doc_metadata=chunk.doc_metadata,
        created_at=chunk.created_at,
    )


def _base64_to_floats(b64: str) -> list[float]:
    """Decode base64-encoded float32 array to list of floats."""
    data = base64.b64decode(b64)
    n = len(data) // 4
    return list(struct.unpack(f"<{n}f", data))


@router.post("/{kb_id}/chunks/batch", response_model=ChunkListResponse)
async def create_chunks_batch(
    kb_id: str,
    body: ChunkBatchCreateRequest,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Bulk create chunks with base64-encoded embeddings. Used by kb-index pipeline."""
    items = []
    for item in body.items:
        embedding_floats = _base64_to_floats(item.embedding)
        chunk = Chunk(
            id=item.id,
            knowledge_base_id=kb_id,
            document_id=item.document_id,
            content=item.content,
            chunk_index=item.chunk_index,
            token_count=item.token_count,
            embedding=embedding_floats,
            chunk_metadata=item.chunk_metadata,
            doc_metadata=item.doc_metadata,
        )
        db.add(chunk)
        await db.flush()
        await db.refresh(chunk)
        items.append(ChunkResponse(
            id=chunk.id,
            knowledge_base_id=chunk.knowledge_base_id,
            document_id=chunk.document_id,
            content=chunk.content,
            chunk_index=chunk.chunk_index,
            token_count=chunk.token_count,
            has_embedding=True,
            chunk_metadata=chunk.chunk_metadata,
            doc_metadata=chunk.doc_metadata,
            created_at=chunk.created_at,
        ))
    return ChunkListResponse(items=items, total=len(items))


# --- Semantic Search ---

@router.post("/{kb_id}/search", response_model=SearchResponse)
async def semantic_search(
    kb_id: str,
    body: SearchRequest,
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Search chunks and FAQs using vector similarity."""
    from app.services.kb_search import search_knowledge_base

    return await search_knowledge_base(
        kb_id,
        body.query,
        top_k=body.top_k,
        search_type=body.search_type,
        label_filters=body.label_filters,
        metadata_filters=body.metadata_filters,
        db=db,
    )


# --- Ask (QA Proxy) ---

@router.post("/{kb_id}/ask", response_model=AskResponse)
async def ask_question(
    kb_id: str,
    body: AskRequest,
    token: str = Depends(require_auth),
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Forward question to the configured QA agent service."""
    if not kb.agent_url:
        raise HTTPException(status_code=400, detail="No agent URL configured for this knowledge base")

    agent_url = kb.agent_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{agent_url}/ask",
                json={
                    "knowledge_base_id": kb_id,
                    "question": body.question,
                    "conversation_history": body.conversation_history,
                    "access_token": token,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return AskResponse(
                answer=data.get("answer", ""),
                sources=[SearchResult(**s) for s in data.get("sources", [])],
            )
    except httpx.HTTPStatusError as e:
        logger.error("Agent returned error: %s %s", e.response.status_code, e.response.text[:200])
        raise HTTPException(status_code=502, detail="Agent service returned an error")
    except Exception as e:
        logger.error("Failed to reach agent at %s: %s", agent_url, e)
        raise HTTPException(status_code=502, detail="Could not reach agent service")
