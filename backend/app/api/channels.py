"""Document channels API."""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.document_channel import DocumentChannel
from app.schemas.channel import ChannelCreate, ChannelNode, ChannelUpdate

router = APIRouter(prefix="/channels", tags=["channels"], dependencies=[Depends(require_auth)])


def _strip_field_order(schema: dict[str, Any] | list | None) -> dict[str, Any] | list | None:
    """Remove fieldOrder from extraction_schema; json type preserves properties key order."""
    if schema is None or not isinstance(schema, dict):
        return schema
    out = {k: v for k, v in schema.items() if k != "fieldOrder"}
    return out


def _build_tree(channels: list[DocumentChannel], parent_id: str | None = None) -> list[ChannelNode]:
    """Build tree from flat list."""
    nodes = [c for c in channels if c.parent_id == parent_id]
    nodes.sort(key=lambda c: (c.sort_order, c.name))
    result = []
    for c in nodes:
        result.append(
            ChannelNode(
                id=c.id,
                name=c.name,
                description=c.description,
                pipeline_id=c.pipeline_id,
                auto_process=c.auto_process,
                extraction_model_id=c.extraction_model_id,
                extraction_schema=_strip_field_order(c.extraction_schema),
                children=_build_tree(channels, c.id),
            )
        )
    return result


@router.get("/documents", response_model=list[ChannelNode])
async def list_document_channels(db: AsyncSession = Depends(get_db)):
    """List document channels as tree (top-level only, children nested)."""
    result = await db.execute(
        select(DocumentChannel).order_by(DocumentChannel.sort_order, DocumentChannel.name)
    )
    channels = list(result.scalars().all())
    return _build_tree(channels, None)


@router.post("/documents", response_model=ChannelNode)
async def create_document_channel(
    body: ChannelCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a document channel."""
    if body.parent_id:
        parent = await db.get(DocumentChannel, body.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent channel not found")

    channel_id = f"dc_{uuid.uuid4().hex[:8]}"
    channel = DocumentChannel(
        id=channel_id,
        name=body.name,
        parent_id=body.parent_id,
        sort_order=body.sort_order,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return ChannelNode(
        id=channel.id,
        name=channel.name,
        description=channel.description,
        pipeline_id=channel.pipeline_id,
        auto_process=channel.auto_process,
        extraction_model_id=channel.extraction_model_id,
        extraction_schema=_strip_field_order(channel.extraction_schema),
        children=[],
    )


@router.put("/documents/{channel_id}", response_model=ChannelNode)
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
        pipeline_id=channel.pipeline_id,
        auto_process=channel.auto_process,
        extraction_model_id=channel.extraction_model_id,
        extraction_schema=_strip_field_order(channel.extraction_schema),
        children=[],
    )
