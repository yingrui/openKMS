"""Link types API (admin CRUD + user read)."""
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.services.permission_catalog import PERM_CONSOLE_LINK_TYPES, PERM_ONTOLOGY_WRITE
from app.api.datasets import fetch_dataset_rows, get_dataset_row_count, get_dataset_row_count_where_not_null
from app.database import get_db
from app.services.data_resource_policy import link_type_visible
from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.link_instance import LinkInstance
from app.services.credential_encryption import decrypt
from app.models.link_type import CARDINALITY_CHOICES, LinkType
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


async def _require_link_type_in_scope(request: Request, db: AsyncSession, link_type_id: str) -> None:
    lt = await db.get(LinkType, link_type_id)
    if not lt:
        raise HTTPException(status_code=404, detail="Link type not found")
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and not await link_type_visible(db, p, sub, lt):
        raise HTTPException(status_code=404, detail="Link type not found")


class IndexToNeo4jRequest(BaseModel):
    neo4j_data_source_id: str


class IndexToNeo4jResponse(BaseModel):
    link_types_indexed: int
    relationships_created: int


async def _link_instance_count(db: AsyncSession, link_type_id: str) -> int:
    return (await db.execute(
        select(func.count()).select_from(LinkInstance).where(LinkInstance.link_type_id == link_type_id)
    )).scalar_one()


async def _link_count_for_type(db: AsyncSession, link_type: LinkType) -> int:
    """Link count: from junction dataset when many-to-many; from source dataset FK when many-to-one/one-to-many; else link_instances."""
    if link_type.cardinality == "many-to-many" and link_type.dataset_id:
        return await get_dataset_row_count(db, link_type.dataset_id)
    # many-to-one: source has FK column (e.g. parent_id) pointing to target; count source rows where that column is not null
    if link_type.cardinality in ("many-to-one", "one-to-many") and link_type.source_key_property:
        source_type = await db.get(ObjectType, link_type.source_object_type_id)
        if source_type and source_type.dataset_id:
            return await get_dataset_row_count_where_not_null(
                db, source_type.dataset_id, link_type.source_key_property
            )
    return await _link_instance_count(db, link_type.id)


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


def _neo4j_rel_count(driver, src_label: str, tgt_label: str, rel_type: str) -> int:
    """Return count of relationships of given type in Neo4j."""
    with driver.session() as session:
        result = session.run(
            f"MATCH (a:{src_label})-[r:{rel_type}]->(b:{tgt_label}) RETURN count(r) AS c"
        )
        row = result.single()
        return row["c"] or 0


def _query_neo4j_relationships(
    driver,
    src_label: str,
    tgt_label: str,
    rel_type: str,
    src_key: str,
    tgt_key: str,
    limit: int,
    offset: int,
) -> tuple[list[dict], int]:
    """Query relationships from Neo4j. Returns (rows with source_key_value, target_key_value, source_data, target_data), total."""
    def _serialize_val(v):
        if v is None:
            return None
        if isinstance(v, (str, int, float, bool)):
            return v
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)

    def _node_to_data(node):
        if node is None:
            return {}
        props = dict(node) if hasattr(node, "keys") else {}
        return {k: _serialize_val(v) for k, v in props.items() if v is not None}

    with driver.session() as session:
        count_result = session.run(
            f"MATCH (a:{src_label})-[r:{rel_type}]->(b:{tgt_label}) RETURN count(r) AS c"
        )
        total = count_result.single()["c"] or 0

        result = session.run(
            f"MATCH (a:{src_label})-[r:{rel_type}]->(b:{tgt_label}) RETURN a, b SKIP $offset LIMIT $limit",
            offset=offset,
            limit=limit,
        )
        rows = []
        for record in result:
            a_node = record["a"]
            b_node = record["b"]
            if a_node is None or b_node is None:
                continue
            source_data = _node_to_data(a_node)
            target_data = _node_to_data(b_node)
            src_val = source_data.get(src_key, list(source_data.values())[0] if source_data else None)
            tgt_val = target_data.get(tgt_key, list(target_data.values())[0] if target_data else None)
            if src_val is not None and tgt_val is not None:
                rows.append({
                    "source_key_value": str(src_val),
                    "target_key_value": str(tgt_val),
                    "source_data": source_data,
                    "target_data": target_data,
                })
        return rows, total


