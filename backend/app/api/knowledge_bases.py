"""Knowledge base management API."""
import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.chunk import Chunk
from app.models.document import Document
from app.models.faq import FAQ
from app.models.kb_document import KBDocument
from app.models.knowledge_base import KnowledgeBase
from app.schemas.knowledge_base import (
    AskRequest,
    AskResponse,
    ChunkListResponse,
    ChunkResponse,
    FAQBatchCreateRequest,
    FAQCreate,
    FAQGenerateRequest,
    FAQGenerateResult,
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
        agent_url=kb.agent_url,
        chunk_config=kb.chunk_config,
        faq_prompt=kb.faq_prompt,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
        **stats,
    )


# --- Knowledge Base CRUD ---

@router.get("", response_model=KnowledgeBaseListResponse)
async def list_knowledge_bases(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase).order_by(KnowledgeBase.created_at.desc()))
    kbs = result.scalars().all()
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
        agent_url=body.agent_url,
        chunk_config=body.chunk_config,
    )
    db.add(kb)
    await db.flush()
    await db.refresh(kb)
    stats = await _kb_stats(db, kb.id)
    return _kb_to_response(kb, stats)


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
async def get_knowledge_base(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    stats = await _kb_stats(db, kb.id)
    return _kb_to_response(kb, stats)


@router.put("/{kb_id}", response_model=KnowledgeBaseResponse)
async def update_knowledge_base(kb_id: str, body: KnowledgeBaseUpdate, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(kb, field, value)
    await db.flush()
    await db.refresh(kb)
    stats = await _kb_stats(db, kb.id)
    return _kb_to_response(kb, stats)


@router.delete("/{kb_id}", status_code=204)
async def delete_knowledge_base(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    await db.execute(delete(Chunk).where(Chunk.knowledge_base_id == kb_id))
    await db.execute(delete(FAQ).where(FAQ.knowledge_base_id == kb_id))
    await db.execute(delete(KBDocument).where(KBDocument.knowledge_base_id == kb_id))
    await db.delete(kb)


# --- KB Documents ---

@router.get("/{kb_id}/documents", response_model=list[KBDocumentResponse])
async def list_kb_documents(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
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
async def add_kb_document(kb_id: str, body: KBDocumentAdd, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
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
async def remove_kb_document(kb_id: str, document_id: str, db: AsyncSession = Depends(get_db)):
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

@router.get("/{kb_id}/faqs", response_model=list[FAQResponse])
async def list_faqs(kb_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FAQ, Document.name)
        .outerjoin(Document, FAQ.document_id == Document.id)
        .where(FAQ.knowledge_base_id == kb_id)
        .order_by(FAQ.created_at.desc())
    )
    rows = result.all()
    return [
        FAQResponse(
            id=f.id,
            knowledge_base_id=f.knowledge_base_id,
            document_id=f.document_id,
            document_name=doc_name,
            question=f.question,
            answer=f.answer,
            has_embedding=f.embedding is not None,
            created_at=f.created_at,
            updated_at=f.updated_at,
        )
        for f, doc_name in rows
    ]


@router.post("/{kb_id}/faqs", response_model=FAQResponse, status_code=201)
async def create_faq(kb_id: str, body: FAQCreate, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    faq = FAQ(
        id=str(uuid.uuid4()),
        knowledge_base_id=kb_id,
        document_id=body.document_id,
        question=body.question,
        answer=body.answer,
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
        has_embedding=False,
        created_at=faq.created_at,
        updated_at=faq.updated_at,
    )


@router.put("/{kb_id}/faqs/{faq_id}", response_model=FAQResponse)
async def update_faq(kb_id: str, faq_id: str, body: FAQUpdate, db: AsyncSession = Depends(get_db)):
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
        has_embedding=faq.embedding is not None,
        created_at=faq.created_at,
        updated_at=faq.updated_at,
    )


@router.delete("/{kb_id}/faqs/{faq_id}", status_code=204)
async def delete_faq(kb_id: str, faq_id: str, db: AsyncSession = Depends(get_db)):
    faq = await db.get(FAQ, faq_id)
    if not faq or faq.knowledge_base_id != kb_id:
        raise HTTPException(status_code=404, detail="FAQ not found")
    await db.delete(faq)


@router.post("/{kb_id}/faqs/generate", response_model=list[FAQGenerateResult])
async def generate_faqs(kb_id: str, body: FAQGenerateRequest, db: AsyncSession = Depends(get_db)):
    """Generate FAQ pairs from documents using an LLM. Returns preview only; use batch save to persist."""
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

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
        for pair in pairs:
            results.append(FAQGenerateResult(
                document_id=doc_id,
                document_name=doc.name,
                question=pair["question"],
                answer=pair["answer"],
            ))
    return results


@router.post("/{kb_id}/faqs/batch", response_model=list[FAQResponse])
async def create_faqs_batch(kb_id: str, body: FAQBatchCreateRequest, db: AsyncSession = Depends(get_db)):
    """Save selected FAQ pairs to the knowledge base."""
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    created = []
    for item in body.items:
        faq = FAQ(
            id=str(uuid.uuid4()),
            knowledge_base_id=kb_id,
            document_id=item.document_id,
            question=item.question,
            answer=item.answer,
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
    db: AsyncSession = Depends(get_db),
):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    total = (await db.execute(
        select(func.count()).select_from(Chunk).where(Chunk.knowledge_base_id == kb_id)
    )).scalar_one()
    result = await db.execute(
        select(Chunk, Document.name)
        .join(Document, Chunk.document_id == Document.id)
        .where(Chunk.knowledge_base_id == kb_id)
        .order_by(Chunk.document_id, Chunk.chunk_index)
        .offset(offset)
        .limit(limit)
    )
    items = []
    for chunk, doc_name in result.all():
        items.append(ChunkResponse(
            id=chunk.id,
            knowledge_base_id=chunk.knowledge_base_id,
            document_id=chunk.document_id,
            document_name=doc_name,
            content=chunk.content,
            chunk_index=chunk.chunk_index,
            token_count=chunk.token_count,
            has_embedding=chunk.embedding is not None,
            chunk_metadata=chunk.chunk_metadata,
            created_at=chunk.created_at,
        ))
    return ChunkListResponse(items=items, total=total)


@router.delete("/{kb_id}/chunks", status_code=204)
async def delete_all_chunks(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    await db.execute(delete(Chunk).where(Chunk.knowledge_base_id == kb_id))


# --- Semantic Search ---

@router.post("/{kb_id}/search", response_model=SearchResponse)
async def semantic_search(kb_id: str, body: SearchRequest, db: AsyncSession = Depends(get_db)):
    """Search chunks and FAQs using vector similarity."""
    from app.models.api_model import ApiModel
    from app.models.api_provider import ApiProvider
    from sqlalchemy.orm import selectinload

    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    if not kb.embedding_model_id:
        raise HTTPException(status_code=400, detail="No embedding model configured for this knowledge base")

    model_result = await db.execute(
        select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == kb.embedding_model_id)
    )
    model = model_result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=400, detail="Embedding model not found")

    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        base_url=model.provider_rel.base_url,
        api_key=model.provider_rel.api_key or "no-key",
    )
    embed_response = await client.embeddings.create(
        model=model.model_name or model.name,
        input=body.query,
    )
    query_embedding = embed_response.data[0].embedding

    results: list[SearchResult] = []

    if body.search_type in ("all", "chunks"):
        chunk_query = (
            select(
                Chunk.id,
                Chunk.content,
                Chunk.document_id,
                Document.name.label("doc_name"),
                Chunk.embedding.cosine_distance(query_embedding).label("distance"),
            )
            .join(Document, Chunk.document_id == Document.id)
            .where(Chunk.knowledge_base_id == kb_id, Chunk.embedding.isnot(None))
            .order_by("distance")
            .limit(body.top_k)
        )
        chunk_rows = (await db.execute(chunk_query)).all()
        for row in chunk_rows:
            results.append(SearchResult(
                id=row.id,
                source_type="chunk",
                content=row.content,
                score=round(1.0 - row.distance, 4),
                source_name=row.doc_name,
                document_id=row.document_id,
            ))

    if body.search_type in ("all", "faqs"):
        faq_query = (
            select(
                FAQ.id,
                FAQ.question,
                FAQ.answer,
                FAQ.document_id,
                FAQ.embedding.cosine_distance(query_embedding).label("distance"),
            )
            .where(FAQ.knowledge_base_id == kb_id, FAQ.embedding.isnot(None))
            .order_by("distance")
            .limit(body.top_k)
        )
        faq_rows = (await db.execute(faq_query)).all()
        for row in faq_rows:
            results.append(SearchResult(
                id=row.id,
                source_type="faq",
                content=f"Q: {row.question}\nA: {row.answer}",
                score=round(1.0 - row.distance, 4),
                document_id=row.document_id,
            ))

    results.sort(key=lambda r: r.score, reverse=True)
    return SearchResponse(results=results[: body.top_k], query=body.query)


# --- Ask (QA Proxy) ---

@router.post("/{kb_id}/ask", response_model=AskResponse)
async def ask_question(kb_id: str, body: AskRequest, db: AsyncSession = Depends(get_db)):
    """Forward question to the configured QA agent service."""
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
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
