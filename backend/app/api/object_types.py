"""Object types API (admin CRUD + user read)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin, require_auth
from app.database import get_db
from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType
from app.schemas.ontology import (
    ObjectInstanceCreate,
    ObjectInstanceListResponse,
    ObjectInstanceResponse,
    ObjectInstanceUpdate,
    ObjectTypeCreate,
    ObjectTypeListResponse,
    ObjectTypeResponse,
    ObjectTypeUpdate,
)

router = APIRouter(
    prefix="/object-types",
    tags=["object-types"],
    dependencies=[Depends(require_auth)],
)


async def _object_instance_count(db: AsyncSession, object_type_id: str) -> int:
    return (await db.execute(
        select(func.count()).select_from(ObjectInstance).where(
            ObjectInstance.object_type_id == object_type_id
        )
    )).scalar_one()


def _to_response(obj_type: ObjectType, instance_count: int) -> ObjectTypeResponse:
    props = [p if isinstance(p, dict) else p.model_dump() for p in (obj_type.properties or [])]
    if hasattr(obj_type, "_property_defs"):
        props = [p.model_dump() if hasattr(p, "model_dump") else p for p in obj_type.properties or []]
    return ObjectTypeResponse(
        id=obj_type.id,
        name=obj_type.name,
        description=obj_type.description,
        properties=props,
        instance_count=instance_count,
        created_at=obj_type.created_at,
        updated_at=obj_type.updated_at,
    )


def _prop_defs_to_dicts(properties: list) -> list[dict]:
    return [p.model_dump() if hasattr(p, "model_dump") else p for p in properties]


# --- Admin CRUD ---

@router.get("", response_model=ObjectTypeListResponse)
async def list_object_types(db: AsyncSession = Depends(get_db)):
    """List all object types. Available to all authenticated users."""
    result = await db.execute(select(ObjectType).order_by(ObjectType.created_at.desc()))
    types = result.scalars().all()
    items = []
    for t in types:
        count = await _object_instance_count(db, t.id)
        items.append(_to_response(t, count))
    return ObjectTypeListResponse(items=items, total=len(items))


@router.post("", response_model=ObjectTypeResponse, status_code=201)
async def create_object_type(
    body: ObjectTypeCreate,
    _: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create object type. Admin only."""
    existing = await db.execute(select(ObjectType).where(ObjectType.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Object type with this name already exists")
    props = _prop_defs_to_dicts(body.properties)
    obj_type = ObjectType(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        properties=props,
    )
    db.add(obj_type)
    await db.flush()
    await db.refresh(obj_type)
    count = await _object_instance_count(db, obj_type.id)
    return _to_response(obj_type, count)


@router.get("/{object_type_id}", response_model=ObjectTypeResponse)
async def get_object_type(object_type_id: str, db: AsyncSession = Depends(get_db)):
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    count = await _object_instance_count(db, obj_type.id)
    return _to_response(obj_type, count)


@router.put("/{object_type_id}", response_model=ObjectTypeResponse)
async def update_object_type(
    object_type_id: str,
    body: ObjectTypeUpdate,
    _: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update object type. Admin only."""
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    if body.name is not None:
        existing = await db.execute(
            select(ObjectType).where(ObjectType.name == body.name, ObjectType.id != object_type_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Object type with this name already exists")
        obj_type.name = body.name
    if body.description is not None:
        obj_type.description = body.description
    if body.properties is not None:
        obj_type.properties = _prop_defs_to_dicts(body.properties)
    await db.flush()
    await db.refresh(obj_type)
    count = await _object_instance_count(db, obj_type.id)
    return _to_response(obj_type, count)


@router.delete("/{object_type_id}", status_code=204)
async def delete_object_type(
    object_type_id: str,
    _: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete object type. Admin only. Cascades to instances."""
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    await db.delete(obj_type)


# --- Object instances (nested under object type) ---

@router.get("/{object_type_id}/objects", response_model=ObjectInstanceListResponse)
async def list_object_instances(
    object_type_id: str,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    query = select(ObjectInstance).where(ObjectInstance.object_type_id == object_type_id)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(cast(ObjectInstance.data, String).ilike(pattern))
    query = query.order_by(ObjectInstance.created_at.desc())
    result = await db.execute(query)
    instances = result.scalars().all()
    return ObjectInstanceListResponse(
        items=[ObjectInstanceResponse(
            id=o.id,
            object_type_id=o.object_type_id,
            data=o.data or {},
            created_at=o.created_at,
            updated_at=o.updated_at,
        ) for o in instances],
        total=len(instances),
    )


@router.post("/{object_type_id}/objects", response_model=ObjectInstanceResponse, status_code=201)
async def create_object_instance(
    object_type_id: str,
    body: ObjectInstanceCreate,
    _: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    instance = ObjectInstance(
        id=str(uuid.uuid4()),
        object_type_id=object_type_id,
        data=body.data or {},
    )
    db.add(instance)
    await db.flush()
    await db.refresh(instance)
    return ObjectInstanceResponse(
        id=instance.id,
        object_type_id=instance.object_type_id,
        data=instance.data or {},
        created_at=instance.created_at,
        updated_at=instance.updated_at,
    )


@router.get("/{object_type_id}/objects/{object_id}", response_model=ObjectInstanceResponse)
async def get_object_instance(
    object_type_id: str,
    object_id: str,
    db: AsyncSession = Depends(get_db),
):
    instance = await db.get(ObjectInstance, object_id)
    if not instance or instance.object_type_id != object_type_id:
        raise HTTPException(status_code=404, detail="Object not found")
    return ObjectInstanceResponse(
        id=instance.id,
        object_type_id=instance.object_type_id,
        data=instance.data or {},
        created_at=instance.created_at,
        updated_at=instance.updated_at,
    )


@router.put("/{object_type_id}/objects/{object_id}", response_model=ObjectInstanceResponse)
async def update_object_instance(
    object_type_id: str,
    object_id: str,
    body: ObjectInstanceUpdate,
    _: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    instance = await db.get(ObjectInstance, object_id)
    if not instance or instance.object_type_id != object_type_id:
        raise HTTPException(status_code=404, detail="Object not found")
    if body.data is not None:
        instance.data = body.data
    await db.flush()
    await db.refresh(instance)
    return ObjectInstanceResponse(
        id=instance.id,
        object_type_id=instance.object_type_id,
        data=instance.data or {},
        created_at=instance.created_at,
        updated_at=instance.updated_at,
    )


@router.delete("/{object_type_id}/objects/{object_id}", status_code=204)
async def delete_object_instance(
    object_type_id: str,
    object_id: str,
    _: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    instance = await db.get(ObjectInstance, object_id)
    if not instance or instance.object_type_id != object_type_id:
        raise HTTPException(status_code=404, detail="Object not found")
    await db.delete(instance)