async def _to_response(db: AsyncSession, link_type: LinkType, link_count_override: int | None = None) -> LinkTypeResponse:
    count = link_count_override if link_count_override is not None else await _link_count_for_type(db, link_type)
    source_type = await db.get(ObjectType, link_type.source_object_type_id)
    target_type = await db.get(ObjectType, link_type.target_object_type_id)
    ds_name = await _dataset_name(db, link_type.dataset_id)
    return LinkTypeResponse(
        id=link_type.id,
        name=link_type.name,
        description=link_type.description,
        source_object_type_id=link_type.source_object_type_id,
        target_object_type_id=link_type.target_object_type_id,
        source_object_type_name=source_type.name if source_type else None,
        target_object_type_name=target_type.name if target_type else None,
        cardinality=link_type.cardinality or "one-to-many",
        dataset_id=link_type.dataset_id,
        dataset_name=ds_name,
        source_key_property=link_type.source_key_property,
        target_key_property=link_type.target_key_property,
        source_dataset_column=link_type.source_dataset_column,
        target_dataset_column=link_type.target_dataset_column,
        link_count=count,
        created_at=link_type.created_at,
        updated_at=link_type.updated_at,
    )


# --- Admin CRUD ---

@router.get("", response_model=LinkTypeListResponse)
async def list_link_types(
    request: Request,
    count_from_neo4j: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """List all link types. When count_from_neo4j=true, link_count comes from Neo4j (Links page)."""
    query = select(LinkType).order_by(LinkType.created_at.desc())
    result = await db.execute(query)
    types = list(result.scalars().all())
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str):
        types = [t for t in types if await link_type_visible(db, p, sub, t)]
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
    items = []
    try:
        for t in types:
            count_override = None
            if neo4j_driver:
                source_type = await db.get(ObjectType, t.source_object_type_id)
                target_type = await db.get(ObjectType, t.target_object_type_id)
                if source_type and target_type:
                    try:
                        src_label = _neo4j_safe_label(source_type.name)
                        tgt_label = _neo4j_safe_label(target_type.name)
                        rel_type = _neo4j_safe_rel_type(t.name)
                        count_override = _neo4j_rel_count(neo4j_driver, src_label, tgt_label, rel_type)
                    except Exception:
                        pass
            items.append(await _to_response(db, t, count_override))
    finally:
        if neo4j_driver:
            neo4j_driver.close()
    return LinkTypeListResponse(items=items, total=len(items))


@router.post("", response_model=LinkTypeResponse, status_code=201)
async def create_link_type(
    body: LinkTypeCreate,
    _: None = Depends(require_any_permission(PERM_CONSOLE_LINK_TYPES, PERM_ONTOLOGY_WRITE)),
    db: AsyncSession = Depends(get_db),
):
    """Create link type. Admin only."""
    source = await db.get(ObjectType, body.source_object_type_id)
    target = await db.get(ObjectType, body.target_object_type_id)
    if not source:
        raise HTTPException(status_code=400, detail="Source object type not found")
    if not target:
        raise HTTPException(status_code=400, detail="Target object type not found")
    cardinality = body.cardinality or "one-to-many"
    if cardinality not in CARDINALITY_CHOICES:
        raise HTTPException(status_code=400, detail=f"cardinality must be one of {CARDINALITY_CHOICES}")
    link_type = LinkType(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        source_object_type_id=body.source_object_type_id,
        target_object_type_id=body.target_object_type_id,
        cardinality=cardinality,
        dataset_id=body.dataset_id,
        source_key_property=body.source_key_property,
        target_key_property=body.target_key_property,
        source_dataset_column=body.source_dataset_column,
        target_dataset_column=body.target_dataset_column,
    )
    db.add(link_type)
    await db.flush()
    await db.refresh(link_type)
    return await _to_response(db, link_type)


@router.get("/{link_type_id}", response_model=LinkTypeResponse)
async def get_link_type(
    link_type_id: str,
    request: Request,
    count_from_neo4j: bool = False,
    db: AsyncSession = Depends(get_db),
):
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and not await link_type_visible(db, p, sub, link_type):
        raise HTTPException(status_code=404, detail="Link type not found")
    count_override = None
    if count_from_neo4j:
        neo4j_ds = await _get_first_neo4j_datasource(db)
        if neo4j_ds:
            source_type = await db.get(ObjectType, link_type.source_object_type_id)
            target_type = await db.get(ObjectType, link_type.target_object_type_id)
            if source_type and target_type:
                try:
                    from neo4j import GraphDatabase

                    username = decrypt(neo4j_ds.username_encrypted) if neo4j_ds.username_encrypted else ""
                    password = decrypt(neo4j_ds.password_encrypted) if neo4j_ds.password_encrypted else ""
                    uri = f"bolt://{neo4j_ds.host}:{neo4j_ds.port or 7687}"
                    driver = GraphDatabase.driver(uri, auth=(username, password))
                    try:
                        src_label = _neo4j_safe_label(source_type.name)
                        tgt_label = _neo4j_safe_label(target_type.name)
                        rel_type = _neo4j_safe_rel_type(link_type.name)
                        count_override = _neo4j_rel_count(driver, src_label, tgt_label, rel_type)
                    finally:
                        driver.close()
                except Exception:
                    pass
    return await _to_response(db, link_type, count_override)


