"""Media channels API (tree)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.media_asset import MediaAsset
from app.models.media_channel import MediaChannel
from app.schemas.media_channel import (
    MediaChannelCreate,
    MediaChannelMergeBody,
    MediaChannelNode,
    MediaChannelReorderBody,
    MediaChannelTreeListResponse,
    MediaChannelUpdate,
)
from app.services.channel_tree_list import paginate_channels_for_tree
from app.services.channel_scope import (
    require_media_channel_in_scope,
    require_media_channel_write,
    scoped_media_channel_ids,
)
from app.services.data_scope import bootstrap_owner_acl
from app.services.feature_toggles import require_media_feature
from app.services.resource_acl_constants import RT_MEDIA_CHANNEL

router = APIRouter(
    prefix="/media-channels",
    tags=["media-channels"],
    dependencies=[Depends(require_auth), Depends(require_media_feature)],
)


async def _scoped_media_channel_ids(request: Request, db: AsyncSession) -> set[str] | None:
    return await scoped_media_channel_ids(request, db)


def _channel_node(channel: MediaChannel, children: list[MediaChannelNode] | None = None) -> MediaChannelNode:
    return MediaChannelNode(
        id=channel.id,
        name=channel.name,
        description=channel.description,
        sort_order=channel.sort_order,
        metadata_schema=channel.metadata_schema,
        default_image_model_id=channel.default_image_model_id,
        default_video_model_id=channel.default_video_model_id,
        children=children or [],
    )


def _build_tree(channels: list[MediaChannel], parent_id: str | None = None) -> list[MediaChannelNode]:
    nodes = [c for c in channels if c.parent_id == parent_id]
    nodes.sort(key=lambda c: (c.sort_order, c.name))
    return [_channel_node(c, _build_tree(channels, c.id)) for c in nodes]


def _collect_descendant_ids(channels: list[MediaChannel], channel_id: str, out: set[str]) -> None:
    out.add(channel_id)
    for c in channels:
        if c.parent_id == channel_id:
            _collect_descendant_ids(channels, c.id, out)


@router.get("/{channel_id}", response_model=MediaChannelNode)
async def get_media_channel(
    channel_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    allowed = await _scoped_media_channel_ids(request, db)
    require_media_channel_in_scope(allowed, channel_id)
    channel = await db.get(MediaChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return _channel_node(channel)


@router.get("", response_model=MediaChannelTreeListResponse)
async def list_media_channels(
    request: Request,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MediaChannel).order_by(MediaChannel.sort_order, MediaChannel.name))
    channels = list(result.scalars().all())
    allowed = await _scoped_media_channel_ids(request, db)
    if allowed is not None:
        channels = [c for c in channels if c.id in allowed]
    page_channels, total = paginate_channels_for_tree(channels, limit=limit, offset=offset)
    return MediaChannelTreeListResponse(
        items=_build_tree(page_channels, None),
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=MediaChannelNode)
async def create_media_channel(
    body: MediaChannelCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if body.parent_id:
        await require_media_channel_write(request, db, body.parent_id)
        parent = await db.get(MediaChannel, body.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent channel not found")

    next_order = await db.execute(
        select(func.coalesce(func.max(MediaChannel.sort_order), -1) + 1).where(
            MediaChannel.parent_id == body.parent_id
        )
    )
    sort_order = next_order.scalar() or 0

    channel_id = f"mc_{uuid.uuid4().hex[:8]}"
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    uname = p.get("preferred_username") or p.get("name")
    channel = MediaChannel(
        id=channel_id,
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
        await bootstrap_owner_acl(db, RT_MEDIA_CHANNEL, channel.id, sub)
    await db.commit()
    await db.refresh(channel)
    return _channel_node(channel)


@router.post("/merge", status_code=204)
async def merge_media_channels(
    body: MediaChannelMergeBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await require_media_channel_write(request, db, body.source_channel_id)
    await require_media_channel_write(request, db, body.target_channel_id)
    if body.source_channel_id == body.target_channel_id:
        raise HTTPException(status_code=400, detail="Source and target must be different")

    source = await db.get(MediaChannel, body.source_channel_id)
    target = await db.get(MediaChannel, body.target_channel_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source channel not found")
    if not target:
        raise HTTPException(status_code=404, detail="Target channel not found")

    result = await db.execute(select(MediaChannel))
    all_channels = list(result.scalars().all())
    source_descendants: set[str] = set()
    _collect_descendant_ids(all_channels, body.source_channel_id, source_descendants)
    if body.target_channel_id in source_descendants:
        raise HTTPException(status_code=400, detail="Target cannot be a descendant of source")

    channel_ids_to_merge = list(source_descendants) if body.include_descendants else [body.source_channel_id]

    if not body.include_descendants:
        child_count = await db.execute(
            select(func.count()).select_from(MediaChannel).where(MediaChannel.parent_id == body.source_channel_id)
        )
        if (child_count.scalar() or 0) > 0:
            raise HTTPException(
                status_code=400,
                detail="Source has sub-channels. Enable include_descendants to merge them too.",
            )

    await db.execute(
        update(MediaAsset).where(MediaAsset.channel_id.in_(channel_ids_to_merge)).values(
            channel_id=body.target_channel_id
        )
    )

    source_ch = await db.get(MediaChannel, body.source_channel_id)
    if source_ch:
        await db.delete(source_ch)
    await db.commit()


@router.delete("/{channel_id}", status_code=204)
async def delete_media_channel(
    channel_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await require_media_channel_write(request, db, channel_id)
    channel = await db.get(MediaChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    asset_count = await db.execute(
        select(func.count()).select_from(MediaAsset).where(MediaAsset.channel_id == channel_id)
    )
    if (asset_count.scalar() or 0) > 0:
        raise HTTPException(status_code=400, detail="Channel has media assets. Move or delete them first.")

    child_count = await db.execute(
        select(func.count()).select_from(MediaChannel).where(MediaChannel.parent_id == channel_id)
    )
    if (child_count.scalar() or 0) > 0:
        raise HTTPException(status_code=400, detail="Channel has sub-channels. Remove or move them first.")

    await db.delete(channel)
    await db.commit()


@router.post("/{channel_id}/reorder", status_code=204)
async def reorder_media_channel(
    channel_id: str,
    body: MediaChannelReorderBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await require_media_channel_write(request, db, channel_id)
    if body.direction not in ("up", "down"):
        raise HTTPException(status_code=400, detail="direction must be 'up' or 'down'")
    channel = await db.get(MediaChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    result = await db.execute(
        select(MediaChannel)
        .where(MediaChannel.parent_id == channel.parent_id)
        .order_by(MediaChannel.sort_order, MediaChannel.name)
    )
    siblings = list(result.scalars().all())
    idx = next((i for i, c in enumerate(siblings) if c.id == channel_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    if body.direction == "up" and idx == 0:
        raise HTTPException(status_code=400, detail="Already first")
    if body.direction == "down" and idx == len(siblings) - 1:
        raise HTTPException(status_code=400, detail="Already last")
    swap_idx = idx - 1 if body.direction == "up" else idx + 1

    needs_normalize = len({s.sort_order for s in siblings}) < len(siblings)
    if needs_normalize:
        for i, s in enumerate(siblings):
            await db.execute(update(MediaChannel).where(MediaChannel.id == s.id).values(sort_order=i))
        await db.flush()

    siblings_refreshed = list(
        (
            await db.execute(
                select(MediaChannel)
                .where(MediaChannel.parent_id == channel.parent_id)
                .order_by(MediaChannel.sort_order, MediaChannel.name)
            )
        ).scalars().all()
    )
    idx = next((i for i, c in enumerate(siblings_refreshed) if c.id == channel_id), idx)
    swap_idx = idx - 1 if body.direction == "up" else idx + 1
    current = siblings_refreshed[idx]
    other = siblings_refreshed[swap_idx]

    cur_order, oth_order = current.sort_order, other.sort_order
    await db.execute(update(MediaChannel).where(MediaChannel.id == current.id).values(sort_order=oth_order))
    await db.execute(update(MediaChannel).where(MediaChannel.id == other.id).values(sort_order=cur_order))
    await db.commit()


@router.put("/{channel_id}", response_model=MediaChannelNode)
async def update_media_channel(
    channel_id: str,
    body: MediaChannelUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await require_media_channel_write(request, db, channel_id)
    channel = await db.get(MediaChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    update_data = body.model_dump(exclude_unset=True)

    if "parent_id" in update_data:
        new_parent_id = update_data["parent_id"]
        if new_parent_id == channel_id:
            raise HTTPException(status_code=400, detail="Cannot move channel to be its own child")
        if new_parent_id is not None:
            await require_media_channel_write(request, db, new_parent_id)
            parent = await db.get(MediaChannel, new_parent_id)
            if not parent:
                raise HTTPException(status_code=404, detail="Parent channel not found")
            result = await db.execute(select(MediaChannel))
            all_channels = list(result.scalars().all())
            descendant_ids: set[str] = set()
            _collect_descendant_ids(all_channels, channel_id, descendant_ids)
            if new_parent_id in descendant_ids:
                raise HTTPException(status_code=400, detail="Cannot move channel to a descendant (would create a cycle)")

    for key, value in update_data.items():
        setattr(channel, key, value)

    await db.commit()
    await db.refresh(channel)
    return _channel_node(channel)
