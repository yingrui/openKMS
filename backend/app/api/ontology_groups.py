"""Ontology Groups API."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.database import get_db
from app.models.link_type import LinkType
from app.models.object_type import ObjectType
from app.models.ontology_function import (
    OntologyActionType,
    OntologyFunction,
    OntologyGroup,
    OntologyGroupObjectType,
)
from app.schemas.ontology_functions import (
    OntologyGroupCreate,
    OntologyGroupRelatedAction,
    OntologyGroupRelatedFunction,
    OntologyGroupRelatedLinkType,
    OntologyGroupRelatedResponse,
    OntologyGroupResponse,
    OntologyGroupUpdate,
)
from app.services.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE

router = APIRouter(prefix="/ontology/groups", tags=["ontology-groups"], dependencies=[Depends(require_auth)])


async def _group_ot_ids(db: AsyncSession, group_id: str) -> list[str]:
    rows = (
        await db.execute(
            select(OntologyGroupObjectType.object_type_id).where(OntologyGroupObjectType.group_id == group_id)
        )
    ).scalars().all()
    return list(rows)


async def _group_response(db: AsyncSession, group: OntologyGroup) -> OntologyGroupResponse:
    return OntologyGroupResponse(
        id=group.id,
        display_name=group.display_name,
        description=group.description,
        object_type_ids=await _group_ot_ids(db, group.id),
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


async def _get_group_or_404(db: AsyncSession, group_id: str) -> OntologyGroup:
    group = (await db.execute(select(OntologyGroup).where(OntologyGroup.id == group_id))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.get("", response_model=list[OntologyGroupResponse])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    groups = (await db.execute(select(OntologyGroup).order_by(OntologyGroup.display_name))).scalars().all()
    return [await _group_response(db, g) for g in groups]


@router.post("", response_model=OntologyGroupResponse, status_code=201)
async def create_group(
    body: OntologyGroupCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    gid = f"og-{uuid.uuid4().hex[:12]}"
    group = OntologyGroup(id=gid, display_name=body.display_name, description=body.description)
    db.add(group)
    for ot_id in body.object_type_ids:
        db.add(OntologyGroupObjectType(group_id=gid, object_type_id=ot_id))
    await db.commit()
    await db.refresh(group)
    return await _group_response(db, group)


@router.get("/{group_id}/related", response_model=OntologyGroupRelatedResponse)
async def get_group_related(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    """Link types, Functions, and Actions whose object types belong to this group."""
    await _get_group_or_404(db, group_id)
    ot_ids = await _group_ot_ids(db, group_id)
    if not ot_ids:
        return OntologyGroupRelatedResponse()

    ot_id_set = set(ot_ids)
    name_rows = (
        await db.execute(select(ObjectType.id, ObjectType.name).where(ObjectType.id.in_(ot_ids)))
    ).all()
    name_by_id = {row[0]: row[1] for row in name_rows}

    link_rows = (
        await db.execute(
            select(LinkType)
            .where(
                or_(
                    LinkType.source_object_type_id.in_(ot_ids),
                    LinkType.target_object_type_id.in_(ot_ids),
                )
            )
            .order_by(LinkType.name)
        )
    ).scalars().all()

    # Resolve endpoint names that may fall outside the group membership.
    extra_ot_ids = {
        tid
        for lt in link_rows
        for tid in (lt.source_object_type_id, lt.target_object_type_id)
        if tid not in ot_id_set
    }
    if extra_ot_ids:
        extra_rows = (
            await db.execute(select(ObjectType.id, ObjectType.name).where(ObjectType.id.in_(extra_ot_ids)))
        ).all()
        name_by_id.update({row[0]: row[1] for row in extra_rows})

    fn_rows = (
        await db.execute(
            select(OntologyFunction)
            .where(OntologyFunction.object_type_id.in_(ot_ids))
            .order_by(OntologyFunction.api_name)
        )
    ).scalars().all()

    action_rows = (
        await db.execute(
            select(OntologyActionType)
            .where(OntologyActionType.object_type_id.in_(ot_ids))
            .order_by(OntologyActionType.api_name)
        )
    ).scalars().all()

    return OntologyGroupRelatedResponse(
        object_type_ids=ot_ids,
        link_types=[
            OntologyGroupRelatedLinkType(
                id=lt.id,
                name=lt.name,
                source_object_type_id=lt.source_object_type_id,
                target_object_type_id=lt.target_object_type_id,
                source_object_type_name=name_by_id.get(lt.source_object_type_id),
                target_object_type_name=name_by_id.get(lt.target_object_type_id),
            )
            for lt in link_rows
        ],
        functions=[
            OntologyGroupRelatedFunction(
                id=fn.id,
                api_name=fn.api_name,
                display_name=fn.display_name,
                object_type_id=fn.object_type_id,
            )
            for fn in fn_rows
        ],
        action_types=[
            OntologyGroupRelatedAction(
                id=at.id,
                api_name=at.api_name,
                display_name=at.display_name,
                object_type_id=at.object_type_id,
                status=at.status,
            )
            for at in action_rows
        ],
    )


@router.get("/{group_id}", response_model=OntologyGroupResponse)
async def get_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    return await _group_response(db, await _get_group_or_404(db, group_id))


@router.patch("/{group_id}", response_model=OntologyGroupResponse)
async def update_group(
    group_id: str,
    body: OntologyGroupUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    group = await _get_group_or_404(db, group_id)
    if body.display_name is not None:
        group.display_name = body.display_name
    if body.description is not None:
        group.description = body.description
    if body.object_type_ids is not None:
        await db.execute(delete(OntologyGroupObjectType).where(OntologyGroupObjectType.group_id == group_id))
        for ot_id in body.object_type_ids:
            db.add(OntologyGroupObjectType(group_id=group_id, object_type_id=ot_id))
    await db.commit()
    await db.refresh(group)
    return await _group_response(db, group)


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    group = await _get_group_or_404(db, group_id)
    await db.delete(group)
    await db.commit()
