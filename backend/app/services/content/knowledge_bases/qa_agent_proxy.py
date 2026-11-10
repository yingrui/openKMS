"""Build URLs and JSON bodies for the per-KB qa-agent API."""

from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
from fastapi import HTTPException

if TYPE_CHECKING:
    pass

from typing import Any

from app.models.knowledge_base import KnowledgeBase
from app.schemas.kb_agent_config import parse_agent_config

CORE_AGENT_SKILLS = ("ontology", "catalog", "page_index")


def resolve_agent_skills(kb: KnowledgeBase) -> list[str]:
    """Skills forwarded to qa-agent; null KB field → core defaults."""
    raw = kb.agent_skills
    if isinstance(raw, list) and raw:
        return [str(s) for s in raw if isinstance(s, str) and s.strip()]
    return list(CORE_AGENT_SKILLS)


def agent_kb_path(agent_url: str, kb_id: str, suffix: str) -> str:
    """``{agent_url}/knowledge-bases/{kb_id}/{suffix}`` (suffix e.g. ``ask``, ``ask/stream``)."""
    base = agent_url.rstrip("/")
    s = suffix.lstrip("/")
    return f"{base}/knowledge-bases/{kb_id}/{s}"


def ask_agent_body(
    *,
    kb: KnowledgeBase,
    question: str,
    conversation_history: list[dict[str, str]],
    access_token: str,
    session_id: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "question": question,
        "conversation_history": conversation_history,
        "access_token": access_token,
        "agent_skills": resolve_agent_skills(kb),
    }
    # Retrieval depth and answer policy live per KB now; an empty config resolves to today's behaviour on the agent side.
    agent_config = parse_agent_config(kb.agent_config).model_dump(exclude_none=True)
    if agent_config:
        body["agent_config"] = agent_config
    if session_id:
        body["session_id"] = session_id
    return body


def retrieve_agent_body(
    *,
    kb: KnowledgeBase,
    query: str,
    access_token: str,
    top_k: int,
) -> dict[str, Any]:
    return {
        "query": query,
        "access_token": access_token,
        "top_k": top_k,
        "agent_skills": resolve_agent_skills(kb),
    }


def agent_error(exc: httpx.HTTPStatusError) -> HTTPException:
    """A 4xx from the agent is a client-side condition, not a gateway failure.

    The agent answers 400 for a bad request and 429 when a knowledge base has hit a ceiling; turning either into 502 told the
    caller "the service is broken" and dropped the reason. 5xx stays a 502: that *is* the upstream failing.
    """
    status = exc.response.status_code
    if status in (400, 404, 429):
        detail: object = "Agent rejected the request"
        try:
            body = exc.response.json()
            detail = body.get("detail", detail) if isinstance(body, dict) else detail
        except ValueError:
            pass
        headers = {}
        if status == 429:
            retry = exc.response.headers.get("Retry-After")
            if retry:
                headers["Retry-After"] = retry
        return HTTPException(status_code=status, detail=detail, headers=headers or None)
    return HTTPException(status_code=502, detail="Agent service returned an error")
