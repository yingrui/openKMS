"""Prompt versions for a knowledge base's QA agent.

Reads are `kb:read`; writing a draft and publishing are `kb:write`, because a prompt is a behaviour change for every answer
that KB gives.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.knowledge_base import KnowledgeBase
from app.api.kb_router_deps import get_kb_scoped, get_kb_scoped_write
from app.services.workspace.evaluations.prompt_store import (
    DEFAULT_SYSTEM_PROMPT,
    PromptStoreError,
    create_draft,
    list_versions,
    publish,
    to_response,
)

router = APIRouter(
    prefix="/knowledge-bases",
    tags=["knowledge-bases"],
    dependencies=[Depends(require_auth)],
)


class PromptDraftBody(BaseModel):
    body: str = Field(min_length=1, max_length=20_000)
    notes: str | None = Field(None, max_length=2_000)


@router.get("/{kb_id}/agent-prompts")
async def list_agent_prompts(kb_id: str, kb: KnowledgeBase = Depends(get_kb_scoped), db: AsyncSession = Depends(get_db)):
    """Every version, newest first, plus the built-in default so a reader can see what an override replaces."""
    rows = await list_versions(db, kb_id)
    return {"default": DEFAULT_SYSTEM_PROMPT, "items": [to_response(r) for r in rows]}


@router.post("/{kb_id}/agent-prompts", status_code=201)
async def create_agent_prompt(
    kb_id: str,
    body: PromptDraftBody,
    request: Request,
    kb: KnowledgeBase = Depends(get_kb_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    """A draft version. Nothing the agent reads changes until it is published."""
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    uname = payload.get("preferred_username") or payload.get("name")
    try:
        draft = await create_draft(
            db,
            kb_id,
            body=body.body,
            notes=body.notes,
            author=sub if isinstance(sub, str) else None,
            author_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
        )
    except PromptStoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await db.commit()
    return to_response(draft)


@router.post("/{kb_id}/agent-prompts/{version}/publish")
async def publish_agent_prompt(
    kb_id: str,
    version: int,
    kb: KnowledgeBase = Depends(get_kb_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    """Make one version live — the rollback is publishing an older one.

    Refused unless an evaluation run was completed after that draft was written: the point of the store is that text reaches
    production with evidence, not with confidence.
    """
    try:
        row = await publish(db, kb_id, version)
    except PromptStoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await db.commit()
    return to_response(row)
