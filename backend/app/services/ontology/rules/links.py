"""`about` links: attach an event to the business object it is about.

A link type is a *pair* of object types, so an event that can be about two kinds of object needs two
link types. They are created lazily, on the first event that names a target type, because the target
usually belongs to a customer's ontology and may not exist in a fresh deployment.

The relation is best-effort by design: a missing target type, a composite key or a missing instance
means "no link", never a failed evaluation — the event itself already carries `subject_type` /
`subject_id`, so nothing is lost.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.link_instance import LinkInstance
from app.models.link_type import LinkType
from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType
from app.services.ontology.object_neo4j_store import (
    encode_object_id,
    fetch_object_from_neo4j,
)

ABOUT_NAME = "about"


async def _about_link_type(db: AsyncSession, source: ObjectType, target: ObjectType) -> LinkType | None:
    """The `about` link type from `source` to `target`, creating it when missing."""
    api_name = f"{ABOUT_NAME}_{target.api_name or target.id}".replace("-", "_")[:128]
    existing = (
        await db.execute(select(LinkType).where(LinkType.api_name == api_name))
    ).scalars().first()
    if existing:
        return existing
    clash = (
        await db.execute(
            select(LinkType).where(
                LinkType.source_object_type_id == source.id,
                LinkType.target_object_type_id == target.id,
                LinkType.name == ABOUT_NAME,
            )
        )
    ).scalars().first()
    if clash:
        return clash
    link_type = LinkType(
        id=uuid.uuid4().hex,
        name=ABOUT_NAME,
        api_name=api_name,
        neo4j_rel_type=api_name,
        description="事件指向它所属的业务对象",
        source_object_type_id=source.id,
        target_object_type_id=target.id,
        cardinality="many-to-one",
        created_by_name="system",
    )
    db.add(link_type)
    await db.flush()
    return link_type


async def _find_target_object_id(db: AsyncSession, target: ObjectType, scope: str) -> str | None:
    """The API id of the object matching `scope`, or None when it cannot be resolved."""
    if target.dataset_id:
        keys = [str(k) for k in (target.key_properties or []) if str(k).strip()]
        if len(keys) != 1:
            return None  # composite keys are not expressible through a single `scope` string
        object_id = encode_object_id([scope])
        if not await fetch_object_from_neo4j(db, target, object_id):
            return None
        return object_id
    prop = str((target.key_properties or ["id"])[0])
    row = (
        await db.execute(
            select(ObjectInstance).where(
                ObjectInstance.object_type_id == target.id,
                ObjectInstance.data[prop].astext == scope,
            )
        )
    ).scalars().first()
    return row.id if row else None


async def link_event_about(
    db: AsyncSession,
    *,
    event_type: ObjectType,
    event_instance_id: str,
    target_api_name: str | None,
    scope: str | None,
) -> str | None:
    """Create `event --about--> target(scope)` when it can be resolved. Returns the link type id."""
    if not target_api_name or not scope:
        return None
    target = (
        await db.execute(select(ObjectType).where(ObjectType.api_name == target_api_name))
    ).scalars().first()
    if not target:
        return None
    target_object_id = await _find_target_object_id(db, target, scope)
    if not target_object_id:
        return None
    link_type = await _about_link_type(db, event_type, target)
    if not link_type:
        return None
    already = (
        await db.execute(
            select(LinkInstance).where(
                LinkInstance.link_type_id == link_type.id,
                LinkInstance.source_object_id == event_instance_id,
                LinkInstance.target_object_id == target_object_id,
            )
        )
    ).scalars().first()
    if already:
        return link_type.id
    db.add(
        LinkInstance(
            id=uuid.uuid4().hex,
            link_type_id=link_type.id,
            source_object_id=event_instance_id,
            target_object_id=target_object_id,
        )
    )
    await db.flush()
    return link_type.id
