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


def _chunk_fixed_size(text: str, chunk_size: int = 8000, chunk_overlap: int = 50) -> list[dict[str, Any]]:
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

_DEFAULT_CHUNK_SIZE = 8000
_DEFAULT_CHUNK_OVERLAP = 50


def _split_text_segments(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    """Split long text into segments no longer than chunk_size (character count)."""
    if chunk_size <= 0 or len(text) <= chunk_size:
        return [text] if text.strip() else []
    segments: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        segment = text[start:end].strip()
        if segment:
            segments.append(segment)
        if end >= len(text):
            break
        start = end - chunk_overlap if chunk_overlap < chunk_size else end
    return segments


def _enforce_max_chunk_size(
    chunks: list[dict[str, Any]],
    chunk_size: int,
    chunk_overlap: int,
) -> list[dict[str, Any]]:
    """Further split chunks that exceed chunk_size (markdown_header / paragraph sections)."""
    if chunk_size <= 0:
        return chunks
    out: list[dict[str, Any]] = []
    idx = 0
    for ch in chunks:
        content = ch.get("content") or ""
        base_meta = dict(ch.get("metadata") or {})
        parts = _split_text_segments(content, chunk_size, chunk_overlap)
        if not parts:
            continue
        for part_i, part in enumerate(parts):
            meta = dict(base_meta)
            if len(parts) > 1:
                meta["split_part"] = part_i
                meta["split_parts"] = len(parts)
            out.append({"content": part, "chunk_index": idx, "metadata": meta})
            idx += 1
    return out


def chunk_document(text: str, config: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Split document text into chunks based on configuration."""
    if not config:
        config = {}
    strategy = config.get("strategy", "fixed_size")
    chunker = CHUNKERS.get(strategy, _chunk_fixed_size)
    kwargs = {k: v for k, v in config.items() if k != "strategy"}
    chunks = chunker(text, **kwargs)
    chunk_size = int(config.get("chunk_size") or _DEFAULT_CHUNK_SIZE)
    chunk_overlap = int(config.get("chunk_overlap") or _DEFAULT_CHUNK_OVERLAP)
    if strategy != "fixed_size":
        chunks = _enforce_max_chunk_size(chunks, chunk_size, chunk_overlap)
    return chunks


# --- Embedding generation ---


_INTERNAL_KB_EMBEDDING_CREDENTIALS = "/internal-api/models/kb-embedding-credentials"
_INTERNAL_KB_PREFIX = "/internal-api/knowledge-bases"
_INTERNAL_DOC_PREFIX = "/internal-api/documents"
_CHUNK_UPLOAD_BATCH_SIZE = 50


def _chunk_upload_timeout(batch_size: int) -> int:
    """Per-batch HTTP read timeout (seconds); scales with payload size."""
    return max(120, 60 + batch_size * 4)


def _finalize_embedding_model_config(model_config: dict[str, Any]) -> dict[str, Any]:
    """Merge optional OPENKMS_EMBEDDING_MODEL_* env overrides on top of internal-api values."""
    from openkms_cli.settings import get_cli_settings

    cfg = get_cli_settings()
    out = dict(model_config)
    if (cfg.embedding_model_base_url or "").strip():
        out["base_url"] = (cfg.embedding_model_base_url or "").strip()
    if (cfg.embedding_model_name or "").strip():
        out["model_name"] = (cfg.embedding_model_name or "").strip()
    cfg_key = (cfg.embedding_model_api_key or "").strip()
    if cfg_key:
        out["api_key"] = cfg_key
    return out


def _require_embedding_api_key(model_config: dict[str, Any]) -> None:
    if (model_config.get("api_key") or "").strip():
        return
    raise RuntimeError(
        "Embedding API key is missing after loading credentials. "
        "Ensure the KB's embedding provider has an API key stored in openKMS, "
        "or set OPENKMS_EMBEDDING_MODEL_API_KEY in openkms-cli/.env as an override. "
        "See openkms-cli/.env.example."
    )


def _require_embedding_base_url(model_config: dict[str, Any]) -> None:
    if (model_config.get("base_url") or "").strip():
        return
    raise RuntimeError(
        "Embedding base URL is empty. Configure the embedding provider base URL in openKMS, "
        "or set OPENKMS_EMBEDDING_MODEL_BASE_URL in openkms-cli/.env."
    )


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


# --- Metadata propagation ---


def _propagate_metadata(doc_metadata: dict | None, metadata_keys: list | None) -> dict | None:
    """Filter document metadata by KB config. Returns filtered doc_metadata."""
    if not metadata_keys:
        return None
    filtered = {k: v for k, v in (doc_metadata or {}).items() if k in metadata_keys}
    return filtered if filtered else None


# --- Main indexer ---


def run_indexer(
    knowledge_base_id: str,
    api_url: str,
    auth_headers: Optional[dict[str, str]] = None,
    basic: Optional[tuple[str, str]] = None,
    progress: Optional[Progress] = None,
    task: Optional[TaskID] = None,
    output_dir: Path | str | None = None,
) -> dict[str, int]:
    """
    Run the full indexing pipeline for a knowledge base.

    1. Fetch KB config from the API; load embedding **base_url**, **model_name**, and **api_key** via
       ``GET /internal-api/models/kb-embedding-credentials`` (same authenticated pattern as VLM defaults).
    2. Chunk documents and linked wiki pages
    3. Generate embeddings
    4. Store chunks in DB
    5. Index FAQ embeddings
    """
    headers = dict(auth_headers or {})
    base = api_url.rstrip("/")

    def _update(msg: str) -> None:
        if progress and task is not None:
            progress.update(task, description=msg)

    _update("Fetching knowledge base config...")
    kb_resp = requests.get(
        f"{base}{_INTERNAL_KB_PREFIX}/{knowledge_base_id}", headers=headers, auth=basic, timeout=30
    )
    if not kb_resp.ok:
        raise RuntimeError(f"Failed to fetch KB: {kb_resp.status_code} {kb_resp.text[:200]}")
    kb_data = kb_resp.json()
    chunk_config = kb_data.get("chunk_config") or {}
    metadata_keys = kb_data.get("metadata_keys") or []
    lifecycle_index_mode = chunk_config.get("lifecycle_index_mode", "current_only")

    cred_resp = requests.get(
        f"{base}{_INTERNAL_KB_EMBEDDING_CREDENTIALS}",
        params={"knowledge_base_id": knowledge_base_id},
        headers=headers,
        auth=basic,
        timeout=30,
    )
    if not cred_resp.ok:
        raise RuntimeError(
            "Failed to fetch embedding credentials "
            f"(GET {_INTERNAL_KB_EMBEDDING_CREDENTIALS}): "
            f"{cred_resp.status_code} {cred_resp.text[:400]}"
        )
    data = cred_resp.json()
    model_config = {
        "base_url": (data.get("base_url") or "").strip(),
        "api_key": (data.get("api_key") or "").strip(),
        "model_name": (data.get("model_name") or "").strip(),
    }

    model_config = _finalize_embedding_model_config(model_config)
    _require_embedding_base_url(model_config)
    _require_embedding_api_key(model_config)

    _update("Fetching documents...")
    docs_resp = requests.get(
        f"{base}{_INTERNAL_KB_PREFIX}/{knowledge_base_id}/documents", headers=headers, auth=basic, timeout=30
    )
    if not docs_resp.ok:
        raise RuntimeError(f"Failed to fetch KB documents: {docs_resp.status_code}")
    kb_docs = docs_resp.json()

    all_chunks: list[dict[str, Any]] = []
    for kbd in kb_docs:
        doc_id = kbd["document_id"]
        doc_name = kbd.get("document_name", doc_id)
        _update(f"Chunking {doc_name}...")
        doc_resp = requests.get(f"{base}{_INTERNAL_DOC_PREFIX}/{doc_id}", headers=headers, auth=basic, timeout=30)
        if not doc_resp.ok:
            continue
        doc_data = doc_resp.json()
        if lifecycle_index_mode == "current_only" and doc_data.get("is_current_for_rag") is False:
            continue
        markdown = doc_data.get("markdown") or ""
        if not markdown.strip():
            continue

        doc_metadata = doc_data.get("metadata")  # API returns "metadata", not "doc_metadata"
        doc_meta = _propagate_metadata(doc_metadata, metadata_keys)

        raw_chunks = chunk_document(markdown, chunk_config)
        for rc in raw_chunks:
            rc["id"] = str(uuid.uuid4())
            rc["knowledge_base_id"] = knowledge_base_id
            rc["document_id"] = doc_id
            rc["wiki_page_id"] = None
            rc["chunk_metadata"] = rc.pop("metadata", None)
            rc["token_count"] = len(rc["content"].split())
            rc["doc_metadata"] = doc_meta
        all_chunks.extend(raw_chunks)

    _update("Fetching wiki pages...")
    wiki_offset = 0
    wiki_limit = 100
    while True:
        wp_resp = requests.get(
            f"{base}{_INTERNAL_KB_PREFIX}/{knowledge_base_id}/wiki-pages-for-index",
            params={"offset": wiki_offset, "limit": wiki_limit},
            headers=headers,
            auth=basic,
            timeout=120,
        )
        if not wp_resp.ok:
            raise RuntimeError(
                f"Failed to fetch wiki pages for KB index: {wp_resp.status_code} {wp_resp.text[:300]}"
            )
        wp_data = wp_resp.json()
        witems = wp_data.get("items") or []
        total_wp = int(wp_data.get("total") or 0)
        for wp in witems:
            page_id = wp["id"]
            page_label = wp.get("path") or page_id
            _update(f"Chunking wiki page {page_label}...")
            markdown = (wp.get("body") or "").strip()
            if not markdown:
                continue
            page_meta = _propagate_metadata(wp.get("metadata"), metadata_keys)
            raw_chunks = chunk_document(markdown, chunk_config)
            for rc in raw_chunks:
                meta = rc.pop("metadata", None) or {}
                if isinstance(meta, dict):
                    meta = {
                        **meta,
                        "wiki_space_id": wp.get("wiki_space_id"),
                        "wiki_path": wp.get("path"),
                    }
                rc["id"] = str(uuid.uuid4())
                rc["knowledge_base_id"] = knowledge_base_id
                rc["document_id"] = None
                rc["wiki_page_id"] = page_id
                rc["chunk_metadata"] = meta
                rc["token_count"] = len(rc["content"].split())
                rc["doc_metadata"] = page_meta
            all_chunks.extend(raw_chunks)
        if wiki_offset + len(witems) >= total_wp or not witems:
            break
        wiki_offset += wiki_limit

    _update("Fetching FAQs...")
    faqs: list[dict[str, Any]] = []
    offset = 0
    limit = 200
    while True:
        faqs_resp = requests.get(
            f"{base}{_INTERNAL_KB_PREFIX}/{knowledge_base_id}/faqs",
            params={"offset": offset, "limit": limit},
            headers=headers,
            auth=basic,
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

    if faqs and lifecycle_index_mode == "current_only":
        kept_faqs: list[dict[str, Any]] = []
        for f in faqs:
            did = f.get("document_id")
            if not did:
                kept_faqs.append(f)
                continue
            dr = requests.get(f"{base}{_INTERNAL_DOC_PREFIX}/{did}", headers=headers, auth=basic, timeout=30)
            if dr.ok and dr.json().get("is_current_for_rag") is False:
                continue
            kept_faqs.append(f)
        faqs = kept_faqs

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
            if doc_id and metadata_keys:
                doc_resp = requests.get(f"{base}{_INTERNAL_DOC_PREFIX}/{doc_id}", headers=headers, auth=basic, timeout=30)
                if doc_resp.ok:
                    doc_data = doc_resp.json()
                    dmeta = _propagate_metadata(doc_data.get("metadata"), metadata_keys)
                    if dmeta is not None:
                        item["doc_metadata"] = dmeta
            faq_updates.append(item)
            faq_items_for_output.append({**f, "embedding": emb})

    if output_dir:
        _save_chunks_to_output(all_chunks, faq_items_for_output, include_embeddings=True)

    _update("Writing to backend API...")
    del_resp = requests.delete(
        f"{base}{_INTERNAL_KB_PREFIX}/{knowledge_base_id}/chunks", headers=headers, auth=basic, timeout=60
    )
    if not del_resp.ok:
        raise RuntimeError(f"Failed to clear chunks: {del_resp.status_code} {del_resp.text[:200]}")

    if all_chunks:
        batch_items = [
            {
                "id": c["id"],
                "document_id": c.get("document_id"),
                "wiki_page_id": c.get("wiki_page_id"),
                "content": c["content"],
                "chunk_index": c["chunk_index"],
                "token_count": c.get("token_count"),
                "embedding": c["embedding"],
                "chunk_metadata": c.get("chunk_metadata"),
                "doc_metadata": c.get("doc_metadata"),
            }
            for c in all_chunks
        ]
        total_batches = (len(batch_items) + _CHUNK_UPLOAD_BATCH_SIZE - 1) // _CHUNK_UPLOAD_BATCH_SIZE
        for batch_idx in range(total_batches):
            start = batch_idx * _CHUNK_UPLOAD_BATCH_SIZE
            batch = batch_items[start : start + _CHUNK_UPLOAD_BATCH_SIZE]
            _update(f"Writing chunks batch {batch_idx + 1}/{total_batches} ({len(batch)} chunks)...")
            create_resp = requests.post(
                f"{base}{_INTERNAL_KB_PREFIX}/{knowledge_base_id}/chunks/batch",
                headers=headers,
                auth=basic,
                json={"items": batch},
                timeout=_chunk_upload_timeout(len(batch)),
            )
            if not create_resp.ok:
                raise RuntimeError(
                    f"Failed to create chunks (batch {batch_idx + 1}/{total_batches}): "
                    f"{create_resp.status_code} {create_resp.text[:500]}"
                )

    if faq_updates:
        faq_emb_items = [
            {k: v for k, v in fu.items() if k in ("id", "embedding", "doc_metadata")}
            for fu in faq_updates
        ]
        faq_resp = requests.put(
            f"{base}{_INTERNAL_KB_PREFIX}/{knowledge_base_id}/faqs/batch-embeddings",
            headers=headers,
            auth=basic,
            json={"items": faq_emb_items},
            timeout=60,
        )
        if not faq_resp.ok:
            raise RuntimeError(f"Failed to update FAQ embeddings: {faq_resp.status_code} {faq_resp.text[:200]}")

    return {
        "chunks_created": len(all_chunks),
        "faqs_indexed": len(faq_updates),
    }
