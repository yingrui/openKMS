"""Ontology Groups API."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.database import get_db
from app.models.ontology_function import OntologyGroup, OntologyGroupObjectType
from app.schemas.ontology_functions import OntologyGroupCreate, OntologyGroupResponse, OntologyGroupUpdate
from app.services.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE

router = APIRouter(prefix="/ontology/groups", tags=["ontology-groups"], dependencies=[Depends(require_auth)])


async def _group_response(db: AsyncSession, group: OntologyGroup) -> OntologyGroupResponse:
    ot_ids = (
        await db.execute(
            select(OntologyGroupObjectType.object_type_id).where(OntologyGroupObjectType.group_id == group.id)
        )
    ).scalars().all()
    return OntologyGroupResponse(
        id=group.id,
        display_name=group.display_name,
        description=group.description,
        object_type_ids=list(ot_ids),
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


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


@router.get("/{group_id}", response_model=OntologyGroupResponse)
async def get_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    group = (await db.execute(select(OntologyGroup).where(OntologyGroup.id == group_id))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return await _group_response(db, group)


@router.patch("/{group_id}", response_model=OntologyGroupResponse)
async def update_group(
    group_id: str,
    body: OntologyGroupUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    group = (await db.execute(select(OntologyGroup).where(OntologyGroup.id == group_id))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
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
    group = (await db.execute(select(OntologyGroup).where(OntologyGroup.id == group_id))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.delete(group)
    await db.commit()
