"""What this agent may read, resolved once and carried with the request.

The bindings live on the workforce agent (`workforce_agent_semantic_models`, `workforce_agent_ontology_groups`). The
qa-agent used to fetch the knowledge base's version of them over HTTP, at a route a later commit deleted — so
`list_ontology_groups` answered 404 and `get_ontology_schema` failed on its normal path.

Sending them with the request fixes two things at once: the tools stop making a round trip per call, and their scope
becomes the agent's actual bindings instead of every model the owner happens to be able to read.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ontology_function import OntologyGroup
from app.models.semantic_model import SemanticModel
from app.models.workforce_agent import (
    WorkforceAgent,
    WorkforceAgentOntologyGroup,
    WorkforceAgentSemanticModel,
)


def empty_scope() -> dict[str, list[dict[str, str]]]:
    return {"semantic_models": [], "ontology_groups": []}


async def data_scope_for_agent(db: AsyncSession, agent: WorkforceAgent | None) -> dict[str, Any]:
    """The models and groups this agent is bound to, with the names a reader (and the model) can use.

    Names travel with the ids so a tool can answer "what may I read" without another request: a tool that has to call
    back for a display name is a tool that breaks when the route changes, which is exactly how this one broke.
    """
    if agent is None:
        return empty_scope()

    models = (
        await db.execute(
            select(SemanticModel.id, SemanticModel.name)
            .join(
                WorkforceAgentSemanticModel,
                WorkforceAgentSemanticModel.semantic_model_id == SemanticModel.id,
            )
            .where(WorkforceAgentSemanticModel.agent_id == agent.id)
        )
    ).all()
    groups = (
        await db.execute(
            select(OntologyGroup.id, OntologyGroup.display_name)
            .join(
                WorkforceAgentOntologyGroup,
                WorkforceAgentOntologyGroup.ontology_group_id == OntologyGroup.id,
            )
            .where(WorkforceAgentOntologyGroup.agent_id == agent.id)
        )
    ).all()

    return {
        "semantic_models": [{"id": str(row[0]), "name": str(row[1] or "")} for row in models],
        "ontology_groups": [{"id": str(row[0]), "name": str(row[1] or "")} for row in groups],
    }
