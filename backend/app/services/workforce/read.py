"""Reading workforce agents: owner scoping, binding lists, and per-agent counts."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_base import KnowledgeBase
from app.models.workforce_agent import (
    AGENT_STATUS_ACTIVE,
    AGENT_STATUS_ARCHIVED,
    WorkforceAgent,
    WorkforceAgentCredential,
    WorkforceAgentKB,
    WorkforceAgentOntologyGroup,
    WorkforceAgentSemanticModel,
)
from app.schemas.workforce import (
    WorkforceAgentDetailResponse,
    WorkforceAgentKBBinding,
    WorkforceAgentOntologyGroupBinding,
    WorkforceAgentResponse,
    WorkforceAgentSemanticModelBinding,
)
from app.services.workforce.usage import usage_by_agent


async def require_agent(
    db: AsyncSession, agent_id: str, *, viewer_sub: str, is_admin: bool
) -> WorkforceAgent:
    """Visible to its owner and to admins. Anyone else gets 404 — an agent's existence is not public."""
    agent = await db.get(WorkforceAgent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Workforce agent not found")
    if not is_admin and agent.owner_sub != viewer_sub:
        raise HTTPException(status_code=404, detail="Workforce agent not found")
    return agent


async def require_agent_write(
    db: AsyncSession, agent_id: str, *, viewer_sub: str, is_admin: bool
) -> WorkforceAgent:
    agent = await require_agent(db, agent_id, viewer_sub=viewer_sub, is_admin=is_admin)
    if agent.status == AGENT_STATUS_ARCHIVED:
        raise HTTPException(status_code=409, detail="Workforce agent is archived")
    return agent


async def counts_by_agent(db: AsyncSession, agent_ids: list[str]) -> dict[str, dict[str, int]]:
    counts = {
        agent_id: {
            "knowledge_base_count": 0,
            "semantic_model_count": 0,
            "ontology_group_count": 0,
            "credential_count": 0,
        }
        for agent_id in agent_ids
    }
    if not agent_ids:
        return counts
    for model, key, extra in (
        (WorkforceAgentKB, "knowledge_base_count", None),
        (WorkforceAgentSemanticModel, "semantic_model_count", None),
        (WorkforceAgentOntologyGroup, "ontology_group_count", None),
        (WorkforceAgentCredential, "credential_count", WorkforceAgentCredential.revoked_at.is_(None)),
    ):
        q = select(model.agent_id, func.count()).where(model.agent_id.in_(agent_ids))
        if extra is not None:
            q = q.where(extra)
        for agent_id, n in (await db.execute(q.group_by(model.agent_id))).all():
            counts[str(agent_id)][key] = int(n)
    return counts


def agent_to_response(
    agent: WorkforceAgent,
    counts: dict[str, int],
    usage: dict[str, object] | None = None,
) -> WorkforceAgentResponse:
    return WorkforceAgentResponse(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        status=agent.status,
        owner_sub=agent.owner_sub,
        owner_name=agent.owner_name,
        agent_tools=dict(agent.agent_tools) if isinstance(agent.agent_tools, dict) else None,
        web_search_connector_id=agent.web_search_connector_id,
        agent_config=dict(agent.agent_config) if isinstance(agent.agent_config, dict) else None,
        origin_knowledge_base_id=agent.origin_knowledge_base_id,
        **counts,
        **(usage or {}),
        created_at=agent.created_at,
        updated_at=agent.updated_at,
    )


async def kb_bindings(db: AsyncSession, agent_id: str) -> list[WorkforceAgentKBBinding]:
    rows = await db.execute(
        select(WorkforceAgentKB, KnowledgeBase.name)
        .join(KnowledgeBase, KnowledgeBase.id == WorkforceAgentKB.knowledge_base_id)
        .where(WorkforceAgentKB.agent_id == agent_id)
        .order_by(WorkforceAgentKB.priority, WorkforceAgentKB.created_at)
    )
    return [
        WorkforceAgentKBBinding(
            id=bind.id,
            knowledge_base_id=bind.knowledge_base_id,
            knowledge_base_name=name,
            label=bind.label,
            priority=bind.priority,
            created_at=bind.created_at,
        )
        for bind, name in rows.all()
    ]


async def semantic_model_bindings(
    db: AsyncSession, agent_id: str
) -> list[WorkforceAgentSemanticModelBinding]:
    from app.models.semantic_model import SemanticModel

    rows = await db.execute(
        select(WorkforceAgentSemanticModel, SemanticModel.name, SemanticModel.description)
        .join(SemanticModel, SemanticModel.id == WorkforceAgentSemanticModel.semantic_model_id)
        .where(WorkforceAgentSemanticModel.agent_id == agent_id)
        .order_by(SemanticModel.name)
    )
    return [
        WorkforceAgentSemanticModelBinding(
            id=bind.id,
            semantic_model_id=bind.semantic_model_id,
            name=name,
            description=description,
            created_at=bind.created_at,
        )
        for bind, name, description in rows.all()
    ]


async def ontology_group_bindings(
    db: AsyncSession, agent_id: str
) -> list[WorkforceAgentOntologyGroupBinding]:
    from app.models.ontology_function import OntologyGroup

    rows = await db.execute(
        select(WorkforceAgentOntologyGroup, OntologyGroup.display_name, OntologyGroup.description)
        .join(OntologyGroup, OntologyGroup.id == WorkforceAgentOntologyGroup.ontology_group_id)
        .where(WorkforceAgentOntologyGroup.agent_id == agent_id)
        .order_by(OntologyGroup.display_name)
    )
    return [
        WorkforceAgentOntologyGroupBinding(
            id=bind.id,
            ontology_group_id=bind.ontology_group_id,
            display_name=display_name,
            description=description,
            created_at=bind.created_at,
        )
        for bind, display_name, description in rows.all()
    ]


async def agent_detail(db: AsyncSession, agent: WorkforceAgent) -> WorkforceAgentDetailResponse:
    counts = (await counts_by_agent(db, [agent.id])).get(agent.id, {})
    # Computed here too: a field that is populated by `/agents` and zero on `/agents/{id}` is a field the detail
    # screen would read as "never called".
    usage = (await usage_by_agent(db, [agent.id])).get(agent.id, {})
    base = agent_to_response(
        agent,
        {
            "knowledge_base_count": counts.get("knowledge_base_count", 0),
            "semantic_model_count": counts.get("semantic_model_count", 0),
            "ontology_group_count": counts.get("ontology_group_count", 0),
            "credential_count": counts.get("credential_count", 0),
        },
        usage,
    )
    return WorkforceAgentDetailResponse(
        **base.model_dump(),
        knowledge_bases=await kb_bindings(db, agent.id),
        semantic_models=await semantic_model_bindings(db, agent.id),
        ontology_groups=await ontology_group_bindings(db, agent.id),
    )


async def default_agents_by_kb(db: AsyncSession, kb_ids: list[str]) -> dict[str, str]:
    """`knowledge_base_id → agent_id` for knowledge bases that have a default runtime agent."""
    if not kb_ids:
        return {}
    rows = await db.execute(
        select(WorkforceAgent.origin_knowledge_base_id, WorkforceAgent.id).where(
            WorkforceAgent.origin_knowledge_base_id.in_(kb_ids)
        )
    )
    return {str(kb_id): str(agent_id) for kb_id, agent_id in rows.all() if kb_id}


async def default_agent_for_kb(db: AsyncSession, kb_id: str) -> WorkforceAgent | None:
    row = await db.execute(
        select(WorkforceAgent).where(
            WorkforceAgent.origin_knowledge_base_id == kb_id,
            WorkforceAgent.status == AGENT_STATUS_ACTIVE,
        )
    )
    return row.scalars().first()
