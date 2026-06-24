"""Wiki space evaluation: wiki content coverage (LLM judge)."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evaluation import EvaluationItem
from app.models.wiki_models import WikiPage, WikiSpace
from app.services.evaluations.search_judge import judge_wiki_content_coverage
from app.services.wiki.wiki_semantic_index import (
    semantic_match_pages,
    wiki_pages_string_match_ids,
)

logger = logging.getLogger(__name__)

SNIPPET_MAX_LEN = 500


def _snippet(content: str, max_len: int = SNIPPET_MAX_LEN) -> str:
    c = content or ""
    return c if len(c) <= max_len else c[:max_len]


async def _pages_by_ids_order(db: AsyncSession, space_id: str, ids_in_order: list[str]) -> list[WikiPage]:
    if not ids_in_order:
        return []
    stmt = select(WikiPage).where(WikiPage.wiki_space_id == space_id, WikiPage.id.in_(ids_in_order))
    rows = list((await db.execute(stmt)).scalars().all())
    by_id = {str(p.id): p for p in rows}
    return [by_id[i] for i in ids_in_order if i in by_id]


def _page_to_passage(page: WikiPage, sim: float | None = None) -> dict[str, Any]:
    title = page.title or ""
    path = page.path or ""
    body = (page.body or "")[:8000]
    text = f"Path: {path}\nTitle: {title}\n\n{body}"
    score = float(sim) if sim is not None else 1.0
    return {"content": text, "score": score, "source_type": "wiki_page"}


async def _ranked_page_ids_for_query(
    db: AsyncSession, ws: WikiSpace, query: str, *, top_k: int
) -> tuple[list[str], list[tuple[str, float | None]]]:
    string_ids = await wiki_pages_string_match_ids(db, ws.id, query, limit=top_k)
    if string_ids:
        meta = [(pid, None) for pid in string_ids[:top_k]]
        return [pid for pid, _ in meta], meta
    rows, _skipped = await semantic_match_pages(db, ws, query, top_k=top_k)
    meta = list(rows[:top_k])
    return [pid for pid, _sim in meta], [(pid, float(sim)) for pid, sim in meta]


async def run_wiki_content_coverage_evaluation(
    db: AsyncSession,
    wiki_space_id: str,
    evaluation_id: str,
    judge_config: dict[str, Any],
) -> list[dict[str, Any]]:
    ws = await db.get(WikiSpace, wiki_space_id)
    if not ws:
        raise ValueError("Wiki space not found.")

    items_result = await db.execute(
        select(EvaluationItem)
        .where(EvaluationItem.evaluation_id == evaluation_id)
        .order_by(EvaluationItem.sort_order, EvaluationItem.created_at)
    )
    items = list(items_result.scalars().all())
    out: list[dict[str, Any]] = []

    for item in items:
        try:
            ids_order, id_sims = await _ranked_page_ids_for_query(db, ws, item.query, top_k=3)
            sim_by_id = {pid: sim for pid, sim in id_sims}
            pages = await _pages_by_ids_order(db, wiki_space_id, ids_order)
            if not pages:
                out.append(
                    {
                        "evaluation_item_id": item.id,
                        "query": item.query,
                        "expected_answer": item.expected_answer,
                        "passed": False,
                        "score": 0.0,
                        "reasoning": (
                            "No wiki pages to evaluate (no title/path match and no usable semantic results). "
                            "Build the wiki semantic index in space settings if you rely on semantic fallback."
                        ),
                        "detail": {"search_results": []},
                    }
                )
                continue
            search_list = [_page_to_passage(p, sim_by_id.get(str(p.id))) for p in pages]
            verdict = await judge_wiki_content_coverage(
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
                    "reasoning": str(verdict.get("reasoning", "")),
                    "detail": {"search_results": snippets, "source": "retrieval_top3"},
                }
            )
        except Exception as e:
            logger.exception("wiki_content_coverage item failed")
            out.append(
                {
                    "evaluation_item_id": item.id,
                    "query": item.query,
                    "expected_answer": item.expected_answer,
                    "passed": False,
                    "score": 0.0,
                    "reasoning": str(e),
                    "detail": {"search_results": []},
                }
            )

    return out
