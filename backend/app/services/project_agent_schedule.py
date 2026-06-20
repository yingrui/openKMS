"""Project agent schedule registry and execution helpers."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_models import AgentConversation, AgentMessage
from app.models.project import Project
from app.models.scheduled_trigger import (
    PROJECT_AGENT_SCHEDULE_KINDS,
    SCHEDULE_KIND_PROJECT_AGENT_STATEFUL,
    SCHEDULE_KIND_PROJECT_AGENT_STATELESS,
    ScheduledTrigger,
)
from app.services.agent_session_api_key import ensure_session_api_key, get_session_bearer_token, revoke_session_api_key
from app.services.agent_skill_install import ensure_skills_materialized
from app.services.connector_sync.schedule import validate_cron_expression, validate_timezone
from app.services.deep_agents.runner import (
    new_id,
    run_project_turn,
)
from app.services.feature_toggles import is_feature_enabled
from app.services.permission_resolution import jwt_realm_role_names

OnRunCompleted = Literal["keep", "delete"]

REQUIRED_CONFIG_KEYS = ("project_id", "owner_sub", "prompt")


def agent_schedule_kind_for_mode(mode: str) -> str:
    m = (mode or "").strip().lower()
    if m == "stateful":
        return SCHEDULE_KIND_PROJECT_AGENT_STATEFUL
    if m == "stateless":
        return SCHEDULE_KIND_PROJECT_AGENT_STATELESS
    raise ValueError("mode must be stateless or stateful")


def normalize_agent_schedule_config(raw: dict[str, Any] | None) -> dict[str, Any]:
    cfg = dict(raw or {})
    project_id = str(cfg.get("project_id") or "").strip()
    owner_sub = str(cfg.get("owner_sub") or "").strip()
    prompt = str(cfg.get("prompt") or "").strip()
    if not project_id:
        raise ValueError("project_id is required")
    if not owner_sub:
        raise ValueError("owner_sub is required")
    if not prompt:
        raise ValueError("prompt is required")
    if len(prompt) > 48000:
        raise ValueError("prompt is too long")
    plan_mode = bool(cfg.get("plan_mode", False))
    on_run = str(cfg.get("on_run_completed") or "keep").strip().lower()
    if on_run not in ("keep", "delete"):
        raise ValueError("on_run_completed must be keep or delete")
    out: dict[str, Any] = {
        "project_id": project_id,
        "owner_sub": owner_sub,
        "prompt": prompt,
        "plan_mode": plan_mode,
        "on_run_completed": on_run,
    }
    conv_id = cfg.get("conversation_id")
    if isinstance(conv_id, str) and conv_id.strip():
        out["conversation_id"] = conv_id.strip()
    roles = cfg.get("oidc_realm_roles")
    if isinstance(roles, list):
        out["oidc_realm_roles"] = [str(r) for r in roles if str(r).strip()]
    langfuse = cfg.get("langfuse_session_id")
    if isinstance(langfuse, str) and langfuse.strip():
        out["langfuse_session_id"] = langfuse.strip()[:256]
    return out


def jwt_payload_from_schedule_config(cfg: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {"sub": cfg["owner_sub"]}
    roles = cfg.get("oidc_realm_roles")
    if isinstance(roles, list) and roles:
        payload["realm_access"] = {"roles": roles}
    return payload


async def get_project_owned(db: AsyncSession, project_id: str, owner_sub: str) -> Project:
    p = await db.get(Project, project_id)
    if not p or p.user_sub != owner_sub:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


async def list_agent_schedules_for_project(
    db: AsyncSession, project_id: str
) -> list[ScheduledTrigger]:
    result = await db.execute(
        select(ScheduledTrigger)
        .where(ScheduledTrigger.kind.in_(tuple(PROJECT_AGENT_SCHEDULE_KINDS)))
        .order_by(ScheduledTrigger.display_name.asc())
    )
    rows = list(result.scalars().all())
    return [r for r in rows if isinstance(r.config, dict) and r.config.get("project_id") == project_id]


async def get_agent_schedule_for_project(
    db: AsyncSession, project_id: str, schedule_id: str
) -> ScheduledTrigger:
    row = await db.get(ScheduledTrigger, schedule_id)
    if not row or row.kind not in PROJECT_AGENT_SCHEDULE_KINDS:
        raise HTTPException(status_code=404, detail="Schedule not found")
    cfg = row.config if isinstance(row.config, dict) else {}
    if cfg.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return row


async def create_agent_schedule(
    db: AsyncSession,
    *,
    project: Project,
    owner_sub: str,
    display_name: str,
    mode: str,
    cron: str,
    timezone_name: str,
    prompt: str,
    enabled: bool,
    plan_mode: bool = False,
    on_run_completed: OnRunCompleted = "keep",
    conversation_id: str | None = None,
    jwt_payload: dict[str, Any] | None = None,
) -> ScheduledTrigger:
    kind = SCHEDULE_KIND_PROJECT_AGENT_STATEFUL if mode == "stateful" else SCHEDULE_KIND_PROJECT_AGENT_STATELESS
    tz = validate_timezone(timezone_name)
    cron_norm = validate_cron_expression(cron) if enabled else None

    cfg: dict[str, Any] = {
        "project_id": project.id,
        "owner_sub": owner_sub,
        "prompt": prompt.strip(),
        "plan_mode": plan_mode,
        "on_run_completed": on_run_completed,
    }
    if jwt_payload:
        roles = sorted(jwt_realm_role_names(jwt_payload))
        if roles:
            cfg["oidc_realm_roles"] = roles

    target_id: str
    if kind == SCHEDULE_KIND_PROJECT_AGENT_STATEFUL:
        if not conversation_id or not conversation_id.strip():
            raise ValueError("conversation_id is required for stateful schedules")
        conv = await db.get(AgentConversation, conversation_id.strip())
        if (
            not conv
            or conv.user_sub != owner_sub
            or conv.surface != "project"
            or (conv.context or {}).get("project_id") != project.id
        ):
            raise ValueError("Conversation not found for this project")
        target_id = conv.id
        cfg["conversation_id"] = conv.id
    else:
        target_id = str(uuid.uuid4())

    normalize_agent_schedule_config(cfg)

    existing = await db.execute(
        select(ScheduledTrigger).where(
            ScheduledTrigger.kind == kind,
            ScheduledTrigger.target_id == target_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("A schedule already exists for this target")

    row = ScheduledTrigger(
        id=str(uuid.uuid4()),
        kind=kind,
        target_id=target_id,
        display_name=display_name.strip()[:256] or "Agent schedule",
        cron=cron_norm,
        timezone=tz,
        enabled=enabled and bool(cron_norm),
        config=cfg,
    )
    db.add(row)
    return row


async def delete_agent_schedule_row(db: AsyncSession, row: ScheduledTrigger) -> None:
    await db.delete(row)


async def _conversation_for_stateful(
    db: AsyncSession, cfg: dict[str, Any]
) -> AgentConversation:
    conv_id = str(cfg.get("conversation_id") or "").strip()
    conv = await db.get(AgentConversation, conv_id)
    if (
        not conv
        or conv.user_sub != cfg["owner_sub"]
        or conv.surface != "project"
        or (conv.context or {}).get("project_id") != cfg["project_id"]
    ):
        raise ValueError("Scheduled conversation not found")
    return conv


async def execute_scheduled_project_agent(
    db: AsyncSession,
    trigger: ScheduledTrigger,
) -> None:
    """Run one agent turn for a scheduled trigger (called from worker)."""
    if trigger.kind not in PROJECT_AGENT_SCHEDULE_KINDS:
        raise ValueError(f"Unsupported schedule kind: {trigger.kind}")

    if not await is_feature_enabled(db, "agents"):
        raise RuntimeError("Agents feature is disabled")

    cfg = normalize_agent_schedule_config(
        trigger.config if isinstance(trigger.config, dict) else {}
    )
    project = await db.get(Project, cfg["project_id"])
    if not project:
        raise RuntimeError("Project not found")

    jwt_payload = jwt_payload_from_schedule_config(cfg)
    plan_mode = bool(cfg.get("plan_mode"))
    if plan_mode:
        raise RuntimeError("plan_mode is not supported for scheduled agent runs")

    created_conv: AgentConversation | None = None
    if trigger.kind == SCHEDULE_KIND_PROJECT_AGENT_STATEFUL:
        conversation = await _conversation_for_stateful(db, cfg)
    else:
        conversation = AgentConversation(
            id=str(uuid.uuid4()),
            user_sub=cfg["owner_sub"],
            surface="project",
            context={"project_id": project.id, "scheduled_trigger_id": trigger.id},
            title=trigger.display_name[:512],
        )
        db.add(conversation)
        await db.flush()
        created_conv = conversation

    user_msg = AgentMessage(
        id=new_id(),
        conversation_id=conversation.id,
        role="user",
        content=cfg["prompt"],
    )
    db.add(user_msg)
    await db.flush()

    await ensure_skills_materialized(db, project)
    bearer = get_session_bearer_token(conversation)
    if not bearer:
        bearer = await ensure_session_api_key(db, conversation, jwt_payload)

    content, tool_calls = await run_project_turn(
        db,
        conversation,
        jwt_payload,
        bearer,
        project.id,
        project.name,
        project.slug,
        project.description,
        project.settings or {},
        plan_mode=False,
        session_id=cfg.get("langfuse_session_id") or trigger.id,
        scheduled_run=True,
    )

    lower = (content or "").lower()
    if not tool_calls and (
        "failed to initialize" in lower or "recursion limit" in lower
    ):
        raise RuntimeError(content or "Scheduled agent run failed")

    asst = AgentMessage(
        id=new_id(),
        conversation_id=conversation.id,
        role="assistant",
        content=content or "",
        tool_calls=tool_calls,
    )
    db.add(asst)
    conversation.updated_at = datetime.now(timezone.utc)
    cfg_out = dict(trigger.config if isinstance(trigger.config, dict) else {})
    cfg_out["last_conversation_id"] = conversation.id
    trigger.config = cfg_out
    await db.flush()

    if (
        trigger.kind == SCHEDULE_KIND_PROJECT_AGENT_STATELESS
        and cfg.get("on_run_completed") == "delete"
        and created_conv is not None
    ):
        from app.services.deep_agents.checkpointer import delete_conversation_thread

        await revoke_session_api_key(db, created_conv)
        await delete_conversation_thread(db, created_conv.id)
        await db.delete(created_conv)

