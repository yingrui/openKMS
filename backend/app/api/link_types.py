"""Link types API (admin CRUD + user read)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin, require_auth
from app.database import get_db
from app.models.link_instance import LinkInstance
from app.models.link_type import LinkType
from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType
from app.schemas.ontology import (
    LinkInstanceCreate,
    LinkInstanceListResponse,
    LinkInstanceResponse,
    LinkTypeCreate,
    LinkTypeListResponse,
    LinkTypeResponse,
    LinkTypeUpdate,
)

router = APIRouter(
    prefix="/link-types",
    tags=["link-types"],
    dependencies=[Depends(require_auth)],
)


async def _link_instance_count(db: AsyncSession, link_type_id: str) -> int:
    return (await db.execute(
        select(func.count()).select_from(LinkInstance).where(LinkInstance.link_type_id == link_type_id)
    )).scalar_one()


async def _to_response(db: AsyncSession, link_type: LinkType) -> LinkTypeResponse:
    count = await _link_instance_count(db, link_type.id)
    source_type = await db.get(ObjectType, link_type.source_object_type_id)
    target_type = await db.get(ObjectType, link_type.target_object_type_id)
    return LinkTypeResponse(
        id=link_type.id,
        name=link_type.name,
        description=link_type.description,
        source_object_type_id=link_type.source_object_type_id,
        target_object_type_id=link_type.target_object_type_id,
        source_object_type_name=source_type.name if source_type else None,
        target_object_type_name=target_type.name if target_type else None,
        link_count=count,
        created_at=link_type.created_at,
        updated_at=link_type.updated_at,
    )


# --- Admin CRUD ---

@router.get("", response_model=LinkTypeListResponse)
async def list_link_types(db: AsyncSession = Depends(get_db)):
    """List all link types. Available to all authenticated users."""
    result = await db.execute(select(LinkType).order_by(LinkType.created_at.desc()))
    types = result.scalars().all()
    items = [await _to_response(db, t) for t in types]
    return LinkTypeListResponse(items=items, total=len(items))


@router.post("", response_model=LinkTypeResponse, status_code=201)
async def create_link_type(
    body: LinkTypeCreate,
    _: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create link type. Admin only."""
    source = await db.get(ObjectType, body.source_object_type_id)
    target = await db.get(ObjectType, body.target_object_type_id)
    if not source:
        raise HTTPException(status_code=400, detail="Source object type not found")
    if not target:
        raise HTTPException(status_code=400, detail="Target object type not found")
    link_type = LinkType(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        source_object_type_id=body.source_object_type_id,
        target_object_type_id=body.target_object_type_id,
    )
    db.add(link_type)
    await db.flush()
    await db.refresh(link_type)
    return await _to_response(db, link_type)


@router.get("/{link_type_id}", response_model=LinkTypeResponse)
async def get_link_type(link_type_id: str, db: AsyncSession = Depends(get_db)):
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    return await _to_response(db, link_type)


@router.put("/{link_type_id}", response_model=LinkTypeResponse)
async def update_link_type(
    link_type_id: str,
    body: LinkTypeUpdate,
    _: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update link type. Admin only."""
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    if body.name is not None:
        link_type.name = body.name
    if body.description is not None:
        link_type.description = body.description
    if body.source_object_type_id is not None:
        src = await db.get(ObjectType, body.source_object_type_id)
        if not src:
            raise HTTPException(status_code=400, detail="Source object type not found")
        link_type.source_object_type_id = body.source_object_type_id
    if body.target_object_type_id is not None:
        tgt = await db.get(ObjectType, body.target_object_type_id)
        if not tgt:
            raise HTTPException(status_code=400, detail="Target object type not found")
        link_type.target_object_type_id = body.target_object_type_id
    await db.flush()
    await db.refresh(link_type)
    return await _to_response(db, link_type)


@router.delete("/{link_type_id}", status_code=204)
async def delete_link_type(
    link_type_id: str,
    _: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete link type. Admin only. Cascades to link instances."""
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    await db.delete(link_type)


# --- Link instances (nested under link type) ---

@router.get("/{link_type_id}/links", response_model=LinkInstanceListResponse)
async def list_link_instances(
    link_type_id: str,
    db: AsyncSession = Depends(get_db),
):
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    result = await db.execute(
        select(LinkInstance)
        .where(LinkInstance.link_type_id == link_type_id)
        .order_by(LinkInstance.created_at.desc())
    )
    links = result.scalars().all()
    items = []
    for li in links:
        source_obj = await db.get(ObjectInstance, li.source_object_id)
        target_obj = await db.get(ObjectInstance, li.target_object_id)
        items.append(LinkInstanceResponse(
            id=li.id,
            link_type_id=li.link_type_id,
            source_object_id=li.source_object_id,
            target_object_id=li.target_object_id,
            source_data=source_obj.data if source_obj else None,
            target_data=target_obj.data if target_obj else None,
            created_at=li.created_at,
            updated_at=li.updated_at,
        ))
    return LinkInstanceListResponse(items=items, total=len(items))


@router.post("/{link_type_id}/links", response_model=LinkInstanceResponse, status_code=201)
async def create_link_instance(
    link_type_id: str,
    body: LinkInstanceCreate,
    _: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    # Validate source/target belong to correct types
    source_obj = await db.get(ObjectInstance, body.source_object_id)
    target_obj = await db.get(ObjectInstance, body.target_object_id)
    if not source_obj:
        raise HTTPException(status_code=400, detail="Source object not found")
    if not target_obj:
        raise HTTPException(status_code=400, detail="Target object not found")
    if source_obj.object_type_id != link_type.source_object_type_id:
        raise HTTPException(status_code=400, detail="Source object must be of source type")
    if target_obj.object_type_id != link_type.target_object_type_id:
        raise HTTPException(status_code=400, detail="Target object must be of target type")
    link_instance = LinkInstance(
        id=str(uuid.uuid4()),
        link_type_id=link_type_id,
        source_object_id=body.source_object_id,
        target_object_id=body.target_object_id,
    )
    db.add(link_instance)
    await db.flush()
    await db.refresh(link_instance)
    return LinkInstanceResponse(
        id=link_instance.id,
        link_type_id=link_instance.link_type_id,
        source_object_id=link_instance.source_object_id,
        target_object_id=link_instance.target_object_id,
        source_data=source_obj.data,
        target_data=target_obj.data,
        created_at=link_instance.created_at,
        updated_at=link_instance.updated_at,
    )


@router.delete("/{link_type_id}/links/{link_id}", status_code=204)
async def delete_link_instance(
    link_type_id: str,
    link_id: str,
    _: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    link_instance = await db.get(LinkInstance, link_id)
    if not link_instance or link_instance.link_type_id != link_type_id:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.delete(link_instance)
