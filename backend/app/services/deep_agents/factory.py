"""Build Deep Agents graphs for project workspace surfaces."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.agent.llm import resolve_agent_llm_config
from app.services.deep_agents.env import build_project_shell_env
from app.services.deep_agents.hitl import interrupt_map
from app.services.deep_agents.langfuse import build_deep_agent_langgraph_config
from app.services.deep_agents.llm_chat import build_deep_agent_chat_openai, normalize_openai_base_url
from app.services.deep_agents.plan_mode import plan_mode_permissions
from app.services.deep_agents.project_backend import ProjectWorkspaceBackend
from app.services.deep_agents.prompts import build_project_system_prompt
from app.services.deep_agents.sandbox import make_sandbox_tools
from app.services.deep_agents.skills.loader import list_skill_paths
from app.services.deep_agents.subagents.profiles import build_subagents
from app.services.deep_agents.tools.web_search import make_web_search_tools
from app.services.project_fs import project_root

logger = logging.getLogger(__name__)


def _settings_flag_on(value: Any) -> bool:
    return value in (True, "true", "True", 1, "1")


@dataclass
class ProjectAgentBuildContext:
    """Optional outputs from agent construction (e.g. scheduled compaction)."""

    llm: Any | None = None
    backend: ProjectWorkspaceBackend | None = None
    extra: dict[str, Any] = field(default_factory=dict)


async def resolve_project_llm(
    db: AsyncSession,
    *,
    streaming: bool,
    temperature: float = 0.2,
) -> Any | None:
    cfg = await resolve_agent_llm_config(db, model_id=settings.deep_agent_model_id)
    if not cfg or not cfg.get("base_url"):
        return None
    return build_deep_agent_chat_openai(
        base_url=normalize_openai_base_url(cfg["base_url"]),
        api_key=cfg.get("api_key") or "not-needed",
        model_name=cfg.get("model_name") or "gpt-4o-mini",
        max_tokens=settings.agent_max_output_tokens,
        streaming=streaming,
        temperature=temperature,
    )


def project_workspace_backend(
    *,
    project_id: str,
    bearer_token: str,
    project_settings: dict,
) -> tuple[ProjectWorkspaceBackend, dict[str, str]]:
    shell_env = build_project_shell_env(project_id, bearer_token, project_settings)
    backend = ProjectWorkspaceBackend(
        root_dir=str(project_root(project_id)),
        virtual_mode=True,
        inherit_env=True,
        env=shell_env,
        timeout=settings.agent_sandbox_timeout_seconds,
    )
    return backend, shell_env


async def build_workspace_deep_agent(
    db: AsyncSession,
    *,
    project_id: str,
    project_name: str,
    project_slug: str,
    project_description: str | None,
    project_settings: dict,
    bearer_token: str,
    plan_mode: bool,
    scheduled_run: bool = False,
    build_ctx: ProjectAgentBuildContext | None = None,
) -> tuple[Any | None, str | None]:
    """Full project agent: tools, subagents, skills, checkpointer, optional HITL."""
    llm = await resolve_project_llm(db, streaming=True, temperature=0.2)
    if not llm:
        return None, "No LLM configured for agents"

    backend, shell_env = project_workspace_backend(
        project_id=project_id,
        bearer_token=bearer_token,
        project_settings=project_settings,
    )
    if build_ctx is not None:
        build_ctx.llm = llm
        build_ctx.backend = backend

    tools: list = []
    if not plan_mode:
        tools.extend(make_sandbox_tools(project_id, shell_env=shell_env))
    connector_id = str(project_settings.get("search_connector_id") or "").strip()
    if _settings_flag_on(project_settings.get("web_search")) and connector_id:
        tools.extend(await make_web_search_tools(db, connector_id))

    skills = list_skill_paths(project_id)
    from app.services.deep_agents.checkpointer import get_checkpointer

    checkpointer = await get_checkpointer()
    try:
        from deepagents import create_deep_agent

        agent = create_deep_agent(
            model=llm,
            tools=tools,
            system_prompt=build_project_system_prompt(
                project_id,
                project_name=project_name,
                project_slug=project_slug,
                project_description=project_description,
                installed_skills=project_settings.get("installed_skills"),
                plan_mode=plan_mode,
                scheduled_run=scheduled_run,
            ),
            subagents=build_subagents(plan_mode=plan_mode, include_shell=not plan_mode),
            skills=skills or None,
            backend=backend,
            permissions=plan_mode_permissions() if plan_mode else None,
            interrupt_on=interrupt_map(plan_mode=plan_mode, scheduled_run=scheduled_run),
            checkpointer=checkpointer,
        )
    except Exception as e:
        logger.exception("create_deep_agent failed for project %s", project_id)
        return None, str(e)
    return agent, None


async def build_improvement_deep_agent(
    db: AsyncSession,
    *,
    project_id: str,
    project_name: str,
    project_settings: dict,
    bearer_token: str,
    system_prompt: str,
) -> tuple[Any | None, str | None]:
    """Session-review improvement agent: filesystem + skills only (no checkpointer)."""
    llm = await resolve_project_llm(db, streaming=True, temperature=0.3)
    if not llm:
        return None, "No LLM configured for agents"

    backend, _shell_env = project_workspace_backend(
        project_id=project_id,
        bearer_token=bearer_token,
        project_settings=project_settings,
    )
    skills = list_skill_paths(project_id)
    try:
        from deepagents import create_deep_agent

        agent = create_deep_agent(
            model=llm,
            system_prompt=system_prompt,
            skills=skills or None,
            backend=backend,
        )
    except Exception as e:
        logger.exception("create_deep_agent failed for improvement agent on %s", project_id)
        return None, str(e)
    return agent, None


def workspace_runnable_config(
    conversation_id: str,
    *,
    thread_id: str | None = None,
    session_id: str | None = None,
    streaming: bool = False,
    plan_mode: bool = False,
) -> dict[str, Any]:
    return build_deep_agent_langgraph_config(
        conversation_id=conversation_id,
        session_id=session_id,
        streaming=streaming,
        plan_mode=plan_mode,
        thread_id=thread_id,
    )


def ephemeral_runnable_config(*, thread_prefix: str) -> dict[str, Any]:
    """One-off agent runs (improvement chat) without conversation checkpoint thread."""
    return {
        "configurable": {"thread_id": f"{thread_prefix}-{uuid4()}"},
        "recursion_limit": settings.agent_recursion_limit,
    }
