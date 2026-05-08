"""Per-KB in-memory BM25 index, lazy-built from backend /chunks + /faqs.

Index keyed by knowledge_base_id. Entries are rebuilt when older than
`settings.bm25_ttl_seconds`. Tokenization uses `jieba` (Chinese-aware) so
embedded English product codes (e.g. ``WWY``, ``MIL``) survive as single tokens.

Output of `query()` is shaped like the backend ``/search`` response so it can be
fused with dense recall by ID.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
import jieba
import bm25s

from .config import settings

logger = logging.getLogger(__name__)

# Suppress jieba's "Building prefix dict from..." log on first call.
jieba.setLogLevel(logging.WARNING)


@dataclass
class _Entry:
    built_at: float
    retriever: Any  # bm25s.BM25
    docs: list[dict[str, Any]] = field(default_factory=list)


class BM25Cache:
    def __init__(self) -> None:
        self._entries: dict[str, _Entry] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._global_lock = threading.Lock()

    def _get_lock(self, kb_id: str) -> threading.Lock:
        with self._global_lock:
            lock = self._locks.get(kb_id)
            if lock is None:
                lock = threading.Lock()
                self._locks[kb_id] = lock
            return lock

    def _is_fresh(self, entry: _Entry) -> bool:
        return (time.time() - entry.built_at) < settings.bm25_ttl_seconds

    def _fetch_all(self, path: str, kb_id: str, access_token: str) -> list[dict[str, Any]]:
        base = settings.openkms_backend_url.rstrip("/")
        url = f"{base}/api/knowledge-bases/{kb_id}/{path}"
        headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}
        out: list[dict[str, Any]] = []
        offset = 0
        page = 200
        with httpx.Client(timeout=60.0) as client:
            while True:
                resp = client.get(
                    url,
                    params={"offset": offset, "limit": page},
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()
                items = data.get("items", []) if isinstance(data, dict) else []
                out.extend(items)
                total = data.get("total", len(out)) if isinstance(data, dict) else len(out)
                if len(out) >= total or not items:
                    break
                offset += page
        return out

    def _build(self, kb_id: str, access_token: str) -> _Entry:
        chunks = self._fetch_all("chunks", kb_id, access_token)
        faqs = self._fetch_all("faqs", kb_id, access_token)

        docs: list[dict[str, Any]] = []
        for c in chunks:
            content = c.get("content") or ""
            if not content.strip():
                continue
            docs.append({
                "id": c.get("id"),
                "source_type": "chunk",
                "content": content,
                "source_name": c.get("document_name"),
                "document_id": c.get("document_id"),
            })
        for f in faqs:
            q = f.get("question") or ""
            a = f.get("answer") or ""
            text = f"Q: {q}\nA: {a}".strip()
            if not text or text == "Q:\nA:":
                continue
            docs.append({
                "id": f.get("id"),
                "source_type": "faq",
                "content": text,
                "source_name": f.get("document_name"),
                "document_id": f.get("document_id"),
            })

        if not docs:
            raise RuntimeError(f"BM25 build: KB {kb_id} has zero indexable chunks/FAQs")

        corpus_tokens = [_tokenize(d["content"]) for d in docs]
        retriever = bm25s.BM25()
        retriever.index(corpus_tokens, show_progress=False)

        logger.info("BM25 index built for KB %s: %d docs (%d chunks + %d FAQs)",
                    kb_id, len(docs), len(chunks), len(faqs))
        return _Entry(built_at=time.time(), retriever=retriever, docs=docs)

    def query(
        self,
        kb_id: str,
        query: str,
        access_token: str,
        top_k: int,
    ) -> list[dict[str, Any]]:
        """Return up to top_k BM25 candidates shaped like backend /search results."""
        if not settings.bm25_enabled or not query.strip():
            return []

        lock = self._get_lock(kb_id)
        with lock:
            entry = self._entries.get(kb_id)
            if entry is None or not self._is_fresh(entry):
                try:
                    entry = self._build(kb_id, access_token)
                    self._entries[kb_id] = entry
                except Exception as exc:  # noqa: BLE001
                    logger.warning("BM25 build failed for KB %s: %s", kb_id, exc)
                    return []

        query_tokens = _tokenize(query)
        if not query_tokens:
            return []
        try:
            results_idx, results_score = entry.retriever.retrieve(
                [query_tokens], k=min(top_k, len(entry.docs)), show_progress=False
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("BM25 retrieve failed for KB %s: %s", kb_id, exc)
            return []

        out: list[dict[str, Any]] = []
        for idx, score in zip(results_idx[0], results_score[0]):
            i = int(idx)
            if i < 0 or i >= len(entry.docs):
                continue
            doc = dict(entry.docs[i])
            doc["score"] = float(score)
            out.append(doc)
        return out

    def invalidate(self, kb_id: str | None = None) -> None:
        with self._global_lock:
            if kb_id is None:
                self._entries.clear()
            else:
                self._entries.pop(kb_id, None)


def _tokenize(text: str) -> list[str]:
    """Jieba word segmentation; lowercase tokens; drop pure whitespace."""
    if not text:
        return []
    tokens = [t.lower() for t in jieba.cut(text, cut_all=False) if t.strip()]
    return tokens


cache = BM25Cache()
