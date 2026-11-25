"""Evaluating a Function: run every case against its published version, then say which ones failed and why.

This lives in Evaluations rather than in the Function Editor because an evaluation is a thing in its own right — a case
set with run history and comparison — and a second eval system would mean a second judge, a second history, and two
places where "did it get better" is answered differently.

Two properties matter more than the score:

* **the version is recorded with the run.** Comparing v3's pass rate with v4's is the whole point of iterating on a
  prompt; a run that does not say which version it measured cannot be compared with anything.
* **comparison is by declared keys, not by whole-JSON equality.** An expectation names the fields that must match; the
  rest of the output is free. Whole-object equality fails on a timestamp and teaches nobody anything.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable

from fastapi import HTTPException
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evaluation import Evaluation, EvaluationItem
from app.models.ontology_function import OntologyFunction
from app.services.ontology import execution_service
from app.services.ontology.function_runtime import FunctionExecutionError
from app.services.ontology.logic_model_registry import resolve_model
from app.services.ontology.logic_runtime import FlowError
from app.services.workspace.evaluations.function_judge import judge_output

logger = logging.getLogger(__name__)

EVALUATION_TYPE_FUNCTION_OUTPUT = "function_output"


def compare_expected(expected: dict[str, Any] | None, output: Any) -> tuple[bool, str]:
    """Every declared key must match. Missing keys are failures; extra output keys are not."""
    if not expected:
        return False, "No expected output: nothing to compare against."
    if not isinstance(output, dict):
        return False, f"Expected an object with {sorted(expected)} but got {type(output).__name__}."

    mismatches: list[str] = []
    for key, want in expected.items():
        if key not in output:
            mismatches.append(f"{key}: missing (expected {json.dumps(want, ensure_ascii=False)})")
            continue
        got = output[key]
        if _normalised(got) != _normalised(want):
            mismatches.append(
                f"{key}: expected {json.dumps(want, ensure_ascii=False)}, got "
                f"{json.dumps(got, ensure_ascii=False)}"
            )
    if mismatches:
        return False, "; ".join(mismatches)
    return True, f"Matched every expected key: {', '.join(sorted(expected))}."


def _normalised(value: Any) -> Any:
    """Numbers compare by value (1 == 1.0), and JSON answers compare as JSON — not as Python identity."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        return value.strip()
    return json.loads(json.dumps(value, sort_keys=True, default=str))


async def run_function_evaluation(
    db: AsyncSession,
    evaluation: Evaluation,
    *,
    access_token: str,
    judge_model_id: str | None = None,
    item_ids: list[str] | None = None,
    should_abort: Callable[[], bool] | None = None,
) -> list[dict[str, Any]]:
    """One result row per case, in the shape the run job aggregates."""
    if not evaluation.function_id:
        raise ValueError("This evaluation has no function")
    fn = await db.get(OntologyFunction, evaluation.function_id)
    if not fn:
        raise ValueError("Function not found")

    stmt = (
        select(EvaluationItem)
        .where(EvaluationItem.evaluation_id == evaluation.id)
        .order_by(EvaluationItem.sort_order, EvaluationItem.created_at)
    )
    items = list((await db.execute(stmt)).scalars().all())
    if item_ids:
        wanted = set(item_ids)
        items = [item for item in items if item.id in wanted]

    # The judge is resolved on first use: a run whose cases all match exactly never touches the model registry.
    judge_cache: dict[str, Any] = {}

    async def get_judge() -> Any:
        if "model" not in judge_cache:
            judge_cache["model"] = await resolve_model(db, judge_model_id)
        return judge_cache["model"]

    rows: list[dict[str, Any]] = []
    for item in items:
        if should_abort is not None and should_abort():
            break
        payload = item.input_payload or {}
        detail: dict[str, Any] = {"input": payload}
        try:
            result = await execution_service.execute_function_by_id(
                db,
                fn.id,
                input_payload=payload,
                version_id=None,
                use_published=True,
                caller_user_id=None,
                caller_token=access_token,
            )
        except (HTTPException, FlowError, FunctionExecutionError, httpx.HTTPError) as e:
            rows.append(
                _row(item, passed=False, score=0.0, reasoning=f"Execution failed: {e}", detail={**detail, "error": str(e)})
            )
            continue

        output = result.output
        passed, reasoning = compare_expected(item.expected_output, output)
        judge: dict[str, Any] | None = None
        if result.status == "ok" and not passed and _needs_judge(item):
            # Exact comparison is the wrong tool for prose: ask whether the substance matches.
            judge = await judge_output(
                model=await get_judge(),
                expectation=item.expected_output or item.expected_answer or "",
                output=output,
                input_payload=payload,
            )
            if judge["verdict"] == "pass":
                passed = True
                reasoning = f"Exact comparison missed it; the judge accepted it: {judge['reasoning']}"
            elif judge["verdict"] == "fail":
                reasoning = f"{reasoning} (judge: {judge['reasoning']})"
            else:
                reasoning = f"{reasoning} (judge undecided: {judge['reasoning']})"

        trace = (result.trace or {}).get("nodes") if isinstance(result.trace, dict) else None
        rows.append(
            _row(
                item,
                passed=passed and result.status == "ok",
                score=1.0 if passed and result.status == "ok" else 0.0,
                reasoning=reasoning if result.status == "ok" else (result.error or "Execution failed"),
                detail={
                    **detail,
                    "output": output,
                    **({"judge": judge} if judge else {}),
                    "status": result.status,
                    "execution_id": result.execution_id,
                    "duration_ms": result.duration_ms,
                    # A Logic function's trace is the only account of what actually happened.
                    "trace_nodes": [
                        {"id": node.get("id"), "kind": node.get("kind"), "ok": node.get("ok")}
                        for node in (trace or [])
                    ],
                },
            )
        )
    return rows


def _needs_judge(item: EvaluationItem) -> bool:
    """Prose can only be judged; precise expectations are compared and then, if they miss, judged too."""
    if not (item.expected_output or item.expected_answer):
        return False
    return True


def _row(
    item: EvaluationItem,
    *,
    passed: bool,
    score: float,
    reasoning: str,
    detail: dict[str, Any],
) -> dict[str, Any]:
    return {
        "evaluation_item_id": item.id,
        "query": item.query or "",
        "passed": passed,
        "score": score,
        "reasoning": reasoning,
        "detail": detail,
    }


def version_snapshot(fn: OntologyFunction, version: int | None) -> dict[str, Any]:
    """What a run measured, so two runs are comparable and the difference has a name."""
    return {
        "target": "function",
        "function_id": fn.id,
        "function_api_name": fn.api_name,
        "version": version,
        "source": fn.source,
    }
