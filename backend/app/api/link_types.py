"""Link types API (admin CRUD + user read)."""
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.services.permissions.permission_catalog import PERM_CONSOLE_LINK_TYPES, PERM_ONTOLOGY_WRITE
from app.services.ontology.dataset_tables import (
    dataset_display_name,
    fetch_dataset_rows,
    get_dataset_row_count,
    get_dataset_row_count_where_not_null,
)
from app.services.ontology.api_names import ApiNameError, resolve_api_name
from app.services.ontology.object_neo4j_store import (
    fetch_object_from_neo4j,
    get_first_neo4j_datasource,
    prune_link_relationships,
    prune_refused_reason,
    link_endpoint_keys,
    link_rel_type,
    object_label,
    sync_link_instances_to_neo4j,
)
from app.database import get_db
from app.services.acl.data_resource_policy import link_type_visible
from app.services.acl.data_scope import bootstrap_owner_acl
from app.services.ontology.ontology_type_scope import require_link_type_permission
from app.services.acl.resource_acl_constants import PERM_READ, PERM_WRITE, RT_LINK_TYPE
from app.models.data_source import DataSource
from app.models.link_instance import LinkInstance
from app.services.ontology.neo4j_async import (
    NEO4J_ERRORS,
    neo4j_driver_available,
    open_neo4j_driver,
    run_with_neo4j_driver,
)
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


async def _require_link_type_read(request: Request, db: AsyncSession, link_type_id: str) -> None:
    await require_link_type_permission(request, db, link_type_id, PERM_READ)


async def _require_link_type_write(request: Request, db: AsyncSession, link_type_id: str) -> None:
    await require_link_type_permission(request, db, link_type_id, PERM_WRITE)


class IndexToNeo4jRequest(BaseModel):
    neo4j_data_source_id: str


