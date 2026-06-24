"""Resource visibility helpers — delegates to resource ACL service."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.evaluation import Evaluation
from app.models.glossary import Glossary
from app.models.knowledge_base import KnowledgeBase
from app.models.link_type import LinkType
from app.models.object_type import ObjectType
from app.models.wiki_models import WikiSpace
from app.services.acl.resource_acl_constants import (
    RT_DATASET,
    RT_EVALUATION,
    RT_GLOSSARY,
    RT_KNOWLEDGE_BASE,
    RT_LINK_TYPE,
    RT_OBJECT_TYPE,
    RT_WIKI_SPACE,
)
from app.services.acl.resource_acl_service import (
    channel_allowed_for_document_upload,
    document_passes_scoped_predicate,
    document_visible_via_channel,
    effective_channel_ids_with_data_resources,
    instance_visible,
    scoped_document_predicate,
)


async def knowledge_base_visible(db: AsyncSession, jwt_payload: dict, sub: str, kb: KnowledgeBase) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_KNOWLEDGE_BASE, kb.id)


async def evaluation_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: Evaluation) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_EVALUATION, row.id)


async def dataset_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: Dataset) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_DATASET, row.id)


async def object_type_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: ObjectType) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_OBJECT_TYPE, row.id)


async def glossary_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: Glossary) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_GLOSSARY, row.id)


async def link_type_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: LinkType) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_LINK_TYPE, row.id)


async def wiki_space_visible(db: AsyncSession, jwt_payload: dict, sub: str, ws: WikiSpace) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_WIKI_SPACE, ws.id)


__all__ = [
    "channel_allowed_for_document_upload",
    "dataset_visible",
    "document_passes_scoped_predicate",
    "document_visible_via_channel",
    "effective_channel_ids_with_data_resources",
    "evaluation_visible",
    "glossary_visible",
    "knowledge_base_visible",
    "link_type_visible",
    "object_type_visible",
    "scoped_document_predicate",
    "wiki_space_visible",
]
