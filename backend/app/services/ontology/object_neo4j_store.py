"""Neo4j as query SoT for ontology objects; helpers for MERGE/DELETE and list.

``object_instances`` remains the Action/REST apply queue. Callers sync queue rows
into Neo4j in the same request when a Neo4j data source exists.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType
from app.services.ontology.neo4j_async import run_with_neo4j_driver


def neo4j_safe_label(name: str) -> str:
    """Convert object type name to Neo4j-safe label (alphanumeric, underscore)."""
    s = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    return s or "Node"


def resolve_id_property(obj_type: ObjectType) -> str:
    """Property name used as list/get API id.

    Prefer ``key_property``. For hand-created / Action-managed types (no dataset),
    always use the write MERGE column (``id``) so list ids match Action ``object_id``
    and queue primary keys — never fall back to the first schema property (e.g. title).
    """
    key = getattr(obj_type, "key_property", None)
    if key and str(key).strip():
        prop_names = [p.get("name") for p in (obj_type.properties or []) if isinstance(p, dict) and p.get("name")]
        if key in (prop_names or [key]):
            return str(key).strip()
    if not getattr(obj_type, "dataset_id", None):
        return resolve_write_id_column(obj_type)
    prop_names = [p.get("name") for p in (obj_type.properties or []) if isinstance(p, dict) and p.get("name")]
    return "id" if (prop_names and "id" in prop_names) else (prop_names[0] if prop_names else "id")


def resolve_write_id_column(obj_type: ObjectType) -> str:
    """Stable MERGE identity for Action/queue sync (no first-column fallback)."""
    key = getattr(obj_type, "key_property", None)
    if key and str(key).strip():
        return str(key).strip()
    return "id"


def resolve_neo4j_id_column_for_row(obj_type: ObjectType, sample_row: dict) -> str:
    """Pick MERGE id property from a representative row (dataset index path)."""
    prop_names = [p.get("name") for p in (obj_type.properties or []) if isinstance(p, dict) and p.get("name")]
    if obj_type.key_property and sample_row and obj_type.key_property in sample_row:
        return obj_type.key_property
    if (prop_names and "id" in prop_names) or (sample_row and "id" in sample_row):
        return "id"
    if prop_names:
        return prop_names[0]
    if sample_row:
        return list(sample_row.keys())[0]
    return "id"


def instance_row_for_neo4j(obj_type: ObjectType, instance: ObjectInstance) -> dict[str, Any]:
    """Flat props for MERGE: instance data plus stable id column = instance.id."""
    row = dict(instance.data or {})
    id_col = resolve_write_id_column(obj_type)
    row[id_col] = instance.id
    if id_col != "id":
        row.setdefault("id", instance.id)
    return row


def merge_object_row_to_neo4j(session, label: str, id_col: str, row: dict) -> int:
    """MERGE one flat property map into Neo4j. Returns 1 if a node was written, else 0."""
    props = {k: v for k, v in row.items() if v is not None}
    node_id = props.get(id_col, props.get(list(props.keys())[0]) if props else None)
    if node_id is None:
        return 0
    safe_props: dict = {}
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
    return 1


def delete_object_node(session, label: str, id_col: str, id_val: str) -> int:
    """DETACH DELETE one node by MERGE identity. Returns deleted count."""
    result = session.run(
        f"MATCH (n:{label} {{`{id_col}`: $id_val}}) DETACH DELETE n RETURN count(*) AS c",
        id_val=id_val,
    )
    row = result.single()
    return int(row["c"] or 0) if row else 0


def query_neo4j_nodes(
    driver,
    label: str,
    search: str | None,
    limit: int,
    offset: int,
    id_prop: str,
    prop_filters: dict[str, str] | None = None,
) -> tuple[list[dict], int]:
    """Query nodes from Neo4j by label. Returns (rows, total)."""
    search_trimmed = search.strip() if search else None
    prop_filters = prop_filters or {}
    where_parts: list[str] = []
    params: dict = {"offset": offset, "limit": limit}
    if search_trimmed:
        where_parts.append(
            "any(k IN keys(n) WHERE toLower(toString(n[k])) CONTAINS toLower($search))"
        )
        params["search"] = search_trimmed
    for i, (name, value) in enumerate(prop_filters.items()):
        pname = f"pf_{i}"
        where_parts.append(f"toString(n.`{name}`) = ${pname}")
        params[pname] = value
    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
    with driver.session() as session:
        count_result = session.run(
            f"MATCH (n:{label}) {where_clause} RETURN count(n) AS c",
            **{k: v for k, v in params.items() if k not in ("offset", "limit")},
        )
        total = count_result.single()["c"] or 0

        result = session.run(
            f"MATCH (n:{label}) {where_clause} RETURN n SKIP $offset LIMIT $limit",
            **params,
        )

        def _serialize_val(v):
            if v is None:
                return None
            if isinstance(v, (str, int, float, bool)):
                return v
            if hasattr(v, "isoformat"):
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


def get_neo4j_node_by_id(driver, label: str, id_col: str, id_val: str) -> dict | None:
    """Return node props dict or None."""
    with driver.session() as session:
        result = session.run(
            f"MATCH (n:{label} {{`{id_col}`: $id_val}}) RETURN n LIMIT 1",
            id_val=id_val,
        )
        record = result.single()
        if not record or record["n"] is None:
            return None
        node = record["n"]
        props = dict(node) if hasattr(node, "__iter__") and hasattr(node, "keys") else {}
        out: dict = {}
        for k, v in props.items():
            if v is None:
                continue
            if isinstance(v, (str, int, float, bool)):
                out[k] = v
            elif hasattr(v, "isoformat"):
                out[k] = v.isoformat()
            else:
                out[k] = str(v)
        return out


async def get_first_neo4j_datasource(db: AsyncSession) -> DataSource | None:
    result = await db.execute(select(DataSource).where(DataSource.kind == "neo4j").limit(1))
    return result.scalar_one_or_none()


async def fetch_object_from_neo4j(
    db: AsyncSession,
    obj_type: ObjectType,
    object_id: str,
) -> dict | None:
    """Load one object node props from Neo4j, or None if no DS / not found."""
    neo4j_ds = await get_first_neo4j_datasource(db)
    if not neo4j_ds:
        return None
    label = neo4j_safe_label(obj_type.name)
    id_col = resolve_write_id_column(obj_type)

    def _query(driver):
        return get_neo4j_node_by_id(driver, label, id_col, object_id)

    try:
        return await run_with_neo4j_driver(neo4j_ds, _query)
    except Exception:
        return None


async def resolve_object_props_for_action(
    db: AsyncSession,
    obj_type: ObjectType,
    object_id: str,
) -> tuple[str, dict] | None:
    """Resolve Action object_id to (canonical_id, props).

    Prefer Neo4j by write id column; fall back to apply-queue row.
    """
    props = await fetch_object_from_neo4j(db, obj_type, object_id)
    if props is not None:
        id_col = resolve_write_id_column(obj_type)
        canonical = str(props.get(id_col) or props.get("id") or object_id)
        return canonical, props

    instance = await db.get(ObjectInstance, object_id)
    if instance and instance.object_type_id == obj_type.id:
        return instance.id, dict(instance.data or {})
    return None


async def sync_queue_ids_to_neo4j(
    db: AsyncSession,
    obj_type: ObjectType,
    *,
    upsert_ids: list[str],
    delete_ids: list[str],
) -> None:
    """Same-request sync: MERGE upsert ids from queue; DETACH DELETE delete ids.

    No-op when there is no Neo4j data source. Raises on Neo4j errors so callers
    can mark the Action/REST write as failed after the queue commit path.
    """
    if not upsert_ids and not delete_ids:
        return
    neo4j_ds = await get_first_neo4j_datasource(db)
    if not neo4j_ds:
        return

    label = neo4j_safe_label(obj_type.name)
    id_col = resolve_write_id_column(obj_type)
    rows: list[dict] = []
    for oid in upsert_ids:
        inst = await db.get(ObjectInstance, oid)
        if not inst or inst.object_type_id != obj_type.id:
            continue
        rows.append(instance_row_for_neo4j(obj_type, inst))
    delete_vals = list(delete_ids)

    def _run(driver) -> None:
        with driver.session() as session:
            for row in rows:
                merge_object_row_to_neo4j(session, label, id_col, row)
            for oid in delete_vals:
                delete_object_node(session, label, id_col, oid)

    await run_with_neo4j_driver(neo4j_ds, _run)


async def sync_edit_apply_result_to_neo4j(
    db: AsyncSession,
    obj_type: ObjectType,
    applied: dict,
) -> None:
    """Sync create/modify/delete ids from an EditApplyResult.as_dict() payload."""
    await sync_queue_ids_to_neo4j(
        db,
        obj_type,
        upsert_ids=list(applied.get("created_ids") or []) + list(applied.get("modified_ids") or []),
        delete_ids=list(applied.get("deleted_ids") or []),
    )
