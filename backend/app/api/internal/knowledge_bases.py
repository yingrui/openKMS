"""Internal knowledge-base routes for kb-index pipeline (openkms-cli, worker).

System-level reads/writes bypass KB and document ACL; callers must authenticate as
an internal service client (same trust model as ``/internal-api/documents/*``).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.api.auth import require_internal_client
from app.api.kb_router_deps import ensure_wiki_page_in_kb_wiki_spaces
from app.api.knowledge_bases import _base64_to_floats
from app.services.knowledge_bases.knowledge_base_read import kb_stats, kb_to_response
from app.database import get_db
from app.models.chunk import Chunk
from app.models.document import Document
from app.models.faq import FAQ
from app.models.kb_document import KBDocument
from app.models.kb_wiki_space import KBWikiSpace
from app.models.knowledge_base import KnowledgeBase
from app.models.wiki_models import WikiPage
from app.schemas.knowledge_base import (
    ChunkBatchCreateRequest,
    ChunkListResponse,
    FAQBatchEmbeddingsRequest,
    FAQListResponse,
    FAQResponse,
    KBDocumentResponse,
    KnowledgeBaseResponse,
    WikiPageForKbIndexItem,
    WikiPageForKbIndexListResponse,
)

router = APIRouter(
    prefix="/internal-api/knowledge-bases",
    tags=["internal-knowledge-bases"],
    dependencies=[Depends(require_internal_client)],
)


async def _get_kb_or_404(db: AsyncSession, kb_id: str) -> KnowledgeBase:
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
async def internal_get_knowledge_base(
    kb_id: str,
    db: AsyncSession = Depends(get_db),
):
    kb = await _get_kb_or_404(db, kb_id)
    stats = await kb_stats(db, kb.id)
    return kb_to_response(kb, stats)


@router.get("/{kb_id}/documents", response_model=list[KBDocumentResponse])
async def internal_list_kb_documents(
    kb_id: str,
    db: AsyncSession = Depends(get_db),
):
    await _get_kb_or_404(db, kb_id)
    result = await db.execute(
        select(KBDocument, Document)
        .join(Document, KBDocument.document_id == Document.id)
        .where(KBDocument.knowledge_base_id == kb_id)
        .order_by(KBDocument.created_at.desc())
    )
    return [
        KBDocumentResponse(
            id=kbd.id,
            knowledge_base_id=kbd.knowledge_base_id,
            document_id=kbd.document_id,
            document_name=doc.name,
            document_file_type=doc.file_type,
            document_status=doc.status,
            created_at=kbd.created_at,
        )
        for kbd, doc in result.all()
    ]


@router.get("/{kb_id}/wiki-pages-for-index", response_model=WikiPageForKbIndexListResponse)
async def internal_list_wiki_pages_for_kb_index(
    kb_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    wiki_space_id: str | None = Query(None, min_length=1),
    db: AsyncSession = Depends(get_db),
):
    """Paginated wiki pages from spaces linked to this KB (no wiki-space ACL filter)."""
    await _get_kb_or_404(db, kb_id)
    filters = [KBWikiSpace.knowledge_base_id == kb_id]
    if wiki_space_id:
        link = (
            await db.execute(
                select(KBWikiSpace.id).where(
                    KBWikiSpace.knowledge_base_id == kb_id,
                    KBWikiSpace.wiki_space_id == wiki_space_id,
                )
            )
        ).scalar_one_or_none()
        if not link:
            raise HTTPException(status_code=404, detail="Wiki space not linked to this knowledge base")
        filters.append(WikiPage.wiki_space_id == wiki_space_id)
    total = (await db.execute(
        select(func.count())
        .select_from(WikiPage)
        .join(KBWikiSpace, KBWikiSpace.wiki_space_id == WikiPage.wiki_space_id)
        .where(*filters)
    )).scalar_one()
    q = await db.execute(
        select(WikiPage)
        .join(KBWikiSpace, KBWikiSpace.wiki_space_id == WikiPage.wiki_space_id)
        .where(*filters)
        .order_by(WikiPage.wiki_space_id, WikiPage.path)
        .offset(offset)
        .limit(limit)
    )
    pages = list(q.scalars().all())
    items = [
        WikiPageForKbIndexItem(
            id=p.id,
            wiki_space_id=p.wiki_space_id,
            path=p.path,
            title=p.title,
            body=p.body or "",
            metadata=p.metadata_,
        )
        for p in pages
    ]
    return WikiPageForKbIndexListResponse(
        items=items,
        total=int(total),
        offset=offset,
        limit=limit,
    )


@router.get("/{kb_id}/faqs", response_model=FAQListResponse)
async def internal_list_faqs(
    kb_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    await _get_kb_or_404(db, kb_id)
    total = (await db.execute(
        select(func.count()).select_from(FAQ).where(FAQ.knowledge_base_id == kb_id)
    )).scalar_one()
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
            has_embedding=False,
            created_at=f.created_at,
            updated_at=f.updated_at,
        )
        for f, doc_name in rows
    ]
    return FAQListResponse(items=items, total=total)


@router.delete("/{kb_id}/chunks", status_code=204)
async def internal_delete_all_chunks(
    kb_id: str,
    db: AsyncSession = Depends(get_db),
):
    await _get_kb_or_404(db, kb_id)
    await db.execute(delete(Chunk).where(Chunk.knowledge_base_id == kb_id))


@router.delete("/{kb_id}/wiki-spaces/{wiki_space_id}/chunks", status_code=204)
async def internal_delete_wiki_space_chunks(
    kb_id: str,
    wiki_space_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete KB chunks whose wiki_page_id belongs to pages in this linked wiki space."""
    await _get_kb_or_404(db, kb_id)
    link = (
        await db.execute(
            select(KBWikiSpace.id).where(
                KBWikiSpace.knowledge_base_id == kb_id,
                KBWikiSpace.wiki_space_id == wiki_space_id,
            )
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Wiki space not linked to this knowledge base")
    page_ids = select(WikiPage.id).where(WikiPage.wiki_space_id == wiki_space_id)
    await db.execute(
        delete(Chunk).where(Chunk.knowledge_base_id == kb_id, Chunk.wiki_page_id.in_(page_ids))
    )


@router.post("/{kb_id}/chunks/batch", response_model=ChunkListResponse)
async def internal_create_chunks_batch(
    kb_id: str,
    body: ChunkBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Bulk create chunks with base64-encoded embeddings (no document/wiki read ACL)."""
    await _get_kb_or_404(db, kb_id)
    validated_wiki: set[str] = set()
    for item in body.items:
        embedding_floats = _base64_to_floats(item.embedding)
        wiki_pid = (item.wiki_page_id or "").strip() or None
        doc_id = (item.document_id or "").strip() or None
        if wiki_pid:
            if wiki_pid not in validated_wiki:
                await ensure_wiki_page_in_kb_wiki_spaces(db, kb_id, wiki_pid)
                validated_wiki.add(wiki_pid)
            chunk = Chunk(
                id=item.id,
                knowledge_base_id=kb_id,
                document_id=None,
                wiki_page_id=wiki_pid,
                content=item.content,
                chunk_index=item.chunk_index,
                token_count=item.token_count,
                embedding=embedding_floats,
                chunk_metadata=item.chunk_metadata,
                doc_metadata=item.doc_metadata,
            )
        else:
            chunk = Chunk(
                id=item.id,
                knowledge_base_id=kb_id,
                document_id=doc_id,
                wiki_page_id=None,
                content=item.content,
                chunk_index=item.chunk_index,
                token_count=item.token_count,
                embedding=embedding_floats,
                chunk_metadata=item.chunk_metadata,
                doc_metadata=item.doc_metadata,
            )
        db.add(chunk)
    await db.flush()
    return ChunkListResponse(items=[], total=len(body.items))


@router.put("/{kb_id}/faqs/batch-embeddings", status_code=204)
async def internal_update_faqs_embeddings_batch(
    kb_id: str,
    body: FAQBatchEmbeddingsRequest,
    db: AsyncSession = Depends(get_db),
):
    await _get_kb_or_404(db, kb_id)
    for item in body.items:
        faq = await db.get(FAQ, item.id)
        if not faq or faq.knowledge_base_id != kb_id:
            continue
        faq.embedding = _base64_to_floats(item.embedding)
        if item.doc_metadata is not None:
            faq.doc_metadata = item.doc_metadata
