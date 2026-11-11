"""Run an evaluation in the worker.

A run is seventeen agent turns plus a judging call each: minutes, not seconds. It used to hold an HTTP request open for
that, so a closed tab lost sight of it (the row was still written, nobody could watch). It now goes through the job
mechanism the rest of the app already uses — `defer_task` from the API, `@audited_task` in `app/jobs/tasks.py`, status in
`/api/jobs`, results in `evaluation_runs` — with no new queue and no new polling protocol.

The row is created **before** the job starts, with `status="running"`: the page can then show a run in progress, and a
worker that dies leaves a run that says so rather than nothing at all.

Credential: the run acts as the person who created the evaluation. The worker has no request to forward, and this is the
same shape the scheduled project agent uses — mint a key for the stored owner (`mint_user_api_key`), run, revoke it.
Falling back to a service identity would quietly widen what the answers can read, so a missing creator fails the run
instead.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from collections.abc import Callable
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker
from app.models.evaluation import Evaluation, EvaluationItem
from app.models.evaluation_run import EvaluationRun, EvaluationRunItem
from app.models.knowledge_base import KnowledgeBase

logger = logging.getLogger(__name__)

#: What the run row needs to be re-executable from the job alone: the worker receives one id.
RUN_PARAMS_KEY = "params"


async def create_run(
    db: AsyncSession,
    *,
    evaluation: Evaluation,
    evaluation_type: str,
    judge_model_id: str,
    item_ids: list[str] | None,
    language: str,
    requested_by: str | None,
    config_snapshot: dict[str, Any],
) -> EvaluationRun:
    """The row the page watches, written before the worker starts."""
    run = EvaluationRun(
        id=str(uuid.uuid4()),
        evaluation_id=evaluation.id,
        knowledge_base_id=evaluation.knowledge_base_id,
        evaluation_type=evaluation_type,
        status="running",
        item_count=0,
        pass_count=0,
        avg_score=None,
        config_snapshot={
            **config_snapshot,
            RUN_PARAMS_KEY: {
                "evaluation_type": evaluation_type,
                "judge_model_id": judge_model_id,
                "item_ids": item_ids,
                "language": language,
                "requested_by": requested_by,
            },
        },
    )
    db.add(run)
    await db.flush()
    return run


def _aggregate(item_rows: list[dict[str, Any]]) -> tuple[int, int, float | None]:
    n = len(item_rows)
    if n == 0:
        return 0, 0, None
    passed = sum(1 for r in item_rows if r.get("passed"))
    return n, passed, sum(float(r.get("score", 0)) for r in item_rows) / n


async def execute_run(run_id: str, *, should_abort: Callable[[], bool] | None = None) -> None:
    """Worker entry: run the strategy, write the results, close the row. Never raises to the worker."""
    async with async_session_maker() as db:
        run = await db.get(EvaluationRun, run_id)
        if run is None:
            logger.warning("evaluation run %s not found", run_id)
            return
        params = (run.config_snapshot or {}).get(RUN_PARAMS_KEY) or {}
        evaluation_type = str(params.get("evaluation_type") or run.evaluation_type)
        language = str(params.get("language") or "en")
        item_ids = params.get("item_ids") or None

        evaluation = await db.get(Evaluation, run.evaluation_id)
        if evaluation is None:
            await _finish_failed(db, run, "The evaluation no longer exists.")
            return
        kb = await db.get(KnowledgeBase, evaluation.knowledge_base_id)
        if kb is None:
            await _finish_failed(db, run, "The knowledge base no longer exists.")
            return

        key_id: str | None = None
        try:
            token, key_id = await _creator_token(db, evaluation)
            judge_model_id, judge_config = await _judge_config(db, kb, params.get("judge_model_id"))
            item_rows = await _execute_strategy(
                db,
                evaluation=evaluation,
                kb=kb,
                evaluation_type=evaluation_type,
                judge_config=judge_config,
                access_token=token,
                item_ids=item_ids,
                language=language,
                should_abort=should_abort,
            )
            report = None
            if evaluation_type == "data_query" and item_rows:
                from app.api.evaluations import build_run_report

                report = await build_run_report(db, evaluation, item_rows, judge_config, language)
            await _finish_completed(db, run, item_rows, report)
        except Exception as exc:  # noqa: BLE001 - recorded, never thrown at the worker loop  # noqa: BLE001 - a failed run must be recorded, not thrown at the worker loop
            logger.exception("evaluation run %s failed", run_id)
            await _finish_failed(db, run, str(exc) or type(exc).__name__)
        finally:
            if key_id:
                await _revoke(db, key_id)


async def _creator_token(db: AsyncSession, evaluation: Evaluation) -> tuple[str, str]:
    """A bearer for the person who created the evaluation — the authority the answers are read with."""
    from app.services.identity.users.user_api_key_service import mint_user_api_key

    owner = (evaluation.created_by or "").strip()
    if not owner:
        raise RuntimeError("This evaluation has no creator, so a run cannot act with anyone's authority.")
    roles = [str(r) for r in (evaluation.created_by_roles or []) if str(r).strip()]
    _row, token = await mint_user_api_key(
        db,
        owner_sub=owner,
        # In OIDC mode the key's permissions come from the realm roles it was minted with. Minting with none produced
        # `data:read` 403s on every dataset the answers needed — the run then failed for a reason that looked like ACL.
        jwt_payload={"sub": owner, "realm_access": {"roles": roles}},
        name=f"evaluation-run:{evaluation.id[:8]}",
        purpose="evaluation_run",
    )
    await db.commit()
    return token, _row.id


async def _revoke(db: AsyncSession, key_id: str) -> None:
    from app.services.identity.users.user_api_key_service import revoke_user_api_key

    try:
        await revoke_user_api_key(db, key_id)
        await db.commit()
    except Exception:  # noqa: BLE001 - a key that outlives a failed revoke is a cron's problem, not the run's
        logger.warning("could not revoke evaluation run key %s", key_id)


async def _judge_config(db: AsyncSession, kb: KnowledgeBase, override_id: str | None) -> tuple[str, dict[str, Any]]:
    from app.api.evaluations import resolve_judge_override

    return await resolve_judge_override(db, kb, override_id)


async def _execute_strategy(
    db: AsyncSession,
    *,
    evaluation: Evaluation,
    kb: KnowledgeBase,
    evaluation_type: str,
    judge_config: dict[str, Any],
    access_token: str,
    item_ids: list[str] | None,
    language: str,
    should_abort: Callable[[], bool] | None = None,
) -> list[dict[str, Any]]:
    from app.services.workspace.evaluations.execute import (
        EVALUATION_TYPE_DATA_QUERY,
        EVALUATION_TYPE_QA_ANSWER,
        EVALUATION_TYPE_SEARCH_RETRIEVAL,
        EVALUATION_TYPE_WIKI_CONTENT_COVERAGE,
        run_data_query_evaluation,
        run_qa_answer_evaluation,
        run_search_retrieval_evaluation,
    )
    from app.services.workspace.evaluations.wiki_execute import run_wiki_content_coverage_evaluation

    if evaluation_type == EVALUATION_TYPE_SEARCH_RETRIEVAL:
        return await run_search_retrieval_evaluation(
            db, evaluation.knowledge_base_id, evaluation.id, judge_config, item_ids, should_abort
        )
    if evaluation_type == EVALUATION_TYPE_QA_ANSWER:
        return await run_qa_answer_evaluation(
            db, kb, evaluation.id, judge_config, access_token, item_ids, should_abort
        )
    if evaluation_type == EVALUATION_TYPE_WIKI_CONTENT_COVERAGE:
        return await run_wiki_content_coverage_evaluation(
            db, evaluation.wiki_space_id, evaluation.id, judge_config
        )
    if evaluation_type == EVALUATION_TYPE_DATA_QUERY:
        return await run_data_query_evaluation(
            db, kb, evaluation.id, judge_config, access_token, item_ids, language, should_abort
        )
    raise HTTPException(status_code=400, detail=f"Unhandled evaluation type: {evaluation_type}")


async def _finish_completed(
    db: AsyncSession, run: EvaluationRun, item_rows: list[dict[str, Any]], report: dict | None
) -> None:
    if await _still_there(db, run) is False:
        return
    n, passed, avg = _aggregate(item_rows)
    run.status = "completed"
    run.item_count = n
    run.pass_count = passed
    run.avg_score = avg
    run.report = report
    run.error_message = None
    run.finished_at = datetime.now(timezone.utc)
    existing = await db.execute(select(EvaluationRunItem.id).where(EvaluationRunItem.evaluation_run_id == run.id))
    for (row_id,) in existing.all():
        await db.delete(await db.get(EvaluationRunItem, row_id))
    for r in item_rows:
        db.add(
            EvaluationRunItem(
                id=str(uuid.uuid4()),
                evaluation_run_id=run.id,
                evaluation_item_id=r["evaluation_item_id"],
                passed=bool(r.get("passed")),
                score=float(r.get("score", 0)),
                reasoning=str(r.get("reasoning", "")),
                detail=r.get("detail"),
            )
        )
    await _commit_quietly(db, run)


async def _finish_failed(db: AsyncSession, run: EvaluationRun, message: str) -> None:
    if await _still_there(db, run) is False:
        return
    run.status = "failed"
    run.error_message = message[:2000]
    run.finished_at = datetime.now(timezone.utc)
    await _commit_quietly(db, run)


async def _still_there(db: AsyncSession, run: EvaluationRun) -> bool:
    """A run the reader deleted mid-flight is not a failure to record — there is nothing left to record it on."""
    exists = await db.get(EvaluationRun, run.id)
    if exists is None:
        logger.info("evaluation run %s disappeared before it finished; nothing to write", run.id)
        return False
    return True


async def _commit_quietly(db: AsyncSession, run: EvaluationRun) -> None:
    try:
        await db.commit()
    except StaleDataError:
        # Deleted between the check above and the write: the row is gone, and so is the point of the update.
        await db.rollback()
        logger.info("evaluation run %s was removed while finishing", run.id)


async def run_item_count(db: AsyncSession, evaluation_id: str, item_ids: list[str] | None) -> int:
    """How many items a run will touch, for the estimate shown before it starts."""
    rows = await db.execute(select(EvaluationItem.id).where(EvaluationItem.evaluation_id == evaluation_id))
    ids = [row[0] for row in rows.all()]
    if item_ids is None:
        return len(ids)
    wanted = set(item_ids)
    return len([i for i in ids if i in wanted])
