"""Admin helpers: resource labels and SPA share links for resource ACL."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.article_channel import ArticleChannel
from app.models.dataset import Dataset
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.models.evaluation import Evaluation
from app.models.knowledge_base import KnowledgeBase
from app.models.link_type import LinkType
from app.models.object_type import ObjectType
from app.models.wiki_models import WikiPage, WikiSpace
from app.services.resource_acl_constants import (
    RT_ARTICLE,
    RT_ARTICLE_CHANNEL,
    RT_DATASET,
    RT_DOCUMENT,
    RT_DOCUMENT_CHANNEL,
    RT_EVALUATION,
    RT_KNOWLEDGE_BASE,
    RT_LINK_TYPE,
    RT_OBJECT_TYPE,
    RT_WIKI_PAGE,
    RT_WIKI_SPACE,
)


def share_path_for(resource_type: str, resource_id: str) -> str | None:
    """Frontend route to open sharing UI for a resource, when available."""
    paths = {
        RT_DOCUMENT_CHANNEL: f"/documents/channels/{resource_id}/settings?tab=sharing",
        RT_ARTICLE_CHANNEL: f"/articles/channels/{resource_id}/settings?tab=sharing",
        RT_WIKI_SPACE: f"/wikis/{resource_id}/settings#sharing",
        RT_KNOWLEDGE_BASE: f"/knowledge-bases/{resource_id}?tab=settings",
        RT_EVALUATION: f"/evaluations/{resource_id}/settings",
    }
    return paths.get(resource_type)


def resource_type_label(resource_type: str) -> str:
    labels = {
        RT_DOCUMENT_CHANNEL: "Document channel",
        RT_DOCUMENT: "Document",
        RT_ARTICLE_CHANNEL: "Article channel",
        RT_ARTICLE: "Article",
        RT_WIKI_SPACE: "Wiki space",
        RT_WIKI_PAGE: "Wiki page",
        RT_KNOWLEDGE_BASE: "Knowledge base",
        RT_EVALUATION: "Evaluation",
        RT_DATASET: "Dataset",
        RT_OBJECT_TYPE: "Object type",
        RT_LINK_TYPE: "Link type",
    }
    return labels.get(resource_type, resource_type.replace("_", " ").title())


async def resolve_resource_label(db: AsyncSession, resource_type: str, resource_id: str) -> str:
    row = None
    if resource_type == RT_DOCUMENT_CHANNEL:
        row = await db.get(DocumentChannel, resource_id)
        return row.name if row else resource_id
    if resource_type == RT_ARTICLE_CHANNEL:
        row = await db.get(ArticleChannel, resource_id)
        return row.name if row else resource_id
    if resource_type == RT_DOCUMENT:
        row = await db.get(Document, resource_id)
        return row.name if row else resource_id
    if resource_type == RT_ARTICLE:
        row = await db.get(Article, resource_id)
        return (row.title or row.id) if row else resource_id
    if resource_type == RT_WIKI_SPACE:
        row = await db.get(WikiSpace, resource_id)
        return row.name if row else resource_id
    if resource_type == RT_WIKI_PAGE:
        row = await db.get(WikiPage, resource_id)
        if row:
            return row.title or row.path or resource_id
        return resource_id
    if resource_type == RT_KNOWLEDGE_BASE:
        row = await db.get(KnowledgeBase, resource_id)
        return row.name if row else resource_id
    if resource_type == RT_EVALUATION:
        row = await db.get(Evaluation, resource_id)
        return row.name if row else resource_id
    if resource_type == RT_DATASET:
        row = await db.get(Dataset, resource_id)
        return row.name if row else resource_id
    if resource_type == RT_OBJECT_TYPE:
        row = await db.get(ObjectType, resource_id)
        return row.name if row else resource_id
    if resource_type == RT_LINK_TYPE:
        row = await db.get(LinkType, resource_id)
        return row.name if row else resource_id
    return resource_id
