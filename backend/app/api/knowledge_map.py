"""Knowledge Map API: hierarchical nodes and links to channels / wiki spaces."""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.database import get_db
from app.models.document_channel import DocumentChannel
from app.models.knowledge_map import KnowledgeMapNode, KnowledgeMapResourceLink
from app.models.wiki_models import WikiSpace
from app.services.permission_catalog import PERM_KNOWLEDGE_MAP_READ, PERM_KNOWLEDGE_MAP_WRITE

router = APIRouter(prefix="/taxonomy", tags=["knowledge-map"])

RESOURCE_TYPES: frozenset[str] = frozenset({"document_channel", "article_channel", "wiki_space"})


def _nid() -> str:
    return uuid.uuid4().hex[:32]


class KnowledgeMapNodeOut(BaseModel):
    id: str
    parent_id: str | None
    name: str
    description: str | None = None
    sort_order: int
    link_count: int = 0
    children: list["KnowledgeMapNodeOut"] = Field(default_factory=list)


class KnowledgeMapNodeCreate(BaseModel):
    parent_id: str | None = None
    name: str = Field(..., min_length=1, max_length=256)
    description: str | None = Field(None, max_length=8192)
    sort_order: int = 0


class KnowledgeMapNodeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=256)
    description: str | None = Field(None, max_length=8192)
    sort_order: int | None = None
    parent_id: str | None = None


class ResourceLinkOut(BaseModel):
    id: str
    taxonomy_node_id: str
    resource_type: str
    resource_id: str


class ResourceLinkUpsert(BaseModel):
    taxonomy_node_id: str = Field(..., min_length=1, max_length=64)
    resource_type: str = Field(..., min_length=1, max_length=32)
    resource_id: str = Field(..., min_length=1, max_length=64)


async def _validate_resource(db: AsyncSession, resource_type: str, resource_id: str) -> None:
    if resource_type not in RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail=f"resource_type must be one of: {sorted(RESOURCE_TYPES)}")
    if resource_type == "document_channel":
        ch = await db.get(DocumentChannel, resource_id)
        if not ch:
            raise HTTPException(status_code=400, detail="document_channel not found")
    elif resource_type == "wiki_space":
        ws = await db.get(WikiSpace, resource_id)
        if not ws:
            raise HTTPException(status_code=400, detail="wiki_space not found")
    else:
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", resource_id):
            raise HTTPException(status_code=400, detail="Invalid article_channel id")


def _build_tree(
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
                children=_build_tree(nodes, link_counts, n.id),
            )
        )
    return out


@router.get(
    "/nodes/tree",
    response_model=list[KnowledgeMapNodeOut],
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_READ))],
)
async def get_knowledge_map_tree(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeMapNode))
    nodes = list(result.scalars().all())
    link_counts: dict[str, int] = {}
    if nodes:
        ids = [n.id for n in nodes]
        lc_result = await db.execute(
            select(KnowledgeMapResourceLink.taxonomy_node_id).where(KnowledgeMapResourceLink.taxonomy_node_id.in_(ids))
        )
        for (nid,) in lc_result.all():
            link_counts[nid] = link_counts.get(nid, 0) + 1
    return _build_tree(nodes, link_counts, None)


