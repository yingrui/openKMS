"""Run evaluation strategies: search + judge, QA agent + judge."""
import logging
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.api_model import ApiModel
from app.models.evaluation_dataset import EvaluationDatasetItem
from app.models.knowledge_base import KnowledgeBase
from app.services.kb_search import search_knowledge_base
from app.services.search_judge import judge_qa_answer, judge_search_results

logger = logging.getLogger(__name__)

EVALUATION_TYPE_SEARCH_RETRIEVAL = "search_retrieval"
EVALUATION_TYPE_QA_ANSWER = "qa_answer"

ALLOWED_EVALUATION_TYPES = frozenset({EVALUATION_TYPE_SEARCH_RETRIEVAL, EVALUATION_TYPE_QA_ANSWER})

SNIPPET_MAX_LEN = 500
TOP_K_SEARCH = 10


async def resolve_judge_config(db: AsyncSession, kb: KnowledgeBase) -> tuple[str, dict[str, Any]]:
    """Return (judge_model_id, model_config dict for OpenAI-compatible client)."""
    judge_model_id = kb.judge_model_id
    if not judge_model_id:
        fallback = await db.execute(
            select(ApiModel)
            .options(selectinload(ApiModel.provider_rel))
            .where(ApiModel.category == "llm")
            .order_by(ApiModel.is_default_in_category.desc().nullslast())
            .limit(1)
        )
        judge_model = fallback.scalar_one_or_none()
        if not judge_model:
            raise HTTPException(
                status_code=400,
                detail="No judge model configured. Set judge_model_id on the KB or add an LLM model.",
            )
        judge_model_id = judge_model.id

    judge_model_result = await db.execute(
        select(ApiModel)
        .options(selectinload(ApiModel.provider_rel))
        .where(ApiModel.id == judge_model_id)
    )
    judge_model = judge_model_result.scalar_one_or_none()
    if not judge_model or not judge_model.provider_rel:
        raise HTTPException(status_code=400, detail="Judge model not found")

    judge_config = {
        "base_url": judge_model.provider_rel.base_url,
        "api_key": judge_model.provider_rel.api_key or "no-key",
        "model_name": judge_model.model_name or judge_model.name,
    }
    return judge_model_id, judge_config


async def _load_dataset_items(db: AsyncSession, dataset_id: str) -> list[EvaluationDatasetItem]:
    result = await db.execute(
        select(EvaluationDatasetItem)
        .where(EvaluationDatasetItem.evaluation_dataset_id == dataset_id)
        .order_by(EvaluationDatasetItem.sort_order, EvaluationDatasetItem.created_at)
    )
    return list(result.scalars().all())


def _snippet(content: str, max_len: int = SNIPPET_MAX_LEN) -> str:
    c = content or ""
    return c if len(c) <= max_len else c[:max_len]


async def run_search_retrieval_evaluation(
    db: AsyncSession,
    knowledge_base_id: str,
    dataset_id: str,
    judge_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Return one dict per item: item_id, query, expected_answer, passed, score, reasoning, detail."""
    items = await _load_dataset_items(db, dataset_id)
    out: list[dict[str, Any]] = []
    for item in items:
        try:
            search_resp = await search_knowledge_base(
                knowledge_base_id,
                item.query,
                top_k=TOP_K_SEARCH,
                search_type="all",
                db=db,
            )
        except HTTPException:
            raise
        except Exception as e:
            out.append(
                {
                    "evaluation_dataset_item_id": item.id,
                    "query": item.query,
                    "expected_answer": item.expected_answer,
                    "passed": False,
                    "score": 0.0,
                    "reasoning": str(e),
                    "detail": {"search_results": []},
                }
            )
            continue

        search_list = [
            {"content": r.content, "score": r.score, "source_type": r.source_type}
            for r in search_resp.results
        ]

        verdict = await judge_search_results(
            item.query,
            item.expected_answer,
            search_list,
            judge_config,
        )

        snippets = [
            {
                "content": _snippet(r.get("content", "")),
                "score": float(r.get("score", 0)),
                "source_type": str(r.get("source_type", "unknown")),
            }
            for r in search_list[:5]
        ]

        out.append(
            {
                "evaluation_dataset_item_id": item.id,
                "query": item.query,
                "expected_answer": item.expected_answer,
                "passed": bool(verdict["pass"]),
                "score": float(verdict["score"]),
                "reasoning": str(verdict["reasoning"]),
                "detail": {"search_results": snippets},
            }
        )
    return out


async def run_qa_answer_evaluation(
    db: AsyncSession,
    kb: KnowledgeBase,
    dataset_id: str,
    judge_config: dict[str, Any],
    access_token: str,
) -> list[dict[str, Any]]:
    """Call KB QA agent per item; judge answer vs expected."""
    if not kb.agent_url:
        raise HTTPException(
            status_code=400,
            detail="No agent URL configured for this knowledge base. QA evaluation requires KB agent_url.",
        )

    agent_url = kb.agent_url.rstrip("/")
    items = await _load_dataset_items(db, dataset_id)
    out: list[dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=120.0) as client:
        for item in items:
            try:
                resp = await client.post(
                    f"{agent_url}/ask",
                    json={
                        "knowledge_base_id": kb.id,
                        "question": item.query,
                        "conversation_history": [],
                        "access_token": access_token,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as e:
                err_text = e.response.text[:300] if e.response else str(e)
                logger.warning("QA agent HTTP error: %s", err_text)
                out.append(
                    {
                        "evaluation_dataset_item_id": item.id,
                        "query": item.query,
                        "expected_answer": item.expected_answer,
                        "passed": False,
                        "score": 0.0,
                        "reasoning": f"Agent error: {e.response.status_code if e.response else ''} {err_text}",
                        "detail": {"answer": "", "sources": []},
                    }
                )
                continue
            except Exception as e:
                out.append(
                    {
                        "evaluation_dataset_item_id": item.id,
                        "query": item.query,
                        "expected_answer": item.expected_answer,
                        "passed": False,
                        "score": 0.0,
                        "reasoning": str(e),
                        "detail": {"answer": "", "sources": []},
                    }
                )
                continue

            answer = (data.get("answer") or "").strip()
            raw_sources = data.get("sources") or []
            sources_for_judge: list[dict[str, Any]] = []
            for s in raw_sources[:10]:
                if isinstance(s, dict):
                    sources_for_judge.append(
                        {
                            "content": s.get("content") or "",
                            "score": float(s.get("score", 0)),
                            "source_type": s.get("source_type") or "unknown",
                        }
                    )

            verdict = await judge_qa_answer(
                item.query,
                item.expected_answer,
                answer,
                sources_for_judge,
                judge_config,
            )

            stored_sources = [
                {
                    "content": _snippet(x.get("content", "")),
                    "score": float(x.get("score", 0)),
                    "source_type": str(x.get("source_type", "unknown")),
                }
                for x in sources_for_judge[:5]
            ]

            out.append(
                {
                    "evaluation_dataset_item_id": item.id,
                    "query": item.query,
                    "expected_answer": item.expected_answer,
                    "passed": bool(verdict["pass"]),
                    "score": float(verdict["score"]),
                    "reasoning": str(verdict["reasoning"]),
                    "detail": {
                        "answer": _snippet(answer, 8000),
                        "sources": stored_sources,
                    },
                }
            )
    return out
