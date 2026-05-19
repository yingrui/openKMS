"""Retriever: hybrid recall (BM25 + dense) → RRF fuse → rerank → top-K.

Pipeline:
  query
    → strip leading slash command (/rag, /ontology, /premium, …)
    → parallel recall:
         A. backend /search dense recall (top settings.hybrid_recall_top_k)
         B. in-memory BM25 over jieba-tokenized chunks/FAQs (top settings.hybrid_recall_top_k)
    → RRF fuse (k=settings.rrf_k) → top settings.rerank_recall_top_k candidates
    → SiliconFlow /v1/rerank (BAAI/bge-reranker-v2-m3 cross-encoder)
    → top-K SourceItems

Each stage degrades gracefully on failure: BM25 build/network errors → dense-only
recall; rerank errors → fused candidates as-is. The answer path never breaks.
"""
import logging
import re
from typing import Any

import httpx

from .bm25_index import cache as bm25_cache
from .config import settings
from .schemas import SourceItem

logger = logging.getLogger(__name__)


_SLASH_COMMANDS = ("rag", "ontology", "page-index", "premium", "calculator", "compare")
_SLASH_PATTERN = re.compile(
    r"^\s*/(?:" + "|".join(_SLASH_COMMANDS) + r")\b\s*",
    re.IGNORECASE,
)


def _strip_slash_prefix(query: str) -> str:
    stripped = _SLASH_PATTERN.sub("", query, count=1).strip()
    return stripped or query.strip()


def _dense_recall(kb_id: str, query: str, access_token: str, top_k: int) -> list[dict[str, Any]]:
    base = settings.openkms_backend_url.rstrip("/")
    url = f"{base}/api/knowledge-bases/{kb_id}/search"
    headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                url,
                json={"query": query, "top_k": top_k, "search_type": "all", "force_dense": True},
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json().get("results", []) or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("dense recall failed for KB %s: %s", kb_id, exc)
        return []


def _bm25_recall(kb_id: str, query: str, access_token: str, top_k: int) -> list[dict[str, Any]]:
    return bm25_cache.query(kb_id, query, access_token, top_k)


def _rrf_fuse(
    ranked_lists: list[list[dict[str, Any]]],
    k: int,
    top_n: int,
) -> list[dict[str, Any]]:
    """Reciprocal Rank Fusion. Each candidate id contributes Σ 1/(k + rank) over
    the lists it appears in. Returns up to top_n merged candidates, score field
    replaced with the RRF score, source dict taken from the first list that has it.
    """
    fused: dict[str, dict[str, Any]] = {}
    rrf_score: dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, cand in enumerate(ranked):
            cid = cand.get("id")
            if not cid:
                continue
            rrf_score[cid] = rrf_score.get(cid, 0.0) + 1.0 / (k + rank + 1)
            if cid not in fused:
                fused[cid] = dict(cand)
    ordered = sorted(fused.values(), key=lambda c: rrf_score.get(c["id"], 0.0), reverse=True)
    out: list[dict[str, Any]] = []
    for cand in ordered[:top_n]:
        cand["score"] = round(rrf_score.get(cand["id"], 0.0), 6)
        out.append(cand)
    return out


def _rerank(query: str, candidates: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
    if not candidates or len(candidates) <= top_k or not settings.rerank_enabled:
        return candidates[:top_k]

    base = settings.llm_base_url.rstrip("/")
    if not base.endswith("/v1"):
        base = f"{base}/v1"
    url = f"{base}/rerank"
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    documents = [c.get("content") or "" for c in candidates]
    body = {
        "model": settings.rerank_model_name,
        "query": query,
        "documents": documents,
        "top_n": min(top_k, len(documents)),
        "return_documents": False,
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(url, json=body, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        results = data.get("results") or []
        out: list[dict[str, Any]] = []
        for item in results:
            idx = item.get("index")
            if idx is None or not (0 <= idx < len(candidates)):
                continue
            cand = dict(candidates[idx])
            cand["score"] = round(float(item.get("relevance_score") or 0.0), 4)
            out.append(cand)
        return out[:top_k] if out else candidates[:top_k]
    except Exception:  # noqa: BLE001
        return candidates[:top_k]


def retrieve(
    knowledge_base_id: str,
    query: str,
    access_token: str,
    top_k: int = 5,
) -> list[SourceItem]:
    """Hybrid retrieve: BM25 + dense → RRF → cross-encoder rerank → top-K."""
    clean_query = _strip_slash_prefix(query)
    recall_k = max(top_k, settings.hybrid_recall_top_k)

    dense = _dense_recall(knowledge_base_id, clean_query, access_token, recall_k)
    bm25 = _bm25_recall(knowledge_base_id, clean_query, access_token, recall_k)

    if dense and bm25:
        fused_top_n = max(top_k, settings.rerank_recall_top_k)
        candidates = _rrf_fuse([dense, bm25], k=settings.rrf_k, top_n=fused_top_n)
    else:
        candidates = dense or bm25

    reranked = _rerank(clean_query, candidates, top_k)
    return [
        SourceItem(
            id=r["id"],
            source_type=r["source_type"],
            content=r["content"],
            score=r.get("score") or 0.0,
            source_name=r.get("source_name"),
            document_id=r.get("document_id"),
            wiki_page_id=r.get("wiki_page_id"),
            wiki_space_id=r.get("wiki_space_id"),
        )
        for r in reranked
    ]
