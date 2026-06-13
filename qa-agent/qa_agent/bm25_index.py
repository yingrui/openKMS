"""Query-time BM25 over a small candidate pool (dense recall results).

Hybrid retrieval loads ~2× the final top-K from dense search, then re-scores
those documents with jieba + BM25 for RRF fusion. Avoids paging the full KB
chunk/FAQ list on every search.
"""
from __future__ import annotations

import logging
from typing import Any

import bm25s
import jieba

from .config import settings

logger = logging.getLogger(__name__)

jieba.setLogLevel(logging.WARNING)


def score_candidates(
    query: str,
    candidates: list[dict[str, Any]],
    top_k: int,
) -> list[dict[str, Any]]:
    """Re-rank up to top_k candidates from the pool by BM25 score."""
    if not settings.bm25_enabled or not query.strip() or not candidates or top_k <= 0:
        return []

    docs: list[dict[str, Any]] = []
    for c in candidates:
        content = c.get("content") or ""
        if not content.strip():
            continue
        docs.append(dict(c))
    if not docs:
        return []

    corpus_tokens = [_tokenize(d["content"]) for d in docs]
    query_tokens = _tokenize(query)
    if not query_tokens:
        return []

    try:
        retriever = bm25s.BM25()
        retriever.index(corpus_tokens, show_progress=False)
        results_idx, results_score = retriever.retrieve(
            [query_tokens], k=min(top_k, len(docs)), show_progress=False
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("BM25 score over candidate pool failed: %s", exc)
        return []

    out: list[dict[str, Any]] = []
    for idx, score in zip(results_idx[0], results_score[0]):
        i = int(idx)
        if i < 0 or i >= len(docs):
            continue
        doc = dict(docs[i])
        doc["score"] = float(score)
        out.append(doc)
    return out


def _tokenize(text: str) -> list[str]:
    if not text:
        return []
    return [t.lower() for t in jieba.cut(text, cut_all=False) if t.strip()]