@router.post(
    "/nodes",
    response_model=KnowledgeMapNodeOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def create_knowledge_map_node(body: KnowledgeMapNodeCreate, db: AsyncSession = Depends(get_db)):
    if body.parent_id:
        parent = await db.get(KnowledgeMapNode, body.parent_id)
        if not parent:
            raise HTTPException(status_code=400, detail="parent_id not found")
    node = KnowledgeMapNode(
        id=_nid(),
        parent_id=body.parent_id,
        name=body.name.strip(),
        description=(body.description.strip() if body.description else None) or None,
        sort_order=body.sort_order,
    )
    db.add(node)
    await db.flush()
    return KnowledgeMapNodeOut(
        id=node.id,
        parent_id=node.parent_id,
        name=node.name,
        description=node.description,
        sort_order=node.sort_order,
        link_count=0,
        children=[],
    )


@router.patch(
    "/nodes/{node_id}",
    response_model=KnowledgeMapNodeOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def update_knowledge_map_node(
    node_id: str,
    body: KnowledgeMapNodeUpdate,
    db: AsyncSession = Depends(get_db),
):
    node = await db.get(KnowledgeMapNode, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    patch = body.model_dump(exclude_unset=True)
    if "parent_id" in patch:
        new_parent = patch["parent_id"]
        if new_parent == node_id:
            raise HTTPException(status_code=400, detail="Cannot set parent to self")
        if new_parent:
            parent = await db.get(KnowledgeMapNode, new_parent)
            if not parent:
                raise HTTPException(status_code=400, detail="parent_id not found")
            cid: str | None = new_parent
            while cid:
                if cid == node_id:
                    raise HTTPException(status_code=400, detail="Cycle detected")
                anc = await db.get(KnowledgeMapNode, cid)
                cid = anc.parent_id if anc else None
        node.parent_id = new_parent
    if "name" in patch and patch["name"] is not None:
        node.name = str(patch["name"]).strip()
    if "description" in patch:
        d = patch["description"]
        node.description = (str(d).strip() or None) if d is not None else None
    if "sort_order" in patch and patch["sort_order"] is not None:
        node.sort_order = int(patch["sort_order"])
    await db.flush()
    cnt2 = await db.scalar(
        select(sa_func.count())
        .select_from(KnowledgeMapResourceLink)
        .where(KnowledgeMapResourceLink.taxonomy_node_id == node_id)
    )
    return KnowledgeMapNodeOut(
        id=node.id,
        parent_id=node.parent_id,
        name=node.name,
        description=node.description,
        sort_order=node.sort_order,
        link_count=int(cnt2 or 0),
        children=[],
    )


@router.delete(
    "/nodes/{node_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def delete_knowledge_map_node(node_id: str, db: AsyncSession = Depends(get_db)):
    node = await db.get(KnowledgeMapNode, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    await db.delete(node)


@router.get(
    "/resource-links",
    response_model=list[ResourceLinkOut],
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_READ))],
)
async def list_resource_links(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeMapResourceLink).order_by(KnowledgeMapResourceLink.created_at))
    rows = result.scalars().all()
    return [
        ResourceLinkOut(
            id=r.id,
            taxonomy_node_id=r.taxonomy_node_id,
            resource_type=r.resource_type,
            resource_id=r.resource_id,
        )
        for r in rows
    ]


@router.put(
    "/resource-links",
    response_model=ResourceLinkOut,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def upsert_resource_link(body: ResourceLinkUpsert, db: AsyncSession = Depends(get_db)):
    node = await db.get(KnowledgeMapNode, body.taxonomy_node_id)
    if not node:
        raise HTTPException(status_code=400, detail="taxonomy_node_id not found")
    await _validate_resource(db, body.resource_type, body.resource_id)
    existing = await db.execute(
        select(KnowledgeMapResourceLink).where(
            KnowledgeMapResourceLink.resource_type == body.resource_type,
            KnowledgeMapResourceLink.resource_id == body.resource_id,
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        row.taxonomy_node_id = body.taxonomy_node_id
    else:
        row = KnowledgeMapResourceLink(
            id=_nid(),
            taxonomy_node_id=body.taxonomy_node_id,
            resource_type=body.resource_type,
            resource_id=body.resource_id,
        )
        db.add(row)
    await db.flush()
    return ResourceLinkOut(
        id=row.id,
        taxonomy_node_id=row.taxonomy_node_id,
        resource_type=row.resource_type,
        resource_id=row.resource_id,
    )


@router.delete(
    "/resource-links",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_KNOWLEDGE_MAP_WRITE))],
)
async def delete_resource_link(
    resource_type: str = Query(..., min_length=1),
    resource_id: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KnowledgeMapResourceLink).where(
            KnowledgeMapResourceLink.resource_type == resource_type,
            KnowledgeMapResourceLink.resource_id == resource_id,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        await db.delete(row)
