"""Retriever: hybrid recall (BM25 + dense) → RRF fuse → rerank → top-K.

Pipeline:
  query
    → strip leading slash command (/rag, /ontology, /premium, …)
    → dense recall: backend /search (force_dense) with pool_k = max(2×top_k, rerank_recall_top_k)
    → BM25 re-score on that candidate pool only (no full-corpus chunk/FAQ crawl)
    → RRF fuse (k=settings.rrf_k) → top settings.rerank_recall_top_k candidates
    → SiliconFlow /v1/rerank (BAAI/bge-reranker-v2-m3 cross-encoder)
    → top-K SourceItems

Each stage degrades gracefully on failure: BM25 errors → dense-only recall;
rerank errors → fused candidates as-is. The answer path never breaks.
"""
import logging
import re
from typing import Any

import httpx

from .bm25_index import score_candidates
from .config import openai_v1_base, settings
from .backend_defaults import resolve_rerank_default, resolve_rerank_for_model
from .llm_config import get_effective_llm_config
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


def _candidate_pool_k(top_k: int) -> int:
    """How many hits to load before RRF/rerank (2× page size, enough for rerank stage)."""
    return max(2 * top_k, settings.rerank_recall_top_k)


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


def _bm25_recall(query: str, candidates: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
    return score_candidates(query, candidates, top_k)


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


def _rerank_endpoint(rerank_model_id: str | None) -> tuple[str, str, str] | None:
    """`(url, model_name, api_key)` for the reranker this query should use.

    A registered model's `base_url` is the API root its provider documents — `…/api/paas/v4` for Zhipu, `…/v1` for an
    OpenAI-compatible gateway — so it is used **as given**. Normalising it to `/v1` (which the environment-variable path
    needs) produced `…/v4/v1/rerank` and every call 404'd into the silent fallback.
    """
    if rerank_model_id:
        try:
            base_url, model_name, api_key = resolve_rerank_for_model(settings, rerank_model_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("rerank model %s could not be resolved: %s", rerank_model_id, exc)
            return None
        return f"{base_url.rstrip('/')}/rerank", model_name, api_key
    registered = resolve_rerank_default(settings)
    if registered is not None:
        base_url, model_name, api_key = registered
        return f"{base_url.rstrip('/')}/rerank", model_name, api_key
    if not settings.rerank_enabled:
        return None
    base = openai_v1_base(settings.rerank_base_url or get_effective_llm_config().base_url)
    return f"{base}/rerank", settings.rerank_model_name, get_effective_llm_config().api_key


def _rerank(
    query: str,
    candidates: list[dict[str, Any]],
    top_k: int,
    *,
    enabled: bool,
    rerank_model_id: str | None = None,
) -> tuple[list[dict[str, Any]], bool]:
    if not candidates or len(candidates) <= top_k or not enabled:
        return candidates[:top_k], False
    target = _rerank_endpoint(rerank_model_id)
    if target is None:
        return candidates[:top_k], False
    url, model_name, api_key = target
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    documents = [c.get("content") or "" for c in candidates]
    body = {
        "model": model_name,
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
        if out:
            return out[:top_k], True
        return candidates[:top_k], False
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "rerank failed (%s); using fused ranking. Point OPENKMS_RERANK_BASE_URL at a /v1/rerank "
            "endpoint or set OPENKMS_RERANK_ENABLED=false.",
            exc,
        )
        return candidates[:top_k], False


def _merge_recall_traces(
    candidates: list[dict[str, Any]],
    dense: list[dict[str, Any]],
    bm25: list[dict[str, Any]],
) -> None:
    """RRF keeps the first list's row per id; copy missing BM25/dense traces from the other recall."""
    by_d = {str(c["id"]): c for c in dense if c.get("id")}
    by_b = {str(c["id"]): c for c in bm25 if c.get("id")}
    for c in candidates:
        cid = str(c.get("id") or "")
        if not cid:
            continue
        if "_trace_dense_rank" not in c and cid in by_d:
            d = by_d[cid]
            c["_trace_dense_rank"] = d.get("_trace_dense_rank")
            c["_trace_dense_similarity"] = d.get("_trace_dense_similarity")
        if "_trace_bm25_rank" not in c and cid in by_b:
            b = by_b[cid]
            c["_trace_bm25_rank"] = b.get("_trace_bm25_rank")
            c["_trace_bm25_score"] = b.get("_trace_bm25_score")


def _annotate_recall_ranks(dense: list[dict[str, Any]], bm25: list[dict[str, Any]]) -> None:
    for i, c in enumerate(dense):
        c["_trace_dense_rank"] = i
        c["_trace_dense_similarity"] = round(float(c.get("score") or 0.0), 4)
    for i, c in enumerate(bm25):
        c["_trace_bm25_rank"] = i
        c["_trace_bm25_score"] = round(float(c.get("score") or 0.0), 6)


def _pipeline_stages(retrieval_mode: str, rerank_applied: bool) -> list[str]:
    if retrieval_mode == "hybrid":
        stages = ["dense", "bm25", "rrf"]
    elif retrieval_mode == "bm25_only":
        stages = ["bm25"]
    else:
        stages = ["dense"]
    if rerank_applied:
        stages.append("rerank")
    return stages


def _retrieval_debug_from_trace(c: dict[str, Any], *, pipeline_stages: list[str]) -> dict[str, Any]:
    dbg: dict[str, Any] = {"pipeline_stages": pipeline_stages}
    if "_trace_dense_rank" in c:
        dbg["dense_rank"] = c["_trace_dense_rank"]
    if "_trace_dense_similarity" in c:
        dbg["dense_similarity"] = c["_trace_dense_similarity"]
    if "_trace_bm25_rank" in c:
        dbg["bm25_rank"] = c["_trace_bm25_rank"]
    if "_trace_bm25_score" in c:
        dbg["bm25_score"] = c["_trace_bm25_score"]
    if "_trace_rrf_score" in c:
        dbg["rrf_score"] = c["_trace_rrf_score"]
    if "rerank" in pipeline_stages:
        dbg["rerank_score"] = round(float(c.get("score") or 0.0), 4)
    return dbg


def _row_to_source_item(
    r: dict[str, Any],
    *,
    retrieval_mode: str,
    pipeline_stages: list[str],
) -> SourceItem:
    dbg = _retrieval_debug_from_trace(r, pipeline_stages=pipeline_stages)
    return SourceItem(
        id=r["id"],
        source_type=r["source_type"],
        content=r["content"],
        score=float(r.get("score") or 0.0),
        source_name=r.get("source_name"),
        document_id=r.get("document_id"),
        wiki_page_id=r.get("wiki_page_id"),
        wiki_space_id=r.get("wiki_space_id"),
        doc_metadata=r.get("doc_metadata"),
        chunk_index=r.get("chunk_index") if r.get("chunk_index") is not None else None,
        retrieval_mode=retrieval_mode,
        retrieval_debug=dbg,
    )


def retrieve(
    knowledge_base_id: str,
    query: str,
    access_token: str,
    top_k: int = 5,
    rerank: bool | None = None,
    rerank_model_id: str | None = None,
) -> list[SourceItem]:
    """Hybrid retrieve: dense pool → BM25 re-score → RRF → cross-encoder rerank → top-K.

    ``rerank`` and ``rerank_model_id`` are the knowledge source's choice, not the agent's: how a corpus is searched is a
    property of the corpus. `None` follows the deployment; naming a model asks for it even when the deployment's own
    switch is off, because a configured model is a stronger statement than a host default.
    """
    clean_query = _strip_slash_prefix(query)
    recall_k = max(top_k, settings.hybrid_recall_top_k)
    pool_k = _candidate_pool_k(top_k)

    dense = _dense_recall(knowledge_base_id, clean_query, access_token, pool_k)
    bm25 = _bm25_recall(clean_query, dense, recall_k) if dense else []
    _annotate_recall_ranks(dense, bm25)

    if dense and bm25:
        retrieval_mode = "hybrid"
        fused_top_n = max(top_k, settings.rerank_recall_top_k)
        candidates = _rrf_fuse([dense, bm25], k=settings.rrf_k, top_n=fused_top_n)
        _merge_recall_traces(candidates, dense, bm25)
        for c in candidates:
            c["_trace_rrf_score"] = round(float(c.get("score") or 0.0), 6)
    else:
        candidates = dense or bm25
        retrieval_mode = "dense" if dense else "bm25_only"

    # An explicit `rerank=True` with a named model is a corpus asking for it; only the absence of both leaves the
    # deployment's switch in charge.
    if rerank is None:
        use_rerank = settings.rerank_enabled or bool(rerank_model_id)
    else:
        use_rerank = rerank
    reranked, rerank_applied = _rerank(
        clean_query,
        candidates,
        top_k,
        enabled=use_rerank,
        rerank_model_id=rerank_model_id,
    )
    stages = _pipeline_stages(retrieval_mode, rerank_applied)
    return [_row_to_source_item(r, retrieval_mode=retrieval_mode, pipeline_stages=stages) for r in reranked]
