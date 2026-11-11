"""Run evaluation strategies: search + judge, QA agent + judge."""
import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.api_model import ApiModel
from app.models.evaluation import Evaluation, EvaluationItem
from app.models.dataset import Dataset
from app.models.knowledge_base import KnowledgeBase
from app.models.semantic_model_field import SemanticModelField
from app.services.platform.boundaries import boundary
from app.services.content.knowledge_bases.kb_search import search_knowledge_base
from app.services.workspace.evaluations.scores import flush_scores, score_data_query_item
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


def _item_result(
    item: EvaluationItem,
    *,
    passed: bool,
    score: float,
    reasoning: str,
    detail: dict[str, Any],
) -> dict[str, Any]:
    """One row of a run, in the shape every strategy returns — the comparison view and the UI read one schema."""
    return {
        "evaluation_item_id": item.id,
        "query": item.query,
        "expected_answer": item.expected_answer,
        "passed": bool(passed),
        "score": float(score),
        "reasoning": str(reasoning),
        "detail": detail,
    }


async def _run_items(
    db: AsyncSession,
    evaluation_id: str,
    run_one: Callable[[EvaluationItem], Awaitable[dict[str, Any]]],
    item_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Load the items and run one strategy step per item. The strategies differ only in `run_one`.

    `item_ids` runs a subset — the items that failed last time, or a first few while tuning — without touching the rest.
    """
    items = await _load_evaluation_items(db, evaluation_id)
    if item_ids:
        wanted = set(item_ids)
        items = [item for item in items if item.id in wanted]
    return [await run_one(item) for item in items]


async def _ask_agent(
    client: httpx.AsyncClient,
    ask_url: str,
    kb: KnowledgeBase,
    item: EvaluationItem,
    access_token: str,
    *,
    session_id: str | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    """One answer for one item: the body, or the reason there is none.

    Returned rather than raised: an unreachable answer is recorded against its own item, while a missing agent URL (a
    configuration mistake) still surfaces as the caller's HTTPException.
    """
    from app.services.content.knowledge_bases.qa_agent_proxy import ask_agent_body

    try:
        resp = await client.post(
            ask_url,
            json=ask_agent_body(
                kb=kb,
                question=item.query,
                conversation_history=[],
                access_token=access_token,
                session_id=session_id,
            ),
        )
        resp.raise_for_status()
        return resp.json(), None
    except httpx.HTTPStatusError as e:
        err_text = e.response.text[:300] if e.response is not None else str(e)
        logger.warning("QA agent HTTP error: %s", err_text)
        status = e.response.status_code if e.response is not None else ""
        return None, f"Agent error: {status} {err_text}".strip()
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as e:
        logger.warning("QA agent error: %s", e)
        return None, f"Agent error: {e}"


async def run_search_retrieval_evaluation(
    db: AsyncSession,
    knowledge_base_id: str,
    evaluation_id: str,
    judge_config: dict[str, Any],
    item_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Return one dict per item: item_id, query, expected_answer, passed, score, reasoning, detail."""

    async def run_one(item: EvaluationItem) -> dict[str, Any]:
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
            return _item_result(
                item, passed=False, score=0.0, reasoning=str(failed[0]), detail={"search_results": []}
            )

        search_list = [
            {"content": r.content, "score": r.score, "source_type": r.source_type} for r in search_resp.results
        ]
        verdict = await judge_search_results(item.query, item.expected_answer, search_list, judge_config)
        return _item_result(
            item,
            passed=bool(verdict["pass"]),
            score=float(verdict["score"]),
            reasoning=str(verdict["reasoning"]),
            detail={
                "search_results": [
                    {
                        "content": _snippet(r.get("content", "")),
                        "score": float(r.get("score", 0)),
                        "source_type": str(r.get("source_type", "unknown")),
                    }
                    for r in search_list[:5]
                ]
            },
        )

    return await _run_items(db, evaluation_id, run_one, item_ids)


async def run_qa_answer_evaluation(
    db: AsyncSession,
    kb: KnowledgeBase,
    evaluation_id: str,
    judge_config: dict[str, Any],
    access_token: str,
    item_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Call KB QA agent per item; judge answer vs expected."""
    if not kb.agent_url:
        raise HTTPException(
            status_code=400,
            detail="No agent URL configured for this knowledge base. QA evaluation requires KB agent_url.",
        )

    from app.services.content.knowledge_bases.qa_agent_proxy import agent_kb_path

    ask_url = agent_kb_path(kb.agent_url, kb.id, "ask")

    async with httpx.AsyncClient(timeout=120.0) as client:

        async def run_one(item: EvaluationItem) -> dict[str, Any]:
            data, error = await _ask_agent(client, ask_url, kb, item, access_token)
            if data is None:
                return _item_result(
                    item,
                    passed=False,
                    score=0.0,
                    reasoning=error or "Agent returned no answer",
                    detail={"answer": "", "sources": []},
                )

            answer = (data.get("answer") or "").strip()
            sources_for_judge = [
                {
                    "content": s.get("content") or "",
                    "score": float(s.get("score", 0)),
                    "source_type": s.get("source_type") or "unknown",
                }
                for s in (data.get("sources") or [])[:10]
                if isinstance(s, dict)
            ]
            verdict = await judge_qa_answer(item.query, item.expected_answer, answer, sources_for_judge, judge_config)
            return _item_result(
                item,
                passed=bool(verdict["pass"]),
                score=float(verdict["score"]),
                reasoning=str(verdict["reasoning"]),
                detail={
                    "answer": _snippet(answer, 8000),
                    "sources": [
                        {
                            "content": _snippet(x.get("content", "")),
                            "score": float(x.get("score", 0)),
                            "source_type": str(x.get("source_type", "unknown")),
                        }
                        for x in sources_for_judge[:5]
                    ],
                },
            )

        return await _run_items(db, evaluation_id, run_one, item_ids)


async def run_data_query_evaluation(
    db: AsyncSession,
    kb: KnowledgeBase,
    evaluation_id: str,
    judge_config: dict[str, Any],
    access_token: str,
    item_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Ask the KB agent per item, then judge the queries it cited against the item's expectation.

    The evaluated thing is the *query*, not the numbers. Every expectation is checked against every cited query by the
    judge (judge.py), which reads the question, the expectation (metric definition or SQL), what was actually run, and the
    model's fields. No shape comparison happens here: "does this column name appear" is not the question, and it rejects
    correct SQL that happens to be spelled differently.
    """
    if not kb.agent_url:
        raise HTTPException(
            status_code=400,
            detail="No agent URL configured for this knowledge base. Data-query evaluation requires KB agent_url.",
        )

    from app.services.content.knowledge_bases.qa_agent_proxy import agent_kb_path
    from app.services.workspace.evaluations.judge import MAX_SOURCES_PER_EXPECTATION, judge_query

    ask_url = agent_kb_path(kb.agent_url, kb.id, "ask")
    # The semantic model belongs to the evaluation, not to the knowledge base: a KB can hold several data sets.
    evaluation = await db.get(Evaluation, evaluation_id)
    schema = await _semantic_model_schema(db, evaluation.semantic_model_id if evaluation else None)

    async with httpx.AsyncClient(timeout=120.0) as client:

        async def run_one(item: EvaluationItem) -> dict[str, Any]:
            # One trace per item, grouped under the evaluation run: a score needs a trace to attach to.
            data, error = await _ask_agent(
                client,
                ask_url,
                kb,
                item,
                access_token,
                session_id=f"eval-{evaluation_id[:8]}-{item.id[:8]}",
            )
            if data is None:
                return _item_result(
                    item,
                    passed=False,
                    score=0.0,
                    reasoning=error or "Agent returned no answer",
                    detail={"data_queries": [], "coverage": 0.0, "uncovered": [], "extra_sources": 0, "judge": None},
                )

            cited: list[dict[str, Any]] = [
                dq
                for s in (data.get("sources") or [])
                if isinstance(s, dict) and isinstance((dq := s.get("data_query")), dict) and dq.get("sql")
            ]
            expected = item.expected_query if isinstance(item.expected_query, list) else []

            # No expectation means "the model cannot answer this": any citation is the failure.
            if not expected:
                cited_count = len(cited)
                return _item_result(
                    item,
                    passed=cited_count == 0,
                    score=0.0 if cited_count else 1.0,
                    reasoning=(
                        f"should have refused, but cited {cited_count} quer{'y' if cited_count == 1 else 'ies'}"
                        if cited_count
                        else "refused, as required"
                    ),
                    detail={
                        "data_queries": _cited_detail(cited),
                        "coverage": 0.0,
                        "uncovered": [],
                        "extra_sources": cited_count,
                        "judge": None,
                    },
                )

            # One call per expectation, with every query of the turn in hand: an answer that explores first and counts
            # second is one answer, not two candidates, and judging the queries separately rejects it for the wrong
            # reason (the exploratory query does not match the question).
            turn = cited[:MAX_SOURCES_PER_EXPECTATION]
            verdicts: list[dict[str, Any]] = []
            uncovered: list[dict[str, Any]] = []
            for expected_index, expectation in enumerate(expected):
                verdict = await judge_query(
                    question=item.query,
                    expected=expectation,
                    actual=turn,
                    schema=schema,
                    forbidden=None,
                    model_config=judge_config,
                )
                entry = {"expected_index": expected_index, **verdict.to_detail()}
                verdicts.append(entry)
                if verdict.verdict != "pass":
                    uncovered.append(entry)

            total = len(expected)
            coverage = (total - len(uncovered)) / total if total else 0.0
            passed = not uncovered
            verdict = "pass" if passed else ("undecided" if all(u.get("verdict") == "undecided" for u in uncovered) else "fail")
            reasons = [
                f"query {u['expected_index'] + 1}: {u.get('reasoning') or u.get('verdict')}" for u in uncovered
            ]
            reasoning = "; ".join(reasons) or "every expected query was covered"

            # Best effort, and never fatal: the trace is where cost and latency already live, so the verdict belongs there
            # too — the evaluation tables keep the reproducible record. Off the loop: this is a network call.
            await asyncio.to_thread(
                score_data_query_item,
                data.get("langfuse_trace_id"),
                passed=passed,
                coverage=coverage,
                reasoning=reasoning,
                kb_id=kb.id,
            )

            return _item_result(
                item,
                passed=passed,
                score=coverage,
                reasoning=reasoning,
                detail={
                    "data_queries": _cited_detail(cited),
                    "coverage": coverage,
                    "uncovered": uncovered,
                    "extra_sources": 0,   # a turn is one answer: a query outside the expectation neither covers nor fails
                    "judge": {
                        "verdict": verdict,
                        "model": judge_config.get("model_name"),
                        "prompt_version": verdicts[0]["prompt_version"] if verdicts else None,
                        "verdicts": verdicts,
                    },
                },
            )

        out = await _run_items(db, evaluation_id, run_one, item_ids)
    await asyncio.to_thread(flush_scores)   # one send for the whole run, not one per score
    return out


def _cited_detail(cited: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """What the answer ran, as stored on the run item: the arguments travel with the SQL (see DataQuerySource)."""
    return [
        {
            "mode": dq.get("mode"),
            "model_id": dq.get("model_id"),
            "metric": dq.get("metric"),
            "expression": dq.get("expression"),
            "group_by": dq.get("group_by") or [],
            "filters": dq.get("filters") or [],
            "base_dataset": dq.get("base_dataset"),
            "joins": dq.get("joins") or [],
            "resource_id": dq.get("resource_id"),
            "sql": dq.get("sql"),
        }
        for dq in cited
    ]


async def _semantic_model_schema(db: AsyncSession, semantic_model_id: str | None) -> dict[str, Any]:
    """What the judge needs to read a query: the fields, and the row identity of each dataset.

    The fields say what `pe_ttm` means and that `industry` belongs to `stock_basic`. The keys say that `count(*)` and
    `count(distinct ts_code)` are the same number on a table keyed by `ts_code` — without them the judge flags a correct
    answer as a different measure.
    """
    if not semantic_model_id:
        return {"fields": [], "datasets": []}

    rows = (
        await db.execute(
            select(SemanticModelField)
            .where(SemanticModelField.semantic_model_id == semantic_model_id)
            .order_by(SemanticModelField.ordinal)
            .limit(200)
        )
    ).scalars().all()
    dataset_ids = {row.dataset_id for row in rows}
    datasets = (
        (await db.execute(select(Dataset).where(Dataset.id.in_(dataset_ids)))).scalars().all()
        if dataset_ids
        else []
    )
    return {
        "fields": [
            {
                "name": row.name,
                "datatype": row.datatype,
                "description": (row.description or row.label or "")[:300] or None,
                "dataset_id": row.dataset_id,
            }
            for row in rows
        ],
        "datasets": [
            {
                "id": dataset.id,
                "name": dataset.display_name
                or (f"{dataset.schema_name}.{dataset.table_name}" if dataset.schema_name else dataset.table_name)
                or dataset.id,
                "primary_key": dataset.primary_key_columns or [],
                "unique_keys": dataset.unique_keys or [],
            }
            for dataset in datasets
        ],
    }