@router.put("/{link_type_id}", response_model=LinkTypeResponse)
async def update_link_type(
    link_type_id: str,
    body: LinkTypeUpdate,
    request: Request,
    _: None = Depends(require_any_permission(PERM_CONSOLE_LINK_TYPES, PERM_ONTOLOGY_WRITE)),
    db: AsyncSession = Depends(get_db),
):
    """Update link type. Admin only."""
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    await _require_link_type_in_scope(request, db, link_type_id)
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
    if body.cardinality is not None:
        if body.cardinality not in CARDINALITY_CHOICES:
            raise HTTPException(status_code=400, detail=f"cardinality must be one of {CARDINALITY_CHOICES}")
        link_type.cardinality = body.cardinality
        if body.cardinality != "many-to-many":
            link_type.dataset_id = None
    if body.dataset_id is not None:
        link_type.dataset_id = body.dataset_id
    if body.source_key_property is not None:
        link_type.source_key_property = body.source_key_property
    if body.target_key_property is not None:
        link_type.target_key_property = body.target_key_property
    if body.source_dataset_column is not None:
        link_type.source_dataset_column = body.source_dataset_column
    if body.target_dataset_column is not None:
        link_type.target_dataset_column = body.target_dataset_column
    await db.flush()
    await db.refresh(link_type)
    return await _to_response(db, link_type)


@router.delete("/{link_type_id}", status_code=204)
async def delete_link_type(
    link_type_id: str,
    request: Request,
    _: None = Depends(require_any_permission(PERM_CONSOLE_LINK_TYPES, PERM_ONTOLOGY_WRITE)),
    db: AsyncSession = Depends(get_db),
):
    """Delete link type. Admin only. Cascades to link instances."""
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    await _require_link_type_in_scope(request, db, link_type_id)
    await db.delete(link_type)


def _neo4j_safe_label(name: str) -> str:
    """Convert name to Neo4j-safe label (alphanumeric, underscore)."""
    s = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    return s or "Node"


def _neo4j_safe_rel_type(name: str) -> str:
    """Sanitize a link type name for use as a Neo4j relationship type. Preserves case — link_type names are stored in lower_snake_case in Postgres and indexed verbatim in Neo4j (e.g. governed_by, covers)."""
    s = re.sub(r"[^a-zA-Z0-9_]", "_", name.strip())
    return s or "relates_to"


