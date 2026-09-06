"""Object types API (admin CRUD + user read)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.services.permissions.permission_catalog import PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE
from app.api.datasets import fetch_dataset_rows, get_dataset_row_count
from app.database import get_db
from app.services.acl.data_resource_policy import object_type_visible
from app.services.acl.data_scope import bootstrap_owner_acl
from app.services.ontology.ontology_type_scope import require_object_type_permission
from app.services.acl.resource_acl_constants import PERM_READ, PERM_WRITE, RT_OBJECT_TYPE
from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.link_instance import LinkInstance
from app.services.ontology.neo4j_async import open_neo4j_driver, run_with_neo4j_driver
from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType
from app.services.ontology.query_filters import parse_prop_filters, row_matches_prop_filters
from app.services.ontology.object_neo4j_store import (
    fetch_object_from_neo4j,
    get_first_neo4j_datasource,
    merge_object_row_to_neo4j,
    neo4j_safe_label,
    query_neo4j_nodes,
    resolve_id_property,
    resolve_neo4j_id_column_for_row,
    resolve_write_id_column,
    instance_row_for_neo4j,
    sync_queue_ids_to_neo4j,
)
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


async def _require_object_type_read(request: Request, db: AsyncSession, object_type_id: str) -> None:
    await require_object_type_permission(request, db, object_type_id, PERM_READ)


async def _require_object_type_write(request: Request, db: AsyncSession, object_type_id: str) -> None:
    await require_object_type_permission(request, db, object_type_id, PERM_WRITE)


class IndexToNeo4jRequest(BaseModel):
    neo4j_data_source_id: str


class IndexToNeo4jResponse(BaseModel):
    object_types_indexed: int
    nodes_created: int


class PurgeOntologyDataRequest(BaseModel):
    """Dangerous wipe of apply-queue rows and Neo4j nodes for one object type."""

    confirm: str
    neo4j_data_source_id: str | None = None
    """If omitted, uses the first Neo4j data source when any exist."""


class PurgeOntologyDataResponse(BaseModel):
    object_instances_deleted: int
    link_instances_deleted: int
    neo4j_nodes_deleted: int
    neo4j_relationships_deleted: int
    object_types_cleared: int
    link_types_cleared: int


def _purge_object_type_neo4j(session, obj_type: ObjectType) -> int:
    label = neo4j_safe_label(obj_type.name)
    count_row = session.run(f"MATCH (n:{label}) RETURN count(n) AS c").single()
    n = int(count_row["c"] or 0) if count_row else 0
    if n:
        session.run(f"MATCH (n:{label}) DETACH DELETE n")
    return n


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


# --- Admin CRUD ---

def _neo4j_safe_label(name: str) -> str:
    return neo4j_safe_label(name)


def _resolve_neo4j_id_column_for_row(obj_type: ObjectType, sample_row: dict) -> str:
    return resolve_neo4j_id_column_for_row(obj_type, sample_row)


def _merge_object_row_to_neo4j(session, label: str, id_col: str, row: dict) -> int:
    return merge_object_row_to_neo4j(session, label, id_col, row)


async def _dataset_name(db: AsyncSession, dataset_id: str | None) -> str | None:
    if not dataset_id:
        return None
    ds = await db.get(Dataset, dataset_id)
    if not ds:
        return None
    return ds.display_name or f"{ds.schema_name}.{ds.table_name}"


async def _get_first_neo4j_datasource(db: AsyncSession) -> DataSource | None:
    return await get_first_neo4j_datasource(db)


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
    prop_filters: dict[str, str] | None = None,
) -> tuple[list[dict], int]:
    return query_neo4j_nodes(driver, label, search, limit, offset, id_prop, prop_filters=prop_filters)

async def _neo4j_node_counts_for_types(ds: DataSource, type_names: list[str]) -> dict[str, int | None]:
    """Return label -> count; None when count fails for that label."""

    def _run(driver) -> dict[str, int | None]:
        out: dict[str, int | None] = {}
        for name in type_names:
            label = _neo4j_safe_label(name)
            try:
                out[label] = _neo4j_node_count(driver, label)
            except Exception:
                out[label] = None
        return out

    return await run_with_neo4j_driver(ds, _run)


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
    result = await db.execute(query)
    types = list(result.scalars().all())
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str):
        types = [t for t in types if await object_type_visible(db, p, sub, t)]
    neo4j_counts: dict[str, int | None] = {}
    if count_from_neo4j:
        neo4j_ds = await _get_first_neo4j_datasource(db)
        if neo4j_ds:
            try:
                neo4j_counts = await _neo4j_node_counts_for_types(neo4j_ds, [t.name for t in types])
            except ImportError:
                neo4j_counts = {}
    items = []
    for t in types:
        label = _neo4j_safe_label(t.name)
        neo4j_count = neo4j_counts.get(label)
        if neo4j_count is not None:
            count = neo4j_count
        else:
            count = await _resolve_instance_count(db, t)
        ds_name = await _dataset_name(db, t.dataset_id)
        items.append(_to_response(t, count, ds_name))
    return ObjectTypeListResponse(items=items, total=len(items))


@router.post("", response_model=ObjectTypeResponse, status_code=201)
async def create_object_type(
    body: ObjectTypeCreate,
    request: Request,
    _: str = Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE)),
    db: AsyncSession = Depends(get_db),
):
    """Create object type. Admin only."""
    existing = await db.execute(select(ObjectType).where(ObjectType.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Object type with this name already exists")
    props = _prop_defs_to_dicts(body.properties)
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    uname = p.get("preferred_username") or p.get("name")
    obj_type = ObjectType(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        dataset_id=body.dataset_id,
        key_property=body.key_property,
        is_master_data=body.is_master_data,
        display_property=body.display_property,
        properties=props,
        created_by=sub if isinstance(sub, str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(obj_type)
    await db.flush()
    if isinstance(sub, str):
        await bootstrap_owner_acl(db, RT_OBJECT_TYPE, obj_type.id, sub)
    await db.commit()
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
    if isinstance(sub, str) and not await object_type_visible(db, p, sub, obj_type):
        raise HTTPException(status_code=404, detail="Object type not found")
    if count_from_neo4j:
        neo4j_ds = await _get_first_neo4j_datasource(db)
        if neo4j_ds:
            try:
                label = _neo4j_safe_label(obj_type.name)
                counts = await _neo4j_node_counts_for_types(neo4j_ds, [obj_type.name])
                neo4j_count = counts.get(label)
                if neo4j_count is not None:
                    ds_name = await _dataset_name(db, obj_type.dataset_id)
                    return _to_response(obj_type, neo4j_count, ds_name)
            except ImportError:
                pass
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


async def _index_object_type_dataset_to_neo4j_session(
    db: AsyncSession,
    session,
    obj_type: ObjectType,
) -> int:
    """MERGE dataset rows for one object type into Neo4j (sync Neo4j session). Returns nodes_created."""
    if not obj_type.dataset_id:
        return 0
    nodes_created = 0
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
        id_col = _resolve_neo4j_id_column_for_row(obj_type, rows[0])
        for row in rows:
            nodes_created += _merge_object_row_to_neo4j(session, label, id_col, row)
        offset += len(rows)
        if offset >= total:
            break
    return nodes_created


async def _index_object_type_instances_to_neo4j_session(
    db: AsyncSession,
    session,
    obj_type: ObjectType,
) -> int:
    """MERGE rows from object_instances into Neo4j (same MERGE rules as dataset rows)."""
    label = _neo4j_safe_label(obj_type.name)
    offset = 0
    batch_size = 1000
    nodes_created = 0
    while True:
        result = await db.execute(
            select(ObjectInstance)
            .where(ObjectInstance.object_type_id == obj_type.id)
            .order_by(ObjectInstance.id)
            .offset(offset)
            .limit(batch_size)
        )
        instances = result.scalars().all()
        if not instances:
            break
        id_col = resolve_write_id_column(obj_type)
        for inst in instances:
            row = instance_row_for_neo4j(obj_type, inst)
            nodes_created += _merge_object_row_to_neo4j(session, label, id_col, row)
        offset += len(instances)
        if len(instances) < batch_size:
            break
    return nodes_created


async def _open_neo4j_driver_for_index(body: IndexToNeo4jRequest, db: AsyncSession):
    """Return connected Neo4j driver for the given data source id, or raise HTTPException."""
    neo4j_ds = await db.get(DataSource, body.neo4j_data_source_id)
    if not neo4j_ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    if neo4j_ds.kind != "neo4j":
        raise HTTPException(status_code=400, detail="Target must be a Neo4j data source")
    try:
        from neo4j import GraphDatabase  # noqa: F401
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Neo4j driver not installed. pip install neo4j",
        ) from None
    return open_neo4j_driver(neo4j_ds)


@router.post(
    "/{object_type_id}/purge-instances",
    response_model=PurgeOntologyDataResponse,
    dependencies=[Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE))],
)
async def purge_object_type_instances(
    object_type_id: str,
    body: PurgeOntologyDataRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Dangerous: clear queue rows for one object type and DETACH DELETE its Neo4j label."""
    await _require_object_type_write(request, db, object_type_id)
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")

    expected = f"PURGE {obj_type.name}"
    if (body.confirm or "").strip() != expected:
        raise HTTPException(
            status_code=400,
            detail=f'Confirmation failed. Send confirm="{expected}"',
        )

    inst_ids = (
        await db.execute(
            select(ObjectInstance.id).where(ObjectInstance.object_type_id == object_type_id)
        )
    ).scalars().all()
    link_count = 0
    if inst_ids:
        link_count = (
            await db.execute(
                select(func.count())
                .select_from(LinkInstance)
                .where(
                    or_(
                        LinkInstance.source_object_id.in_(inst_ids),
                        LinkInstance.target_object_id.in_(inst_ids),
                    )
                )
            )
        ).scalar_one()
        await db.execute(
            LinkInstance.__table__.delete().where(
                or_(
                    LinkInstance.source_object_id.in_(inst_ids),
                    LinkInstance.target_object_id.in_(inst_ids),
                )
            )
        )
    obj_count = (
        await db.execute(
            select(func.count()).select_from(ObjectInstance).where(
                ObjectInstance.object_type_id == object_type_id
            )
        )
    ).scalar_one()
    await db.execute(
        ObjectInstance.__table__.delete().where(ObjectInstance.object_type_id == object_type_id)
    )
    await db.flush()

    nodes_deleted = 0
    neo4j_ds: DataSource | None = None
    if body.neo4j_data_source_id:
        neo4j_ds = await db.get(DataSource, body.neo4j_data_source_id)
        if not neo4j_ds or neo4j_ds.kind != "neo4j":
            raise HTTPException(status_code=400, detail="Invalid Neo4j data source")
    else:
        neo4j_ds = await get_first_neo4j_datasource(db)

    if neo4j_ds:
        try:
            from neo4j import GraphDatabase  # noqa: F401
        except ImportError:
            raise HTTPException(
                status_code=501,
                detail="Neo4j driver not installed. pip install neo4j",
            ) from None

        def _run(driver) -> int:
            with driver.session() as session:
                return _purge_object_type_neo4j(session, obj_type)

        try:
            nodes_deleted = await run_with_neo4j_driver(neo4j_ds, _run)
        except Exception as e:
            await db.rollback()
            raise HTTPException(status_code=502, detail=f"Queue cleared but Neo4j purge failed: {e}") from e

    return PurgeOntologyDataResponse(
        object_instances_deleted=int(obj_count or 0),
        link_instances_deleted=int(link_count or 0),
        neo4j_nodes_deleted=nodes_deleted,
        neo4j_relationships_deleted=0,
        object_types_cleared=1,
        link_types_cleared=0,
    )


