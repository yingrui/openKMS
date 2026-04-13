"""Validate data resources and build scoped predicates (group-granted ABAC)."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_resource import AccessGroupDataResource, DataResource
from app.models.dataset import Dataset
from app.models.document import Document
from app.models.evaluation_dataset import EvaluationDataset
from app.models.knowledge_base import KnowledgeBase
from app.models.link_type import LinkType
from app.models.object_type import ObjectType
from app.services.data_scope import (
    effective_channel_ids,
    effective_dataset_ids,
    effective_evaluation_dataset_ids,
    effective_knowledge_base_ids,
    effective_link_type_ids,
    effective_object_type_ids,
    expanded_channel_ids_for_roots,
    scope_applies,
    user_group_ids,
)

KIND_DOCUMENT = "document"
KIND_KNOWLEDGE_BASE = "knowledge_base"
KIND_EVALUATION_DATASET = "evaluation_dataset"
KIND_DATASET = "dataset"
KIND_OBJECT_TYPE = "object_type"
KIND_LINK_TYPE = "link_type"

ALLOWED_RESOURCE_KINDS = frozenset(
    {
        KIND_DOCUMENT,
        KIND_KNOWLEDGE_BASE,
        KIND_EVALUATION_DATASET,
        KIND_DATASET,
        KIND_OBJECT_TYPE,
        KIND_LINK_TYPE,
    }
)

_METADATA_KEY_TAIL = re.compile(r"^[\w.-]{1,128}$")
_MAX_ATTR_KEYS = 32
_MAX_STR_VALUE_LEN = 512


def _reject(msg: str) -> None:
    from fastapi import HTTPException

    raise HTTPException(status_code=400, detail=msg)


def validate_data_resource_payload(
    resource_kind: str,
    attributes: dict[str, Any],
    anchor_channel_id: str | None,
    anchor_knowledge_base_id: str | None,
) -> None:
    if resource_kind not in ALLOWED_RESOURCE_KINDS:
        _reject(f"Unknown resource_kind; allowed: {', '.join(sorted(ALLOWED_RESOURCE_KINDS))}")
    if not isinstance(attributes, dict):
        _reject("attributes must be an object")
    if len(attributes) > _MAX_ATTR_KEYS:
        _reject(f"At most {_MAX_ATTR_KEYS} attribute keys allowed")

    for k, v in attributes.items():
        if not isinstance(k, str) or len(k) > 128:
            _reject("Invalid attribute key")
        if isinstance(v, bool):
            pass
        elif isinstance(v, int):
            pass
        elif isinstance(v, str):
            if len(v) > _MAX_STR_VALUE_LEN:
                _reject(f"Attribute value too long for key {k!r}")
        else:
            _reject(f"Attribute {k!r} must be string, number, or boolean")

    if resource_kind == KIND_DOCUMENT:
        for k in attributes:
            if k == "channel_id":
                continue
            if k.startswith("metadata."):
                tail = k[9:]
                if not _METADATA_KEY_TAIL.match(tail):
                    _reject(f"Invalid metadata key in {k!r}")
            else:
                _reject(f"Unknown document attribute key {k!r}; use metadata.<key> or channel_id")
        if not anchor_channel_id and not attributes:
            _reject("document resource needs anchor_channel_id and/or attributes (e.g. metadata.*)")
    elif resource_kind == KIND_KNOWLEDGE_BASE:
        if not anchor_knowledge_base_id and "kb_id" not in attributes and "name" not in attributes:
            _reject("knowledge_base resource needs anchor_knowledge_base_id or attributes kb_id / name")
    elif resource_kind == KIND_EVALUATION_DATASET:
        if "evaluation_dataset_id" not in attributes:
            _reject("evaluation_dataset resource requires attributes.evaluation_dataset_id")
    elif resource_kind == KIND_DATASET:
        if "dataset_id" not in attributes:
            _reject("dataset resource requires attributes.dataset_id")
    elif resource_kind == KIND_OBJECT_TYPE:
        if "object_type_id" not in attributes:
            _reject("object_type resource requires attributes.object_type_id")
    elif resource_kind == KIND_LINK_TYPE:
        if "link_type_id" not in attributes:
            _reject("link_type resource requires attributes.link_type_id")


async def user_data_resources_of_kinds(
    db: AsyncSession, user_id: str, kinds: frozenset[str]
) -> list[DataResource]:
    gids = await user_group_ids(db, user_id)
    if not gids:
        return []
    r = await db.execute(
        select(DataResource)
        .join(AccessGroupDataResource, AccessGroupDataResource.data_resource_id == DataResource.id)
        .where(
            AccessGroupDataResource.group_id.in_(gids),
            DataResource.resource_kind.in_(kinds),
        )
    )
    return list(r.scalars().unique().all())


async def build_document_scope_or_predicate(db: AsyncSession, resources: list[DataResource]) -> Any:
    """SQLAlchemy OR of AND-clauses for document-kind resources (may be empty -> false())."""
    doc_resources = [r for r in resources if r.resource_kind == KIND_DOCUMENT]
    if not doc_resources:
        return false()
    or_parts: list = []
    for dr in doc_resources:
        ands: list = []
        if dr.anchor_channel_id:
            exp = await expanded_channel_ids_for_roots(db, {dr.anchor_channel_id})
            if not exp:
                continue
            ands.append(Document.channel_id.in_(exp))
        for k, v in dr.attributes.items():
            if k == "channel_id":
                ands.append(Document.channel_id == str(v))
            elif k.startswith("metadata."):
                mk = k[9:]
                if not _METADATA_KEY_TAIL.match(mk):
                    continue
                ands.append(Document.doc_metadata[mk].as_string() == str(v))
        if not ands:
            continue
        or_parts.append(and_(*ands))
    if not or_parts:
        return false()
    return or_(*or_parts)


def knowledge_base_matches_resource(kb: KnowledgeBase, dr: DataResource) -> bool:
    if dr.resource_kind != KIND_KNOWLEDGE_BASE:
        return False
    if dr.anchor_knowledge_base_id:
        return kb.id == dr.anchor_knowledge_base_id
    if "kb_id" in dr.attributes:
        return str(dr.attributes["kb_id"]) == kb.id
    if "name" in dr.attributes:
        return str(dr.attributes["name"]) == kb.name
    return False


def evaluation_dataset_matches_resource(row: EvaluationDataset, dr: DataResource) -> bool:
    if dr.resource_kind != KIND_EVALUATION_DATASET:
        return False
    return str(dr.attributes.get("evaluation_dataset_id", "")) == row.id


def dataset_matches_resource(row: Dataset, dr: DataResource) -> bool:
    if dr.resource_kind != KIND_DATASET:
        return False
    return str(dr.attributes.get("dataset_id", "")) == row.id


def object_type_matches_resource(row: ObjectType, dr: DataResource) -> bool:
    if dr.resource_kind != KIND_OBJECT_TYPE:
        return False
    return str(dr.attributes.get("object_type_id", "")) == row.id


def link_type_matches_resource(row: LinkType, dr: DataResource) -> bool:
    if dr.resource_kind != KIND_LINK_TYPE:
        return False
    return str(dr.attributes.get("link_type_id", "")) == row.id


def entity_matches_any_resource(row: Any, resources: list[DataResource], matcher) -> bool:
    return any(matcher(row, dr) for dr in resources)


async def knowledge_base_visible(db: AsyncSession, jwt_payload: dict, sub: str, kb: KnowledgeBase) -> bool:
    if not scope_applies(jwt_payload, sub):
        return True
    allowed = await effective_knowledge_base_ids(db, sub)
    if allowed is None:
        return True
    resources = await user_data_resources_of_kinds(db, sub, frozenset({KIND_KNOWLEDGE_BASE}))
    return (kb.id in allowed) or entity_matches_any_resource(
        kb, resources, knowledge_base_matches_resource
    )


async def evaluation_dataset_visible(
    db: AsyncSession, jwt_payload: dict, sub: str, row: EvaluationDataset
) -> bool:
    if not scope_applies(jwt_payload, sub):
        return True
    allowed = await effective_evaluation_dataset_ids(db, sub)
    if allowed is None:
        return True
    resources = await user_data_resources_of_kinds(db, sub, frozenset({KIND_EVALUATION_DATASET}))
    return (row.id in allowed) or entity_matches_any_resource(
        row, resources, evaluation_dataset_matches_resource
    )


async def dataset_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: Dataset) -> bool:
    if not scope_applies(jwt_payload, sub):
        return True
    allowed = await effective_dataset_ids(db, sub)
    if allowed is None:
        return True
    resources = await user_data_resources_of_kinds(db, sub, frozenset({KIND_DATASET}))
    return (row.id in allowed) or entity_matches_any_resource(row, resources, dataset_matches_resource)


async def object_type_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: ObjectType) -> bool:
    if not scope_applies(jwt_payload, sub):
        return True
    allowed = await effective_object_type_ids(db, sub)
    if allowed is None:
        return True
    resources = await user_data_resources_of_kinds(db, sub, frozenset({KIND_OBJECT_TYPE}))
    return (row.id in allowed) or entity_matches_any_resource(row, resources, object_type_matches_resource)


async def link_type_visible(db: AsyncSession, jwt_payload: dict, sub: str, row: LinkType) -> bool:
    if not scope_applies(jwt_payload, sub):
        return True
    allowed = await effective_link_type_ids(db, sub)
    if allowed is None:
        return True
    resources = await user_data_resources_of_kinds(db, sub, frozenset({KIND_LINK_TYPE}))
    return (row.id in allowed) or entity_matches_any_resource(row, resources, link_type_matches_resource)


async def scoped_document_predicate(db: AsyncSession, jwt_payload: dict, sub: str) -> Any | None:
    """Combined channel-ID allow list OR document data-resources. None = no extra filter."""
    if not scope_applies(jwt_payload, sub):
        return None
    gids = await user_group_ids(db, sub)
    if not gids:
        return None
    allowed = await effective_channel_ids(db, sub)
    resources = await user_data_resources_of_kinds(db, sub, frozenset({KIND_DOCUMENT}))
    pred_dr = await build_document_scope_or_predicate(db, resources)
    ch_part = Document.channel_id.in_(allowed) if allowed else false()
    return or_(ch_part, pred_dr)


async def document_passes_scoped_predicate(db: AsyncSession, jwt_payload: dict, sub: str, doc: Document) -> bool:
    pred = await scoped_document_predicate(db, jwt_payload, sub)
    if pred is None:
        return True
    r = await db.execute(select(Document.id).where(Document.id == doc.id).where(pred))
    return r.scalar_one_or_none() is not None


async def expanded_document_resource_channel_ids(db: AsyncSession, user_id: str) -> set[str]:
    """Channel IDs referenced by document data resources (anchors + channel_id attribute)."""
    resources = await user_data_resources_of_kinds(db, user_id, frozenset({KIND_DOCUMENT}))
    out: set[str] = set()
    for dr in resources:
        if dr.anchor_channel_id:
            out |= await expanded_channel_ids_for_roots(db, {dr.anchor_channel_id})
        cid = dr.attributes.get("channel_id")
        if cid is not None:
            out.add(str(cid))
    return out


async def effective_channel_ids_with_data_resources(
    db: AsyncSession, jwt_payload: dict, sub: str
) -> set[str] | None:
    """Channel tree visibility: legacy group channel IDs union document-resource channel references."""
    if not scope_applies(jwt_payload, sub):
        return None
    gids = await user_group_ids(db, sub)
    if not gids:
        return None
    base = await effective_channel_ids(db, sub)
    extra = await expanded_document_resource_channel_ids(db, sub)
    return base | extra


async def channel_allowed_for_document_upload(db: AsyncSession, user_id: str, channel_id: str) -> bool:
    """Upload uses channel only (no metadata yet): allow legacy channel set or channel-only data resources."""
    allowed = await effective_channel_ids(db, user_id)
    if allowed and channel_id in allowed:
        return True
    resources = await user_data_resources_of_kinds(db, user_id, frozenset({KIND_DOCUMENT}))
    for dr in resources:
        meta_keys = [k for k in dr.attributes if k.startswith("metadata.")]
        if meta_keys:
            continue
        if dr.anchor_channel_id:
            exp = await expanded_channel_ids_for_roots(db, {dr.anchor_channel_id})
            if channel_id in exp:
                return True
        cid_attr = dr.attributes.get("channel_id")
        if cid_attr is not None and str(cid_attr) == channel_id:
            return True
    return False
