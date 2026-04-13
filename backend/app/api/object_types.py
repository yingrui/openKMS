"""Object types API (admin CRUD + user read)."""
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.services.permission_catalog import PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE
from app.api.datasets import fetch_dataset_rows, get_dataset_row_count
from app.database import get_db
from app.services.data_scope import effective_object_type_ids, scope_applies
from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.services.credential_encryption import decrypt
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


async def _require_object_type_in_scope(request: Request, db: AsyncSession, object_type_id: str) -> None:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        allowed = await effective_object_type_ids(db, sub)
        if allowed is not None and object_type_id not in allowed:
            raise HTTPException(status_code=404, detail="Object type not found")


class IndexToNeo4jRequest(BaseModel):
    neo4j_data_source_id: str


class IndexToNeo4jResponse(BaseModel):
    object_types_indexed: int
    nodes_created: int


async def _object_instance_count(db: AsyncSession, object_type_id: str) -> int:
    return (await db.execute(
        select(func.count()).select_from(ObjectInstance).where(
            ObjectInstance.object_type_id == object_type_id
        )
    )).scalar_one()


async def _resolve_instance_count(db: AsyncSession, obj_type: ObjectType) -> int:
    """Instance count: dataset row count when linked, else object_instances count."""
    if obj_type.dataset_id:
        return await get_dataset_row_count(db, obj_type.dataset_id)
    return await _object_instance_count(db, obj_type.id)


def _to_response(obj_type: ObjectType, instance_count: int, dataset_name: str | None = None) -> ObjectTypeResponse:
    props = [p if isinstance(p, dict) else p.model_dump() for p in (obj_type.properties or [])]
    if hasattr(obj_type, "_property_defs"):
        props = [p.model_dump() if hasattr(p, "model_dump") else p for p in obj_type.properties or []]
    return ObjectTypeResponse(
        id=obj_type.id,
        name=obj_type.name,
        description=obj_type.description,
        dataset_id=obj_type.dataset_id,
        dataset_name=dataset_name,
        key_property=obj_type.key_property,
        is_master_data=getattr(obj_type, "is_master_data", False),
        display_property=getattr(obj_type, "display_property", None),
        properties=props,
        instance_count=instance_count,
        created_at=obj_type.created_at,
        updated_at=obj_type.updated_at,
    )


def _prop_defs_to_dicts(properties: list) -> list[dict]:
    return [p.model_dump() if hasattr(p, "model_dump") else p for p in properties]


def _resolve_id_property(obj_type: ObjectType) -> str:
    """Return property name used as primary/ID. Uses key_property if set, else infers."""
    if obj_type.key_property:
        prop_names = [p.get("name") for p in (obj_type.properties or []) if isinstance(p, dict) and p.get("name")]
        if obj_type.key_property in (prop_names or ["id"]):
            return obj_type.key_property
    prop_names = [p.get("name") for p in (obj_type.properties or []) if isinstance(p, dict) and p.get("name")]
    return "id" if (prop_names and "id" in prop_names) else (prop_names[0] if prop_names else "id")


# --- Admin CRUD ---

def _neo4j_safe_label(name: str) -> str:
    """Convert object type name to Neo4j-safe label (alphanumeric, underscore)."""
    s = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    return s or "Node"


async def _dataset_name(db: AsyncSession, dataset_id: str | None) -> str | None:
    if not dataset_id:
        return None
    ds = await db.get(Dataset, dataset_id)
    if not ds:
        return None
    return ds.display_name or f"{ds.schema_name}.{ds.table_name}"


async def _get_first_neo4j_datasource(db: AsyncSession) -> DataSource | None:
    result = await db.execute(select(DataSource).where(DataSource.kind == "neo4j").limit(1))
    return result.scalar_one_or_none()


def _neo4j_node_count(driver, label: str) -> int:
    """Return count of nodes with the given label in Neo4j."""
    with driver.session() as session:
        result = session.run(f"MATCH (n:{label}) RETURN count(n) AS c")
        row = result.single()
        return row["c"] or 0


