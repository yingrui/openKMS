"""Document channels API."""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.schemas.channel import ChannelCreate, ChannelMergeBody, ChannelNode, ChannelReorderBody, ChannelUpdate

router = APIRouter(prefix="/document-channels", tags=["document-channels"], dependencies=[Depends(require_auth)])


def _strip_field_order(schema: dict[str, Any] | list | None) -> dict[str, Any] | list | None:
    """Remove fieldOrder from extraction_schema; json type preserves properties key order."""
    if schema is None or not isinstance(schema, dict):
        return schema
    out = {k: v for k, v in schema.items() if k != "fieldOrder"}
    return out


def _build_tree(channels: list[DocumentChannel], parent_id: str | None = None) -> list[ChannelNode]:
    """Build tree from flat list. Siblings sorted by sort_order then name at each level."""
    nodes = [c for c in channels if c.parent_id == parent_id]
    nodes.sort(key=lambda c: (c.sort_order, c.name))
    result = []
    for c in nodes:
        result.append(
            ChannelNode(
                id=c.id,
                name=c.name,
                description=c.description,
                sort_order=c.sort_order,
                pipeline_id=c.pipeline_id,
                auto_process=c.auto_process,
                extraction_model_id=c.extraction_model_id,
                extraction_schema=_strip_field_order(c.extraction_schema),
                children=_build_tree(channels, c.id),
            )
        )
    return result


@router.get("", response_model=list[ChannelNode])
async def list_document_channels(db: AsyncSession = Depends(get_db)):
    """List document channels as tree (top-level only, children nested)."""
    result = await db.execute(
        select(DocumentChannel).order_by(DocumentChannel.sort_order, DocumentChannel.name)
    )
    channels = list(result.scalars().all())
    return _build_tree(channels, None)


