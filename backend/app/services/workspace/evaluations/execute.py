"""Run evaluation strategies: search + judge, QA agent + judge."""
import json
import logging
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.api_model import ApiModel
from app.models.evaluation import EvaluationItem
from app.models.knowledge_base import KnowledgeBase
from app.services.platform.boundaries import boundary
from app.services.content.knowledge_bases.kb_search import search_knowledge_base
from app.services.workspace.evaluations.search_judge import judge_qa_answer, judge_search_results

logger = logging.getLogger(__name__)

EVALUATION_TYPE_SEARCH_RETRIEVAL = "search_retrieval"
EVALUATION_TYPE_QA_ANSWER = "qa_answer"
EVALUATION_TYPE_WIKI_CONTENT_COVERAGE = "wiki_content_coverage"
EVALUATION_TYPE_DATA_QUERY = "data_query"

ALLOWED_EVALUATION_TYPES = frozenset(
    {
        EVALUATION_TYPE_SEARCH_RETRIEVAL,
        EVALUATION_TYPE_QA_ANSWER,
        EVALUATION_TYPE_WIKI_CONTENT_COVERAGE,
        EVALUATION_TYPE_DATA_QUERY,
    }
)

EVALUATION_TYPES_WITH_SEARCH_SNIPPETS = frozenset(
    {
        EVALUATION_TYPE_SEARCH_RETRIEVAL,
        EVALUATION_TYPE_WIKI_CONTENT_COVERAGE,
    }
)

SNIPPET_MAX_LEN = 500
TOP_K_SEARCH = 10


