"""Push an evaluation's verdict to Langfuse as a score on the answer's trace.

Two homes for one judgement, and each is right for something different: the evaluation tables hold the reproducible record
(ground truth, per-item detail, run-over-run comparison), and Langfuse holds the trace — latency, cost, tool calls, and the
conversation a human reviews. A score is the join: it puts "did the answer cite the right query" on the same screen as what
the answer cost.

Best effort by design: a langfuse outage must not turn a finished evaluation into a failed one.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

#: Score names. Prefixed by family so a Langfuse dashboard can filter one kind of answer from another.
SCORE_DATA_QUERY_COVERAGE = "data_query_coverage"
SCORE_DATA_QUERY_PASS = "data_query_pass"
SCORE_GROUNDING_RATIO = "grounding_ratio"


#: One client for the process. It was built per score — two per evaluated answer — which meant a new HTTP client and a
#: flush for every number written. A run now creates it once and flushes once.
_client_cache: Any | None = None
_client_unavailable = False


def _client() -> Any | None:
    global _client_cache, _client_unavailable
    if _client_cache is not None or _client_unavailable:
        return _client_cache
    if not (
        (settings.langfuse_secret_key or "").strip()
        and (settings.langfuse_public_key or "").strip()
        and (settings.langfuse_base_url or "").strip()
    ):
        _client_unavailable = True
        return None
    os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.langfuse_secret_key or "")
    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.langfuse_public_key or "")
    os.environ.setdefault("LANGFUSE_HOST", settings.langfuse_base_url or "")
    try:
        from langfuse import Langfuse

        _client_cache = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_base_url,
        )
    except (ImportError, RuntimeError, ValueError) as exc:
        logger.debug("langfuse client unavailable: %s", exc)
        _client_unavailable = True
    return _client_cache


def flush_scores() -> None:
    """Send what the batch client is holding. A run calls this once, at the end; per-score flushing was 2N round trips."""
    if _client_cache is None:
        return
    try:
        _client_cache.flush()
    except (RuntimeError, ValueError, OSError) as exc:
        logger.debug("langfuse flush failed: %s", exc)


def score_trace(
    trace_id: str | None,
    name: str,
    value: float,
    *,
    comment: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> bool:
    """Attach one score. Returns False when Langfuse is not configured, the trace is unknown, or the call fails."""
    if not trace_id:
        return False
    client = _client()
    if client is None:
        return False
    try:
        client.create_score(
            trace_id=trace_id,
            name=name,
            value=value,
            comment=comment,
            metadata=metadata or {},
        )
        return True
    except (RuntimeError, ValueError, TypeError, OSError) as exc:
        logger.warning("langfuse score %s for %s failed: %s", name, trace_id, exc)
        return False


def score_data_query_item(
    trace_id: str | None,
    *,
    passed: bool,
    coverage: float,
    reasoning: str,
    kb_id: str | None = None,
) -> int:
    """The two scores a data-query verdict produces: did it pass, and how much of the expected set did it cover."""
    wrote = 0
    wrote += score_trace(
        trace_id,
        SCORE_DATA_QUERY_PASS,
        1.0 if passed else 0.0,
        comment=reasoning[:500] or None,
        metadata={"kb_id": kb_id},
    )
    wrote += score_trace(
        trace_id,
        SCORE_DATA_QUERY_COVERAGE,
        float(coverage),
        comment=reasoning[:500] or None,
        metadata={"kb_id": kb_id},
    )
    return wrote
