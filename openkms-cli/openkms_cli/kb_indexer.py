"""Knowledge base indexer: chunk documents, generate embeddings, store in pgvector."""
import base64
import json
import re
import struct
import uuid
from pathlib import Path
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


def generate_embeddings(texts: list[str], model_config: dict[str, Any]) -> list[str]:
    """Generate embeddings using OpenAI-compatible API with base64 encoding. Returns list of base64 strings."""
    from openai import OpenAI

    base_url = model_config["base_url"].rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    client = OpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )

    BATCH_SIZE = 32
    all_embeddings: list[str] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        response = client.embeddings.create(
            model=model_config.get("model_name", "text-embedding-ada-002"),
            input=batch,
            encoding_format="base64",
        )
        for item in response.data:
            emb = item.embedding
            if isinstance(emb, str):
                all_embeddings.append(emb)
            else:
                all_embeddings.append(base64.b64encode(struct.pack(f"<{len(emb)}f", *emb)).decode("ascii"))
    return all_embeddings


# --- Label/metadata propagation ---


def _propagate_labels_metadata(
    doc_labels: dict | None,
    doc_metadata: dict | None,
    label_keys: list | None,
    metadata_keys: list | None,
) -> tuple[dict | None, dict | None]:
    """Filter document labels and metadata by KB config. Returns (labels, doc_metadata)."""
    labels = None
    if label_keys:
        filtered = {k: v for k, v in (doc_labels or {}).items() if k in label_keys}
        labels = filtered if filtered else None
    meta = None
    if metadata_keys:
        filtered = {k: v for k, v in (doc_metadata or {}).items() if k in metadata_keys}
        meta = filtered if filtered else None
    return labels, meta


# --- Main indexer ---


