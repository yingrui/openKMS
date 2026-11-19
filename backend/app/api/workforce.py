"""Workforce agents — externally-serving Q&A services built on knowledge bases.

Two routers, because they answer to two different callers:

- **management** (`/api/workforce/...`): a signed-in user configures agents. Owner-scoped: an agent is
  visible to the person who created it and to admins, and to nobody else.
- **service** (`POST /api/workforce/agents/{id}/ask`): an integrator calls with the agent's own
  credential. `authenticate_request` resolves that credential to the owner's identity plus
  `openkms_workforce_agent_id`, and the strict-permission middleware holds it to reads.

See `docs/features/workforce.md`.
"""

from __future__ import annotations

import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import authenticate_request, jwt_payload_is_admin, require_auth
from app.config import settings
from app.database import get_db
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
    WorkforcePromptPreviewResponse,
    WorkforceAgentCreate,
    WorkforceAgentDetailResponse,
    WorkforceAgentKBAdd,
    WorkforceAgentKBBinding,
    WorkforceAgentListResponse,
    WorkforceAgentOntologyGroupAdd,
    WorkforceAgentOntologyGroupBinding,
    WorkforceAgentSemanticModelAdd,
    WorkforceAgentSemanticModelBinding,
    WorkforceAgentUpdate,
    WorkforceAskRequest,
    WorkforceAskResponse,
    WorkforceCredentialCreate,
    WorkforceCredentialCreatedResponse,
    WorkforceCredentialListItem,
    WorkforceCredentialListResponse,
)
from app.services.content.knowledge_bases.qa_agent_proxy import (
    agent_error,
    base_instruction_for,
    agent_kb_path,
    ask_agent_body,
    resolve_agent_url,
)
from app.services.identity.acl.resource_acl_constants import (
    PERM_READ,
    RT_KNOWLEDGE_BASE,
    RT_SEMANTIC_MODEL,
)
from app.services.identity.acl.resource_guard import resource_allowed
from app.services.identity.permissions.permission_resolution import jwt_realm_role_names
from app.services.workforce.agent_config import (
    agent_config_payload,
    agent_skills_for,
    resolve_skills,
    runtime_config,
)
from app.services.workforce.credentials import mint_credential
from app.services.workforce.read import (
    agent_detail,
    agent_to_response,
    counts_by_agent,
    default_agent_for_kb,
    kb_bindings,
    ontology_group_bindings,
    require_agent,
    require_agent_write,
    semantic_model_bindings,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workforce", tags=["workforce"], dependencies=[Depends(require_auth)])
service_router = APIRouter(prefix="/workforce", tags=["workforce-service"])

_EMPTY_COUNTS = {
    "knowledge_base_count": 0,
    "semantic_model_count": 0,
    "ontology_group_count": 0,
    "credential_count": 0,
}


def _principal(request: Request) -> tuple[str, str | None]:
    """The signed-in user (subject + display name) an agent would be created for."""
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise HTTPException(status_code=403, detail="Authentication required")
    name = payload.get("preferred_username") or payload.get("name")
    return sub, (str(name)[:256] if isinstance(name, str) and name.strip() else None)


async def _bind_kb(
    db: AsyncSession,
    request: Request,
    *,
    agent_id: str,
    kb_id: str,
    label: str | None,
    priority: int,
) -> WorkforceAgentKB:
    """Bind one knowledge source, refusing a source the agent's creator cannot read.

    The agent is a delegation of the creator's read access, so a binding they could not read would be
    the agent looking at something on their behalf that they cannot look at themselves.
    """
    if await db.get(KnowledgeBase, kb_id) is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if not await resource_allowed(db, request, RT_KNOWLEDGE_BASE, kb_id, PERM_READ):
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    existing = (
        await db.execute(
            select(WorkforceAgentKB).where(
                WorkforceAgentKB.agent_id == agent_id,
                WorkforceAgentKB.knowledge_base_id == kb_id,
            )
        )
    ).scalars().first()
    if existing is not None:
        existing.label = label
        existing.priority = priority
        return existing
    row = WorkforceAgentKB(
        id=str(uuid.uuid4()),
        agent_id=agent_id,
        knowledge_base_id=kb_id,
        label=label,
        priority=priority,
    )
    db.add(row)
    await db.flush()
    return row


# --- Agents ---


@router.get("/agents", response_model=WorkforceAgentListResponse)
async def list_agents(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    sub, _ = _principal(request)
    q = select(WorkforceAgent).where(WorkforceAgent.status == AGENT_STATUS_ACTIVE)
    count_q = select(func.count()).select_from(WorkforceAgent).where(
        WorkforceAgent.status == AGENT_STATUS_ACTIVE
    )
    if not jwt_payload_is_admin(request.state.openkms_jwt_payload):
        q = q.where(WorkforceAgent.owner_sub == sub)
        count_q = count_q.where(WorkforceAgent.owner_sub == sub)
    total = int((await db.execute(count_q)).scalar_one())
    rows = list(
        (await db.execute(q.order_by(WorkforceAgent.created_at.desc()).offset(offset).limit(limit)))
        .scalars()
        .all()
    )
    counts = await counts_by_agent(db, [a.id for a in rows])
    return WorkforceAgentListResponse(
        items=[agent_to_response(a, counts.get(a.id, _EMPTY_COUNTS)) for a in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/agents", response_model=WorkforceAgentDetailResponse, status_code=201)
async def create_agent(
    body: WorkforceAgentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub, name = _principal(request)
    agent = WorkforceAgent(
        id=str(uuid.uuid4()),
        name=body.name.strip(),
        description=body.description,
        owner_sub=sub,
        owner_name=name,
        status=AGENT_STATUS_ACTIVE,
        agent_skills=body.agent_skills,
        agent_config=agent_config_payload(body.agent_config),
    )
    db.add(agent)
    await db.flush()
    for kb_id in dict.fromkeys(body.knowledge_base_ids):
        await _bind_kb(db, request, agent_id=agent.id, kb_id=kb_id, label=None, priority=0)
    await db.commit()
    await db.refresh(agent)
    return await agent_detail(db, agent)


async def _scoped(db: AsyncSession, request: Request, agent_id: str, *, write: bool) -> WorkforceAgent:
    sub, _ = _principal(request)
    loader = require_agent_write if write else require_agent
    return await loader(
        db,
        agent_id,
        viewer_sub=sub,
        is_admin=jwt_payload_is_admin(request.state.openkms_jwt_payload),
    )


@router.get("/agents/{agent_id}", response_model=WorkforceAgentDetailResponse)
async def get_agent(
    agent_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await agent_detail(db, await _scoped(db, request, agent_id, write=False))


@router.put("/agents/{agent_id}", response_model=WorkforceAgentDetailResponse)
async def update_agent(
    agent_id: str,
    body: WorkforceAgentUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    agent = await _scoped(db, request, agent_id, write=True)
    sent = body.model_dump(exclude_unset=True)
    if "name" in sent and sent["name"] is not None:
        agent.name = str(sent["name"]).strip()
    if "description" in sent:
        agent.description = sent["description"]
    if "agent_skills" in sent:
        agent.agent_skills = sent["agent_skills"]
    if "agent_config" in sent:
        agent.agent_config = agent_config_payload(body.agent_config)
    await db.commit()
    await db.refresh(agent)
    return await agent_detail(db, agent)


@router.delete("/agents/{agent_id}", status_code=204)
async def archive_agent(
    agent_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete the service without losing the record: the row stays (bindings and audit keep pointing at it), the
    credentials stop working immediately, and the UI stops listing it.

    The word matters. There is no restore endpoint, so calling this "archive" in the interface promised something
    reversible that is not; it is a delete as far as a reader is concerned, and the confirm text says what survives.
    `status = archived` is the storage value for that state.
    """
    agent = await _scoped(db, request, agent_id, write=False)
    agent.status = AGENT_STATUS_ARCHIVED
    await db.commit()
    return None


@router.get("/agents/{agent_id}/prompt-preview", response_model=WorkforcePromptPreviewResponse)
async def agent_prompt_preview(
    agent_id: str,
    kb_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """The system prompt the model actually receives, plus the text that becomes AGENTS.md.

    Assembled by the qa-agent, not here: a second implementation in the backend would drift from the one that runs.
    The knowledge source is only needed to reach that agent and to supply its retrieval settings.
    """
    kb = await db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge source not found")
    linked = (
        await db.execute(
            select(WorkforceAgentKB).where(
                WorkforceAgentKB.agent_id == agent_id,
                WorkforceAgentKB.knowledge_base_id == kb_id,
            )
        )
    ).scalars().first()
    if linked is None:
        raise HTTPException(status_code=404, detail="Knowledge source is not bound to this agent")
    agent = await _scoped(db, request, agent_id, write=False)

    url = resolve_agent_url(kb)
    if not url:
        raise HTTPException(status_code=400, detail="No QA agent URL configured for this deployment")

    body = {
        "agent_skills": agent_skills_for(kb, agent),
        "agent_config": runtime_config(kb, agent),
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(agent_kb_path(url, kb.id, "prompt-preview"), json=body)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        raise agent_error(e) from e
    except httpx.HTTPError as e:
        logger.error("Prompt preview could not reach %s: %s", url, e)
        raise HTTPException(status_code=502, detail="Could not reach agent service") from e

    return WorkforcePromptPreviewResponse(
        system_prompt=str(data.get("system_prompt") or ""),
        base_instruction=data.get("base_instruction"),
        agents_md=data.get("agents_md"),
    )


# --- Knowledge sources ---


@router.get("/agents/{agent_id}/knowledge-bases", response_model=list[WorkforceAgentKBBinding])
async def list_agent_kbs(agent_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    await _scoped(db, request, agent_id, write=False)
    return await kb_bindings(db, agent_id)


@router.post(
    "/agents/{agent_id}/knowledge-bases",
    response_model=WorkforceAgentKBBinding,
    status_code=201,
)
async def add_agent_kb(
    agent_id: str,
    body: WorkforceAgentKBAdd,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _scoped(db, request, agent_id, write=True)
    row = await _bind_kb(
        db,
        request,
        agent_id=agent_id,
        kb_id=body.knowledge_base_id,
        label=body.label,
        priority=body.priority,
    )
    await db.commit()
    kb = await db.get(KnowledgeBase, row.knowledge_base_id)
    return WorkforceAgentKBBinding(
        id=row.id,
        knowledge_base_id=row.knowledge_base_id,
        knowledge_base_name=kb.name if kb is not None else None,
        label=row.label,
        priority=row.priority,
        created_at=row.created_at,
    )


@router.delete("/agents/{agent_id}/knowledge-bases/{binding_id}", status_code=204)
async def remove_agent_kb(
    agent_id: str,
    binding_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _scoped(db, request, agent_id, write=True)
    await db.execute(
        delete(WorkforceAgentKB).where(
            WorkforceAgentKB.id == binding_id, WorkforceAgentKB.agent_id == agent_id
        )
    )
    await db.commit()
    return None


# --- Catalog / Ontology scope ---


@router.get(
    "/agents/{agent_id}/semantic-models", response_model=list[WorkforceAgentSemanticModelBinding]
)
async def list_agent_models(agent_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    await _scoped(db, request, agent_id, write=False)
    return await semantic_model_bindings(db, agent_id)


@router.post(
    "/agents/{agent_id}/semantic-models",
    response_model=WorkforceAgentSemanticModelBinding,
    status_code=201,
)
async def add_agent_model(
    agent_id: str,
    body: WorkforceAgentSemanticModelAdd,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _scoped(db, request, agent_id, write=True)
    from app.models.semantic_model import SemanticModel

    model = await db.get(SemanticModel, body.semantic_model_id)
    if model is None or not await resource_allowed(
        db, request, RT_SEMANTIC_MODEL, body.semantic_model_id, PERM_READ
    ):
        raise HTTPException(status_code=404, detail="Semantic model not found")
    existing = (
        await db.execute(
            select(WorkforceAgentSemanticModel).where(
                WorkforceAgentSemanticModel.agent_id == agent_id,
                WorkforceAgentSemanticModel.semantic_model_id == body.semantic_model_id,
            )
        )
    ).scalars().first()
    if existing is None:
        existing = WorkforceAgentSemanticModel(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            semantic_model_id=body.semantic_model_id,
        )
        db.add(existing)
        await db.commit()
        await db.refresh(existing)
    return WorkforceAgentSemanticModelBinding(
        id=existing.id,
        semantic_model_id=existing.semantic_model_id,
        name=model.name,
        description=model.description,
        created_at=existing.created_at,
    )


@router.delete("/agents/{agent_id}/semantic-models/{binding_id}", status_code=204)
async def remove_agent_model(
    agent_id: str,
    binding_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _scoped(db, request, agent_id, write=True)
    await db.execute(
        delete(WorkforceAgentSemanticModel).where(
            WorkforceAgentSemanticModel.id == binding_id,
            WorkforceAgentSemanticModel.agent_id == agent_id,
        )
    )
    await db.commit()
    return None


@router.get(
    "/agents/{agent_id}/ontology-groups", response_model=list[WorkforceAgentOntologyGroupBinding]
)
async def list_agent_groups(agent_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    await _scoped(db, request, agent_id, write=False)
    return await ontology_group_bindings(db, agent_id)


@router.post(
    "/agents/{agent_id}/ontology-groups",
    response_model=WorkforceAgentOntologyGroupBinding,
    status_code=201,
)
async def add_agent_group(
    agent_id: str,
    body: WorkforceAgentOntologyGroupAdd,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _scoped(db, request, agent_id, write=True)
    from app.models.ontology_function import OntologyGroup

    group = await db.get(OntologyGroup, body.ontology_group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Ontology group not found")
    existing = (
        await db.execute(
            select(WorkforceAgentOntologyGroup).where(
                WorkforceAgentOntologyGroup.agent_id == agent_id,
                WorkforceAgentOntologyGroup.ontology_group_id == body.ontology_group_id,
            )
        )
    ).scalars().first()
    if existing is None:
        existing = WorkforceAgentOntologyGroup(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            ontology_group_id=body.ontology_group_id,
        )
        db.add(existing)
        await db.commit()
        await db.refresh(existing)
    return WorkforceAgentOntologyGroupBinding(
        id=existing.id,
        ontology_group_id=existing.ontology_group_id,
        display_name=group.display_name,
        description=group.description,
        created_at=existing.created_at,
    )


@router.delete("/agents/{agent_id}/ontology-groups/{binding_id}", status_code=204)
async def remove_agent_group(
    agent_id: str,
    binding_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _scoped(db, request, agent_id, write=True)
    await db.execute(
        delete(WorkforceAgentOntologyGroup).where(
            WorkforceAgentOntologyGroup.id == binding_id,
            WorkforceAgentOntologyGroup.agent_id == agent_id,
        )
    )
    await db.commit()
    return None


# --- Credentials ---


def _credential_mode(request: Request) -> tuple[str, list[str] | None]:
    if settings.auth_mode == "local":
        return "local", None
    return "oidc", sorted(jwt_realm_role_names(request.state.openkms_jwt_payload))


@router.get("/agents/{agent_id}/credentials", response_model=WorkforceCredentialListResponse)
async def list_credentials(agent_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    await _scoped(db, request, agent_id, write=False)
    rows = (
        await db.execute(
            select(WorkforceAgentCredential)
            .where(WorkforceAgentCredential.agent_id == agent_id)
            .order_by(WorkforceAgentCredential.created_at.desc())
        )
    ).scalars().all()
    return WorkforceCredentialListResponse(
        items=[WorkforceCredentialListItem.model_validate(r) for r in rows]
    )


@router.post(
    "/agents/{agent_id}/credentials",
    response_model=WorkforceCredentialCreatedResponse,
    status_code=201,
)
async def create_credential(
    agent_id: str,
    body: WorkforceCredentialCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    agent = await _scoped(db, request, agent_id, write=True)
    mode, roles = _credential_mode(request)
    row, token = await mint_credential(
        db, agent_id=agent.id, name=body.name, auth_mode=mode, oidc_realm_roles=roles
    )
    await db.commit()
    await db.refresh(row)
    return WorkforceCredentialCreatedResponse(
        id=row.id,
        name=row.name,
        token=token,
        key_prefix=row.key_prefix,
        created_at=row.created_at,
    )


@router.delete("/agents/{agent_id}/credentials/{credential_id}", status_code=204)
async def revoke_credential(
    agent_id: str,
    credential_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _scoped(db, request, agent_id, write=True)
    from datetime import datetime, timezone

    row = await db.get(WorkforceAgentCredential, credential_id)
    if row is None or row.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Credential not found")
    row.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return None


# --- Service plane ---


async def require_agent_credential(
    request: Request, db: AsyncSession = Depends(get_db)
) -> WorkforceAgent:
    """The caller must present an agent credential — a session is not a substitute.

    In strict permission mode the middleware has already authenticated the request; this dependency is
    what makes the endpoint work in every mode, and it is the only place that says "this is a service
    call" rather than "a person clicked something".
    """
    await authenticate_request(request, db)
    agent = getattr(request.state, "openkms_workforce_agent", None)
    if agent is None:
        raise HTTPException(
            status_code=403, detail="A workforce agent credential is required for this endpoint"
        )
    return agent


@service_router.post("/agents/{agent_id}/ask", response_model=WorkforceAskResponse)
async def ask_agent(
    agent_id: str,
    body: WorkforceAskRequest,
    request: Request,
    credential_agent: WorkforceAgent = Depends(require_agent_credential),
    db: AsyncSession = Depends(get_db),
):
    """Answer one question from one bound knowledge source, as this agent.

    The caller presents the agent's credential. `authenticate_request` has already resolved it to the
    owner's identity; what is left is to prove the credential belongs to *this* agent and that the
    named knowledge source is one the agent may answer from.
    """
    agent = credential_agent
    if agent.id != agent_id:
        raise HTTPException(status_code=403, detail="Credential does not belong to this agent")
    if agent.status != AGENT_STATUS_ACTIVE:
        raise HTTPException(status_code=409, detail="Workforce agent is archived")

    bound = (
        await db.execute(
            select(WorkforceAgentKB).where(
                WorkforceAgentKB.agent_id == agent.id,
                WorkforceAgentKB.knowledge_base_id == body.kb_id,
            )
        )
    ).scalars().first()
    if bound is None:
        raise HTTPException(status_code=404, detail="Knowledge source is not bound to this agent")
    kb = await db.get(KnowledgeBase, body.kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="Knowledge source not found")

    url = resolve_agent_url(kb)
    if not url:
        raise HTTPException(status_code=400, detail="No QA agent URL configured for this deployment")

    # Attribute the audit row to the agent, keeping the owner as the subject it acts for.
    payload = dict(request.state.openkms_jwt_payload)
    payload["preferred_username"] = agent.name
    payload["name"] = agent.name
    request.state.openkms_jwt_payload = payload
    request.state.audit_label = agent.name

    token = request.state.openkms_auth_token or ""

    runtime = runtime_config(kb, agent)
    request_body = ask_agent_body(
        kb=kb,
        question=body.question,
        conversation_history=body.conversation_history,
        access_token=token,
        session_id=body.session_id,
        agent_skills=resolve_skills(agent.agent_skills),
        agent_config=runtime,
        # The author's base instruction; without it the qa-agent uses its built-in text.
        system_prompt=base_instruction_for(runtime),
    )
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(agent_kb_path(url, kb.id, "ask"), json=request_body)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        logger.error("Workforce ask failed: %s %s", e.response.status_code, e.response.text[:200])
        raise agent_error(e) from e
    except httpx.HTTPError as e:
        logger.error("Workforce ask could not reach %s: %s", url, e)
        raise HTTPException(status_code=502, detail="Could not reach agent service") from e

    return WorkforceAskResponse(
        answer=str(data.get("answer", "") or ""),
        kb_id=kb.id,
        sources=list(data.get("sources") or []),
        grounding=data.get("grounding"),
        langfuse_trace_id=data.get("langfuse_trace_id"),
        warnings=list(data.get("warnings") or []),
        # Fail closed: an upstream that says nothing about verification has not verified anything. "Not
        # checked" is not "passed" — the qa-agent sends False unless the answer passed an enforced policy.
        verified=data.get("verified") is True,
        prompt_version=data.get("prompt_version"),
        model=data.get("model"),
    )


# --- Compatibility helper used by the knowledge-base API ---


async def ensure_default_agent(
    db: AsyncSession, *, kb: KnowledgeBase, owner_sub: str, owner_name: str | None
) -> WorkforceAgent:
    """Create (or find) the agent a knowledge base's own Q&A resolves.

    The behaviour is seeded from the knowledge base so the answers it already gave are the agent's starting
    point. The **description is not**: a corpus's blurb says what is known, and copying it here made every
    default agent read like a document collection rather than a service. It starts empty, for someone to say
    who this employee answers and for whom.
    """
    existing = await default_agent_for_kb(db, kb.id)
    if existing is not None:
        return existing
    agent = WorkforceAgent(
        id=str(uuid.uuid4()),
        name=kb.name,
        description=None,
        owner_sub=owner_sub,
        owner_name=owner_name,
        status=AGENT_STATUS_ACTIVE,
        agent_skills=kb.agent_skills,
        agent_config=agent_config_payload(kb.agent_config),
        origin_knowledge_base_id=kb.id,
    )
    db.add(agent)
    await db.flush()
    db.add(
        WorkforceAgentKB(
            id=str(uuid.uuid4()),
            agent_id=agent.id,
            knowledge_base_id=kb.id,
            label=None,
            priority=0,
        )
    )
    await db.flush()
    return agent