class IndexToNeo4jResponse(BaseModel):
    link_types_indexed: int
    relationships_created: int
    #: Only non-zero when the request asked to prune (`?prune=true`).
    relationships_pruned: int = 0
    prune_skipped: str | None = None


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
    *,
    source_key_value: str | None = None,
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

    where = ""
    params: dict = {"offset": offset, "limit": limit}
    if source_key_value is not None and source_key_value != "":
        safe_src_key = re.sub(r"[^a-zA-Z0-9_]", "_", src_key) or "id"
        where = f"WHERE toString(a.`{safe_src_key}`) = $source_key_value"
        params["source_key_value"] = source_key_value

    with driver.session() as session:
        count_params = {k: v for k, v in params.items() if k not in ("offset", "limit")}
        count_result = session.run(
            f"MATCH (a:{src_label})-[r:{rel_type}]->(b:{tgt_label}) {where} RETURN count(r) AS c",
            **count_params,
        )
        total = count_result.single()["c"] or 0

        result = session.run(
            f"MATCH (a:{src_label})-[r:{rel_type}]->(b:{tgt_label}) {where} "
            f"RETURN a, b SKIP $offset LIMIT $limit",
            **params,
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


async def _neo4j_rel_counts_batch(
    ds: DataSource,
    keys: list[tuple[str, str, str]],
) -> dict[tuple[str, str, str], int | None]:
    if not keys:
        return {}

    def _run(driver) -> dict[tuple[str, str, str], int | None]:
        out: dict[tuple[str, str, str], int | None] = {}
        for src_label, tgt_label, rel_type in keys:
            try:
                out[(src_label, tgt_label, rel_type)] = _neo4j_rel_count(
                    driver, src_label, tgt_label, rel_type
                )
            except NEO4J_ERRORS:
                out[(src_label, tgt_label, rel_type)] = None
        return out

    return await run_with_neo4j_driver(ds, _run)


async def _taken_api_names(db: AsyncSession, *, exclude_id: str | None = None) -> set[str]:
    """Every api_name already claimed — the set a new/claiming row must not collide with."""
    query = select(LinkType.api_name).where(LinkType.api_name.isnot(None))
    if exclude_id:
        query = query.where(LinkType.id != exclude_id)
    return set((await db.execute(query)).scalars().all())


async def _to_response(db: AsyncSession, link_type: LinkType, link_count_override: int | None = None) -> LinkTypeResponse:
    count = link_count_override if link_count_override is not None else await _link_count_for_type(db, link_type)
    source_type = await db.get(ObjectType, link_type.source_object_type_id)
    target_type = await db.get(ObjectType, link_type.target_object_type_id)
    ds_name = await dataset_display_name(db, link_type.dataset_id)
    return LinkTypeResponse(
        id=link_type.id,
        name=link_type.name,
        api_name=getattr(link_type, "api_name", None),
        neo4j_rel_type=link_rel_type(link_type),
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
    neo4j_counts: dict[tuple[str, str, str], int | None] = {}
    object_types_by_id: dict[str, ObjectType] = {}
    if count_from_neo4j and types:
        type_ids = {t.source_object_type_id for t in types} | {t.target_object_type_id for t in types}
        ot_result = await db.execute(select(ObjectType).where(ObjectType.id.in_(type_ids)))
        object_types_by_id = {ot.id: ot for ot in ot_result.scalars().all()}
        neo4j_ds = await get_first_neo4j_datasource(db)
        if neo4j_ds:
            keys: list[tuple[str, str, str]] = []
            for t in types:
                source_type = object_types_by_id.get(t.source_object_type_id)
                target_type = object_types_by_id.get(t.target_object_type_id)
                if source_type and target_type:
                    keys.append(
                        (
                            object_label(source_type),
                            object_label(target_type),
                            link_rel_type(t),
                        )
                    )
            unique_keys = list(dict.fromkeys(keys))
            try:
                neo4j_counts = await _neo4j_rel_counts_batch(neo4j_ds, unique_keys)
            except ImportError:
                neo4j_counts = {}
    items = []
    for t in types:
        count_override = None
        if neo4j_counts:
            source_type = object_types_by_id.get(t.source_object_type_id)
            target_type = object_types_by_id.get(t.target_object_type_id)
            if source_type and target_type:
                key = (
                    object_label(source_type),
                    object_label(target_type),
                    link_rel_type(t),
                )
                count_override = neo4j_counts.get(key)
        items.append(await _to_response(db, t, count_override))
    return LinkTypeListResponse(items=items, total=len(items))


@router.post("", response_model=LinkTypeResponse, status_code=201)
async def create_link_type(
    body: LinkTypeCreate,
    request: Request,
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
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    uname = p.get("preferred_username") or p.get("name")
    # `api_name` is the frozen identifier code/Cypher use, and it doubles as the relationship
    # type: both are assigned here, so renaming `name` later changes neither.
    try:
        api_name = resolve_api_name(
            requested=body.api_name,
            display_name=body.name,
            taken=await _taken_api_names(db),
        )
    except ApiNameError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    rel_type = api_name
    rel_clash = (
        await db.execute(select(LinkType).where(LinkType.neo4j_rel_type == rel_type))
    ).scalars().first()
    if rel_clash:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Graph relationship type '{rel_type}' is already used by link type "
                f"'{rel_clash.name}' indexed before api_name existed. Pick another api_name."
            ),
        )
    link_type = LinkType(
        id=str(uuid.uuid4()),
        name=body.name,
        api_name=api_name,
        neo4j_rel_type=rel_type,
        description=body.description,
        source_object_type_id=body.source_object_type_id,
        target_object_type_id=body.target_object_type_id,
        cardinality=cardinality,
        dataset_id=body.dataset_id,
        source_key_property=body.source_key_property,
        target_key_property=body.target_key_property,
        source_dataset_column=body.source_dataset_column,
        target_dataset_column=body.target_dataset_column,
        created_by=sub if isinstance(sub, str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(link_type)
    await db.flush()
    if isinstance(sub, str):
        await bootstrap_owner_acl(db, RT_LINK_TYPE, link_type.id, sub)
    await db.commit()
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
        neo4j_ds = await get_first_neo4j_datasource(db)
        if neo4j_ds:
            source_type = await db.get(ObjectType, link_type.source_object_type_id)
            target_type = await db.get(ObjectType, link_type.target_object_type_id)
            if source_type and target_type:
                key = (
                    object_label(source_type),
                    object_label(target_type),
                    link_rel_type(link_type),
                )
                try:
                    counts = await _neo4j_rel_counts_batch(neo4j_ds, [key])
                    count_override = counts.get(key)
                except NEO4J_ERRORS:
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
    await _require_link_type_read(request, db, link_type_id)
    if body.name is not None:
        # `neo4j_rel_type` stays as it was — a rename is a display change, not a re-index.
        link_type.name = body.name
    if body.api_name is not None and body.api_name.strip():
        if link_type.api_name:
            raise HTTPException(
                status_code=400,
                detail=(
                    "api_name is fixed at creation — published Functions reference this link type "
                    "by it. Rename the display name instead."
                ),
            )
        try:
            link_type.api_name = resolve_api_name(
                requested=body.api_name,
                display_name=link_type.name,
                taken=await _taken_api_names(db, exclude_id=link_type_id),
            )
        except ApiNameError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
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
    await _require_link_type_read(request, db, link_type_id)
    await db.delete(link_type)


def _neo4j_safe_rel_type(name: str) -> str:
    """Sanitize a link type name for use as a Neo4j relationship type. Preserves case — link_type names are stored in lower_snake_case in Postgres and indexed verbatim in Neo4j (e.g. governed_by, covers)."""
    s = re.sub(r"[^a-zA-Z0-9_]", "_", name.strip())
    return s or "relates_to"


async def _open_neo4j_driver_for_link_index(body: IndexToNeo4jRequest, db: AsyncSession):
    neo4j_ds = await db.get(DataSource, body.neo4j_data_source_id)
    if not neo4j_ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    if neo4j_ds.kind != "neo4j":
        raise HTTPException(status_code=400, detail="Target must be a Neo4j data source")
    if not neo4j_driver_available():
        raise HTTPException(
            status_code=501,
            detail="Neo4j driver not installed. pip install neo4j",
        )
    return open_neo4j_driver(neo4j_ds)


async def _index_link_type_m2m_junction(
    db: AsyncSession,
    session,
    link_type: LinkType,
    source_type: ObjectType,
    target_type: ObjectType,
) -> tuple[int, set]:
    """MERGE relationships from many-to-many junction dataset rows.

    Returns (created, endpoint pairs written) — the pair set is what pruning keeps.
    """
    src_label = object_label(source_type)
    tgt_label = object_label(target_type)
    rel_type = link_rel_type(link_type)
    src_col = link_type.source_dataset_column
    tgt_col = link_type.target_dataset_column
    # Keyed like the object layer keys these nodes, so the edge joins the node the object API shows.
    src_key, tgt_key = link_endpoint_keys(source_type, target_type)
    relationships_created = 0
    keep: set = set()
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
            keep.add((src_val, tgt_val))
            relationships_created += 1
        offset += len(rows)
        if offset >= total:
            break
    return relationships_created, keep


async def _index_link_type_m2o_source_fk(
    db: AsyncSession,
    session,
    link_type: LinkType,
    source_type: ObjectType,
    target_type: ObjectType,
) -> tuple[int, set]:
    """MERGE relationships from source object dataset rows (FK column → target node id)."""
    if not source_type.dataset_id:
        return 0, set()
    src_label = object_label(source_type)
    tgt_label = object_label(target_type)
    rel_type = link_rel_type(link_type)
    fk_col = link_type.source_key_property
    src_key, tgt_key = link_endpoint_keys(source_type, target_type)
    relationships_created = 0
    keep: set = set()
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
            keep.add((src_val, tgt_val))
            relationships_created += 1
        offset += len(rows)
        if offset >= total:
            break
    return relationships_created, keep


async def _index_link_type_from_saved_instances(
    db: AsyncSession,
    session,
    link_type: LinkType,
    source_type: ObjectType,
    target_type: ObjectType,
) -> tuple[int, set]:
    """MERGE relationships from link_instances (object ids are the node keys)."""
    src_label = object_label(source_type)
    tgt_label = object_label(target_type)
    rel_type = link_rel_type(link_type)
    relationships_created = 0
    keep: set = set()
    offset = 0
    batch_size = 500
    while True:
        result = await db.execute(
            select(LinkInstance)
            .where(LinkInstance.link_type_id == link_type.id)
            .order_by(LinkInstance.id)
            .offset(offset)
            .limit(batch_size)
        )
        links = result.scalars().all()
        if not links:
            break
        for li in links:
            source_obj = await db.get(ObjectInstance, li.source_object_id)
            target_obj = await db.get(ObjectInstance, li.target_object_id)
            if not source_obj or not target_obj:
                continue
            # Same identity the object layer MERGEs these nodes on; the stored id *is* that value.
            src_key, tgt_key = link_endpoint_keys(source_type, target_type)
            src_val = li.source_object_id
            tgt_val = li.target_object_id
            if src_val is None or tgt_val is None:
                continue
            session.run(
                f"MERGE (a:{src_label} {{`{src_key}`: $src_id}}) MERGE (b:{tgt_label} {{`{tgt_key}`: $tgt_id}}) MERGE (a)-[r:{rel_type}]->(b)",
                src_id=src_val,
                tgt_id=tgt_val,
            )
            keep.add((src_val, tgt_val))
            relationships_created += 1
        offset += len(links)
        if len(links) < batch_size:
            break
    return relationships_created, keep


@dataclass(frozen=True)
class _LinkPruneContext:
    """What a prune needs after a link type has been indexed."""

    src_label: str
    tgt_label: str
    rel_type: str
    src_key: str
    tgt_key: str
    keep: set


def _prune_kwargs(ctx: _LinkPruneContext) -> dict:
    return {
        "src_label": ctx.src_label,
        "tgt_label": ctx.tgt_label,
        "rel_type": ctx.rel_type,
        "src_key": ctx.src_key,
        "tgt_key": ctx.tgt_key,
        "keep": ctx.keep,
    }


async def _index_one_link_type_to_neo4j_session(
    db: AsyncSession,
    session,
    link_type: LinkType,
) -> tuple[int, bool, _LinkPruneContext | None]:
    """Returns (relationships_created, did_run_an_indexing_mode, prune_context)."""
    source_type = await db.get(ObjectType, link_type.source_object_type_id)
    target_type = await db.get(ObjectType, link_type.target_object_type_id)
    if not source_type or not target_type:
        return 0, False, None
    if (
        link_type.cardinality == "many-to-many"
        and link_type.dataset_id
        and link_type.source_dataset_column
        and link_type.target_dataset_column
    ):
        n, keep = await _index_link_type_m2m_junction(db, session, link_type, source_type, target_type)
    elif (
        link_type.cardinality in ("many-to-one", "one-to-many")
        and link_type.source_key_property
        and source_type.dataset_id
    ):
        n, keep = await _index_link_type_m2o_source_fk(db, session, link_type, source_type, target_type)
    else:
        n_inst = await _link_instance_count(db, link_type.id)
        if n_inst == 0:
            return 0, False, None
        n, keep = await _index_link_type_from_saved_instances(
            db, session, link_type, source_type, target_type
        )
    src_key, tgt_key = link_endpoint_keys(source_type, target_type)
    return (
        n,
        True,
        _LinkPruneContext(
            src_label=object_label(source_type),
            tgt_label=object_label(target_type),
            rel_type=link_rel_type(link_type),
            src_key=src_key,
            tgt_key=tgt_key,
            keep=keep,
        ),
    )


@router.post("/index-to-neo4j", response_model=IndexToNeo4jResponse, dependencies=[Depends(require_any_permission(PERM_CONSOLE_LINK_TYPES, PERM_ONTOLOGY_WRITE))])
async def index_links_to_neo4j(
    body: IndexToNeo4jRequest,
    prune: bool = Query(False, description="Delete edges this run did not write (a mirror type)"),
    db: AsyncSession = Depends(get_db),
):
    """Index link types to Neo4j: junction or source-FK datasets when configured, else saved link instances.

    With ``prune=true`` it also deletes edges of that type whose endpoint pair the source no longer
    has — removing a row leaves the edge otherwise.
    """
    driver = await _open_neo4j_driver_for_link_index(body, db)
    relationships_created = 0
    relationships_pruned = 0
    prune_skipped: str | None = None
    link_types_indexed = 0
    try:
        with driver.session() as session:
            result = await db.execute(select(LinkType).order_by(LinkType.name))
            for link_type in result.scalars().all():
                n, ok, ctx = await _index_one_link_type_to_neo4j_session(db, session, link_type)
                if not ok:
                    continue
                link_types_indexed += 1
                relationships_created += n
                if prune and ctx is not None:
                    reason = prune_refused_reason(ctx.keep)
                    if reason:
                        prune_skipped = reason
                    else:
                        relationships_pruned += prune_link_relationships(session, **_prune_kwargs(ctx))
    finally:
        driver.close()
    return IndexToNeo4jResponse(
        link_types_indexed=link_types_indexed,
        relationships_created=relationships_created,
        relationships_pruned=relationships_pruned,
        prune_skipped=prune_skipped,
    )


@router.post(
    "/{link_type_id}/index-to-neo4j",
    response_model=IndexToNeo4jResponse,
    dependencies=[Depends(require_any_permission(PERM_CONSOLE_LINK_TYPES, PERM_ONTOLOGY_WRITE))],
)
async def index_one_link_type_to_neo4j(
    link_type_id: str,
    body: IndexToNeo4jRequest,
    prune: bool = Query(False, description="Delete edges this run did not write (a mirror type)"),
    db: AsyncSession = Depends(get_db),
):
    """Index one link type to Neo4j (dataset path or saved instances). Admin only."""
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    driver = await _open_neo4j_driver_for_link_index(body, db)
    relationships_pruned = 0
    prune_skipped: str | None = None
    try:
        with driver.session() as session:
            n, ok, ctx = await _index_one_link_type_to_neo4j_session(db, session, link_type)
            if ok and prune and ctx is not None:
                reason = prune_refused_reason(ctx.keep)
                if reason:
                    prune_skipped = reason
                else:
                    relationships_pruned = prune_link_relationships(session, **_prune_kwargs(ctx))
    finally:
        driver.close()
    if not ok:
        raise HTTPException(
            status_code=400,
            detail="This link type has no junction or source-dataset configuration and no saved links to index.",
        )
    return IndexToNeo4jResponse(
        link_types_indexed=1,
        relationships_created=n,
        relationships_pruned=relationships_pruned,
        prune_skipped=prune_skipped,
    )


# --- Link instances (nested under link type) ---

@router.get("/{link_type_id}/links", response_model=LinkInstanceListResponse)
async def list_link_instances(
    link_type_id: str,
    request: Request,
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    source_object_id: str | None = None,
    source_key_value: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List link instances from the ontology graph.

    The junction table, the source-table FK and ``link_instances`` are what gets *indexed into* the
    graph; they are not read paths. So this answers like the object list: **409** without a Neo4j
    data source, **503** when the graph is unreachable, and ``indexed: false`` when a type has
    source rows but no indexed edges.

    ``source_object_id`` / ``source_key_value`` filter on the source endpoint's id — the same id the
    object API shows for that object.
    """
    link_type = await db.get(LinkType, link_type_id)
    if not link_type:
        raise HTTPException(status_code=404, detail="Link type not found")
    await _require_link_type_read(request, db, link_type_id)

    source_type = await db.get(ObjectType, link_type.source_object_type_id)
    target_type = await db.get(ObjectType, link_type.target_object_type_id)
    neo4j_ds = await get_first_neo4j_datasource(db)
    if not neo4j_ds:
        raise HTTPException(
            status_code=409,
            detail=(
                "Link instances are read from the graph. Add a Neo4j data source "
                "(Console → Data Sources), then index this link type."
            ),
        )
    if not source_type or not target_type:
        raise HTTPException(
            status_code=409,
            detail="This link type points at an object type that no longer exists; fix it first.",
        )

    source_key = source_key_value or source_object_id
    src_label = object_label(source_type)
    tgt_label = object_label(target_type)
    rel_type = link_rel_type(link_type)
    # A relationship joins two objects, so both ends use the identity the object layer writes.
    src_key, tgt_key = link_endpoint_keys(source_type, target_type)

    def _query(driver):
        return _query_neo4j_relationships(
            driver,
            src_label,
            tgt_label,
            rel_type,
            src_key,
            tgt_key,
            limit,
            offset,
            source_key_value=source_key,
        )

    try:
        rows, total = await run_with_neo4j_driver(neo4j_ds, _query)
    except NEO4J_ERRORS as e:
        raise HTTPException(status_code=503, detail=f"Ontology graph unavailable: {e}") from e

    # An empty, unfiltered page can mean "no links" or "never indexed". Say which.
    indexed: bool | None = True
    if total == 0 and source_key is None:
        indexed = not await _has_unindexed_link_source(db, link_type, source_type)
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
        indexed=indexed,
    )


async def _has_unindexed_link_source(
    db: AsyncSession, link_type: LinkType, source_type: ObjectType
) -> bool:
    """Whether this link type has source rows to index that the graph does not show."""
    if (
        link_type.cardinality == "many-to-many"
        and link_type.dataset_id
        and link_type.source_dataset_column
        and link_type.target_dataset_column
    ):
        return await get_dataset_row_count(db, link_type.dataset_id) > 0
    if link_type.cardinality in ("many-to-one", "one-to-many") and link_type.source_key_property:
        if source_type.dataset_id:
            return (
                await get_dataset_row_count_where_not_null(
                    db, source_type.dataset_id, link_type.source_key_property
                )
                > 0
            )
    return await _link_instance_count(db, link_type.id) > 0


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
    await _require_link_type_write(request, db, link_type_id)
    if link_type.cardinality == "many-to-many" and link_type.dataset_id:
        raise HTTPException(
            status_code=400,
            detail="Links come from the junction table dataset; add/remove rows there.",
        )
    source_type = await db.get(ObjectType, link_type.source_object_type_id)
    target_type = await db.get(ObjectType, link_type.target_object_type_id)
    if not source_type or not target_type:
        raise HTTPException(status_code=400, detail="Link type references a missing object type")
    # Endpoints are resolved through the graph, not the write queue: a link joins two *objects*,
    # and a dataset-backed object has no queue row at all. Looking the id up inside the declared
    # type also proves it is of that type.
    source_props = await fetch_object_from_neo4j(db, source_type, body.source_object_id)
    if source_props is None:
        raise HTTPException(
            status_code=409,
            detail=f"Source object {body.source_object_id} is not in the ontology graph yet. Index {source_type.name} first.",
        )
    target_props = await fetch_object_from_neo4j(db, target_type, body.target_object_id)
    if target_props is None:
        raise HTTPException(
            status_code=409,
            detail=f"Target object {body.target_object_id} is not in the ontology graph yet. Index {target_type.name} first.",
        )
    link_instance = LinkInstance(
        id=str(uuid.uuid4()),
        link_type_id=link_type_id,
        source_object_id=body.source_object_id,
        target_object_id=body.target_object_id,
    )
    db.add(link_instance)
    await db.flush()
    # Same-request graph sync, like an object write: a link nothing can read is not a link.
    try:
        await sync_link_instances_to_neo4j(
            db,
            link_type,
            source_type,
            target_type,
            upsert=[(body.source_object_id, body.target_object_id)],
            delete=[],
        )
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(e)) from e
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=502, detail=f"Queued but Neo4j sync failed: {e}") from e
    await db.refresh(link_instance)
    return LinkInstanceResponse(
        id=link_instance.id,
        link_type_id=link_instance.link_type_id,
        source_object_id=link_instance.source_object_id,
        target_object_id=link_instance.target_object_id,
        source_data=source_props,
        target_data=target_props,
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
    await _require_link_type_write(request, db, link_type_id)
    if link_type.cardinality == "many-to-many" and link_type.dataset_id:
        raise HTTPException(
            status_code=400,
            detail="Links come from the junction table dataset; remove rows there.",
        )
    link_instance = await db.get(LinkInstance, link_id)
    if not link_instance or link_instance.link_type_id != link_type_id:
        raise HTTPException(status_code=404, detail="Link not found")
    source_type = await db.get(ObjectType, link_type.source_object_type_id)
    target_type = await db.get(ObjectType, link_type.target_object_type_id)
    endpoints = (link_instance.source_object_id, link_instance.target_object_id)
    await db.delete(link_instance)
    await db.flush()
    if source_type and target_type:
        try:
            await sync_link_instances_to_neo4j(
                db, link_type, source_type, target_type, upsert=[], delete=[endpoints]
            )
        except Exception as e:
            await db.rollback()
            raise HTTPException(status_code=502, detail=f"Deleted but Neo4j sync failed: {e}") from e
