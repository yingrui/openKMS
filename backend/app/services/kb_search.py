"""Knowledge base semantic search service."""
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import func

from app.models.chunk import Chunk
from app.models.document import Document
from app.models.faq import FAQ
from app.models.knowledge_base import KnowledgeBase
from app.models.api_model import ApiModel
from app.schemas.knowledge_base import SearchRequest, SearchResponse, SearchResult


def _build_metadata_key_filter_conditions(column: Any, filters: dict[str, str | list[str]]) -> Any:
    """Build SQLAlchemy conditions for metadata key filters. Matches scalar or array containment."""
    key_conds = []
    for key, val in filters.items():
        vals = val if isinstance(val, list) else [val]
        val_conds = []
        for v in vals:
            obj_expr = func.jsonb_build_object(key, v)
            arr_expr = func.jsonb_build_array(v)
            val_conds.append(
                or_(
                    column.op("@>")(obj_expr),
                    column[key].op("@>")(arr_expr),
                )
            )
        key_conds.append(or_(*val_conds))
    return and_(*key_conds) if key_conds else True


def _build_metadata_filter_conditions(column: Any, filters: dict[str, Any]) -> Any:
    """Build SQLAlchemy condition for metadata_filters using JSONB containment."""
    if not filters:
        return True
    args = []
    for k, v in filters.items():
        args.extend([k, v])
    obj_expr = func.jsonb_build_object(*args)
    return column.op("@>")(obj_expr)


async def search_knowledge_base(
    kb_id: str,
    query: str,
    *,
    top_k: int = 10,
    search_type: str = "all",
    label_filters: dict[str, str | list[str]] | None = None,
    metadata_filters: dict[str, Any] | None = None,
    db: AsyncSession | None = None,
) -> SearchResponse:
    """Search chunks and FAQs using vector similarity. Caller must provide db session."""
    if db is None:
        raise ValueError("db session is required")

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
        input=query,
    )
    query_embedding = embed_response.data[0].embedding

    results: list[SearchResult] = []

    chunk_where = [Chunk.knowledge_base_id == kb_id, Chunk.embedding.isnot(None)]
    faq_where = [FAQ.knowledge_base_id == kb_id, FAQ.embedding.isnot(None)]
    if label_filters:
        lbl_cond = _build_metadata_key_filter_conditions(Chunk.doc_metadata, label_filters)
        chunk_where.append(lbl_cond)
        faq_lbl_cond = _build_metadata_key_filter_conditions(FAQ.doc_metadata, label_filters)
        faq_where.append(faq_lbl_cond)
    if metadata_filters:
        meta_cond = _build_metadata_filter_conditions(Chunk.doc_metadata, metadata_filters)
        chunk_where.append(meta_cond)
        faq_meta_cond = _build_metadata_filter_conditions(FAQ.doc_metadata, metadata_filters)
        faq_where.append(faq_meta_cond)

    try:
        if search_type in ("all", "chunks"):
            chunk_query = (
                select(
                    Chunk.id,
                    Chunk.content,
                    Chunk.document_id,
                    Chunk.doc_metadata,
                    Document.name.label("doc_name"),
                    Chunk.embedding.cosine_distance(query_embedding).label("distance"),
                )
                .join(Document, Chunk.document_id == Document.id)
                .where(*chunk_where)
                .order_by("distance")
                .limit(top_k)
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
                    doc_metadata=row.doc_metadata,
                ))

        if search_type in ("all", "faqs"):
            faq_query = (
                select(
                    FAQ.id,
                    FAQ.question,
                    FAQ.answer,
                    FAQ.document_id,
                    FAQ.doc_metadata,
                    FAQ.embedding.cosine_distance(query_embedding).label("distance"),
                )
                .where(*faq_where)
                .order_by("distance")
                .limit(top_k)
            )
            faq_rows = (await db.execute(faq_query)).all()
            for row in faq_rows:
                results.append(SearchResult(
                    id=row.id,
                    source_type="faq",
                    content=f"Q: {row.question}\nA: {row.answer}",
                    score=round(1.0 - row.distance, 4),
                    document_id=row.document_id,
                    doc_metadata=row.doc_metadata,
                ))
    except DBAPIError as e:
        msg = str(e.orig) if e.orig else str(e)
        if "vector" in msg.lower() or "$libdir" in msg.lower():
            raise HTTPException(
                status_code=503,
                detail="Vector search requires the pgvector extension. Install it in PostgreSQL (e.g. brew install pgvector or use pgvector/pgvector Docker image), then run: CREATE EXTENSION IF NOT EXISTS vector;",
            ) from e
        raise

    results.sort(key=lambda r: r.score, reverse=True)
    return SearchResponse(results=results[:top_k], query=query)