def _query_neo4j_nodes(
    driver,
    label: str,
    search: str | None,
    limit: int,
    offset: int,
    id_prop: str,
) -> tuple[list[dict], int]:
    """Query nodes from Neo4j by label. Returns (rows, total)."""
    search_trimmed = search.strip() if search else None
    with driver.session() as session:
        # Count query
        if search_trimmed:
            count_result = session.run(
                f"""
                MATCH (n:{label})
                WHERE any(k IN keys(n) WHERE toLower(toString(n[k])) CONTAINS toLower($search))
                RETURN count(n) AS c
                """,
                search=search_trimmed,
            )
        else:
            count_result = session.run(f"MATCH (n:{label}) RETURN count(n) AS c")
        total = count_result.single()["c"] or 0

        # Data query
        if search_trimmed:
            result = session.run(
                f"""
                MATCH (n:{label})
                WHERE any(k IN keys(n) WHERE toLower(toString(n[k])) CONTAINS toLower($search))
                RETURN n
                SKIP $offset LIMIT $limit
                """,
                search=search_trimmed,
                offset=offset,
                limit=limit,
            )
        else:
            result = session.run(
                f"MATCH (n:{label}) RETURN n SKIP $offset LIMIT $limit",
                offset=offset,
                limit=limit,
            )
        def _serialize_val(v):
            if v is None:
                return None
            if isinstance(v, (str, int, float, bool)):
                return v
            if hasattr(v, "isoformat"):  # datetime
                return v.isoformat()
            return str(v)

        rows = []
        for record in result:
            node = record["n"]
            if node is None:
                continue
            props = dict(node) if hasattr(node, "__iter__") and hasattr(node, "keys") else {}
            data = {k: _serialize_val(v) for k, v in props.items() if v is not None}
            row_id = data.get(id_prop, list(data.values())[0] if data else None)
            if row_id is not None:
                rows.append({"id": row_id, "data": data})
        return rows, total


