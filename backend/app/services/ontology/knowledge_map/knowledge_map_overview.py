"""Knowledge Map Overview composition: schema, default layout, validation, view merge."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_map import (
    DEFAULT_KNOWLEDGE_MAP_OVERVIEW_COMPOSITION_ID,
    KnowledgeMapOverviewComposition,
)
from app.models.media_channel import MediaChannel
from app.services.knowledge_map.knowledge_map_html import (
    knowledge_map_nodes_last_modified_at,
    load_semantic_snapshot,
    semantic_content_hash,
)
from app.services.knowledge_map.knowledge_map_read import (
    KnowledgeMapNodeOut,
    ResourceLinkOut,
    load_knowledge_map_tree,
    load_resource_labels,
    load_resource_links,
)
from app.services.knowledge_map.knowledge_map_overview_a2ui import (
    normalize_stored_a2ui_document,
    synthesize_overview_a2ui_messages,
    validate_a2ui_messages_against_snapshot,
)


ResourceType = Literal["document_channel", "article_channel", "media_channel", "wiki_space"]


class ResourceRef(BaseModel):
    resource_type: ResourceType
    resource_id: str = Field(min_length=1, max_length=64)


class NodeTreeBlock(BaseModel):
    type: Literal["node_tree"] = "node_tree"
    root_node_id: str
    depth: int | None = Field(default=None, ge=0, le=32)


class NodeListBlock(BaseModel):
    type: Literal["node_list"] = "node_list"
    node_ids: list[str] = Field(default_factory=list)


class ResourceListBlock(BaseModel):
    type: Literal["resource_list"] = "resource_list"
    refs: list[ResourceRef] = Field(default_factory=list)


class RichTextBlock(BaseModel):
    type: Literal["rich_text"] = "rich_text"
    markdown: str = Field(default="", max_length=8000)


class DividerBlock(BaseModel):
    type: Literal["divider"] = "divider"


Block = NodeTreeBlock | NodeListBlock | ResourceListBlock | RichTextBlock | DividerBlock


class SectionSourceRoot(BaseModel):
    type: Literal["root_node"] = "root_node"
    node_id: str


class SectionSourceManual(BaseModel):
    type: Literal["manual"] = "manual"


class OverviewSection(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=256)
    blurb: str | None = Field(default=None, max_length=2000)
    source: SectionSourceRoot | SectionSourceManual = Field(default_factory=SectionSourceManual)
    blocks: list[Block] = Field(default_factory=list)


class OverviewMeta(BaseModel):
    title: str | None = Field(default=None, max_length=256)
    subtitle: str | None = Field(default=None, max_length=1000)


class FeaturedNode(BaseModel):
    type: Literal["node"] = "node"
    node_id: str


class FeaturedResource(BaseModel):
    type: Literal["resource"] = "resource"
    resource_type: ResourceType
    resource_id: str


FeaturedPin = FeaturedNode | FeaturedResource


class OverviewComposition(BaseModel):
    version: Literal[1] = 1
    meta: OverviewMeta = Field(default_factory=OverviewMeta)
    sections: list[OverviewSection] = Field(default_factory=list)
    featured: list[FeaturedPin] = Field(default_factory=list)
    hidden_node_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _unique_section_ids(self) -> OverviewComposition:
        ids = [s.id for s in self.sections]
        if len(ids) != len(set(ids)):
            raise ValueError("section ids must be unique")
        return self


class LabeledResourceLink(BaseModel):
    knowledge_map_node_id: str
    resource_type: str
    resource_id: str
    label: str
    href: str


class UnresolvedRef(BaseModel):
    kind: Literal["node", "resource"]
    node_id: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    where: str


class OverviewStatusOut(BaseModel):
    current_content_hash: str
    composition_content_hash: str | None = None
    stale: bool
    has_composition: bool
    nodes_modified_at: datetime | None = None
    published_at: datetime | None = None


class OverviewViewOut(BaseModel):
    stale: bool
    current_content_hash: str
    composition_content_hash: str | None = None
    has_composition: bool
    synthesized: bool
    published_at: datetime | None = None
    a2ui_messages: list[dict[str, Any]] = Field(default_factory=list)
    tree: list[KnowledgeMapNodeOut]
    resources_by_node: dict[str, list[LabeledResourceLink]]
    unresolved_refs: list[UnresolvedRef] = Field(default_factory=list)


def resource_href(resource_type: str, resource_id: str) -> str:
    rid = resource_id
    if resource_type == "document_channel":
        return f"/documents/channels/{rid}"
    if resource_type == "wiki_space":
        return f"/wikis/{rid}/pages/graph"
    if resource_type == "article_channel":
        return f"/articles/channels/{rid}"
    if resource_type == "media_channel":
        return f"/media/channels/{rid}"
    return "/articles"


def synthesize_default_composition(tree: list[KnowledgeMapNodeOut]) -> OverviewComposition:
    """Deterministic Overview when nothing is published — one section per root."""
    sections: list[OverviewSection] = []
    for root in tree:
        sections.append(
            OverviewSection(
                id=f"sec-{root.id[:12]}",
                title=root.name,
                blurb=(root.description or None),
                source=SectionSourceRoot(node_id=root.id),
                blocks=[NodeTreeBlock(root_node_id=root.id)],
            )
        )
    title = "Knowledge Map"
    subtitle = "Browse terms and jump to linked channels and wiki spaces."
    if not sections:
        subtitle = "Add terms on the Edit map tab, then return here for an overview."
    return OverviewComposition(
        version=1,
        meta=OverviewMeta(title=title, subtitle=subtitle),
        sections=sections,
    )


def collect_composition_refs(composition: OverviewComposition) -> tuple[set[str], set[tuple[str, str]]]:
    node_ids: set[str] = set(composition.hidden_node_ids)
    resources: set[tuple[str, str]] = set()
    for sec in composition.sections:
        if isinstance(sec.source, SectionSourceRoot):
            node_ids.add(sec.source.node_id)
        for block in sec.blocks:
            if isinstance(block, NodeTreeBlock):
                node_ids.add(block.root_node_id)
            elif isinstance(block, NodeListBlock):
                node_ids.update(block.node_ids)
            elif isinstance(block, ResourceListBlock):
                for ref in block.refs:
                    resources.add((ref.resource_type, ref.resource_id))
    for feat in composition.featured:
        if isinstance(feat, FeaturedNode):
            node_ids.add(feat.node_id)
        else:
            resources.add((feat.resource_type, feat.resource_id))
    return node_ids, resources


def validate_composition_against_snapshot(
    composition: OverviewComposition,
    snapshot: dict[str, Any],
) -> OverviewComposition:
    """Parse + ensure all referenced ids exist in the live map. Raises ValueError."""
    parsed = OverviewComposition.model_validate(composition.model_dump())
    live_nodes = {n["id"] for n in snapshot.get("nodes") or []}
    live_links = {(lk["resource_type"], lk["resource_id"]) for lk in snapshot.get("links") or []}
    node_ids, resources = collect_composition_refs(parsed)
    missing_nodes = sorted(nid for nid in node_ids if nid not in live_nodes)
    if missing_nodes:
        raise ValueError(f"unknown node ids: {', '.join(missing_nodes[:12])}")
    bad = sorted(f"{t}:{i}" for t, i in resources if (t, i) not in live_links)
    if bad:
        raise ValueError(f"unknown resource refs: {', '.join(bad[:12])}")
    return parsed


def find_unresolved_refs(
    composition: OverviewComposition,
    snapshot: dict[str, Any],
) -> list[UnresolvedRef]:
    live_nodes = {n["id"] for n in snapshot.get("nodes") or []}
    live_links = {(lk["resource_type"], lk["resource_id"]) for lk in snapshot.get("links") or []}
    out: list[UnresolvedRef] = []
    node_ids, resources = collect_composition_refs(composition)
    for nid in sorted(node_ids):
        if nid not in live_nodes:
            out.append(UnresolvedRef(kind="node", node_id=nid, where="composition"))
    for t, i in sorted(resources):
        if (t, i) not in live_links:
            out.append(UnresolvedRef(kind="resource", resource_type=t, resource_id=i, where="composition"))
    return out


async def load_resource_labels_with_media(
    db: AsyncSession, links: list[ResourceLinkOut]
) -> dict[str, str]:
    labels = await load_resource_labels(db, links)
    media_ids = {link.resource_id for link in links if link.resource_type == "media_channel"}
    if media_ids:
        result = await db.execute(select(MediaChannel).where(MediaChannel.id.in_(media_ids)))
        for ch in result.scalars().all():
            labels[f"media_channel:{ch.id}"] = ch.name
    return labels


async def load_overview_status(db: AsyncSession) -> OverviewStatusOut:
    snapshot = await load_semantic_snapshot(db)
    current_hash = semantic_content_hash(snapshot)
    row = await db.get(KnowledgeMapOverviewComposition, DEFAULT_KNOWLEDGE_MAP_OVERVIEW_COMPOSITION_ID)
    comp_hash = row.content_hash if row else None
    stale = row is None or row.content_hash != current_hash
    nodes_mod = await knowledge_map_nodes_last_modified_at(db)
    return OverviewStatusOut(
        current_content_hash=current_hash,
        composition_content_hash=comp_hash,
        stale=stale,
        has_composition=row is not None,
        nodes_modified_at=nodes_mod,
        published_at=row.published_at if row else None,
    )


async def load_overview_view(
    db: AsyncSession,
    *,
    working_a2ui_messages: list[dict[str, Any]] | None = None,
) -> OverviewViewOut:
    snapshot = await load_semantic_snapshot(db)
    current_hash = semantic_content_hash(snapshot)
    tree = await load_knowledge_map_tree(db)
    links = await load_resource_links(db)
    labels = await load_resource_labels_with_media(db, links)

    tree_dicts = [n.model_dump(mode="json") for n in tree]
    link_dicts = [
        {
            "knowledge_map_node_id": lk.knowledge_map_node_id,
            "resource_type": lk.resource_type,
            "resource_id": lk.resource_id,
        }
        for lk in links
    ]

    row = await db.get(KnowledgeMapOverviewComposition, DEFAULT_KNOWLEDGE_MAP_OVERVIEW_COMPOSITION_ID)
    synthesized = False
    if working_a2ui_messages is not None:
        a2ui_messages = working_a2ui_messages
        has_composition = row is not None
        comp_hash = row.content_hash if row else None
        published_at = row.published_at if row else None
        stale = row is None or (row.content_hash != current_hash)
    elif row is not None:
        parsed = normalize_stored_a2ui_document(row.composition)
        if parsed is not None:
            a2ui_messages = parsed
        else:
            # Legacy OverviewComposition JSON — fall back to live synthesize
            a2ui_messages = synthesize_overview_a2ui_messages(tree_dicts, link_dicts, labels)
            synthesized = True
        has_composition = True
        comp_hash = row.content_hash
        published_at = row.published_at
        stale = row.content_hash != current_hash
    else:
        a2ui_messages = synthesize_overview_a2ui_messages(tree_dicts, link_dicts, labels)
        synthesized = True
        has_composition = False
        comp_hash = None
        published_at = None
        stale = True

    resources_by_node: dict[str, list[LabeledResourceLink]] = {}
    for link in links:
        key = f"{link.resource_type}:{link.resource_id}"
        label = labels.get(key) or f"{link.resource_type}: {link.resource_id}"
        resources_by_node.setdefault(link.knowledge_map_node_id, []).append(
            LabeledResourceLink(
                knowledge_map_node_id=link.knowledge_map_node_id,
                resource_type=link.resource_type,
                resource_id=link.resource_id,
                label=label,
                href=resource_href(link.resource_type, link.resource_id),
            )
        )

    return OverviewViewOut(
        stale=stale,
        current_content_hash=current_hash,
        composition_content_hash=comp_hash,
        has_composition=has_composition,
        synthesized=synthesized,
        published_at=published_at,
        a2ui_messages=a2ui_messages,
        tree=tree,
        resources_by_node=resources_by_node,
        unresolved_refs=[],
    )


async def publish_overview_a2ui(
    db: AsyncSession,
    messages: list[dict[str, Any]],
) -> KnowledgeMapOverviewComposition:
    snapshot = await load_semantic_snapshot(db)
    validated = validate_a2ui_messages_against_snapshot(messages, snapshot)
    content_hash = semantic_content_hash(snapshot)
    now = datetime.now(timezone.utc)
    payload = {"format": "a2ui_v0_9", "messages": validated}
    row = await db.get(KnowledgeMapOverviewComposition, DEFAULT_KNOWLEDGE_MAP_OVERVIEW_COMPOSITION_ID)
    if row is None:
        row = KnowledgeMapOverviewComposition(
            id=DEFAULT_KNOWLEDGE_MAP_OVERVIEW_COMPOSITION_ID,
            composition=payload,
            content_hash=content_hash,
            published_at=now,
        )
        db.add(row)
    else:
        row.composition = payload
        row.content_hash = content_hash
        row.published_at = now
    await db.flush()
    return row


async def delete_overview_composition(db: AsyncSession) -> bool:
    row = await db.get(KnowledgeMapOverviewComposition, DEFAULT_KNOWLEDGE_MAP_OVERVIEW_COMPOSITION_ID)
    if row is None:
        return False
    await db.delete(row)
    await db.flush()
    return True
