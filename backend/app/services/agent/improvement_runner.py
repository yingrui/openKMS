"""Improvement agent: refine AGENTS.md / MEMORY.md / Skills guided by lesson events."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from deepagents import create_deep_agent
from langchain_core.messages import HumanMessage
from langgraph.errors import GraphRecursionError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.agent.llm import resolve_agent_llm_config
from app.services.deep_agents.env import build_project_shell_env
from app.services.deep_agents.project_backend import ProjectWorkspaceBackend
from app.services.deep_agents.stream_events import ProjectStreamPart
from app.services.project_fs import project_root, read_agents_md, read_lessons_json, read_memory_md

logger = logging.getLogger(__name__)


def _normalize_openai_base_url(url: str) -> str:
    b = (url or "").rstrip("/")
    return b if b.endswith("/v1") else f"{b}/v1"


def _format_lessons_for_prompt(raw_lessons: str) -> str:
    if not raw_lessons.strip():
        return "(no approved lessons yet)"
    import json
    try:
        items = json.loads(raw_lessons)
    except (json.JSONDecodeError, TypeError):
        return "(could not parse lessons)"
    approved = [l for l in items if isinstance(l, dict) and l.get("status") == "approved"]
    if not approved:
        return "(no approved lessons yet)"
    parts: list[str] = []
    for i, l in enumerate(approved, 1):
        parts.append(
            f"{i}. [{l.get('type', '?')}|{l.get('severity', '?')}] {l.get('what_went_wrong', '')}"
        )
        fix = l.get("what_fixed_it")
        if fix:
            parts.append(f"   Fix: {fix}")
        parts.append("")
    return "\n".join(parts)


def build_improvement_system_prompt(
    project_name: str,
    agents_md: str,
    memory_md: str,
    lessons_text: str,
) -> str:
    return f"""You are an improvement agent for project "{project_name}".
Your job is to help the user refine project artifacts based on lessons learned
from past agent conversations.

## Available files
- AGENTS.md at the workspace root — rules, constraints, behavioral guidelines for the project agent
- MEMORY.md at the workspace root — persistent project knowledge: decisions, user preferences, known pitfalls, conventions
- .openkms/lessons.json — approved lesson events extracted from conversation reviews

## Current file contents

AGENTS.md:
```
{agents_md or "(empty)"}
```

MEMORY.md:
```
{memory_md or "(empty)"}
```

## Approved lessons
{lessons_text}

## Key rules for making changes
- Read file contents with read_file before proposing any changes.
- For AGENTS.md: add rules that prevent known errors, codify best practices, or clarify constraints. Use brief, imperative style.
- For MEMORY.md: record project facts, user preferences, key decisions, known pitfalls, conventions that the agent should remember across sessions.
- Be surgical — prefer small, targeted edits over rewriting entire files.
- Always explain what you changed and why, linking to specific lessons where relevant.
- If the user asks a question without requesting changes, answer clearly without modifying files.
- Use edit_file for small patches; use write_file only when replacing the whole file is warranted."""


async def iter_improvement_stream_parts(
    db: AsyncSession,
    *,
    project_id: str,
    project_name: str,
    project_settings: dict,
    bearer_token: str,
    user_message: str,
) -> AsyncIterator[ProjectStreamPart]:
    cfg = await resolve_agent_llm_config(db, model_id=settings.deep_agent_model_id)
    if not cfg or not cfg.get("base_url"):
        yield {"type": "fatal", "message": "No LLM configured for agents"}
        return

    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI(
        base_url=_normalize_openai_base_url(cfg["base_url"]),
        api_key=cfg.get("api_key") or "not-needed",
        model=cfg.get("model_name") or "gpt-4o-mini",
        max_tokens=settings.agent_max_output_tokens,
        streaming=True,
        temperature=0.3,
    )

    agents_md = read_agents_md(project_id)
    memory_md = read_memory_md(project_id)
    raw_lessons = read_lessons_json(project_id)
    lessons_text = _format_lessons_for_prompt(raw_lessons)

    root = str(project_root(project_id))
    shell_env = build_project_shell_env(project_id, bearer_token, project_settings)
    backend = ProjectWorkspaceBackend(
        root_dir=root,
        virtual_mode=True,
        inherit_env=True,
        env=shell_env,
        timeout=settings.agent_sandbox_timeout_seconds,
    )

    skills_paths: list[str] = []
    try:
        from app.services.deep_agents.skills.loader import list_skill_paths
        skills_paths = list_skill_paths(project_id)
    except Exception:
        pass

    try:
        agent = create_deep_agent(
            model=llm,
            system_prompt=build_improvement_system_prompt(
                project_name, agents_md, memory_md, lessons_text,
            ),
            skills=skills_paths or None,
            backend=backend,
        )
    except Exception as e:
        logger.exception("create_deep_agent failed for improvement agent")
        yield {"type": "fatal", "message": str(e)}
        return

    messages = [HumanMessage(content=user_message)]

    from uuid import uuid4
    cfg = {
        "configurable": {
            "thread_id": f"improvement-{uuid4()}",
        },
        "recursion_limit": 25,
    }

    from app.services.deep_agents.stream_events import iter_langgraph_stream_parts
    try:
        async for part in iter_langgraph_stream_parts(agent, {"messages": messages}, cfg):
            yield part
    except GraphRecursionError:
        yield {"type": "fatal", "message": "Agent hit recursion limit — the task may be too complex. Try a simpler request."}
    except Exception as e:
        logger.exception("improvement agent streaming failed")
        yield {"type": "fatal", "message": str(e)}
