"""Article channels API (tree; no parsing pipeline)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.article import Article
from app.models.article_channel import ArticleChannel
from app.schemas.article_channel import (
    ArticleChannelCreate,
    ArticleChannelMergeBody,
    ArticleChannelNode,
    ArticleChannelReorderBody,
    ArticleChannelUpdate,
)
from app.services.data_scope import effective_article_channel_ids, scope_applies

router = APIRouter(prefix="/article-channels", tags=["article-channels"], dependencies=[Depends(require_auth)])


async def _scoped_article_channel_ids(request: Request, db: AsyncSession) -> set[str] | None:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str):
        return None
    if not scope_applies(p, sub):
        return None
    return await effective_article_channel_ids(db, sub)


def _require_ac_channel_in_scope(allowed: set[str] | None, channel_id: str) -> None:
    if allowed is None:
        return
    if channel_id not in allowed:
        raise HTTPException(status_code=404, detail="Channel not found")


def _build_tree(channels: list[ArticleChannel], parent_id: str | None = None) -> list[ArticleChannelNode]:
    nodes = [c for c in channels if c.parent_id == parent_id]
    nodes.sort(key=lambda c: (c.sort_order, c.name))
    return [
        ArticleChannelNode(
            id=c.id,
            name=c.name,
            description=c.description,
            sort_order=c.sort_order,
            children=_build_tree(channels, c.id),
        )
        for c in nodes
    ]


def _collect_descendant_ids(channels: list[ArticleChannel], channel_id: str, out: set[str]) -> None:
    out.add(channel_id)
    for c in channels:
        if c.parent_id == channel_id:
            _collect_descendant_ids(channels, c.id, out)


@router.get("/{channel_id}", response_model=ArticleChannelNode)
async def get_article_channel(
    channel_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    allowed = await _scoped_article_channel_ids(request, db)
    _require_ac_channel_in_scope(allowed, channel_id)
    channel = await db.get(ArticleChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return ArticleChannelNode(
        id=channel.id,
        name=channel.name,
        description=channel.description,
        sort_order=channel.sort_order,
        children=[],
    )


@router.get("", response_model=list[ArticleChannelNode])
async def list_article_channels(request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ArticleChannel).order_by(ArticleChannel.sort_order, ArticleChannel.name))
    channels = list(result.scalars().all())
    allowed = await _scoped_article_channel_ids(request, db)
    if allowed is not None:
        channels = [c for c in channels if c.id in allowed]
    return _build_tree(channels, None)


@router.post("", response_model=ArticleChannelNode)
async def create_article_channel(
    body: ArticleChannelCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    allowed = await _scoped_article_channel_ids(request, db)
    if allowed is not None:
        if body.parent_id:
            _require_ac_channel_in_scope(allowed, body.parent_id)
        elif not allowed:
            raise HTTPException(status_code=403, detail="Not allowed to create channels outside your access scope")
    if body.parent_id:
        parent = await db.get(ArticleChannel, body.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent channel not found")

    next_order = await db.execute(
        select(func.coalesce(func.max(ArticleChannel.sort_order), -1) + 1).where(
            ArticleChannel.parent_id == body.parent_id
        )
    )
    sort_order = next_order.scalar() or 0

    channel_id = f"ac_{uuid.uuid4().hex[:8]}"
    channel = ArticleChannel(
        id=channel_id,
        name=body.name,
        description=body.description,
        parent_id=body.parent_id,
        sort_order=sort_order,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return ArticleChannelNode(
        id=channel.id,
        name=channel.name,
        description=channel.description,
        sort_order=channel.sort_order,
        children=[],
    )


@router.post("/merge", status_code=204)
async def merge_article_channels(
    body: ArticleChannelMergeBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    allowed = await _scoped_article_channel_ids(request, db)
    if allowed is not None:
        _require_ac_channel_in_scope(allowed, body.source_channel_id)
        _require_ac_channel_in_scope(allowed, body.target_channel_id)
    if body.source_channel_id == body.target_channel_id:
        raise HTTPException(status_code=400, detail="Source and target must be different")

    source = await db.get(ArticleChannel, body.source_channel_id)
    target = await db.get(ArticleChannel, body.target_channel_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source channel not found")
    if not target:
        raise HTTPException(status_code=404, detail="Target channel not found")

    result = await db.execute(select(ArticleChannel))
    all_channels = list(result.scalars().all())
    source_descendants: set[str] = set()
    _collect_descendant_ids(all_channels, body.source_channel_id, source_descendants)
    if body.target_channel_id in source_descendants:
        raise HTTPException(status_code=400, detail="Target cannot be a descendant of source")

    channel_ids_to_merge = list(source_descendants) if body.include_descendants else [body.source_channel_id]

    if not body.include_descendants:
        child_count = await db.execute(
            select(func.count()).select_from(ArticleChannel).where(ArticleChannel.parent_id == body.source_channel_id)
        )
        if (child_count.scalar() or 0) > 0:
            raise HTTPException(
                status_code=400,
                detail="Source has sub-channels. Enable include_descendants to merge them too.",
            )

    await db.execute(
        update(Article).where(Article.channel_id.in_(channel_ids_to_merge)).values(channel_id=body.target_channel_id)
    )

    source_ch = await db.get(ArticleChannel, body.source_channel_id)
    if source_ch:
        await db.delete(source_ch)
    await db.commit()


@router.delete("/{channel_id}", status_code=204)
async def delete_article_channel(
    channel_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    allowed = await _scoped_article_channel_ids(request, db)
    _require_ac_channel_in_scope(allowed, channel_id)
    channel = await db.get(ArticleChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    art_count = await db.execute(select(func.count()).select_from(Article).where(Article.channel_id == channel_id))
    if (art_count.scalar() or 0) > 0:
        raise HTTPException(status_code=400, detail="Channel has articles. Move or delete them first.")

    child_count = await db.execute(
        select(func.count()).select_from(ArticleChannel).where(ArticleChannel.parent_id == channel_id)
    )
    if (child_count.scalar() or 0) > 0:
        raise HTTPException(status_code=400, detail="Channel has sub-channels. Remove or move them first.")

    await db.delete(channel)
    await db.commit()


@router.post("/{channel_id}/reorder", status_code=204)
async def reorder_article_channel(
    channel_id: str,
    body: ArticleChannelReorderBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    allowed = await _scoped_article_channel_ids(request, db)
    _require_ac_channel_in_scope(allowed, channel_id)
    if body.direction not in ("up", "down"):
        raise HTTPException(status_code=400, detail="direction must be 'up' or 'down'")
    channel = await db.get(ArticleChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    result = await db.execute(
        select(ArticleChannel)
        .where(ArticleChannel.parent_id == channel.parent_id)
        .order_by(ArticleChannel.sort_order, ArticleChannel.name)
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
            await db.execute(update(ArticleChannel).where(ArticleChannel.id == s.id).values(sort_order=i))
        await db.flush()

    siblings_refreshed = list(
        (
            await db.execute(
                select(ArticleChannel)
                .where(ArticleChannel.parent_id == channel.parent_id)
                .order_by(ArticleChannel.sort_order, ArticleChannel.name)
            )
        ).scalars().all()
    )
    idx = next((i for i, c in enumerate(siblings_refreshed) if c.id == channel_id), idx)
    swap_idx = idx - 1 if body.direction == "up" else idx + 1
    current = siblings_refreshed[idx]
    other = siblings_refreshed[swap_idx]

    cur_order, oth_order = current.sort_order, other.sort_order
    await db.execute(update(ArticleChannel).where(ArticleChannel.id == current.id).values(sort_order=oth_order))
    await db.execute(update(ArticleChannel).where(ArticleChannel.id == other.id).values(sort_order=cur_order))
    await db.commit()


@router.put("/{channel_id}", response_model=ArticleChannelNode)
async def update_article_channel(
    channel_id: str,
    body: ArticleChannelUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    allowed = await _scoped_article_channel_ids(request, db)
    _require_ac_channel_in_scope(allowed, channel_id)
    channel = await db.get(ArticleChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    update_data = body.model_dump(exclude_unset=True)

    if "parent_id" in update_data:
        new_parent_id = update_data["parent_id"]
        if new_parent_id == channel_id:
            raise HTTPException(status_code=400, detail="Cannot move channel to be its own child")
        if new_parent_id is not None:
            parent = await db.get(ArticleChannel, new_parent_id)
            if not parent:
                raise HTTPException(status_code=404, detail="Parent channel not found")
            result = await db.execute(select(ArticleChannel))
            all_channels = list(result.scalars().all())
            descendant_ids: set[str] = set()
            _collect_descendant_ids(all_channels, channel_id, descendant_ids)
            if new_parent_id in descendant_ids:
                raise HTTPException(status_code=400, detail="Cannot move channel to a descendant (would create a cycle)")

    for key, value in update_data.items():
        setattr(channel, key, value)

    await db.commit()
    await db.refresh(channel)
    return ArticleChannelNode(
        id=channel.id,
        name=channel.name,
        description=channel.description,
        sort_order=channel.sort_order,
        children=[],
    )
