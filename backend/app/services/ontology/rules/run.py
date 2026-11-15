"""Run a rule (or a subject's rules) inside one snapshot.

Each operand is a separate query, so a rule evaluated outside a transaction reads the two sides at two
different moments: a write in between produces a failure that never happened (or a pass that hides one), and
neither can be reproduced afterwards. `REPEATABLE READ` costs nothing here and makes the comparison a
comparison of one consistent state.
"""
from __future__ import annotations

import asyncio

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.database import async_session_maker
from app.models.object_instance import ObjectInstance
from app.services.ontology.rules.evaluator import EvalResult, evaluate_rule, evaluate_rules_for_subject


#: Serialisation failures under `REPEATABLE READ` are retried rather than serialised up front: a run is
#: idempotent by design (dedupe key + upsert), so repeating it is safe — and holding a lock across the whole
#: run would park a pooled connection per waiter for as long as the slowest evaluation takes.
RETRYABLE_SQLSTATE = "40001"
MAX_ATTEMPTS = 5


def _is_serialization_error(exc: BaseException) -> bool:
    if not isinstance(exc, DBAPIError):
        return False
    for candidate in (exc, exc.orig, getattr(exc.orig, "__cause__", None)):
        state = getattr(candidate, "sqlstate", None) or getattr(candidate, "pgcode", None)
        if state == RETRYABLE_SQLSTATE:
            return True
    text_repr = str(exc)
    return "40001" in text_repr or "could not serialize access" in text_repr


async def evaluate_rule_in_snapshot(
    request: Request,
    *,
    rule_id: str,
    period_start: str = "",
    period_end: str = "",
    dry_run: bool = False,
) -> list[EvalResult]:
    """Evaluate one rule; the caller keeps its own session for loading and serialising."""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        session = async_session_maker()
        try:
            await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
            rule = await session.get(ObjectInstance, rule_id)
            if rule is None:
                return []
            results = await evaluate_rule(
                session,
                request,
                rule=rule,
                period_start=period_start,
                period_end=period_end,
                dry_run=dry_run,
            )
            await session.commit()
            return results
        except DBAPIError as exc:
            await session.rollback()
            if not _is_serialization_error(exc) or attempt == MAX_ATTEMPTS:
                raise
            await asyncio.sleep(0.05 * attempt)
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def evaluate_subject_in_snapshot(
    request: Request,
    *,
    subject_type: str | None = None,
    subject_id: str | None = None,
    period_start: str = "",
    period_end: str = "",
    limit: int = 100,
) -> list[EvalResult]:
    """Every active rule of a subject, all against the same snapshot."""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        session = async_session_maker()
        try:
            await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
            results = await evaluate_rules_for_subject(
                session,
                request,
                subject_type=subject_type,
                subject_id=subject_id,
                period_start=period_start,
                period_end=period_end,
                limit=limit,
            )
            await session.commit()
            return results
        except DBAPIError as exc:
            await session.rollback()
            if not _is_serialization_error(exc) or attempt == MAX_ATTEMPTS:
                raise
            await asyncio.sleep(0.05 * attempt)
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