def run_indexer(
    knowledge_base_id: str,
    api_url: str,
    token: Optional[str] = None,
    embedding_override: Optional[dict[str, Any]] = None,
    progress: Optional[Progress] = None,
    task: Optional[TaskID] = None,
    output_dir: Path | str | None = None,
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
    label_keys = kb_data.get("label_keys") or []
    metadata_keys = kb_data.get("metadata_keys") or []

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

        doc_labels = doc_data.get("labels")
        doc_metadata = doc_data.get("metadata")  # API returns "metadata", not "doc_metadata"
        labels, doc_meta = _propagate_labels_metadata(
            doc_labels, doc_metadata, label_keys, metadata_keys
        )

        raw_chunks = chunk_document(markdown, chunk_config)
        for rc in raw_chunks:
            rc["id"] = str(uuid.uuid4())
            rc["knowledge_base_id"] = knowledge_base_id
            rc["document_id"] = doc_id
            rc["chunk_metadata"] = rc.pop("metadata", None)
            rc["token_count"] = len(rc["content"].split())
            rc["labels"] = labels
            rc["doc_metadata"] = doc_meta
        all_chunks.extend(raw_chunks)

    _update("Fetching FAQs...")
    faqs: list[dict[str, Any]] = []
    offset = 0
    limit = 200
    while True:
        faqs_resp = requests.get(
            f"{base}/api/knowledge-bases/{knowledge_base_id}/faqs",
            params={"offset": offset, "limit": limit},
            headers=headers,
            timeout=30,
        )
        if not faqs_resp.ok:
            break
        data = faqs_resp.json()
        items = data.get("items", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        faqs.extend(items)
        if len(items) < limit:
            break
        offset += limit

    def _save_chunks_to_output(
        chunks: list[dict],
        faq_items: list[dict],
        include_embeddings: bool = False,
    ) -> None:
        if not output_dir:
            return
        out = Path(output_dir)
        kb_out = out / f"kb_{knowledge_base_id}"
        kb_out.mkdir(parents=True, exist_ok=True)
        to_save = []
        for c in chunks:
            d = dict(c)
            if "embedding" in d and not include_embeddings:
                d = {k: v for k, v in d.items() if k != "embedding"}
            elif include_embeddings and c.get("embedding") is not None:
                d["embedding"] = c["embedding"]
            d["source_type"] = "chunk"
            to_save.append(d)
        for f in faq_items:
            d = {
                "source_type": "faq",
                "id": f["id"],
                "knowledge_base_id": knowledge_base_id,
                "document_id": f.get("document_id"),
                "content": f["question"],
                "answer": f["answer"],
                "chunk_index": 0,
                "chunk_metadata": {"strategy": "faq"},
            }
            if include_embeddings and f.get("embedding") is not None:
                d["embedding"] = f["embedding"]
            to_save.append(d)
        path = kb_out / "chunks.json"
        path.write_text(json.dumps(to_save, indent=2, ensure_ascii=False), encoding="utf-8")

    if output_dir:
        faq_items_pre_embed = [{"id": f["id"], "document_id": f.get("document_id"), "question": f["question"], "answer": f["answer"]} for f in faqs]
        _save_chunks_to_output(all_chunks, faq_items_pre_embed, include_embeddings=False)
        _update(f"Chunks and FAQs saved to {Path(output_dir) / f'kb_{knowledge_base_id}'}/chunks.json")

    _update(f"Generating embeddings for {len(all_chunks)} chunks...")
    if all_chunks:
        chunk_texts = [c["content"] for c in all_chunks]
        embeddings = generate_embeddings(chunk_texts, model_config)
        for c, emb in zip(all_chunks, embeddings):
            c["embedding"] = emb

    faq_updates: list[dict[str, Any]] = []
    faq_items_for_output: list[dict[str, Any]] = []
    if faqs:
        _update(f"Generating embeddings for {len(faqs)} FAQs...")
        faq_texts = [f["question"] for f in faqs]
        faq_embeddings = generate_embeddings(faq_texts, model_config)
        for f, emb in zip(faqs, faq_embeddings):
            item: dict[str, Any] = {"id": f["id"], "embedding": emb}
            doc_id = f.get("document_id")
            if doc_id and (label_keys or metadata_keys):
                doc_resp = requests.get(f"{base}/api/documents/{doc_id}", headers=headers, timeout=30)
                if doc_resp.ok:
                    doc_data = doc_resp.json()
                    lbl, dmeta = _propagate_labels_metadata(
                        doc_data.get("labels"), doc_data.get("metadata"),
                        label_keys, metadata_keys
                    )
                    if lbl is not None:
                        item["labels"] = lbl
                    if dmeta is not None:
                        item["doc_metadata"] = dmeta
            faq_updates.append(item)
            faq_items_for_output.append({**f, "embedding": emb})

    if output_dir:
        _save_chunks_to_output(all_chunks, faq_items_for_output, include_embeddings=True)

    _update("Writing to backend API...")
    del_resp = requests.delete(f"{base}/api/knowledge-bases/{knowledge_base_id}/chunks", headers=headers, timeout=60)
    if not del_resp.ok:
        raise RuntimeError(f"Failed to clear chunks: {del_resp.status_code} {del_resp.text[:200]}")

    if all_chunks:
        batch_items = [
            {
                "id": c["id"],
                "document_id": c["document_id"],
                "content": c["content"],
                "chunk_index": c["chunk_index"],
                "token_count": c.get("token_count"),
                "embedding": c["embedding"],
                "chunk_metadata": c.get("chunk_metadata"),
                "labels": c.get("labels"),
                "doc_metadata": c.get("doc_metadata"),
            }
            for c in all_chunks
        ]
        create_resp = requests.post(
            f"{base}/api/knowledge-bases/{knowledge_base_id}/chunks/batch",
            headers=headers,
            json={"items": batch_items},
            timeout=120,
        )
        if not create_resp.ok:
            raise RuntimeError(f"Failed to create chunks: {create_resp.status_code} {create_resp.text[:500]}")

    if faq_updates:
        faq_emb_items = [
            {k: v for k, v in fu.items() if k in ("id", "embedding", "labels", "doc_metadata")}
            for fu in faq_updates
        ]
        faq_resp = requests.put(
            f"{base}/api/knowledge-bases/{knowledge_base_id}/faqs/batch-embeddings",
            headers=headers,
            json={"items": faq_emb_items},
            timeout=60,
        )
        if not faq_resp.ok:
            raise RuntimeError(f"Failed to update FAQ embeddings: {faq_resp.status_code} {faq_resp.text[:200]}")

    return {
        "chunks_created": len(all_chunks),
        "faqs_indexed": len(faq_updates),
    }