@router.post(
    "/index-to-neo4j",
    response_model=IndexToNeo4jResponse,
    dependencies=[Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE))],
)
async def index_objects_to_neo4j(
    body: IndexToNeo4jRequest,
    db: AsyncSession = Depends(get_db),
):
    """Index object types that have a linked dataset or queued instances to Neo4j.

    For types without a dataset this drains the ``object_instances`` apply queue
    (full MERGE of current queue rows). Admin only.
    """
    has_instances = exists().where(ObjectInstance.object_type_id == ObjectType.id)
    result = await db.execute(
        select(ObjectType)
        .where(or_(ObjectType.dataset_id.isnot(None), has_instances))
        .order_by(ObjectType.name)
    )
    obj_types = result.scalars().all()
    if not obj_types:
        return IndexToNeo4jResponse(object_types_indexed=0, nodes_created=0)
    driver = await _open_neo4j_driver_for_index(body, db)
    nodes_created = 0
    try:
        with driver.session() as session:
            for obj_type in obj_types:
                if obj_type.dataset_id:
                    nodes_created += await _index_object_type_dataset_to_neo4j_session(db, session, obj_type)
                else:
                    nodes_created += await _index_object_type_instances_to_neo4j_session(db, session, obj_type)
    finally:
        driver.close()
    return IndexToNeo4jResponse(object_types_indexed=len(obj_types), nodes_created=nodes_created)