async def resolve_judge_config(db: AsyncSession, kb: KnowledgeBase) -> tuple[str, dict[str, Any]]:
    """Return (judge_model_id, model_config dict for OpenAI-compatible client)."""
    judge_model_id = kb.judge_model_id
    if not judge_model_id:
        fallback = await db.execute(
            select(ApiModel)
            .options(selectinload(ApiModel.provider_rel))
            .where(ApiModel.api_kind == "chat-completions")
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


async def _load_evaluation_items(db: AsyncSession, evaluation_id: str) -> list[EvaluationItem]:
    result = await db.execute(
        select(EvaluationItem)
        .where(EvaluationItem.evaluation_id == evaluation_id)
        .order_by(EvaluationItem.sort_order, EvaluationItem.created_at)
    )
    return list(result.scalars().all())


def _snippet(content: str, max_len: int = SNIPPET_MAX_LEN) -> str:
    c = content or ""
    return c if len(c) <= max_len else c[:max_len]


async def run_search_retrieval_evaluation(
    db: AsyncSession,
    knowledge_base_id: str,
    evaluation_id: str,
    judge_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Return one dict per item: item_id, query, expected_answer, passed, score, reasoning, detail."""
    items = await _load_evaluation_items(db, evaluation_id)
    out: list[dict[str, Any]] = []
    for item in items:
        # A failing item is recorded and skipped; an HTTP error (bad KB) still reaches the client.
        with boundary("search for an evaluation item", reraise=(HTTPException,)) as failed:
            search_resp = await search_knowledge_base(
                knowledge_base_id,
                item.query,
                top_k=TOP_K_SEARCH,
                search_type="all",
                db=db,
            )
        if failed:
            out.append(
                {
                    "evaluation_item_id": item.id,
                    "query": item.query,
                    "expected_answer": item.expected_answer,
                    "passed": False,
                    "score": 0.0,
                    "reasoning": str(failed[0]),
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
                "evaluation_item_id": item.id,
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
    evaluation_id: str,
    judge_config: dict[str, Any],
    access_token: str,
) -> list[dict[str, Any]]:
    """Call KB QA agent per item; judge answer vs expected."""
    if not kb.agent_url:
        raise HTTPException(
            status_code=400,
            detail="No agent URL configured for this knowledge base. QA evaluation requires KB agent_url.",
        )

    from app.services.content.knowledge_bases.qa_agent_proxy import agent_kb_path, ask_agent_body

    ask_url = agent_kb_path(kb.agent_url, kb.id, "ask")
    items = await _load_evaluation_items(db, evaluation_id)
    out: list[dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=120.0) as client:
        for item in items:
            try:
                resp = await client.post(
                    ask_url,
                    json=ask_agent_body(
                        kb=kb,
                        question=item.query,
                        conversation_history=[],
                        access_token=access_token,
                    ),
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as e:
                err_text = e.response.text[:300] if e.response else str(e)
                logger.warning("QA agent HTTP error: %s", err_text)
                out.append(
                    {
                        "evaluation_item_id": item.id,
                        "query": item.query,
                        "expected_answer": item.expected_answer,
                        "passed": False,
                        "score": 0.0,
                        "reasoning": f"Agent error: {e.response.status_code if e.response else ''} {err_text}",
                        "detail": {"answer": "", "sources": []},
                    }
                )
                continue
            except (httpx.HTTPError, KeyError, TypeError, ValueError) as e:
                out.append(
                    {
                        "evaluation_item_id": item.id,
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
                    "evaluation_item_id": item.id,
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


EVALUATION_TYPE_DATA_QUERY = "data_query"


async def run_data_query_evaluation(
    db: AsyncSession,
    kb: KnowledgeBase,
    evaluation_id: str,
    judge_config: dict[str, Any],
    access_token: str,
) -> list[dict[str, Any]]:
    """Ask the KB agent per item, then judge the ``data_query`` sources it cited.

    The evaluated thing is the *query*, not the numbers: each answer's sources carry ``data_query`` (model id + SQL),
    and the deterministic judge checks that against ``EvaluationItem.expected_query``. The SQL is never re-run.
    """
    if not kb.agent_url:
        raise HTTPException(
            status_code=400,
            detail="No agent URL configured for this knowledge base. Data-query evaluation requires KB agent_url.",
        )

    from app.services.content.knowledge_bases.qa_agent_proxy import agent_kb_path, ask_agent_body
    from app.services.workspace.evaluations.data_query_judge import match_sources_to_queries

    ask_url = agent_kb_path(kb.agent_url, kb.id, "ask")
    items = await _load_evaluation_items(db, evaluation_id)
    out: list[dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=120.0) as client:
        for item in items:
            try:
                resp = await client.post(
                    ask_url,
                    json=ask_agent_body(
                        kb=kb,
                        question=item.query,
                        conversation_history=[],
                        access_token=access_token,
                    ),
                )
                resp.raise_for_status()
                data = resp.json()
            except (httpx.HTTPError, ValueError) as e:
                logger.warning("QA agent error: %s", e)
                out.append(
                    {
                        "evaluation_item_id": item.id,
                        "query": item.query,
                        "expected_answer": item.expected_answer,
                        "passed": False,
                        "score": 0.0,
                        "reasoning": f"Agent error: {e}",
                        "detail": {"data_queries": [], "coverage": 0.0},
                    }
                )
                continue

            sources = data.get("sources") or []
            data_queries: list[dict[str, Any]] = []
            for s in sources:
                dq = (s or {}).get("data_query") if isinstance(s, dict) else None
                if isinstance(dq, dict) and dq.get("sql"):
                    data_queries.append(dq)

            expected = item.expected_query
            if not isinstance(expected, list):
                expected = []
            result = match_sources_to_queries(expected, data_queries)

            # A raw-SQL expectation is judged for equivalence, not structure. Resolve each pending query with the LLM
            # and fold the verdicts back in, recomputing coverage.
            if result["pending_llm"]:
                by_query: dict[int, list[dict[str, Any]]] = {}
                for p in result["pending_llm"]:
                    by_query.setdefault(p["query_index"], []).append(p)
                for query_index, pendings in by_query.items():
                    resolution = {"passed": False, "reasoning": "no equivalent SQL cited"}
                    for p in pendings:
                        verdict = await judge_sql_equivalence(
                            p["verdict"]["expected_sql"], p["verdict"]["actual_sql"], judge_config
                        )
                        if verdict["pass"]:
                            resolution = {"passed": True, "reasoning": verdict["reasoning"]}
                            break
                        resolution["reasoning"] = verdict["reasoning"]
                    if resolution["passed"]:
                        result["matched"].append({"query_index": query_index, "source_index": -1, "verdict": {"passed": True}})
                    else:
                        result["uncovered"].append({"query_index": query_index, "source_index": -1, "verdict": {"passed": False, "reasons": [resolution["reasoning"]], "checks": {}}})
                total = len(expected)
                result["coverage"] = len(result["matched"]) / total if total else 0.0
                result["passed"] = result["coverage"] == 1.0

            # The pass line is coverage: every expected query is covered. Extra sources are completeness — reported, and
            # scored later (they must not fail an otherwise-correct answer).
            reasons: list[str] = []
            for u in result["uncovered"]:
                reasons.append(f"query {u['query_index'] + 1}: {'; '.join(u['verdict']['reasons'])}")
            if result.get("expect_refusal"):
                # No expected query means the model cannot answer this, so citing anything is the failure.
                cited = len(result["extra_sources"])
                reasons = [f"should have refused, but cited {cited} quer{'y' if cited == 1 else 'ies'}"] if cited else []

            out.append(
                {
                    "evaluation_item_id": item.id,
                    "query": item.query,
                    "expected_answer": item.expected_answer,
                    "passed": result["passed"],
                    "score": result["coverage"],
                    "reasoning": (
                        "; ".join(reasons)
                        if reasons
                        else ("refused, as required" if result.get("expect_refusal") else "every expected query was cited")
                    ),
                    "detail": {
                        "data_queries": [
                            {
                                "mode": dq.get("mode"),
                                "model_id": dq.get("model_id"),
                                "metric": dq.get("metric"),
                                "sql": dq.get("sql"),
                            }
                            for dq in data_queries
                        ],
                        "coverage": result["coverage"],
                        "matched": len(result["matched"]),
                        "extra_sources": len(result["extra_sources"]),
                    },
                }
            )
    return out


SQL_EQUIVALENCE_PROMPT = """You are judging whether two SQL statements answer the same question.

Expected SQL (ground truth):
{expected_sql}

Actual SQL (what the agent ran):
{actual_sql}

The two may differ in formatting, aliases, join order, or `BETWEEN` vs two inequalities. Judge whether they are
**semantically equivalent**: the actual query must answer the expected query's question. An actual query may return
*additional* measures or columns — asking more is not an error, it is completeness — as long as the expected measure is
present and computed the same way. A real difference is: the wrong table, a missing or changed filter, a different grain
(GROUP BY), or the expected measure computed differently.

Respond with JSON only: {{"pass": true|false, "score": 0.0-1.0, "reasoning": "one or two sentences"}}
- pass: true if they are equivalent, false otherwise
- score: how close they are (1.0 identical meaning, 0.0 different question)
- reasoning: what differs, if anything"""


async def judge_sql_equivalence(
    expected_sql: str,
    actual_sql: str,
    model_config: dict[str, Any],
) -> dict[str, Any]:
    """LLM judge for two SQLs that are not compared structurally (a SQL Lab source has only text)."""
    from openai import AsyncOpenAI, OpenAIError

    prompt = SQL_EQUIVALENCE_PROMPT.format(expected_sql=expected_sql, actual_sql=actual_sql)
    base_url = model_config.get("base_url", "").rstrip("/")
    if base_url and not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    client = AsyncOpenAI(base_url=base_url, api_key=model_config.get("api_key") or "no-key")
    try:
        response = await client.chat.completions.create(
            model=model_config.get("model_name", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": "You are a SQL equivalence evaluator. Respond only with valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
        )
        content = (response.choices[0].message.content or "{}").strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        data = json.loads(content)
        if not isinstance(data, dict):
            return {"pass": False, "score": 0.0, "reasoning": "Invalid judge response"}
        return {
            "pass": bool(data.get("pass", False)),
            "score": float(data.get("score", 0.0)),
            "reasoning": str(data.get("reasoning", "")),
        }
    except (ValueError, OpenAIError) as exc:
        logger.warning("SQL equivalence judge failed: %s", exc)
        return {"pass": False, "score": 0.0, "reasoning": f"judge error: {exc}"}
