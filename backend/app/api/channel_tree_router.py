"""Shared CRUD / merge / reorder routes for document, article and media channel trees."""

import uuid
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.schemas.channel import ChannelCreate, ChannelMergeBody, ChannelReorderBody
from app.services.acl.context_guard import (
    require_channel_in_scope,
    require_channel_write,
    scoped_channel_ids,
)
from app.services.acl.data_scope import bootstrap_owner_acl
from app.services.channels.channel_tree_list import paginate_channels_for_tree


@dataclass(frozen=True)
class ChannelTreeSpec:
    kind: str
    """Route-name stem, e.g. ``article`` → ``list_article_channels``."""
    prefix: str
    channel_model: Any
    item_model: Any
    """Rows assigned to a channel via ``channel_id`` (moved on merge, block delete)."""
    items_label: str
    id_prefix: str
    resource_type: str
    scope_not_found_detail: str
    node_schema: type[BaseModel]
    tree_list_schema: type[BaseModel]
    update_schema: type[BaseModel]
    to_node: Callable[[Any, list], BaseModel]
    prepare_update: Callable[[AsyncSession, dict[str, Any]], Awaitable[None]] | None = None
    extra_dependencies: Sequence[Any] = ()


def _collect_descendant_ids(channels: list[Any], channel_id: str, out: set[str]) -> None:
    out.add(channel_id)
    for c in channels:
        if c.parent_id == channel_id:
            _collect_descendant_ids(channels, c.id, out)


