"""Build URLs and JSON bodies for the per-KB qa-agent API."""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException

from app.config import settings
from app.models.knowledge_base import KnowledgeBase
from app.schemas.kb_agent_config import parse_agent_config

CORE_AGENT_SKILLS = ("ontology", "catalog", "page_index")


def resolve_agent_skills(kb: KnowledgeBase) -> list[str]:
    """Skills forwarded to qa-agent; null KB field → core defaults."""
    raw = kb.agent_skills
    if isinstance(raw, list) and raw:
        return [str(s) for s in raw if isinstance(s, str) and s.strip()]
    return list(CORE_AGENT_SKILLS)


def resolve_agent_url(kb: KnowledgeBase) -> str | None:
    """Where this deployment's qa-agent lives.

    A knowledge base may still name its own agent (older deployments); the deployment-wide
    ``OPENKMS_QA_AGENT_URL`` is the default a new workforce agent starts from.
    """
    return kb.agent_url or settings.qa_agent_url or None


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
    system_prompt: str | None = None,
    prompt_version: str | None = None,
    agent_skills: list[str] | None = None,
    agent_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The qa-agent request body.

    ``agent_skills`` / ``agent_config`` default to the knowledge base's own values, which is exactly
    the pre-Workforce payload. A workforce agent passes its own: the same knowledge source can answer
    as different services.
    """
    body: dict[str, Any] = {
        "question": question,
        "conversation_history": conversation_history,
        "access_token": access_token,
        "agent_skills": resolve_agent_skills(kb) if agent_skills is None else agent_skills,
    }
    # The published prompt version, resolved by the caller (it has the session). Absent means the built-in text.
    if system_prompt:
        body["system_prompt"] = system_prompt
        body["prompt_version"] = prompt_version
    # Retrieval depth and answer policy live per KB now; an empty config resolves to today's behaviour on the agent side.
    config = (
        parse_agent_config(kb.agent_config).model_dump(exclude_none=True)
        if agent_config is None
        else agent_config
    )
    if config:
        body["agent_config"] = config
    if session_id:
        body["session_id"] = session_id
    return body


def base_instruction_for(agent_config: dict[str, Any] | None) -> str | None:
    """The author-written base instruction inside an agent config, if any.

    Sent as `system_prompt`, which the qa-agent uses as the first paragraph of the prompt; the skill descriptions,
    policy rules and retrieved passages are appended by the runtime and are not part of this text.
    """
    from app.schemas.kb_agent_config import parse_agent_config

    return parse_agent_config(agent_config or {}).prompts.system_prompt


async def ask_agent_body_for_kb(db: Any, *, kb: KnowledgeBase, **kwargs: Any) -> dict[str, Any]:
    """`ask_agent_body` with the knowledge base's default workforce agent supplying the runtime half.

    A knowledge base's own Q&A is one agent's job. Resolving that agent here (instead of reading the
    knowledge base's copy) is what makes the agent the single source: editing the agent changes the
    knowledge base's answers, and the legacy Agent tab writes through to the same row.
    """
    from app.services.workforce.agent_config import agent_skills_for, runtime_config
    from app.services.workforce.read import default_agent_for_kb

    agent = await default_agent_for_kb(db, kb.id)
    return ask_agent_body(
        kb=kb,
        agent_skills=agent_skills_for(kb, agent),
        agent_config=runtime_config(kb, agent),
        **kwargs,
    )


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
