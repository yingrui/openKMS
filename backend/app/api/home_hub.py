"""Aggregated data for the signed-in home (knowledge operations hub)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.auth import require_any_permission
from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.models.document_relationship import DocumentRelationship
from app.models.knowledge_map import KnowledgeMapNode, KnowledgeMapResourceLink
from app.services.knowledge_map_read import (
    KnowledgeMapHtmlStatusOut,
    KnowledgeMapNodeOut,
    ResourceLinkOut,
    load_knowledge_map_tree,
    load_map_html_status,
    load_resource_labels,
    load_resource_links,
)
from app.services.permission_catalog import PERM_ALL, PERM_DOCUMENTS_READ, PERM_KNOWLEDGE_MAP_READ
from app.services.permission_resolution import resolve_oidc_permission_keys, resolve_user_permission_keys
from app.services.resource_acl_service import readable_document_channel_ids, scope_applies

router = APIRouter(prefix="/home", tags=["home"])


class KnowledgeMapSummary(BaseModel):
    node_count: int
    link_count: int


class WorkItem(BaseModel):
    id: str
    relation_type: str
    source_document_id: str
    target_document_id: str
    source_title: str
    target_title: str
    created_at: datetime


class HomeHubResponse(BaseModel):
    knowledge_map: KnowledgeMapSummary | None = None
    work_items: list[WorkItem] = Field(default_factory=list)
    share_requests: list[dict] = Field(default_factory=list)
    knowledge_map_tree: list[KnowledgeMapNodeOut] | None = None
    resource_links: list[ResourceLinkOut] | None = None
    map_html_status: KnowledgeMapHtmlStatusOut | None = None
    resource_labels: dict[str, str] = Field(default_factory=dict)


@router.get(
    "/hub",
    response_model=HomeHubResponse,
    dependencies=[Depends(require_any_permission(PERM_KNOWLEDGE_MAP_READ, PERM_DOCUMENTS_READ))],
)
async def get_home_hub(request: Request, db: AsyncSession = Depends(get_db)):
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    if not isinstance(sub, str):
        sub = ""

    if settings.auth_mode == "local":
        perms = await resolve_user_permission_keys(db, sub)
    else:
        perms = await resolve_oidc_permission_keys(db, payload)

    has_tax = PERM_ALL in perms or PERM_KNOWLEDGE_MAP_READ in perms
    has_docs = PERM_ALL in perms or PERM_DOCUMENTS_READ in perms

    km_summary: KnowledgeMapSummary | None = None
    km_tree: list[KnowledgeMapNodeOut] | None = None
    resource_links: list[ResourceLinkOut] | None = None
    map_html_status: KnowledgeMapHtmlStatusOut | None = None
    resource_labels: dict[str, str] = {}

    if has_tax:
        node_count = await db.scalar(select(sa_func.count()).select_from(KnowledgeMapNode)) or 0
        link_count = await db.scalar(select(sa_func.count()).select_from(KnowledgeMapResourceLink)) or 0
        km_summary = KnowledgeMapSummary(node_count=int(node_count), link_count=int(link_count))
        km_tree = await load_knowledge_map_tree(db)
        resource_links = await load_resource_links(db)
        map_html_status = await load_map_html_status(db)
        resource_labels = await load_resource_labels(db, resource_links)

    work_items: list[WorkItem] = []
    if has_docs and sub:
        readable_channels: set[str] | None = None
        if scope_applies(payload, sub):
            readable_channels = await readable_document_channel_ids(db, payload, sub)

        sdoc = aliased(Document)
        tdoc = aliased(Document)
        rel_result = await db.execute(
            select(
                DocumentRelationship,
                sdoc.name,
                tdoc.name,
                sdoc.channel_id,
                tdoc.channel_id,
            )
            .join(sdoc, DocumentRelationship.source_document_id == sdoc.id)
            .join(tdoc, DocumentRelationship.target_document_id == tdoc.id)
            .where(
                DocumentRelationship.relation_type.in_(
                    ("supersedes", "amends", "implements", "see_also"),
                )
            )
            .order_by(DocumentRelationship.created_at.desc())
            .limit(40)
        )
        for rel, sname, tname, src_channel_id, tgt_channel_id in rel_result.all():
            if readable_channels is not None:
                src_ok = bool(src_channel_id and src_channel_id in readable_channels)
                tgt_ok = bool(tgt_channel_id and tgt_channel_id in readable_channels)
                if not (src_ok or tgt_ok):
                    continue
            work_items.append(
                WorkItem(
                    id=rel.id,
                    relation_type=rel.relation_type,
                    source_document_id=rel.source_document_id,
                    target_document_id=rel.target_document_id,
                    source_title=sname,
                    target_title=tname,
                    created_at=rel.created_at,
                )
            )
            if len(work_items) >= 15:
                break

    return HomeHubResponse(
        knowledge_map=km_summary,
        work_items=work_items,
        share_requests=[],
        knowledge_map_tree=km_tree,
        resource_links=resource_links,
        map_html_status=map_html_status,
        resource_labels=resource_labels,
    )
