"""Batch-readable standalone resource id filters and legacy effective_* wrappers."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.wiki_models import WikiSpace
from app.models.resource_acl import ResourceAclEntry
from app.services.acl_channel_filters import (
    accessible_article_channel_ids,
    accessible_document_channel_ids,
    accessible_media_channel_ids,
    readable_article_channel_ids,
    readable_document_channel_ids,
    readable_media_channel_ids,
)
from app.services.acl_context import acl_check_required
from app.services.acl_resolve import (
    _authenticated_bits_from_chain,
    _effective_permissions_from_entries,
    check_resource_access,
)
from app.services.acl_scope import scope_applies
from app.services.resource_acl_constants import (
    PERM_READ,
    RT_DATASET,
    RT_EVALUATION,
    RT_GLOSSARY,
    RT_KNOWLEDGE_BASE,
    RT_LINK_TYPE,
    RT_OBJECT_TYPE,
    RT_WIKI_SPACE,
    perm_satisfies,
)

_STANDALONE_RESOURCE_TYPES = frozenset(
    {
        RT_WIKI_SPACE,
        RT_KNOWLEDGE_BASE,
        RT_EVALUATION,
        RT_GLOSSARY,
        RT_DATASET,
        RT_OBJECT_TYPE,
        RT_LINK_TYPE,
    }
)


async def _readable_standalone_resource_ids(
    db: AsyncSession,
    payload: dict,
    subject: str,
    resource_type: str,
    all_ids: set[str],
) -> set[str]:
    """Batch ACL evaluation for standalone securable types (single context node)."""
    if not isinstance(subject, str):
        return set()
    if not scope_applies(payload, subject):
        return all_ids

    entries_result = await db.execute(
        select(ResourceAclEntry).where(ResourceAclEntry.resource_type == resource_type)
    )
    entries_by_id: dict[str, list[ResourceAclEntry]] = {}
    for entry in entries_result.scalars().all():
        entries_by_id.setdefault(entry.resource_id, []).append(entry)

    readable: set[str] = set()
    for rid in all_ids:
        entries = entries_by_id.get(rid, [])
        if not settings.enforce_resource_acl and not entries:
            readable.add(rid)
            continue
        chain = [(resource_type, rid)]
        bits = await _effective_permissions_from_entries(
            db, subject, chain, entries, payload
        )
        if perm_satisfies(bits, PERM_READ):
            readable.add(rid)
    return readable


async def readable_resource_ids(
    db: AsyncSession, payload: dict, subject: str, resource_type: str
) -> set[str] | None:
    """Instance ids (KB, wiki space, etc.) readable by user; unset ACL = open unless enforced."""
    if not isinstance(subject, str):
        return set()
    from app.models.dataset import Dataset
    from app.models.evaluation import Evaluation
    from app.models.glossary import Glossary
    from app.models.knowledge_base import KnowledgeBase
    from app.models.link_type import LinkType
    from app.models.object_type import ObjectType
    from app.services.resource_acl_constants import (
        RT_DATASET,
        RT_EVALUATION,
        RT_GLOSSARY,
        RT_KNOWLEDGE_BASE,
        RT_LINK_TYPE,
        RT_OBJECT_TYPE,
    )

    model_by_type = {
        RT_WIKI_SPACE: WikiSpace,
        RT_KNOWLEDGE_BASE: KnowledgeBase,
        RT_EVALUATION: Evaluation,
        RT_GLOSSARY: Glossary,
        RT_DATASET: Dataset,
        RT_OBJECT_TYPE: ObjectType,
        RT_LINK_TYPE: LinkType,
    }
    model = model_by_type.get(resource_type)
    if model is None:
        return None
    result = await db.execute(select(model.id))
    all_ids = {str(row[0]) for row in result.all()}
    if resource_type in _STANDALONE_RESOURCE_TYPES:
        return await _readable_standalone_resource_ids(
            db, payload, subject, resource_type, all_ids
        )
    readable: set[str] = set()
    for rid in all_ids:
        if not await acl_check_required(db, resource_type, rid):
            readable.add(rid)
        elif await check_resource_access(db, payload, subject, resource_type, rid, PERM_READ):
            readable.add(rid)
    return readable


async def accessible_resource_ids(
    db: AsyncSession, subject: str, resource_type: str, payload: dict | None = None
) -> set[str] | None:
    if payload is None:
        return None
    return await readable_resource_ids(db, payload, subject, resource_type)


async def effective_wiki_space_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    return await accessible_resource_ids(db, subject, RT_WIKI_SPACE, payload)


async def effective_knowledge_base_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    from app.services.resource_acl_constants import RT_KNOWLEDGE_BASE

    return await accessible_resource_ids(db, subject, RT_KNOWLEDGE_BASE, payload)


async def effective_evaluation_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    from app.services.resource_acl_constants import RT_EVALUATION

    return await accessible_resource_ids(db, subject, RT_EVALUATION, payload)


async def effective_dataset_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    from app.services.resource_acl_constants import RT_DATASET

    return await accessible_resource_ids(db, subject, RT_DATASET, payload)


async def effective_object_type_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    from app.services.resource_acl_constants import RT_OBJECT_TYPE

    return await accessible_resource_ids(db, subject, RT_OBJECT_TYPE, payload)


async def effective_link_type_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    from app.services.resource_acl_constants import RT_LINK_TYPE

    return await accessible_resource_ids(db, subject, RT_LINK_TYPE, payload)


async def effective_channel_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    return await accessible_document_channel_ids(db, subject, payload)


async def effective_article_channel_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    return await accessible_article_channel_ids(db, subject, payload)


async def effective_media_channel_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    return await accessible_media_channel_ids(db, subject, payload)


async def effective_channel_ids_with_data_resources(
    db: AsyncSession, payload: dict, subject: str
) -> set[str] | None:
    return await readable_document_channel_ids(db, payload, subject)