def build_channel_tree_router(spec: ChannelTreeSpec) -> APIRouter:
    Channel = spec.channel_model
    Item = spec.item_model
    NodeSchema = spec.node_schema
    TreeListSchema = spec.tree_list_schema
    UpdateSchema = spec.update_schema
    kind = spec.kind

    router = APIRouter(
        prefix=spec.prefix,
        tags=[spec.prefix.strip("/")],
        dependencies=[Depends(require_auth), *spec.extra_dependencies],
    )

    async def require_write(request: Request, db: AsyncSession, channel_id: str) -> None:
        await require_channel_write(
            db, request, spec.resource_type, channel_id, detail=spec.scope_not_found_detail
        )

    def build_tree(channels: list[Any], parent_id: str | None = None) -> list[BaseModel]:
        nodes = [c for c in channels if c.parent_id == parent_id]
        nodes.sort(key=lambda c: (c.sort_order, c.name))
        return [spec.to_node(c, build_tree(channels, c.id)) for c in nodes]

    @router.get("/{channel_id}", response_model=NodeSchema, name=f"get_{kind}_channel")
    async def get_channel(
        channel_id: str,
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        allowed = await scoped_channel_ids(request, db, spec.resource_type)
        require_channel_in_scope(allowed, channel_id, detail=spec.scope_not_found_detail)
        channel = await db.get(Channel, channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")
        return spec.to_node(channel, [])

    @router.get("", response_model=TreeListSchema, name=f"list_{kind}_channels")
    async def list_channels(
        request: Request,
        limit: int = Query(200, ge=1, le=500),
        offset: int = Query(0, ge=0),
        db: AsyncSession = Depends(get_db),
    ):
        """List channels as tree (paginated by top-level roots; each page includes full subtrees)."""
        result = await db.execute(select(Channel).order_by(Channel.sort_order, Channel.name))
        channels = list(result.scalars().all())
        allowed = await scoped_channel_ids(request, db, spec.resource_type)
        if allowed is not None:
            channels = [c for c in channels if c.id in allowed]
        page_channels, total = paginate_channels_for_tree(channels, limit=limit, offset=offset)
        return TreeListSchema(items=build_tree(page_channels, None), total=total, limit=limit, offset=offset)

    @router.post("", response_model=NodeSchema, name=f"create_{kind}_channel")
    async def create_channel(
        body: ChannelCreate,
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        if body.parent_id:
            await require_write(request, db, body.parent_id)
            parent = await db.get(Channel, body.parent_id)
            if not parent:
                raise HTTPException(status_code=404, detail="Parent channel not found")

        next_order = await db.execute(
            select(func.coalesce(func.max(Channel.sort_order), -1) + 1).where(Channel.parent_id == body.parent_id)
        )
        sort_order = next_order.scalar() or 0

        p = request.state.openkms_jwt_payload
        sub = p.get("sub")
        uname = p.get("preferred_username") or p.get("name")
        channel = Channel(
            id=f"{spec.id_prefix}_{uuid.uuid4().hex[:8]}",
            name=body.name,
            description=body.description,
            parent_id=body.parent_id,
            sort_order=sort_order,
            created_by=sub if isinstance(sub, str) else None,
            created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
        )
        db.add(channel)
        await db.flush()
        if isinstance(sub, str):
            await bootstrap_owner_acl(db, spec.resource_type, channel.id, sub)
        await db.commit()
        await db.refresh(channel)
        return spec.to_node(channel, [])

    @router.post("/merge", status_code=204, name=f"merge_{kind}_channels")
    async def merge_channels(
        body: ChannelMergeBody,
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        """Move all items from source channel(s) to target, then delete the source channel(s)."""
        await require_write(request, db, body.source_channel_id)
        await require_write(request, db, body.target_channel_id)
        if body.source_channel_id == body.target_channel_id:
            raise HTTPException(status_code=400, detail="Source and target must be different")

        source = await db.get(Channel, body.source_channel_id)
        target = await db.get(Channel, body.target_channel_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source channel not found")
        if not target:
            raise HTTPException(status_code=404, detail="Target channel not found")

        all_channels = list((await db.execute(select(Channel))).scalars().all())
        source_descendants: set[str] = set()
        _collect_descendant_ids(all_channels, body.source_channel_id, source_descendants)
        if body.target_channel_id in source_descendants:
            raise HTTPException(status_code=400, detail="Target cannot be a descendant of source")

        channel_ids_to_merge = list(source_descendants) if body.include_descendants else [body.source_channel_id]

        if not body.include_descendants:
            child_count = await db.execute(
                select(func.count()).select_from(Channel).where(Channel.parent_id == body.source_channel_id)
            )
            if (child_count.scalar() or 0) > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Source has sub-channels. Enable include_descendants to merge them too.",
                )

        await db.execute(
            update(Item).where(Item.channel_id.in_(channel_ids_to_merge)).values(channel_id=body.target_channel_id)
        )

        source_ch = await db.get(Channel, body.source_channel_id)
        if source_ch:
            await db.delete(source_ch)
        await db.commit()

    @router.delete("/{channel_id}", status_code=204, name=f"delete_{kind}_channel")
    async def delete_channel(
        channel_id: str,
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        """Delete a channel. Fails if it still has items or sub-channels."""
        await require_write(request, db, channel_id)
        channel = await db.get(Channel, channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")

        item_count = await db.execute(select(func.count()).select_from(Item).where(Item.channel_id == channel_id))
        if (item_count.scalar() or 0) > 0:
            raise HTTPException(
                status_code=400, detail=f"Channel has {spec.items_label}. Move or delete them first."
            )

        child_count = await db.execute(
            select(func.count()).select_from(Channel).where(Channel.parent_id == channel_id)
        )
        if (child_count.scalar() or 0) > 0:
            raise HTTPException(status_code=400, detail="Channel has sub-channels. Remove or move them first.")

        await db.delete(channel)
        await db.commit()

    @router.post("/{channel_id}/reorder", status_code=204, name=f"reorder_{kind}_channel")
    async def reorder_channel(
        channel_id: str,
        body: ChannelReorderBody,
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        """Move channel up or down among siblings (same parent)."""
        await require_write(request, db, channel_id)
        if body.direction not in ("up", "down"):
            raise HTTPException(status_code=400, detail="direction must be 'up' or 'down'")
        channel = await db.get(Channel, channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")

        def siblings_query():
            return (
                select(Channel)
                .where(Channel.parent_id == channel.parent_id)
                .order_by(Channel.sort_order, Channel.name)
            )

        siblings = list((await db.execute(siblings_query())).scalars().all())
        idx = next((i for i, c in enumerate(siblings) if c.id == channel_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Channel not found")
        if body.direction == "up" and idx == 0:
            raise HTTPException(status_code=400, detail="Already first")
        if body.direction == "down" and idx == len(siblings) - 1:
            raise HTTPException(status_code=400, detail="Already last")

        if len({s.sort_order for s in siblings}) < len(siblings):
            for i, s in enumerate(siblings):
                await db.execute(update(Channel).where(Channel.id == s.id).values(sort_order=i))
            await db.flush()
            siblings = list((await db.execute(siblings_query())).scalars().all())
            idx = next((i for i, c in enumerate(siblings) if c.id == channel_id), idx)

        swap_idx = idx - 1 if body.direction == "up" else idx + 1
        current, other = siblings[idx], siblings[swap_idx]
        cur_order, oth_order = current.sort_order, other.sort_order
        await db.execute(update(Channel).where(Channel.id == current.id).values(sort_order=oth_order))
        await db.execute(update(Channel).where(Channel.id == other.id).values(sort_order=cur_order))
        await db.commit()

    @router.put("/{channel_id}", response_model=NodeSchema, name=f"update_{kind}_channel")
    async def update_channel(
        channel_id: str,
        body: UpdateSchema,  # type: ignore[valid-type]
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        await require_write(request, db, channel_id)
        channel = await db.get(Channel, channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")

        update_data = body.model_dump(exclude_unset=True)

        if "parent_id" in update_data:
            new_parent_id = update_data["parent_id"]
            if new_parent_id == channel_id:
                raise HTTPException(status_code=400, detail="Cannot move channel to be its own child")
            if new_parent_id is not None:
                await require_write(request, db, new_parent_id)
                parent = await db.get(Channel, new_parent_id)
                if not parent:
                    raise HTTPException(status_code=404, detail="Parent channel not found")
                all_channels = list((await db.execute(select(Channel))).scalars().all())
                descendant_ids: set[str] = set()
                _collect_descendant_ids(all_channels, channel_id, descendant_ids)
                if new_parent_id in descendant_ids:
                    raise HTTPException(
                        status_code=400, detail="Cannot move channel to a descendant (would create a cycle)"
                    )

        if spec.prepare_update is not None:
            await spec.prepare_update(db, update_data)

        for key, value in update_data.items():
            setattr(channel, key, value)

        await db.commit()
        await db.refresh(channel)
        return spec.to_node(channel, [])

    return router
