"""Legacy data-resource policy — delegates to resource ACL service."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.document import Document
from app.models.evaluation import Evaluation
from app.models.knowledge_base import KnowledgeBase
from app.models.link_type import LinkType
from app.models.object_type import ObjectType
from app.services.resource_acl_constants import (
    RT_DATASET,
    RT_EVALUATION,
    RT_KNOWLEDGE_BASE,
    RT_LINK_TYPE,
    RT_OBJECT_TYPE,
)
from app.services.resource_acl_service import (
    channel_allowed_for_document_upload,
    document_passes_scoped_predicate,
    effective_channel_ids_with_data_resources,
    instance_visible,
    scoped_document_predicate,
)

# Re-export kind constants for admin API compatibility
KIND_DOCUMENT = "document"
KIND_KNOWLEDGE_BASE = "knowledge_base"
KIND_EVALUATION = "evaluation"
KIND_DATASET = "dataset"
KIND_OBJECT_TYPE = "object_type"
KIND_LINK_TYPE = "link_type"

ALLOWED_RESOURCE_KINDS = frozenset(
    {
        KIND_DOCUMENT,
        KIND_KNOWLEDGE_BASE,
        KIND_EVALUATION,
        KIND_DATASET,
        KIND_OBJECT_TYPE,
        KIND_LINK_TYPE,
    }
)


def validate_data_resource_payload(
    resource_kind: str,
    attributes: dict[str, Any],
    anchor_channel_id: str | None,
    anchor_knowledge_base_id: str | None,
) -> None:
    """Deprecated: data resources are replaced by per-resource ACL."""
    from fastapi import HTTPException

    raise HTTPException(
        status_code=410,
        detail="Data resources are deprecated. Use resource sharing (ACL) on each item instead.",
    )


async def knowledge_base_visible(db: AsyncSession, jwt_payload: dict, sub: str, kb: KnowledgeBase) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_KNOWLEDGE_BASE, kb.id)


async def evaluation_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: Evaluation) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_EVALUATION, row.id)


async def dataset_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: Dataset) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_DATASET, row.id)


async def object_type_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: ObjectType) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_OBJECT_TYPE, row.id)


async def link_type_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: LinkType) -> bool:
    return await instance_visible(db, jwt_payload, sub, RT_LINK_TYPE, row.id)


__all__ = [
    "ALLOWED_RESOURCE_KINDS",
    "KIND_DATASET",
    "KIND_DOCUMENT",
    "KIND_EVALUATION",
    "KIND_KNOWLEDGE_BASE",
    "KIND_LINK_TYPE",
    "KIND_OBJECT_TYPE",
    "channel_allowed_for_document_upload",
    "dataset_visible",
    "document_passes_scoped_predicate",
    "effective_channel_ids_with_data_resources",
    "evaluation_visible",
    "knowledge_base_visible",
    "link_type_visible",
    "object_type_visible",
    "scoped_document_predicate",
    "validate_data_resource_payload",
]
