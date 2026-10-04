"""Media channels API (tree)."""

from fastapi import Depends

from app.api.channel_tree_router import ChannelTreeSpec, build_channel_tree_router
from app.models.media_asset import MediaAsset
from app.models.media_channel import MediaChannel
from app.schemas.media_channel import (
    MediaChannelNode,
    MediaChannelTreeListResponse,
    MediaChannelUpdate,
)
from app.services.acl.resource_acl_constants import RT_MEDIA_CHANNEL
from app.services.feature_toggles import require_media_feature


def _channel_node(channel: MediaChannel, children: list[MediaChannelNode]) -> MediaChannelNode:
    return MediaChannelNode(
        id=channel.id,
        name=channel.name,
        description=channel.description,
        sort_order=channel.sort_order,
        metadata_schema=channel.metadata_schema,
        default_image_model_id=channel.default_image_model_id,
        default_video_model_id=channel.default_video_model_id,
        children=children,
    )


router = build_channel_tree_router(
    ChannelTreeSpec(
        kind="media",
        prefix="/media-channels",
        channel_model=MediaChannel,
        item_model=MediaAsset,
        items_label="media assets",
        id_prefix="mc",
        resource_type=RT_MEDIA_CHANNEL,
        scope_not_found_detail="Media channel not found",
        node_schema=MediaChannelNode,
        tree_list_schema=MediaChannelTreeListResponse,
        update_schema=MediaChannelUpdate,
        to_node=_channel_node,
        extra_dependencies=(Depends(require_media_feature),),
    )
)
