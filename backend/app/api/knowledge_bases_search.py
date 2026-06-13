"""Knowledge base semantic search and QA agent proxy routes."""

from __future__ import annotations

import json
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.api.kb_router_deps import get_kb_scoped
from app.database import get_db
from app.models.knowledge_base import KnowledgeBase
from app.schemas.knowledge_base import (
    AskRequest,
    AskResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["knowledge-bases"])


@router.post("/{kb_id}/search", response_model=SearchResponse)
async def semantic_search(
    kb_id: str,
    body: SearchRequest,
    token: str = Depends(require_auth),
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Hybrid search via qa-agent (BM25 + dense + RRF + rerank), with dense-only fallback.

    Filtered requests (label/metadata/historical) skip qa-agent because the hybrid
    pipeline does not honor those filters; they go straight to the dense-only service.
    """
    from app.services.kb_search import search_knowledge_base

    has_filters = bool(
        body.label_filters
        or body.metadata_filters
        or body.include_historical_documents
        or (body.search_type and body.search_type != "all")
    )

    if kb.agent_url and not has_filters and not body.force_dense:
        agent_url = kb.agent_url.rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                resp = await client.post(
                    f"{agent_url}/retrieve",
                    json={
                        "knowledge_base_id": kb_id,
                        "query": body.query,
                        "access_token": token,
                        "top_k": body.top_k,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            results = [SearchResult(**s) for s in data.get("results", [])]
            return SearchResponse(results=results, query=body.query)
        except Exception as e:  # noqa: BLE001
            logger.warning("Hybrid /retrieve failed, falling back to dense-only: %s", e)

    return await search_knowledge_base(
        kb_id,
        body.query,
        top_k=body.top_k,
        search_type=body.search_type,
        label_filters=body.label_filters,
        metadata_filters=body.metadata_filters,
        include_historical_documents=body.include_historical_documents,
        retrieval_mode="dense_fallback",
        db=db,
    )


@router.post("/{kb_id}/ask", response_model=AskResponse)
async def ask_question(
    kb_id: str,
    body: AskRequest,
    token: str = Depends(require_auth),
    kb: KnowledgeBase = Depends(get_kb_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Forward question to the configured QA agent service."""
    if not kb.agent_url:
        raise HTTPException(status_code=400, detail="No agent URL configured for this knowledge base")

    agent_url = kb.agent_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{agent_url}/ask",
                json={
                    "knowledge_base_id": kb_id,
                    "question": body.question,
                    "conversation_history": body.conversation_history,
                    "access_token": token,
                    "session_id": body.session_id,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return AskResponse(
                answer=data.get("answer", ""),
                sources=[SearchResult(**s) for s in data.get("sources", [])],
            )
    except httpx.HTTPStatusError as e:
        logger.error("Agent returned error: %s %s", e.response.status_code, e.response.text[:200])
        raise HTTPException(status_code=502, detail="Agent service returned an error")
    except Exception as e:
        logger.error("Failed to reach agent at %s: %s", agent_url, e)
        raise HTTPException(status_code=502, detail="Could not reach agent service")


@router.post("/{kb_id}/ask/stream")
async def ask_question_stream(
    kb_id: str,
    body: AskRequest,
    token: str = Depends(require_auth),
    kb: KnowledgeBase = Depends(get_kb_scoped),
):
    """Proxy streaming NDJSON from the QA agent (delta lines, then done)."""
    if not kb.agent_url:
        raise HTTPException(status_code=400, detail="No agent URL configured for this knowledge base")

    agent_url = kb.agent_url.rstrip("/")

    async def proxy_stream():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{agent_url}/ask/stream",
                    json={
                        "knowledge_base_id": kb_id,
                        "question": body.question,
                        "conversation_history": body.conversation_history,
                        "access_token": token,
                        "session_id": body.session_id,
                    },
                ) as resp:
                    if resp.status_code >= 400:
                        err_body = (await resp.aread()).decode("utf-8", errors="replace")[:800]
                        yield (
                            '{"type":"error","detail":'
                            + json.dumps(err_body or f"HTTP {resp.status_code}")
                            + "}\n"
                        ).encode("utf-8")
                        return
                    async for chunk in resp.aiter_bytes():
                        yield chunk
        except httpx.HTTPError as e:
            logger.error("Agent stream failed at %s: %s", agent_url, e)
            yield (
                '{"type":"error","detail":'
                + json.dumps("Could not reach agent service")
                + "}\n"
            ).encode("utf-8")

    return StreamingResponse(
        proxy_stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