@router.post(
    "/{object_type_id}/index-to-neo4j",
    response_model=IndexToNeo4jResponse,
    dependencies=[Depends(require_any_permission(PERM_CONSOLE_OBJECT_TYPES, PERM_ONTOLOGY_WRITE))],
)
async def index_one_object_type_to_neo4j(
    object_type_id: str,
    body: IndexToNeo4jRequest,
    db: AsyncSession = Depends(get_db),
):
    """Index one object type to Neo4j from its linked dataset, or drain the
    object_instances apply queue when there is no dataset."""
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    if obj_type.dataset_id:
        pass
    else:
        inst_n = await _object_instance_count(db, object_type_id)
        if inst_n == 0:
            raise HTTPException(
                status_code=400,
                detail=(
                    "This object type has no linked dataset and no queued instances. "
                    "Link a dataset or create instances (Action/REST queue) before indexing."
                ),
            )
    driver = await _open_neo4j_driver_for_index(body, db)
    try:
        with driver.session() as session:
            if obj_type.dataset_id:
                nodes_created = await _index_object_type_dataset_to_neo4j_session(db, session, obj_type)
            else:
                nodes_created = await _index_object_type_instances_to_neo4j_session(db, session, obj_type)
    finally:
        driver.close()
    return IndexToNeo4jResponse(object_types_indexed=1, nodes_created=nodes_created)


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
    """List object instances.

    Types with a linked dataset: prefer Neo4j when a Neo4j data source exists (indexed
    projection), else the dataset SQL path.

    Types without a dataset: read Neo4j only (query SoT). ``object_instances`` is the
    Action/REST apply queue and is never used for list. Without a Neo4j DS, returns empty.

    Property equality filters: ``prop.<name>=value`` (repeatable).
    """
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    await _require_object_type_read(request, db, object_type_id)

    id_prop = resolve_id_property(obj_type)
    prop_filters = parse_prop_filters(request)

    # No-dataset types: query SoT is Neo4j only (never object_instances).
    if not obj_type.dataset_id:
        neo4j_ds = await _get_first_neo4j_datasource(db)
        if not neo4j_ds:
            return ObjectInstanceListResponse(items=[], total=0)
        try:
            from neo4j import GraphDatabase  # noqa: F401

            label = _neo4j_safe_label(obj_type.name)

            def _query(driver):
                return _query_neo4j_nodes(
                    driver, label, search, limit, offset, id_prop, prop_filters=prop_filters
                )

            rows, total = await run_with_neo4j_driver(neo4j_ds, _query)
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
        except ImportError:
            return ObjectInstanceListResponse(items=[], total=0)
        except Exception:
            return ObjectInstanceListResponse(items=[], total=0)

    neo4j_ds = await _get_first_neo4j_datasource(db)
    if neo4j_ds:
        try:
            from neo4j import GraphDatabase  # noqa: F401

            label = _neo4j_safe_label(obj_type.name)

            def _query(driver):
                return _query_neo4j_nodes(
                    driver, label, search, limit, offset, id_prop, prop_filters=prop_filters
                )

            rows, total = await run_with_neo4j_driver(neo4j_ds, _query)
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
        except ImportError:
            pass
        except Exception:
            pass

    try:
        # Fetch a page then filter in memory (dataset SQL path has no prop pushdown yet).
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
        if not row_matches_prop_filters(data, prop_filters):
            continue
        items.append(
            ObjectInstanceResponse(
                id=str(row_id),
                object_type_id=object_type_id,
                data=data,
                created_at=None,
                updated_at=None,
            )
        )
    return ObjectInstanceListResponse(items=items, total=len(items) if prop_filters else total)


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
    await _require_object_type_write(request, db, object_type_id)
    if obj_type.dataset_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot create hand instances on a dataset-backed object type",
        )
    instance = ObjectInstance(
        id=str(uuid.uuid4()),
        object_type_id=object_type_id,
        data=body.data or {},
    )
    db.add(instance)
    await db.flush()
    await db.refresh(instance)
    try:
        await sync_queue_ids_to_neo4j(db, obj_type, upsert_ids=[instance.id], delete_ids=[])
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=502, detail=f"Queued but Neo4j sync failed: {e}") from e
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
    await _require_object_type_read(request, db, object_type_id)
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")

    if not obj_type.dataset_id:
        props = await fetch_object_from_neo4j(db, obj_type, object_id)
        if not props:
            raise HTTPException(status_code=404, detail="Object not found")
        return ObjectInstanceResponse(
            id=object_id,
            object_type_id=object_type_id,
            data=props,
            created_at=None,
            updated_at=None,
        )

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
    await _require_object_type_write(request, db, object_type_id)
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    if obj_type.dataset_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot update hand instances on a dataset-backed object type",
        )

    instance = await db.get(ObjectInstance, object_id)
    if not instance or instance.object_type_id != object_type_id:
        # Seed queue from Neo4j when the node exists but the queue row does not.
        props = await fetch_object_from_neo4j(db, obj_type, object_id)
        if not props:
            raise HTTPException(status_code=404, detail="Object not found")
        instance = ObjectInstance(
            id=object_id,
            object_type_id=object_type_id,
            data={k: v for k, v in props.items() if k not in ("id", "__rid")},
        )
        db.add(instance)
        await db.flush()

    if body.data is not None:
        instance.data = body.data
    await db.flush()
    await db.refresh(instance)
    try:
        await sync_queue_ids_to_neo4j(db, obj_type, upsert_ids=[instance.id], delete_ids=[])
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=502, detail=f"Queued but Neo4j sync failed: {e}") from e
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
    await _require_object_type_write(request, db, object_type_id)
    obj_type = await db.get(ObjectType, object_type_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    if obj_type.dataset_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete hand instances on a dataset-backed object type",
        )

    instance = await db.get(ObjectInstance, object_id)
    if instance and instance.object_type_id == object_type_id:
        await db.delete(instance)
        await db.flush()
    else:
        props = await fetch_object_from_neo4j(db, obj_type, object_id)
        if not props:
            raise HTTPException(status_code=404, detail="Object not found")

    try:
        await sync_queue_ids_to_neo4j(db, obj_type, upsert_ids=[], delete_ids=[object_id])
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=502, detail=f"Queued but Neo4j sync failed: {e}") from e