@router.get("", response_model=ObjectTypeListResponse)
async def list_object_types(
    request: Request,
    count_from_neo4j: bool = False,
    is_master_data: bool | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List object types. count_from_neo4j: instance_count from Neo4j. is_master_data: filter to master data only."""
    query = select(ObjectType).order_by(ObjectType.created_at.desc())
    if is_master_data is not None:
        query = query.where(ObjectType.is_master_data == is_master_data)
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        allowed = await effective_object_type_ids(db, sub)
        if allowed is not None:
            if not allowed:
                return ObjectTypeListResponse(items=[], total=0)
            query = query.where(ObjectType.id.in_(allowed))
    result = await db.execute(query)
    types = result.scalars().all()
    items = []
    neo4j_driver = None
    if count_from_neo4j:
        neo4j_ds = await _get_first_neo4j_datasource(db)
        if neo4j_ds:
            try:
                from neo4j import GraphDatabase

                username = decrypt(neo4j_ds.username_encrypted) if neo4j_ds.username_encrypted else ""
                password = decrypt(neo4j_ds.password_encrypted) if neo4j_ds.password_encrypted else ""
                uri = f"bolt://{neo4j_ds.host}:{neo4j_ds.port or 7687}"
                neo4j_driver = GraphDatabase.driver(uri, auth=(username, password))
            except ImportError:
                neo4j_driver = None
    try:
        for t in types:
            if neo4j_driver:
                try:
                    label = _neo4j_safe_label(t.name)
                    count = _neo4j_node_count(neo4j_driver, label)
                except Exception:
                    count = await _resolve_instance_count(db, t)
            else:
                count = await _resolve_instance_count(db, t)
            ds_name = await _dataset_name(db, t.dataset_id)
            items.append(_to_response(t, count, ds_name))
    finally:
        if neo4j_driver:
            neo4j_driver.close()
    return ObjectTypeListResponse(items=items, total=len(items))


@router.post("", response_model=ObjectTypeResponse, status_code=201)
async def create_object_type(
    body: ObjectTypeCreate,
    _: str = Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE)),
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
        dataset_id=body.dataset_id,
        key_property=body.key_property,
        is_master_data=body.is_master_data,
        display_property=body.display_property,
        properties=props,
    )
    db.add(obj_type)
    await db.flush()
    await db.refresh(obj_type)
    count = await _resolve_instance_count(db, obj_type)
    ds_name = await _dataset_name(db, obj_type.dataset_id)
    return _to_response(obj_type, count, ds_name)


@router.get("/{object_type_id}", response_model=ObjectTypeResponse)
async def get_object_type(
    object_type_id: str,
    request: Request,
    count_from_neo4j: bool = False,
    db: AsyncSession = Depends(get_db),
):
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and scope_applies(p, sub):
        allowed = await effective_object_type_ids(db, sub)
        if allowed is not None and object_type_id not in allowed:
            raise HTTPException(status_code=404, detail="Object type not found")
    if count_from_neo4j:
        neo4j_ds = await _get_first_neo4j_datasource(db)
        if neo4j_ds:
            try:
                from neo4j import GraphDatabase

                username = decrypt(neo4j_ds.username_encrypted) if neo4j_ds.username_encrypted else ""
                password = decrypt(neo4j_ds.password_encrypted) if neo4j_ds.password_encrypted else ""
                uri = f"bolt://{neo4j_ds.host}:{neo4j_ds.port or 7687}"
                driver = GraphDatabase.driver(uri, auth=(username, password))
                try:
                    label = _neo4j_safe_label(obj_type.name)
                    count = _neo4j_node_count(driver, label)
                finally:
                    driver.close()
                ds_name = await _dataset_name(db, obj_type.dataset_id)
                return _to_response(obj_type, count, ds_name)
            except Exception:
                pass
    count = await _resolve_instance_count(db, obj_type)
    ds_name = await _dataset_name(db, obj_type.dataset_id)
    return _to_response(obj_type, count, ds_name)


@router.put("/{object_type_id}", response_model=ObjectTypeResponse)
async def update_object_type(
    object_type_id: str,
    body: ObjectTypeUpdate,
    _: str = Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE)),
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
    if body.key_property is not None:
        obj_type.key_property = body.key_property.strip() or None
    if body.description is not None:
        obj_type.description = body.description
    if body.dataset_id is not None:
        obj_type.dataset_id = body.dataset_id
    if body.is_master_data is not None:
        obj_type.is_master_data = body.is_master_data
    if body.display_property is not None:
        obj_type.display_property = body.display_property.strip() or None
    if body.properties is not None:
        obj_type.properties = _prop_defs_to_dicts(body.properties)
    await db.flush()
    await db.refresh(obj_type)
    count = await _resolve_instance_count(db, obj_type)
    ds_name = await _dataset_name(db, obj_type.dataset_id)
    return _to_response(obj_type, count, ds_name)


@router.delete("/{object_type_id}", status_code=204)
async def delete_object_type(
    object_type_id: str,
    _: str = Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE)),
    db: AsyncSession = Depends(get_db),
):
    """Delete object type. Admin only. Cascades to instances."""
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    await db.delete(obj_type)


@router.post(
    "/index-to-neo4j",
    response_model=IndexToNeo4jResponse,
    dependencies=[Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE))],
)
async def index_objects_to_neo4j(
    body: IndexToNeo4jRequest,
    db: AsyncSession = Depends(get_db),
):
    """Index all object types with datasets to the target Neo4j database. Admin only."""
    neo4j_ds = await db.get(DataSource, body.neo4j_data_source_id)
    if not neo4j_ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    if neo4j_ds.kind != "neo4j":
        raise HTTPException(status_code=400, detail="Target must be a Neo4j data source")
    try:
        from neo4j import GraphDatabase
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Neo4j driver not installed. pip install neo4j",
        )
    username = decrypt(neo4j_ds.username_encrypted) if neo4j_ds.username_encrypted else ""
    password = decrypt(neo4j_ds.password_encrypted) if neo4j_ds.password_encrypted else ""
    uri = f"bolt://{neo4j_ds.host}:{neo4j_ds.port or 7687}"
    result = await db.execute(
        select(ObjectType).where(ObjectType.dataset_id.isnot(None)).order_by(ObjectType.name)
    )
    obj_types = result.scalars().all()
    if not obj_types:
        return IndexToNeo4jResponse(object_types_indexed=0, nodes_created=0)
    nodes_created = 0
    driver = GraphDatabase.driver(uri, auth=(username, password))
    try:
        with driver.session() as session:
            for obj_type in obj_types:
                label = _neo4j_safe_label(obj_type.name)
                offset = 0
                batch_size = 1000
                while True:
                    try:
                        rows, total = await fetch_dataset_rows(db, obj_type.dataset_id, limit=batch_size, offset=offset)
                    except Exception as e:
                        raise HTTPException(
                            status_code=502,
                            detail=f"Failed to fetch dataset for {obj_type.name}: {e}",
                        ) from e
                    if not rows:
                        break
                    prop_names = [p.get("name") for p in (obj_type.properties or []) if isinstance(p, dict) and p.get("name")]
                    if obj_type.key_property and rows and obj_type.key_property in rows[0]:
                        id_col = obj_type.key_property
                    elif (prop_names and "id" in prop_names) or (rows and "id" in rows[0]):
                        id_col = "id"
                    else:
                        id_col = prop_names[0] if prop_names else list(rows[0].keys())[0]
                    for row in rows:
                        props = {k: v for k, v in row.items() if v is not None}
                        node_id = props.get(id_col, props.get(list(props.keys())[0]) if props else None)
                        if node_id is None:
                            continue
                        safe_props = {}
                        for k, v in props.items():
                            if isinstance(v, (str, int, float, bool)):
                                safe_props[k] = v
                            else:
                                safe_props[k] = str(v)
                        session.run(
                            f"MERGE (n:{label} {{`{id_col}`: $id_val}}) SET n += $props",
                            id_val=safe_props.get(id_col, node_id),
                            props=safe_props,
                        )
                        nodes_created += 1
                    offset += len(rows)
                    if offset >= total:
                        break
    finally:
        driver.close()
    return IndexToNeo4jResponse(object_types_indexed=len(obj_types), nodes_created=nodes_created)


# --- Object instances (nested under object type) ---

@router.get("/{object_type_id}/objects", response_model=ObjectInstanceListResponse)
async def list_object_instances(
    object_type_id: str,
    request: Request,
    search: str | None = None,
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List object instances. Objects page loads from Neo4j when a Neo4j data source exists."""
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    await _require_object_type_in_scope(request, db, object_type_id)

    id_prop = _resolve_id_property(obj_type)

    neo4j_ds = await _get_first_neo4j_datasource(db)
    if neo4j_ds:
        try:
            from neo4j import GraphDatabase
        except ImportError:
            pass
        else:
            username = decrypt(neo4j_ds.username_encrypted) if neo4j_ds.username_encrypted else ""
            password = decrypt(neo4j_ds.password_encrypted) if neo4j_ds.password_encrypted else ""
            uri = f"bolt://{neo4j_ds.host}:{neo4j_ds.port or 7687}"
            driver = GraphDatabase.driver(uri, auth=(username, password))
            try:
                label = _neo4j_safe_label(obj_type.name)
                rows, total = _query_neo4j_nodes(
                    driver, label, search, limit, offset, id_prop
                )
                return ObjectInstanceListResponse(
                    items=[
                        ObjectInstanceResponse(
                            id=str(r["id"]),
                            object_type_id=object_type_id,
                            data=r["data"],
                            created_at=None,
                            updated_at=None,
                        )
                        for r in rows
                    ],
                    total=total,
                )
            except Exception:
                pass
            finally:
                driver.close()

    if obj_type.dataset_id:
        try:
            rows, total = await fetch_dataset_rows(db, obj_type.dataset_id, limit=limit, offset=offset)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        id_col = (
            obj_type.key_property
            if obj_type.key_property and rows and rows[0] and obj_type.key_property in rows[0]
            else ("id" if (rows and rows[0] and "id" in rows[0])
                  else (list(rows[0].keys())[0] if rows else "id"))
        )
        items = []
        for row in rows:
            row_id = row.get(id_col, row.get(list(row.keys())[0]) if row else None)
            if row_id is None:
                continue
            data = {k: v for k, v in row.items() if v is not None}
            items.append(
                ObjectInstanceResponse(
                    id=str(row_id),
                    object_type_id=object_type_id,
                    data=data,
                    created_at=None,
                    updated_at=None,
                )
            )
        return ObjectInstanceListResponse(items=items, total=total)
    else:
        query = select(ObjectInstance).where(ObjectInstance.object_type_id == object_type_id)
        if search and search.strip():
            pattern = f"%{search.strip()}%"
            query = query.where(cast(ObjectInstance.data, String).ilike(pattern))
        query = query.order_by(ObjectInstance.created_at.desc())
        result = await db.execute(query)
        instances = result.scalars().all()
        return ObjectInstanceListResponse(
            items=[
                ObjectInstanceResponse(
                    id=o.id,
                    object_type_id=o.object_type_id,
                    data=o.data or {},
                    created_at=o.created_at,
                    updated_at=o.updated_at,
                )
                for o in instances
            ],
            total=len(instances),
        )


@router.post("/{object_type_id}/objects", response_model=ObjectInstanceResponse, status_code=201)
async def create_object_instance(
    object_type_id: str,
    request: Request,
    body: ObjectInstanceCreate,
    _: str = Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE)),
    db: AsyncSession = Depends(get_db),
):
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    await _require_object_type_in_scope(request, db, object_type_id)
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
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _require_object_type_in_scope(request, db, object_type_id)
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
    request: Request,
    body: ObjectInstanceUpdate,
    _: str = Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE)),
    db: AsyncSession = Depends(get_db),
):
    await _require_object_type_in_scope(request, db, object_type_id)
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
    request: Request,
    _: str = Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE)),
    db: AsyncSession = Depends(get_db),
):
    await _require_object_type_in_scope(request, db, object_type_id)
    instance = await db.get(ObjectInstance, object_id)
    if not instance or instance.object_type_id != object_type_id:
        raise HTTPException(status_code=404, detail="Object not found")
    await db.delete(instance)
