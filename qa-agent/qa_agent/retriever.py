"""Retriever: recall (dense) + rerank (cross-encoder) → top-K.

Pipeline:
  query
    → strip leading slash command (/rag, /ontology, /premium, …)
    → backend /search dense recall (top_k = settings.rerank_recall_top_k, default 25)
    → SiliconFlow /v1/rerank  (BAAI/bge-reranker-v2-m3 cross-encoder)
    → top-K SourceItems

Rerank failure (network, 429, model unavailable) falls back to dense top-K so
the answer path never breaks.
"""
import re
from typing import Any

import httpx

from .config import settings
from .schemas import SourceItem


_SLASH_COMMANDS = ("rag", "ontology", "page-index", "premium", "calculator", "compare")
_SLASH_PATTERN = re.compile(
    r"^\s*/(?:" + "|".join(_SLASH_COMMANDS) + r")\b\s*",
    re.IGNORECASE,
)


def _strip_slash_prefix(query: str) -> str:
    stripped = _SLASH_PATTERN.sub("", query, count=1).strip()
    return stripped or query.strip()


def _recall(kb_id: str, query: str, access_token: str, top_k: int) -> list[dict[str, Any]]:
    base = settings.openkms_backend_url.rstrip("/")
    url = f"{base}/api/knowledge-bases/{kb_id}/search"
    headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            url,
            json={"query": query, "top_k": top_k, "search_type": "all"},
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json().get("results", []) or []


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
    """Retrieve top-K relevant chunks/FAQs via dense recall + cross-encoder rerank."""
    clean_query = _strip_slash_prefix(query)
    recall_k = max(top_k, settings.rerank_recall_top_k)
    candidates = _recall(knowledge_base_id, clean_query, access_token, recall_k)
    reranked = _rerank(clean_query, candidates, top_k)
    return [
        SourceItem(
            id=r["id"],
            source_type=r["source_type"],
            content=r["content"],
            score=r.get("score") or 0.0,
            source_name=r.get("source_name"),
            document_id=r.get("document_id"),
        )
        for r in reranked
    ]
