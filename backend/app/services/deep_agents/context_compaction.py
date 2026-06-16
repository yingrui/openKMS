"""Pre-run context compaction for unattended scheduled agent turns."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from deepagents.middleware.summarization import create_summarization_middleware
from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

_MAX_COMPACTION_ROUNDS = 5


async def compact_project_context_if_needed(
    agent: Any,
    cfg: dict,
    *,
    llm: BaseChatModel,
    backend: Any,
    max_rounds: int = _MAX_COMPACTION_ROUNDS,
) -> int:
    """Summarize checkpoint context when over the model budget (scheduled runs).

    Uses the same thresholds as deepagents ``SummarizationMiddleware``. Updates
    ``_summarization_event`` on the LangGraph thread without mutating raw messages.
    """
    mw = create_summarization_middleware(llm, backend)
    rounds = 0

    for _ in range(max_rounds):
        snap = await agent.aget_state(cfg)
        state = dict(snap.values or {})
        messages = list(state.get("messages") or [])
        event = state.get("_summarization_event")
        effective = mw._apply_event_to_messages(messages, event)

        try:
            total_tokens = mw.token_counter(effective)
        except TypeError:
            total_tokens = mw.token_counter(effective)

        if not mw._should_summarize(effective, total_tokens):
            break

        cutoff = mw._determine_cutoff_index(effective)
        if cutoff <= 0:
            break

        to_summarize, _preserved = mw._partition_messages(effective, cutoff)
        file_path, summary = await asyncio.gather(
            mw._aoffload_to_backend(backend, to_summarize),
            mw._acreate_summary(to_summarize),
        )
        summary_msgs = mw._build_new_messages_with_path(summary, file_path)
        state_cutoff = mw._compute_state_cutoff(event, cutoff)
        new_event = {
            "cutoff_index": state_cutoff,
            "summary_message": summary_msgs[0],
            "file_path": file_path,
        }
        await agent.aupdate_state(cfg, {"_summarization_event": new_event})
        rounds += 1
        logger.info(
            "Scheduled agent compacted context (round %s, summarized %s messages)",
            rounds,
            len(to_summarize),
        )

    return rounds
