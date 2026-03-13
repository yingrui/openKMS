"""Vector retriever: query pgvector for relevant chunks and FAQs."""
import json

import psycopg
from pgvector.psycopg import register_vector
from openai import OpenAI

from .config import settings
from .schemas import SourceItem


def _get_connection():
    conn = psycopg.connect(settings.database_url)
    register_vector(conn)
    return conn


def _get_query_embedding(query: str) -> list[float]:
    base_url = settings.embedding_base_url.rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"
    client = OpenAI(
        base_url=base_url,
        api_key=settings.embedding_api_key,
    )
    response = client.embeddings.create(
        model=settings.embedding_model_name,
        input=query,
    )
    return response.data[0].embedding


def retrieve(knowledge_base_id: str, query: str, top_k: int = 5) -> list[SourceItem]:
    """Retrieve top-K relevant chunks and FAQs from pgvector."""
    embedding = _get_query_embedding(query)
    sources: list[SourceItem] = []

    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.id, c.content, c.document_id, d.name AS doc_name,
                       c.embedding <=> %s::vector AS distance
                FROM chunks c
                JOIN documents d ON c.document_id = d.id
                WHERE c.knowledge_base_id = %s AND c.embedding IS NOT NULL
                ORDER BY distance
                LIMIT %s
                """,
                (embedding, knowledge_base_id, top_k),
            )
            for row in cur.fetchall():
                sources.append(SourceItem(
                    id=row[0],
                    source_type="chunk",
                    content=row[1],
                    score=round(1.0 - row[4], 4),
                    source_name=row[3],
                    document_id=row[2],
                ))

            cur.execute(
                """
                SELECT f.id, f.question, f.answer, f.document_id,
                       f.embedding <=> %s::vector AS distance
                FROM faqs f
                WHERE f.knowledge_base_id = %s AND f.embedding IS NOT NULL
                ORDER BY distance
                LIMIT %s
                """,
                (embedding, knowledge_base_id, top_k),
            )
            for row in cur.fetchall():
                sources.append(SourceItem(
                    id=row[0],
                    source_type="faq",
                    content=f"Q: {row[1]}\nA: {row[2]}",
                    score=round(1.0 - row[4], 4),
                    document_id=row[3],
                ))
    finally:
        conn.close()

    sources.sort(key=lambda s: s.score, reverse=True)
    return sources[:top_k]