@router.post("/index-to-neo4j", response_model=IndexToNeo4jResponse, dependencies=[Depends(require_any_permission(PERM_CONSOLE_LINK_TYPES, PERM_ONTOLOGY_WRITE))])
async def index_links_to_neo4j(
    body: IndexToNeo4jRequest,
    db: AsyncSession = Depends(get_db),
):
    """Index link types to Neo4j: many-to-many from junction table, many-to-one/one-to-many from source dataset FK. Admin only."""
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
    relationships_created = 0
    link_types_indexed = 0
    driver = GraphDatabase.driver(uri, auth=(username, password))

    # 1. Many-to-many: junction table
    m2m_result = await db.execute(
        select(LinkType)
        .where(
            LinkType.cardinality == "many-to-many",
            LinkType.dataset_id.isnot(None),
            LinkType.source_dataset_column.isnot(None),
            LinkType.target_dataset_column.isnot(None),
        )
        .order_by(LinkType.name)
    )
    m2m_types = m2m_result.scalars().all()

    # 2. Many-to-one / one-to-many: source object type has dataset, source_key_property = FK column
    m2o_result = await db.execute(
        select(LinkType)
        .where(
            LinkType.cardinality.in_(["many-to-one", "one-to-many"]),
            LinkType.source_key_property.isnot(None),
        )
        .order_by(LinkType.name)
    )
    m2o_types = m2o_result.scalars().all()

    try:
        with driver.session() as session:
            # Index many-to-many
            for link_type in m2m_types:
                source_type = await db.get(ObjectType, link_type.source_object_type_id)
                target_type = await db.get(ObjectType, link_type.target_object_type_id)
                if not source_type or not target_type:
                    continue
                src_label = _neo4j_safe_label(source_type.name)
                tgt_label = _neo4j_safe_label(target_type.name)
                rel_type = _neo4j_safe_rel_type(link_type.name)
                src_col = link_type.source_dataset_column
                tgt_col = link_type.target_dataset_column
                src_key = link_type.source_key_property or "id"
                tgt_key = link_type.target_key_property or "id"
                offset = 0
                batch_size = 1000
                while True:
                    try:
                        rows, total = await fetch_dataset_rows(db, link_type.dataset_id, limit=batch_size, offset=offset)
                    except Exception as e:
                        raise HTTPException(
                            status_code=502,
                            detail=f"Failed to fetch junction dataset for {link_type.name}: {e}",
                        ) from e
                    if not rows:
                        break
                    for row in rows:
                        src_val = row.get(src_col)
                        tgt_val = row.get(tgt_col)
                        if src_val is None or tgt_val is None:
                            continue
                        session.run(
                            f"MERGE (a:{src_label} {{`{src_key}`: $src_id}}) MERGE (b:{tgt_label} {{`{tgt_key}`: $tgt_id}}) MERGE (a)-[r:{rel_type}]->(b)",
                            src_id=src_val,
                            tgt_id=tgt_val,
                        )
                        relationships_created += 1
                    offset += len(rows)
                    if offset >= total:
                        break
                link_types_indexed += 1

            # Index many-to-one / one-to-many: source dataset rows where FK column is not null
            for link_type in m2o_types:
                source_type = await db.get(ObjectType, link_type.source_object_type_id)
                target_type = await db.get(ObjectType, link_type.target_object_type_id)
                if not source_type or not target_type or not source_type.dataset_id:
                    continue
                src_label = _neo4j_safe_label(source_type.name)
                tgt_label = _neo4j_safe_label(target_type.name)
                rel_type = _neo4j_safe_rel_type(link_type.name)
                fk_col = link_type.source_key_property  # column in source dataset holding target ref (e.g. parent_id)
                src_key = link_type.target_key_property or "id"  # both nodes match on id
                tgt_key = src_key
                offset = 0
                batch_size = 1000
                while True:
                    try:
                        rows, total = await fetch_dataset_rows(
                            db, source_type.dataset_id, limit=batch_size, offset=offset
                        )
                    except Exception as e:
                        raise HTTPException(
                            status_code=502,
                            detail=f"Failed to fetch source dataset for {link_type.name}: {e}",
                        ) from e
                    if not rows:
                        break
                    src_id_col = "id" if "id" in rows[0] else list(rows[0].keys())[0]
                    for row in rows:
                        tgt_val = row.get(fk_col)
                        if tgt_val is None:
                            continue
                        src_val = row.get(src_id_col)
                        if src_val is None:
                            continue
                        session.run(
                            f"MERGE (a:{src_label} {{`{src_key}`: $src_id}}) MERGE (b:{tgt_label} {{`{tgt_key}`: $tgt_id}}) MERGE (a)-[r:{rel_type}]->(b)",
                            src_id=src_val,
                            tgt_id=tgt_val,
                        )
                        relationships_created += 1
                    offset += len(rows)
                    if offset >= total:
                        break
                link_types_indexed += 1
    finally:
        driver.close()
    return IndexToNeo4jResponse(link_types_indexed=link_types_indexed, relationships_created=relationships_created)


# --- Link instances (nested under link type) ---

