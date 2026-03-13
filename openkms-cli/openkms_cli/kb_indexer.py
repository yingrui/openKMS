"""Knowledge base indexer: chunk documents, generate embeddings, store in pgvector."""
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import requests
from rich.progress import Progress, TaskID

# --- Chunking strategies ---


def _chunk_fixed_size(text: str, chunk_size: int = 512, chunk_overlap: int = 50) -> list[dict[str, Any]]:
    """Split text into fixed-size chunks by character count with overlap."""
    chunks = []
    start = 0
    idx = 0
    while start < len(text):
        end = start + chunk_size
        chunk_text = text[start:end]
        if chunk_text.strip():
            chunks.append({
                "content": chunk_text.strip(),
                "chunk_index": idx,
                "metadata": {"strategy": "fixed_size", "char_start": start, "char_end": min(end, len(text))},
            })
            idx += 1
        start = end - chunk_overlap if chunk_overlap < chunk_size else end
    return chunks


def _chunk_markdown_header(text: str, **_kwargs: Any) -> list[dict[str, Any]]:
    """Split markdown by headers (# ## ###), keeping the header with its content."""
    sections = re.split(r'(?m)^(#{1,3}\s+.+)$', text)
    chunks = []
    idx = 0
    current = ""
    current_heading = ""

    for part in sections:
        stripped = part.strip()
        if re.match(r'^#{1,3}\s+', stripped):
            if current.strip():
                chunks.append({
                    "content": current.strip(),
                    "chunk_index": idx,
                    "metadata": {"strategy": "markdown_header", "heading": current_heading},
                })
                idx += 1
            current = stripped + "\n"
            current_heading = stripped.lstrip("# ").strip()
        else:
            current += part

    if current.strip():
        chunks.append({
            "content": current.strip(),
            "chunk_index": idx,
            "metadata": {"strategy": "markdown_header", "heading": current_heading},
        })

    return chunks


def _chunk_paragraph(text: str, **_kwargs: Any) -> list[dict[str, Any]]:
    """Split text on double newlines (paragraphs)."""
    paragraphs = re.split(r'\n\s*\n', text)
    chunks = []
    idx = 0
    for para in paragraphs:
        stripped = para.strip()
        if stripped:
            chunks.append({
                "content": stripped,
                "chunk_index": idx,
                "metadata": {"strategy": "paragraph"},
            })
            idx += 1
    return chunks


CHUNKERS = {
    "fixed_size": _chunk_fixed_size,
    "markdown_header": _chunk_markdown_header,
    "paragraph": _chunk_paragraph,
}


def chunk_document(text: str, config: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Split document text into chunks based on configuration."""
    if not config:
        config = {}
    strategy = config.get("strategy", "fixed_size")
    chunker = CHUNKERS.get(strategy, _chunk_fixed_size)
    kwargs = {k: v for k, v in config.items() if k != "strategy"}
    return chunker(text, **kwargs)


# --- Embedding generation ---


def generate_embeddings(texts: list[str], model_config: dict[str, Any]) -> list[list[float]]:
    """Generate embeddings for a batch of texts using OpenAI-compatible API."""
    from openai import OpenAI

    base_url = model_config["base_url"].rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    client = OpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )

    BATCH_SIZE = 32
    all_embeddings = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        response = client.embeddings.create(
            model=model_config.get("model_name", "text-embedding-ada-002"),
            input=batch,
        )
        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)

    return all_embeddings


# --- Database operations ---


def _get_db_connection(db_url: str):
    """Create psycopg connection."""
    import psycopg
    return psycopg.connect(db_url)


def _clear_chunks(conn, kb_id: str) -> None:
    """Delete existing chunks for a knowledge base."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM chunks WHERE knowledge_base_id = %s", (kb_id,))
    conn.commit()


