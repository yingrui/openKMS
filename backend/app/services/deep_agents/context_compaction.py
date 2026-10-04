"""Context compaction before project agent turns (interactive + scheduled)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from deepagents.middleware.summarization import (
    SUMMARIZATION_SESSION_ID_KEY,
    create_summarization_middleware,
)
from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

_MAX_COMPACTION_ROUNDS = 5
_SUMMARIZATION_EVENT_KEY = "_summarization_event"


async def compact_project_context_if_needed(
    agent: Any,
    cfg: dict,
    *,
    llm: BaseChatModel,
    backend: Any,
    max_rounds: int = _MAX_COMPACTION_ROUNDS,
) -> int:
    """Summarize checkpoint context when over the model budget.

    Uses the same thresholds as deepagents ``SummarizationMiddleware``. Updates
    ``_summarization_event`` (and session id) on the LangGraph thread without
    mutating raw messages. Called before interactive and scheduled turns when
    the thread already has state.
    """
    mw = create_summarization_middleware(llm, backend)
    rounds = 0

    for _ in range(max_rounds):
        snap = await agent.aget_state(cfg)
        state = dict(snap.values or {})
        messages = list(state.get("messages") or [])
        event = state.get(_SUMMARIZATION_EVENT_KEY)
        effective = mw._apply_event_to_messages(messages, event)

        total_tokens = mw.token_counter(effective)

        if not mw._should_summarize(effective, total_tokens):
            break

        cutoff = mw._determine_cutoff_index(effective)
        if cutoff <= 0:
            break

        to_summarize, _preserved = mw._partition_messages(effective, cutoff)
        # Match deepagents compact path: media offload first, then history file
        # + summary in parallel, reusing a stable session id across rounds.
        offloaded_messages, _failed_media = await mw._aoffload_inline_media(backend, to_summarize)
        session_id = mw._get_session_id(state)
        file_path, summary = await asyncio.gather(
            mw._aoffload_to_backend(backend, offloaded_messages, session_id),
            mw._acreate_summary(offloaded_messages),
        )
        summary_msgs = mw._build_new_messages_with_path(summary, file_path)
        state_cutoff = mw._compute_state_cutoff(event, cutoff)
        new_event = {
            "cutoff_index": state_cutoff,
            "summary_message": summary_msgs[0],
            "file_path": file_path,
        }
        await agent.aupdate_state(
            cfg,
            {
                _SUMMARIZATION_EVENT_KEY: new_event,
                SUMMARIZATION_SESSION_ID_KEY: session_id,
            },
        )
        # Keep session id in local state for multi-round compaction in one call.
        state[SUMMARIZATION_SESSION_ID_KEY] = session_id
        state[_SUMMARIZATION_EVENT_KEY] = new_event
        rounds += 1
        logger.info(
            "Project agent compacted context (round %s, summarized %s messages)",
            rounds,
            len(to_summarize),
        )

    return rounds
