"""Document channels API."""
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.channel_tree_router import ChannelTreeSpec, build_channel_tree_router
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.models.object_type import ObjectType
from app.schemas.channel import ChannelNode, ChannelTreeListResponse, ChannelUpdate
from app.services.acl.resource_acl_constants import RT_DOCUMENT_CHANNEL


def _strip_field_order(schema: dict[str, Any] | list | None) -> dict[str, Any] | list | None:
    """Remove fieldOrder from extraction_schema; json type preserves properties key order."""
    if schema is None or not isinstance(schema, dict):
        return schema
    out = {k: v for k, v in schema.items() if k != "fieldOrder"}
    return out


def _normalize_label_config(cfg: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
    """Normalize label_config: migrate allow_multiple to type for backward compat."""
    if not cfg or not isinstance(cfg, list):
        return cfg
    out = []
    for item in cfg:
        if not isinstance(item, dict):
            out.append(item)
            continue
        copy = dict(item)
        if "type" not in copy or copy.get("type") not in ("object_type", "list[object_type]"):
            copy["type"] = "list[object_type]" if copy.get("allow_multiple") else "object_type"
        if "allow_multiple" in copy:
            del copy["allow_multiple"]
        out.append(copy)
    return out


def _channel_node(channel: DocumentChannel, children: list[ChannelNode]) -> ChannelNode:
    return ChannelNode(
        id=channel.id,
        name=channel.name,
        description=channel.description,
        sort_order=channel.sort_order,
        pipeline_id=channel.pipeline_id,
        auto_process=channel.auto_process,
        extraction_model_id=channel.extraction_model_id,
        extraction_schema=_strip_field_order(channel.extraction_schema),
        label_config=_normalize_label_config(getattr(channel, "label_config", None)),
        object_type_extraction_max_instances=getattr(channel, "object_type_extraction_max_instances", None),
        children=children,
    )


async def _prepare_update(db: AsyncSession, update_data: dict[str, Any]) -> None:
    if update_data.get("extraction_schema") is not None:
        update_data["extraction_schema"] = _strip_field_order(update_data["extraction_schema"])

    cfg = update_data.get("label_config")
    if cfg is None:
        return
    if not isinstance(cfg, list):
        raise HTTPException(status_code=400, detail="label_config must be a list")
    for item in cfg:
        if not isinstance(item, dict):
            continue
        ot_id = item.get("object_type_id")
        if not ot_id:
            raise HTTPException(status_code=400, detail="label_config item must have object_type_id")
        ot = await db.get(ObjectType, ot_id)
        if not ot:
            raise HTTPException(status_code=400, detail=f"Object type {ot_id} not found")
        if not getattr(ot, "is_master_data", False):
            raise HTTPException(
                status_code=400,
                detail=f"Object type '{ot.name}' is not master data. Only master data object types can be used for manual labels.",
            )
    update_data["label_config"] = _normalize_label_config(cfg)


router = build_channel_tree_router(
    ChannelTreeSpec(
        kind="document",
        prefix="/document-channels",
        channel_model=DocumentChannel,
        item_model=Document,
        items_label="documents",
        id_prefix="dc",
        resource_type=RT_DOCUMENT_CHANNEL,
        scope_not_found_detail="Channel not found",
        node_schema=ChannelNode,
        tree_list_schema=ChannelTreeListResponse,
        update_schema=ChannelUpdate,
        to_node=_channel_node,
        prepare_update=_prepare_update,
    )
)
