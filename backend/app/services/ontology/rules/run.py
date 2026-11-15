"""Run a rule (or a subject's rules) inside one snapshot.

Each operand is a separate query, so a rule evaluated outside a transaction reads the two sides at two
different moments: a write in between produces a failure that never happened (or a pass that hides one), and
neither can be reproduced afterwards. `REPEATABLE READ` costs nothing here and makes the comparison a
comparison of one consistent state.
"""
from __future__ import annotations

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker
from app.models.object_instance import ObjectInstance
from app.services.ontology.rules.evaluator import EvalResult, evaluate_rule, evaluate_rules_for_subject


async def _snapshot_session() -> AsyncSession:
    """A session whose transaction sees one snapshot for every statement in it."""
    session = async_session_maker()
    # Must be the first statement of the transaction — nothing has been executed on this session yet.
    await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
    return session


async def evaluate_rule_in_snapshot(
    request: Request,
    *,
    rule_id: str,
    period_start: str = "",
    period_end: str = "",
    dry_run: bool = False,
) -> list[EvalResult]:
    """Evaluate one rule; the caller keeps its own session for loading and serialising."""
    session = await _snapshot_session()
    try:
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
    session = await _snapshot_session()
    try:
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
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