@router.post("", response_model=ChannelNode)
async def create_document_channel(
    body: ChannelCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a document channel."""
    if body.parent_id:
        parent = await db.get(DocumentChannel, body.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent channel not found")

    # New channel gets sort_order = max(siblings) + 1 so it appears at end of its level
    next_order = await db.execute(
        select(func.coalesce(func.max(DocumentChannel.sort_order), -1) + 1).where(
            DocumentChannel.parent_id == body.parent_id
        )
    )
    sort_order = next_order.scalar() or 0

    channel_id = f"dc_{uuid.uuid4().hex[:8]}"
    channel = DocumentChannel(
        id=channel_id,
        name=body.name,
        description=body.description,
        parent_id=body.parent_id,
        sort_order=sort_order,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return ChannelNode(
        id=channel.id,
        name=channel.name,
        description=channel.description,
        sort_order=channel.sort_order,
        pipeline_id=channel.pipeline_id,
        auto_process=channel.auto_process,
        extraction_model_id=channel.extraction_model_id,
        extraction_schema=_strip_field_order(channel.extraction_schema),
        children=[],
    )


@router.post("/merge", status_code=204)
async def merge_document_channels(
    body: ChannelMergeBody,
    db: AsyncSession = Depends(get_db),
):
    """Merge source channel(s) into target. Moves all documents to target, then deletes source channel(s)."""
    if body.source_channel_id == body.target_channel_id:
        raise HTTPException(status_code=400, detail="Source and target must be different")

    source = await db.get(DocumentChannel, body.source_channel_id)
    target = await db.get(DocumentChannel, body.target_channel_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source channel not found")
    if not target:
        raise HTTPException(status_code=404, detail="Target channel not found")

    result = await db.execute(select(DocumentChannel))
    all_channels = list(result.scalars().all())
    source_descendants = set()
    _collect_descendant_ids(all_channels, body.source_channel_id, source_descendants)
    if body.target_channel_id in source_descendants:
        raise HTTPException(
            status_code=400,
            detail="Target cannot be a descendant of source",
        )

    channel_ids_to_merge = (
        list(source_descendants) if body.include_descendants else [body.source_channel_id]
    )

    if not body.include_descendants:
        child_count = await db.execute(
            select(func.count()).select_from(DocumentChannel).where(
                DocumentChannel.parent_id == body.source_channel_id
            )
        )
        if (child_count.scalar() or 0) > 0:
            raise HTTPException(
                status_code=400,
                detail="Source has sub-channels. Enable include_descendants to merge them too.",
            )

    await db.execute(
        update(Document)
        .where(Document.channel_id.in_(channel_ids_to_merge))
        .values(channel_id=body.target_channel_id)
    )

    source_ch = await db.get(DocumentChannel, body.source_channel_id)
    if source_ch:
        await db.delete(source_ch)
    await db.commit()


@router.delete("/{channel_id}", status_code=204)
async def delete_document_channel(
    channel_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a document channel. Fails if channel has documents or sub-channels."""
    channel = await db.get(DocumentChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    doc_count = await db.execute(
        select(func.count()).select_from(Document).where(Document.channel_id == channel_id)
    )
    if (doc_count.scalar() or 0) > 0:
        raise HTTPException(
            status_code=400,
            detail="Channel has documents. Move or delete them first.",
        )

    child_count = await db.execute(
        select(func.count()).select_from(DocumentChannel).where(DocumentChannel.parent_id == channel_id)
    )
    if (child_count.scalar() or 0) > 0:
        raise HTTPException(
            status_code=400,
            detail="Channel has sub-channels. Remove or move them first.",
        )

    await db.delete(channel)
    await db.commit()

def _collect_descendant_ids(channels: list[DocumentChannel], channel_id: str, out: set[str]) -> None:
    """Collect channel_id and all descendant IDs into out."""
    out.add(channel_id)
    for c in channels:
        if c.parent_id == channel_id:
            _collect_descendant_ids(channels, c.id, out    )


@router.post("/{channel_id}/reorder", status_code=204)
async def reorder_document_channel(
    channel_id: str,
    body: ChannelReorderBody,
    db: AsyncSession = Depends(get_db),
):
    """Move channel up or down among siblings (same parent)."""
    if body.direction not in ("up", "down"):
        raise HTTPException(status_code=400, detail="direction must be 'up' or 'down'")
    channel = await db.get(DocumentChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    result = await db.execute(
        select(DocumentChannel)
        .where(DocumentChannel.parent_id == channel.parent_id)
        .order_by(DocumentChannel.sort_order, DocumentChannel.name)
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

    needs_normalize = len(set(s.sort_order for s in siblings)) < len(siblings)
    if needs_normalize:
        for i, s in enumerate(siblings):
            await db.execute(
                update(DocumentChannel).where(DocumentChannel.id == s.id).values(sort_order=i)
            )
        await db.flush()

    siblings_refreshed = list(
        (await db.execute(
            select(DocumentChannel)
            .where(DocumentChannel.parent_id == channel.parent_id)
            .order_by(DocumentChannel.sort_order, DocumentChannel.name)
        )).scalars().all()
    )
    idx = next((i for i, c in enumerate(siblings_refreshed) if c.id == channel_id), idx)
    swap_idx = idx - 1 if body.direction == "up" else idx + 1
    current = siblings_refreshed[idx]
    other = siblings_refreshed[swap_idx]

    cur_order, oth_order = current.sort_order, other.sort_order
    await db.execute(
        update(DocumentChannel).where(DocumentChannel.id == current.id).values(sort_order=oth_order)
    )
    await db.execute(
        update(DocumentChannel).where(DocumentChannel.id == other.id).values(sort_order=cur_order)
    )
    await db.commit()


@router.put("/{channel_id}", response_model=ChannelNode)
async def update_document_channel(
    channel_id: str,
    body: ChannelUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a document channel."""
    channel = await db.get(DocumentChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    update_data = body.model_dump(exclude_unset=True)

    if "parent_id" in update_data:
        new_parent_id = update_data["parent_id"]
        if new_parent_id == channel_id:
            raise HTTPException(status_code=400, detail="Cannot move channel to be its own child")
        if new_parent_id is not None:
            parent = await db.get(DocumentChannel, new_parent_id)
            if not parent:
                raise HTTPException(status_code=404, detail="Parent channel not found")
            result = await db.execute(select(DocumentChannel))
            all_channels = list(result.scalars().all())
            descendant_ids = set()
            _collect_descendant_ids(all_channels, channel_id, descendant_ids)
            if new_parent_id in descendant_ids:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot move channel to a descendant (would create a cycle)",
                )

    if "extraction_schema" in update_data and update_data["extraction_schema"] is not None:
        update_data["extraction_schema"] = _strip_field_order(update_data["extraction_schema"])
    for key, value in update_data.items():
        setattr(channel, key, value)

    await db.commit()
    await db.refresh(channel)
    return ChannelNode(
        id=channel.id,
        name=channel.name,
        description=channel.description,
        sort_order=channel.sort_order,
        pipeline_id=channel.pipeline_id,
        auto_process=channel.auto_process,
        extraction_model_id=channel.extraction_model_id,
        extraction_schema=_strip_field_order(channel.extraction_schema),
        children=[],
    )
