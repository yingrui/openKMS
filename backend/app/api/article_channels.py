"""Article channels API (tree; no parsing pipeline)."""

from app.api.channel_tree_router import ChannelTreeSpec, build_channel_tree_router
from app.models.article import Article
from app.models.article_channel import ArticleChannel
from app.schemas.article_channel import (
    ArticleChannelNode,
    ArticleChannelTreeListResponse,
    ArticleChannelUpdate,
)
from app.services.acl.resource_acl_constants import RT_ARTICLE_CHANNEL


def _channel_node(channel: ArticleChannel, children: list[ArticleChannelNode]) -> ArticleChannelNode:
    return ArticleChannelNode(
        id=channel.id,
        name=channel.name,
        description=channel.description,
        sort_order=channel.sort_order,
        review_model_id=channel.review_model_id,
        review_prompt=channel.review_prompt,
        review_criteria=channel.review_criteria,
        children=children,
    )


router = build_channel_tree_router(
    ChannelTreeSpec(
        kind="article",
        prefix="/article-channels",
        channel_model=ArticleChannel,
        item_model=Article,
        items_label="articles",
        id_prefix="ac",
        resource_type=RT_ARTICLE_CHANNEL,
        scope_not_found_detail="Article channel not found",
        node_schema=ArticleChannelNode,
        tree_list_schema=ArticleChannelTreeListResponse,
        update_schema=ArticleChannelUpdate,
        to_node=_channel_node,
    )
)