def _insert_chunks(conn, chunks: list[dict[str, Any]]) -> None:
    """Bulk insert chunks with embeddings into PostgreSQL."""
    if not chunks:
        return
    from pgvector.psycopg import register_vector
    register_vector(conn)

    with conn.cursor() as cur:
        for c in chunks:
            embedding = c.get("embedding")
            cur.execute(
                """INSERT INTO chunks (id, knowledge_base_id, document_id, content,
                   chunk_index, token_count, embedding, chunk_metadata, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    c["id"],
                    c["knowledge_base_id"],
                    c["document_id"],
                    c["content"],
                    c["chunk_index"],
                    c.get("token_count"),
                    embedding,
                    json.dumps(c.get("chunk_metadata")) if c.get("chunk_metadata") else None,
                    datetime.now(timezone.utc),
                ),
            )
    conn.commit()


def _update_faq_embeddings(conn, faq_updates: list[dict[str, Any]]) -> None:
    """Update FAQ rows with generated embeddings."""
    if not faq_updates:
        return
    from pgvector.psycopg import register_vector
    register_vector(conn)

    with conn.cursor() as cur:
        for fu in faq_updates:
            cur.execute(
                "UPDATE faqs SET embedding = %s WHERE id = %s",
                (fu["embedding"], fu["id"]),
            )
    conn.commit()


# --- Main indexer ---


def run_indexer(
    knowledge_base_id: str,
    api_url: str,
    db_url: str,
    token: Optional[str] = None,
    embedding_override: Optional[dict[str, Any]] = None,
    progress: Optional[Progress] = None,
    task: Optional[TaskID] = None,
) -> dict[str, int]:
    """
    Run the full indexing pipeline for a knowledge base.

    1. Fetch KB config and documents from API
    2. Chunk documents
    3. Generate embeddings
    4. Store chunks in DB
    5. Index FAQ embeddings
    """
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    base = api_url.rstrip("/")

    def _update(msg: str) -> None:
        if progress and task is not None:
            progress.update(task, description=msg)

    _update("Fetching knowledge base config...")
    kb_resp = requests.get(f"{base}/api/knowledge-bases/{knowledge_base_id}", headers=headers, timeout=30)
    if not kb_resp.ok:
        raise RuntimeError(f"Failed to fetch KB: {kb_resp.status_code} {kb_resp.text[:200]}")
    kb_data = kb_resp.json()
    chunk_config = kb_data.get("chunk_config") or {}

    if embedding_override:
        model_config = embedding_override
    else:
        embedding_model_id = kb_data.get("embedding_model_id")
        if not embedding_model_id:
            raise RuntimeError("No embedding model configured and no override provided")
        model_resp = requests.get(f"{base}/api/models/{embedding_model_id}", headers=headers, timeout=30)
        if not model_resp.ok:
            raise RuntimeError(f"Failed to fetch embedding model: {model_resp.status_code}")
        model_data = model_resp.json()
        provider_resp = requests.get(f"{base}/api/providers/{model_data['provider_id']}", headers=headers, timeout=30)
        if not provider_resp.ok:
            raise RuntimeError(f"Failed to fetch provider: {provider_resp.status_code}")
        provider_data = provider_resp.json()
        model_config = {
            "base_url": provider_data["base_url"],
            "api_key": provider_data.get("api_key", ""),
            "model_name": model_data.get("model_name") or model_data["name"],
        }

    _update("Fetching documents...")
    docs_resp = requests.get(f"{base}/api/knowledge-bases/{knowledge_base_id}/documents", headers=headers, timeout=30)
    if not docs_resp.ok:
        raise RuntimeError(f"Failed to fetch KB documents: {docs_resp.status_code}")
    kb_docs = docs_resp.json()

    all_chunks: list[dict[str, Any]] = []
    for kbd in kb_docs:
        doc_id = kbd["document_id"]
        doc_name = kbd.get("document_name", doc_id)
        _update(f"Chunking {doc_name}...")
        doc_resp = requests.get(f"{base}/api/documents/{doc_id}", headers=headers, timeout=30)
        if not doc_resp.ok:
            continue
        doc_data = doc_resp.json()
        markdown = doc_data.get("markdown") or ""
        if not markdown.strip():
            continue

        raw_chunks = chunk_document(markdown, chunk_config)
        for rc in raw_chunks:
            rc["id"] = str(uuid.uuid4())
            rc["knowledge_base_id"] = knowledge_base_id
            rc["document_id"] = doc_id
            rc["chunk_metadata"] = rc.pop("metadata", None)
            rc["token_count"] = len(rc["content"].split())
        all_chunks.extend(raw_chunks)

    _update(f"Generating embeddings for {len(all_chunks)} chunks...")
    if all_chunks:
        chunk_texts = [c["content"] for c in all_chunks]
        embeddings = generate_embeddings(chunk_texts, model_config)
        for c, emb in zip(all_chunks, embeddings):
            c["embedding"] = emb

    _update("Fetching FAQs...")
    faqs_resp = requests.get(f"{base}/api/knowledge-bases/{knowledge_base_id}/faqs", headers=headers, timeout=30)
    faqs = faqs_resp.json() if faqs_resp.ok else []

    faq_updates: list[dict[str, Any]] = []
    if faqs:
        _update(f"Generating embeddings for {len(faqs)} FAQs...")
        faq_texts = [f["question"] for f in faqs]
        faq_embeddings = generate_embeddings(faq_texts, model_config)
        for f, emb in zip(faqs, faq_embeddings):
            faq_updates.append({"id": f["id"], "embedding": emb})

    _update("Writing to database...")
    conn = _get_db_connection(db_url)
    try:
        _clear_chunks(conn, knowledge_base_id)
        _insert_chunks(conn, all_chunks)
        _update_faq_embeddings(conn, faq_updates)
    finally:
        conn.close()

    return {
        "chunks_created": len(all_chunks),
        "faqs_indexed": len(faq_updates),
    }