@router.get("/{link_type_id}/links", response_model=LinkInstanceListResponse)
async def list_link_instances(
    link_type_id: str,
    request: Request,
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List link instances. Links page loads from Neo4j when a Neo4j data source exists."""
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    await _require_link_type_in_scope(request, db, link_type_id)

    neo4j_ds = await _get_first_neo4j_datasource(db)
    if neo4j_ds:
        source_type = await db.get(ObjectType, link_type.source_object_type_id)
        target_type = await db.get(ObjectType, link_type.target_object_type_id)
        if source_type and target_type:
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
                    src_label = _neo4j_safe_label(source_type.name)
                    tgt_label = _neo4j_safe_label(target_type.name)
                    rel_type = _neo4j_safe_rel_type(link_type.name)
                    if link_type.cardinality in ("many-to-one", "one-to-many"):
                        src_key = link_type.target_key_property or "id"
                        tgt_key = src_key
                    else:
                        src_key = link_type.source_key_property or "id"
                        tgt_key = link_type.target_key_property or "id"
                    rows, total = _query_neo4j_relationships(
                        driver, src_label, tgt_label, rel_type, src_key, tgt_key, limit, offset
                    )
                    return LinkInstanceListResponse(
                        items=[
                            LinkInstanceResponse(
                                id=f"neo4j:{r['source_key_value']}:{r['target_key_value']}",
                                link_type_id=link_type_id,
                                source_object_id="",
                                target_object_id="",
                                source_key_value=r["source_key_value"],
                                target_key_value=r["target_key_value"],
                                source_data=r["source_data"],
                                target_data=r["target_data"],
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

    # Many-to-many with dataset: connections come from junction table
    if (
        link_type.cardinality == "many-to-many"
        and link_type.dataset_id
        and link_type.source_dataset_column
        and link_type.target_dataset_column
    ):
        try:
            rows, total = await fetch_dataset_rows(db, link_type.dataset_id, limit=limit, offset=offset)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        src_col = link_type.source_dataset_column
        tgt_col = link_type.target_dataset_column
        items = []
        for i, row in enumerate(rows):
            src_val = row.get(src_col)
            tgt_val = row.get(tgt_col)
            if src_val is not None and tgt_val is not None:
                items.append(
                    LinkInstanceResponse(
                        id=f"dataset:{offset + i}",
                        link_type_id=link_type_id,
                        source_object_id="",
                        target_object_id="",
                        source_key_value=str(src_val),
                        target_key_value=str(tgt_val),
                        source_data={src_col: src_val},
                        target_data={tgt_col: tgt_val},
                        created_at=None,
                        updated_at=None,
                    )
                )
        return LinkInstanceListResponse(items=items, total=total)
    # many-to-one / one-to-many: from source dataset
    if (
        link_type.cardinality in ("many-to-one", "one-to-many")
        and link_type.source_key_property
    ):
        source_type = await db.get(ObjectType, link_type.source_object_type_id)
        if source_type and source_type.dataset_id:
            try:
                rows, _ = await fetch_dataset_rows(db, source_type.dataset_id, limit=limit, offset=offset)
                total = await get_dataset_row_count_where_not_null(
                    db, source_type.dataset_id, link_type.source_key_property
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            fk_col = link_type.source_key_property
            src_id_col = "id" if (rows and "id" in rows[0]) else (list(rows[0].keys())[0] if rows else "id")
            items = []
            for i, row in enumerate(rows):
                tgt_val = row.get(fk_col)
                if tgt_val is None:
                    continue
                src_val = row.get(src_id_col)
                if src_val is None:
                    continue
                items.append(
                    LinkInstanceResponse(
                        id=f"dataset:{offset + i}",
                        link_type_id=link_type_id,
                        source_object_id="",
                        target_object_id="",
                        source_key_value=str(src_val),
                        target_key_value=str(tgt_val),
                        source_data={k: v for k, v in row.items() if v is not None},
                        target_data={fk_col: tgt_val},
                        created_at=None,
                        updated_at=None,
                    )
                )
            return LinkInstanceListResponse(items=items, total=total)
    # Otherwise: from link_instances table
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
        items.append(
            LinkInstanceResponse(
                id=li.id,
                link_type_id=li.link_type_id,
                source_object_id=li.source_object_id,
                target_object_id=li.target_object_id,
                source_data=source_obj.data if source_obj else None,
                target_data=target_obj.data if target_obj else None,
                created_at=li.created_at,
                updated_at=li.updated_at,
            )
        )
    return LinkInstanceListResponse(items=items, total=len(items))


@router.post("/{link_type_id}/links", response_model=LinkInstanceResponse, status_code=201)
async def create_link_instance(
    link_type_id: str,
    body: LinkInstanceCreate,
    request: Request,
    _: None = Depends(require_any_permission(PERM_CONSOLE_LINK_TYPES, PERM_ONTOLOGY_WRITE)),
    db: AsyncSession = Depends(get_db),
):
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    await _require_link_type_in_scope(request, db, link_type_id)
    if link_type.cardinality == "many-to-many" and link_type.dataset_id:
        raise HTTPException(
            status_code=400,
            detail="Links come from the junction table dataset; add/remove rows there.",
        )
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
    request: Request,
    _: None = Depends(require_any_permission(PERM_CONSOLE_LINK_TYPES, PERM_ONTOLOGY_WRITE)),
    db: AsyncSession = Depends(get_db),
):
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    await _require_link_type_in_scope(request, db, link_type_id)
    if link_type.cardinality == "many-to-many" and link_type.dataset_id:
        raise HTTPException(
            status_code=400,
            detail="Links come from the junction table dataset; remove rows there.",
        )
    link_instance = await db.get(LinkInstance, link_id)
    if not link_instance or link_instance.link_type_id != link_type_id:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.delete(link_instance)
