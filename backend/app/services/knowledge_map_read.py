"""Read-only Knowledge Map helpers shared by API routes."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article_channel import ArticleChannel
from app.models.document_channel import DocumentChannel
from app.models.knowledge_map import (
    DEFAULT_KNOWLEDGE_MAP_HTML_ARTIFACT_ID,
    KnowledgeMapHtmlArtifact,
    KnowledgeMapNode,
    KnowledgeMapResourceLink,
)
from app.models.wiki_models import WikiSpace
from app.services.knowledge_map_html import (
    knowledge_map_nodes_last_modified_at,
    load_semantic_snapshot,
    semantic_content_hash,
)


class KnowledgeMapNodeOut(BaseModel):
    id: str
    parent_id: str | None
    name: str
    description: str | None = None
    sort_order: int
    link_count: int = 0
    children: list["KnowledgeMapNodeOut"] = Field(default_factory=list)


class ResourceLinkOut(BaseModel):
    id: str
    knowledge_map_node_id: str
    resource_type: str
    resource_id: str


class KnowledgeMapHtmlStatusOut(BaseModel):
    current_content_hash: str
    artifact_content_hash: str | None = None
    stale: bool
    has_artifact: bool
    nodes_modified_at: datetime | None = None
    generated_at: datetime | None = None


def build_knowledge_map_tree(
    nodes: list[KnowledgeMapNode],
    link_counts: dict[str, int],
    parent_id: str | None,
) -> list[KnowledgeMapNodeOut]:
    children = [n for n in nodes if n.parent_id == parent_id]
    children.sort(key=lambda n: (n.sort_order, n.name))
    out: list[KnowledgeMapNodeOut] = []
    for n in children:
        out.append(
            KnowledgeMapNodeOut(
                id=n.id,
                parent_id=n.parent_id,
                name=n.name,
                description=n.description,
                sort_order=n.sort_order,
                link_count=link_counts.get(n.id, 0),
                children=build_knowledge_map_tree(nodes, link_counts, n.id),
            )
        )
    return out


async def load_knowledge_map_tree(db: AsyncSession) -> list[KnowledgeMapNodeOut]:
    result = await db.execute(select(KnowledgeMapNode))
    nodes = list(result.scalars().all())
    link_counts: dict[str, int] = {}
    if nodes:
        ids = [n.id for n in nodes]
        lc_result = await db.execute(
            select(KnowledgeMapResourceLink.knowledge_map_node_id).where(
                KnowledgeMapResourceLink.knowledge_map_node_id.in_(ids)
            )
        )
        for (nid,) in lc_result.all():
            link_counts[nid] = link_counts.get(nid, 0) + 1
    return build_knowledge_map_tree(nodes, link_counts, None)


async def load_resource_links(db: AsyncSession) -> list[ResourceLinkOut]:
    result = await db.execute(select(KnowledgeMapResourceLink).order_by(KnowledgeMapResourceLink.created_at))
    rows = result.scalars().all()
    return [
        ResourceLinkOut(
            id=r.id,
            knowledge_map_node_id=r.knowledge_map_node_id,
            resource_type=r.resource_type,
            resource_id=r.resource_id,
        )
        for r in rows
    ]


async def load_map_html_status(db: AsyncSession) -> KnowledgeMapHtmlStatusOut:
    snapshot = await load_semantic_snapshot(db)
    current_hash = semantic_content_hash(snapshot)
    row = await db.get(KnowledgeMapHtmlArtifact, DEFAULT_KNOWLEDGE_MAP_HTML_ARTIFACT_ID)
    artifact_hash = row.content_hash if row else None
    stale = row is None or row.content_hash != current_hash
    nodes_mod = await knowledge_map_nodes_last_modified_at(db)
    return KnowledgeMapHtmlStatusOut(
        current_content_hash=current_hash,
        artifact_content_hash=artifact_hash,
        stale=stale,
        has_artifact=row is not None and bool((row.html or "").strip()),
        nodes_modified_at=nodes_mod,
        generated_at=row.generated_at if row else None,
    )


def _flatten_channel_labels(
    channels: list[DocumentChannel | ArticleChannel],
    parent_id: str | None = None,
    prefix: str = "",
) -> dict[str, str]:
    labels: dict[str, str] = {}
    children = [c for c in channels if c.parent_id == parent_id]
    children.sort(key=lambda c: (c.sort_order, c.name))
    for ch in children:
        label = f"{prefix}{ch.name}"
        labels[ch.id] = label
        labels.update(_flatten_channel_labels(channels, ch.id, f"{label} / "))
    return labels


async def load_resource_labels(db: AsyncSession, links: list[ResourceLinkOut]) -> dict[str, str]:
    doc_ids = {link.resource_id for link in links if link.resource_type == "document_channel"}
    art_ids = {link.resource_id for link in links if link.resource_type == "article_channel"}
    wiki_ids = {link.resource_id for link in links if link.resource_type == "wiki_space"}

    labels: dict[str, str] = {}

    if doc_ids:
        result = await db.execute(select(DocumentChannel))
        doc_channels = list(result.scalars().all())
        for cid, name in _flatten_channel_labels(doc_channels).items():
            if cid in doc_ids:
                labels[f"document_channel:{cid}"] = name

    if art_ids:
        result = await db.execute(select(ArticleChannel))
        art_channels = list(result.scalars().all())
        for cid, name in _flatten_channel_labels(art_channels).items():
            if cid in art_ids:
                labels[f"article_channel:{cid}"] = name

    if wiki_ids:
        result = await db.execute(select(WikiSpace).where(WikiSpace.id.in_(wiki_ids)))
        for ws in result.scalars().all():
            labels[f"wiki_space:{ws.id}"] = ws.name

    return labels
