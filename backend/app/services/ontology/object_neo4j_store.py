"""Neo4j as query SoT for ontology objects; helpers for MERGE/DELETE and list.

``object_instances`` remains the Action/REST apply queue. Callers sync queue rows
into Neo4j in the same request when a Neo4j data source exists.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote, unquote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.link_type import LinkType
from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType
from app.services.platform.boundaries import boundary
from app.services.ontology.neo4j_async import NEO4J_ERRORS, run_with_neo4j_driver


def neo4j_safe_label(name: str) -> str:
    """Convert object type name to Neo4j-safe label (alphanumeric, underscore)."""
    return neo4j_safe_rel_type(name, fallback="Node")


def neo4j_safe_rel_type(name: str, *, fallback: str = "relates_to") -> str:
    """Convert a schema name to a Neo4j-safe label / relationship type.

    Case is preserved: link type names are lower_snake_case in Postgres and indexed
    verbatim in Neo4j (e.g. ``governed_by``).
    """
    s = re.sub(r"[^a-zA-Z0-9_]", "_", (name or "").strip())
    return s or fallback


def object_label(obj_type: ObjectType) -> str:
    """The Neo4j node label this object type is indexed under.

    Read from ``ObjectType.neo4j_label``, which is assigned once at creation and never
    rewritten. Renaming the object type therefore changes only the display name; the
    already-indexed nodes stay addressable instead of being orphaned under the old label.

    The name-derived fallback keeps rows created before that column existed readable (the
    migration backfills them to exactly this value).
    """
    stored = getattr(obj_type, "neo4j_label", None)
    if isinstance(stored, str) and stored.strip():
        return stored.strip()
    return neo4j_safe_label(obj_type.name)


def link_rel_type(link_type: LinkType) -> str:
    """The Neo4j relationship type a link type is indexed under (stable, like ``object_label``)."""
    stored = getattr(link_type, "neo4j_rel_type", None)
    if isinstance(stored, str) and stored.strip():
        return stored.strip()
    return neo4j_safe_rel_type(link_type.name)


# Platform object identity on Neo4j (hand-created / Action-managed). Not a schema property.
SYSTEM_RID_PROPERTY = "__rid"


ID_SEPARATOR = "|"


def object_key_properties(obj_type: ObjectType, *, sample_row: dict | None = None) -> list[str]:
    """The properties that identify an object in its source table — one, or several.

    A dataset-backed type names them in ``key_properties`` (e.g. ``[portfolio_id, ts_code]`` for
    a table that is unique on the pair). Fallbacks never pick a *business* column by accident:
    ``id`` first, then a declared property, then a column of the row — in that order.

    A hand-created / Action-managed type has no source table, so its identity is the platform
    ``__rid`` (the queue primary key, the same value Actions call ``object_id``).
    """
    if not getattr(obj_type, "dataset_id", None):
        return [SYSTEM_RID_PROPERTY]
    declared = [
        str(k).strip() for k in (getattr(obj_type, "key_properties", None) or []) if str(k).strip()
    ]
    declared = [k for k in declared if sample_row is None or k in sample_row]
    if declared:
        return declared
    prop_names = [
        p.get("name")
        for p in (getattr(obj_type, "properties", None) or [])
        if isinstance(p, dict) and p.get("name")
    ]
    if "id" in prop_names or (sample_row and "id" in sample_row):
        return ["id"]
    if prop_names:
        return [str(prop_names[0])]
    if sample_row:
        return [str(next(iter(sample_row)))]
    return ["id"]


def encode_object_id(values: list[Any]) -> str:
    """The API id of an object with a (possibly composite) key: `a|b`, each part URL-escaped."""
    return ID_SEPARATOR.join(quote(str(v), safe="") for v in values)


def decode_object_id(object_id: str, key_properties: list[str]) -> list[str]:
    """Split an API id back into its key values. Raises ValueError when the count does not match."""
    parts = str(object_id).split(ID_SEPARATOR)
    if len(parts) != len(key_properties):
        raise ValueError(
            f"id {object_id!r} has {len(parts)} part(s); "
            f"{', '.join(key_properties)} need {len(key_properties)}"
        )
    return [unquote(part) for part in parts]


def link_endpoint_values(
    columns: list[str],
    row: dict,
    *,
    fallback: list[Any] | None = None,
) -> list[Any] | None:
    """Endpoint values for a node, taken from the row the link was derived from.

    A composite key needs every one of its columns in that row; when one is missing the caller
    cannot identify the node and must skip instead of merging into whatever matched.
    """
    values = [row.get(column) for column in columns]
    if any(value is None for value in values):
        return fallback if fallback is not None else None
    return values


def key_map(columns: list[str], values: list[Any]) -> dict[str, Any]:
    """The property map a MERGE / MATCH uses for these key columns."""
    return {column: value for column, value in zip(columns, values, strict=True)}


def object_id_from_props(props: dict | None, key_properties: list[str]) -> str | None:
    """The API id of an object, read from its node properties."""
    if not props:
        return None
    values = [props.get(k) for k in key_properties]
    if any(v is None for v in values):
        return None
    return encode_object_id(values)


def resolve_id_properties(obj_type: ObjectType) -> list[str]:
    """The properties the list/get API id is built from (see ``object_key_properties``)."""
    return object_key_properties(obj_type)


def resolve_write_id_columns(obj_type: ObjectType) -> list[str]:
    """The columns a write MERGEs on — the same identity, never a business column by accident."""
    return object_key_properties(obj_type)


def resolve_neo4j_id_columns_for_row(obj_type: ObjectType, sample_row: dict) -> list[str]:
    """MERGE columns for the dataset index path, from a representative row."""
    return object_key_properties(obj_type, sample_row=sample_row)


def instance_row_for_neo4j(obj_type: ObjectType, instance: ObjectInstance) -> dict[str, Any]:
    """Flat props for MERGE: instance data plus the platform ``__rid`` or the business key values."""
    row = {k: v for k, v in dict(instance.data or {}).items() if k != SYSTEM_RID_PROPERTY}
    columns = resolve_write_id_columns(obj_type)
    if columns == [SYSTEM_RID_PROPERTY]:
        row[SYSTEM_RID_PROPERTY] = instance.id
        return row
    # A dataset-backed overlay row is keyed by the encoded business id; split it back into columns.
    values = decode_object_id(instance.id, columns)
    row.update(key_map(columns, values))
    return row


def merge_object_row_to_neo4j(session, label: str, columns: list[str], row: dict) -> int:
    """MERGE one flat property map into Neo4j. Returns 1 if a node was written, else 0.

    The identity is the whole key, so a table unique on `(portfolio_id, ts_code)` produces one
    node per pair instead of one node per whichever column was configured first.
    """
    props = {k: v for k, v in row.items() if v is not None}
    values = [props.get(column) for column in columns]
    if any(value is None for value in values):
        return 0
    safe_props: dict = {}
    for k, v in props.items():
        if isinstance(v, (str, int, float, bool)):
            safe_props[k] = v
        else:
            safe_props[k] = str(v)
    identity = ", ".join(f"`{column}`: $k{i}" for i, column in enumerate(columns))
    params = {f"k{i}": safe_props.get(column) for i, column in enumerate(columns)}
    params["props"] = safe_props
    session.run(
        f"MERGE (n:{label} {{{identity}}}) SET n += $props",
        **params,
    )
    return 1


def _match_map(columns: list[str]) -> str:
    return ", ".join(f"`{column}`: $k{i}" for i, column in enumerate(columns))


def delete_object_node(session, label: str, columns: list[str], values: list[Any]) -> int:
    """DETACH DELETE one node by its (possibly composite) identity. Returns deleted count."""
    result = session.run(
        f"MATCH (n:{label} {{{_match_map(columns)}}}) DETACH DELETE n RETURN count(*) AS c",
        **{f"k{i}": value for i, value in enumerate(values)},
    )
    row = result.single()
    return int(row["c"] or 0) if row else 0


def _search_clause(search: str | None) -> tuple[list[str], dict]:
    trimmed = search.strip() if search else None
    if not trimmed:
        return [], {}
    return (
        ["any(k IN keys(n) WHERE toLower(toString(n[k])) CONTAINS toLower($search))"],
        {"search": trimmed},
    )


def query_object_set(
    driver,
    label: str,
    *,
    search: str | None,
    limit: int,
    offset: int,
    key_properties: list[str],
    filters: list | None = None,
    sort: list | None = None,
    link_info: dict | None = None,
) -> tuple[list[dict], int]:
    """One page of an object set, and its total size.

    The set is `label + search + filters`, ordered by `sort`; that is the same shape the URL carries, so the
    chart aggregation below runs over exactly the rows this returns.
    """
    parts, params = _search_clause(search)
    from app.services.ontology.object_query import count_query, order_clause, page_query, where_clause

    where, filter_params = where_clause(filters or [], link_info=link_info or {})
    params.update(filter_params)
    if where:
        parts.append(where.removeprefix("WHERE "))
    combined = f"WHERE {' AND '.join(parts)}" if parts else ""
    order = order_clause(sort or [], key_properties=key_properties)
    with driver.session() as session:
        total = session.run(count_query(label, combined), **params).single()["c"] or 0
        result = session.run(
            page_query(label, combined, order), **params, offset=offset, limit=limit
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
            row_id = object_id_from_props(data, key_properties)
            if row_id is None:
                # A node missing part of its key is still listed (it exists), by whatever it has.
                row_id = next(iter(data.values()), None) if data else None
            if row_id is not None:
                rows.append({"id": row_id, "data": data})
        return rows, total


def query_neo4j_nodes(
    driver,
    label: str,
    search: str | None,
    limit: int,
    offset: int,
    key_properties: list[str],
    prop_filters: dict[str, str] | None = None,
) -> tuple[list[dict], int]:
    """Legacy entry point: equality filters only. Everything else goes through `query_object_set`."""
    from app.services.ontology.object_query import PropertyFilter

    filters = [
        PropertyFilter(prop=name, op="eq", value=value)
        for name, value in (prop_filters or {}).items()
    ]
    return query_object_set(
        driver,
        label,
        search=search,
        limit=limit,
        offset=offset,
        key_properties=key_properties,
        filters=filters,
    )


def aggregate_object_set(
    driver,
    label: str,
    *,
    prop: str,
    search: str | None,
    filters: list | None,
    link_info: dict | None,
    limit: int = 50,
    buckets: int = 0,
    metric: str = "count",
    measure: str | None = None,
    split: str | None = None,
    compare_filters: list | None = None,
    compare_search: str | None = None,
    chronological: bool = False,
) -> dict:
    """One chart's data for one property over the current object set.

    A number is read as intervals and everything else as values, decided by the data rather than by a declared type:
    asking for buckets on a text property falls back to the distribution, which is what the caller wanted anyway.
    """
    from app.services.ontology.object_query import (
        aggregate_query,
        histogram_query,
        numeric_extent_query,
        where_clause,
    )

    parts, params = _search_clause(search)
    where, filter_params = where_clause(filters or [], link_info=link_info or {})
    params.update(filter_params)
    if where:
        parts.append(where.removeprefix("WHERE "))
    combined = f"WHERE {' AND '.join(parts)}" if parts else ""

    compare_combined: str | None = None
    if compare_filters is not None or compare_search is not None:
        # The baseline is a *set*, not "the rest": it is built exactly like the current one, with its own parameters,
        # and may overlap it (an object can be in both, and then it counts in both).
        compare_parts, compare_params = _search_clause(compare_search)
        compare_where, compare_filter_params = where_clause(
            compare_filters or [], link_info=link_info or {}, param_prefix="c"
        )
        params.update(compare_params)
        params.update(compare_filter_params)
        if compare_where:
            compare_parts.append(compare_where.removeprefix("WHERE "))
        compare_combined = f"WHERE {' AND '.join(compare_parts)}" if compare_parts else ""

    if buckets > 0:
        try:
            with driver.session() as session:
                extent = session.run(
                    numeric_extent_query(label, combined, prop, link_info=link_info), **params
                ).single()
        except NEO4J_ERRORS:
            # `toFloat()` refuses a boolean outright — a property that is not a number is not a reason to lose the
            # whole chart, let alone the other charts in the same request. It falls back to a value distribution.
            extent = None
        lo, hi, count, total = (
            (extent["lo"], extent["hi"], extent["c"], extent["total"])
            if extent
            else (None, None, 0, 0)
        )
        if count:
            lo = float(lo)
            hi = float(hi)
            width = (hi - lo) / buckets if hi > lo else 1.0
            with driver.session() as session:
                counts = {
                    int(record["k"]): int(record["c"])
                    for record in session.run(
                        histogram_query(
                            label, combined, prop, lo=lo, width=width, link_info=link_info
                        ),
                        lo=lo,
                        width=width,
                        buckets=buckets,
                        **params,
                    )
                }
            intervals = []
            for index in range(buckets):
                start = lo + index * width
                intervals.append(
                    {
                        "from": round(start, 6),
                        "to": round(start + width, 6),
                        "count": counts.get(index, 0),
                    }
                )
            # `total - count` is how many objects have no number here. A distribution that silently drops them
            # reads as "the set is 14" when it is 18.
            return {
                "prop": prop,
                "buckets": intervals,
                "min": lo,
                "max": hi,
                "counted": count,
                "total": total,
            }

    with driver.session() as session:
        records = list(
            session.run(
                aggregate_query(
                    label,
                    combined,
                    prop,
                    limit=(limit * limit + 1) if split else limit + 1,
                    link_info=link_info,
                    metric=metric,
                    measure=measure,
                    split=split,
                    compare_where=compare_combined,
                    chronological=chronological,
                ),
                **params,
            )
        )
    if split:
        # `limit` is per axis here: a matrix of 20 values × 20 splits is still one chart, and cutting it at 20 cells
        # would silently drop the right-hand columns.
        cell_limit = limit * limit
        cells = [
            {"value": record["value"], "split": record["split"], "count": record["c"]}
            for record in records[:cell_limit]
        ]
        return {
            "prop": prop,
            "split": split,
            "cells": cells,
            "truncated": len(records) > cell_limit,
        }
    if compare_combined is not None:
        rows = []
        for record in records[:limit]:
            row = {
                "value": record["value"],
                "count": record["c"],
                "baseline": record["base"],
            }
            if metric == "avg":
                row["measure"] = (
                    record["v"] / record["nv"] if record["nv"] else None
                )
                row["baseline_measure"] = (
                    record["basv"] / record["basnv"] if record["basnv"] else None
                )
            elif metric != "count":
                row["measure"] = record["v"]
                row["baseline_measure"] = record["basv"]
            rows.append(row)
        return _chart_result(prop, rows, truncated=len(records) > limit, chronological=chronological)

    rows = [
        {"value": record["value"], "count": record["c"]} for record in records[:limit]
    ]
    if metric == "avg":
        # The query carries a mean as sum + count, so that a comparison can combine two sets without averaging two
        # means. One set, one division, here.
        for row, record in zip(rows, records[:limit], strict=True):
            if record["nv"]:
                row["measure"] = record["v"] / record["nv"]
    elif metric != "count":
        # A value can have objects but no measurement in it; the number is then absent, not zero.
        for row, record in zip(rows, records[:limit], strict=True):
            if record["v"] is not None:
                row["measure"] = record["v"]
    return _chart_result(prop, rows, truncated=len(records) > limit, chronological=chronological)


def _chart_result(
    prop: str, rows: list[dict], *, truncated: bool, chronological: bool
) -> dict:
    """One chart's payload. `order` tells the client to draw a trend instead of a ranking."""
    result: dict = {"prop": prop, "values": rows, "truncated": truncated}
    if chronological:
        result["order"] = "chronological"
    return result


def get_neo4j_node_by_id(
    driver, label: str, columns: list[str], values: list[Any]
) -> dict | None:
    """Return node props dict or None."""
    with driver.session() as session:
        result = session.run(
            f"MATCH (n:{label} {{{_match_map(columns)}}}) RETURN n LIMIT 1",
            **{f"k{i}": value for i, value in enumerate(values)},
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
    label = object_label(obj_type)
    columns = resolve_write_id_columns(obj_type)
    try:
        values = decode_object_id(object_id, columns)
    except ValueError:
        return None

    def _query(driver):
        return get_neo4j_node_by_id(driver, label, columns, values)

    # Best-effort read: an unreachable or mis-configured mirror means "not found" here; the
    # mutation paths below are the ones that report Neo4j failures.
    with boundary("read an object from Neo4j") as failed:
        props = await run_with_neo4j_driver(neo4j_ds, _query)
    return None if failed else props


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
        canonical = object_id_from_props(props, resolve_write_id_columns(obj_type)) or object_id
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

    label = object_label(obj_type)
    columns = resolve_write_id_columns(obj_type)
    rows: list[dict] = []
    for oid in upsert_ids:
        inst = await db.get(ObjectInstance, oid)
        if not inst or inst.object_type_id != obj_type.id:
            continue
        rows.append(instance_row_for_neo4j(obj_type, inst))
    delete_vals: list[list[Any]] = []
    for oid in delete_ids:
        try:
            delete_vals.append(decode_object_id(oid, columns))
        except ValueError:
            continue

    def _run(driver) -> None:
        with driver.session() as session:
            for row in rows:
                merge_object_row_to_neo4j(session, label, columns, row)
            for values in delete_vals:
                delete_object_node(session, label, columns, values)

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


# --- Link instances ---------------------------------------------------------
#
# A link is an edge between two *object* nodes, so both ends are keyed by the same identity the
# object layer writes (`resolve_write_id_column`: `__rid` for hand-created types, the business key
# for dataset-backed ones). Reading a link therefore uses that key too — the endpoint value a link
# reports is the same id the object API shows for that object.


def link_endpoint_keys(
    source_type: ObjectType, target_type: ObjectType
) -> tuple[list[str], list[str]]:
    """The properties each end of a relationship is matched on (1..n per end)."""
    return resolve_write_id_columns(source_type), resolve_write_id_columns(target_type)


def _endpoint_map(side: str, columns: list[str]) -> str:
    """`a: $s0, b: $s1` — the parameter names the callers bind."""
    return ", ".join(f"`{column}`: ${side}{i}" for i, column in enumerate(columns))


def merge_link_between_nodes(
    session,
    *,
    src_label: str,
    tgt_label: str,
    rel_type: str,
    src_columns: list[str],
    tgt_columns: list[str],
    src_values: list[Any],
    tgt_values: list[Any],
) -> bool:
    """MERGE one relationship between two existing nodes. False when an endpoint is missing."""
    params = {f"src_{i}": v for i, v in enumerate(src_values)}
    params.update({f"tgt_{i}": v for i, v in enumerate(tgt_values)})
    result = session.run(
        f"MATCH (a:{src_label} {{{_endpoint_map('src', src_columns)}}}) "
        f"MATCH (b:{tgt_label} {{{_endpoint_map('tgt', tgt_columns)}}}) "
        f"MERGE (a)-[r:{rel_type}]->(b) RETURN count(r) AS c",
        **params,
    )
    row = result.single()
    return bool(row and row["c"])


def delete_link_between_nodes(
    session,
    *,
    src_label: str,
    tgt_label: str,
    rel_type: str,
    src_columns: list[str],
    tgt_columns: list[str],
    src_values: list[Any],
    tgt_values: list[Any],
) -> int:
    """DELETE the relationship(s) between two nodes. Returns how many were removed."""
    params = {f"src_{i}": v for i, v in enumerate(src_values)}
    params.update({f"tgt_{i}": v for i, v in enumerate(tgt_values)})
    result = session.run(
        f"MATCH (a:{src_label} {{{_endpoint_map('src', src_columns)}}})"
        f"-[r:{rel_type}]->"
        f"(b:{tgt_label} {{{_endpoint_map('tgt', tgt_columns)}}}) DELETE r",
        **params,
    )
    return int(result.consume().counters.relationships_deleted)


async def sync_link_instances_to_neo4j(
    db: AsyncSession,
    link_type: LinkType,
    source_type: ObjectType,
    target_type: ObjectType,
    *,
    upsert: list[tuple[str, str]],
    delete: list[tuple[str, str]],
) -> None:
    """Same-request sync of hand-created links: MERGE / delete the edge in the graph.

    No-op when there is no Neo4j data source. Raises ValueError when an endpoint node is not in
    the graph yet — a link to a node nothing can read is worse than a failed write, and the caller
    turns it into "index these types first". Other Neo4j failures propagate as-is.
    """
    if not upsert and not delete:
        return
    neo4j_ds = await get_first_neo4j_datasource(db)
    if not neo4j_ds:
        return

    src_label = object_label(source_type)
    tgt_label = object_label(target_type)
    rel_type = link_rel_type(link_type)
    src_columns, tgt_columns = link_endpoint_keys(source_type, target_type)

    # An object's API id is its (possibly composite) key value(s): `__rid` for hand-created types,
    # the business key columns for dataset-backed ones.
    def _pairs(pairs: list[tuple[str, str]]) -> list[tuple[list[Any], list[Any]]]:
        out: list[tuple[list[Any], list[Any]]] = []
        for source_id, target_id in pairs:
            try:
                out.append(
                    (
                        decode_object_id(source_id, src_columns),
                        decode_object_id(target_id, tgt_columns),
                    )
                )
            except ValueError:
                continue
        return out

    upsert_vals = _pairs(upsert)
    delete_vals = _pairs(delete)
    missing: list[str] = []

    def _run(driver) -> None:
        with driver.session() as session:
            for src_values, tgt_values in upsert_vals:
                if not merge_link_between_nodes(
                    session,
                    src_label=src_label,
                    tgt_label=tgt_label,
                    rel_type=rel_type,
                    src_columns=src_columns,
                    tgt_columns=tgt_columns,
                    src_values=src_values,
                    tgt_values=tgt_values,
                ):
                    missing.append(
                        f"{encode_object_id(src_values)} -> {encode_object_id(tgt_values)}"
                    )
            for src_values, tgt_values in delete_vals:
                delete_link_between_nodes(
                    session,
                    src_label=src_label,
                    tgt_label=tgt_label,
                    rel_type=rel_type,
                    src_columns=src_columns,
                    tgt_columns=tgt_columns,
                    src_values=src_values,
                    tgt_values=tgt_values,
                )

    await run_with_neo4j_driver(neo4j_ds, _run)
    if missing:
        raise ValueError(
            "An endpoint of this link is not in the ontology graph yet ("
            + ", ".join(missing[:3])
            + "). Index the object types, then link them."
        )


# --- Pruning -----------------------------------------------------------------
#
# MERGE-only indexing never removes a node or edge, so a deleted source row leaves a phantom that
# keeps answering queries. Pruning is **opt-in** (`?prune=true`): it deletes what this run did not
# write, which is exactly what a mirror of an owned table wants — and exactly what a hand-maintained
# graph must not do by accident.

PRUNE_KEY_LIMIT = 100_000


def prune_refused_reason(keep: set | list) -> str | None:
    """Why pruning must be skipped, or None when it is safe to run.

    An empty keep-set means the source produced no rows. That is far more often a broken read than
    an instruction to delete every node under the label, so the prune declines and says so.
    """
    if not keep:
        return "the source produced no rows; refusing to delete every node"
    if len(keep) > PRUNE_KEY_LIMIT:
        return f"more than {PRUNE_KEY_LIMIT} keys to keep; prune a mirror type, not a fact table"
    return None


def prune_object_nodes(session, *, label: str, columns: list[str], keep: set[str]) -> int:
    """DETACH DELETE nodes of `label` whose encoded identity is not in `keep`.

    `keep` holds the API ids this run wrote (`encode_object_id`), so a composite key prunes as
    one identity instead of one column at a time.
    """
    # A node **without** the identity column cannot be the object it claims to be — and `NOT toString(null) IN
    # $keep` is null, so it would survive the comparison. Those are the orphan shells left by a writer that merged
    # on a different column; deleting them is the point of pruning a mirror.
    if len(columns) == 1:
        result = session.run(
            f"MATCH (n:{label}) "
            f"WHERE n.`{columns[0]}` IS NULL OR NOT toString(n.`{columns[0]}`) IN $keep "
            "DETACH DELETE n",
            keep=list(keep),
        )
        return int(result.consume().counters.nodes_deleted)
    # Composite: keep-list is encoded ids, so compare against the node's encoded key.
    parts = " + '|' + ".join(
        f"toString(n.`{column}`)" for column in columns
    )
    missing = " OR ".join(f"n.`{column}` IS NULL" for column in columns)
    result = session.run(
        f"MATCH (n:{label}) WHERE {missing} OR NOT ({parts}) IN $keep DETACH DELETE n",
        keep=list(keep),
    )
    return int(result.consume().counters.nodes_deleted)


def prune_link_relationships(
    session,
    *,
    src_label: str,
    tgt_label: str,
    rel_type: str,
    src_key: str,
    tgt_key: str,
    keep: set,
) -> int:
    """DELETE edges of this type whose endpoint pair was not written. Returns edges deleted."""
    pairs = [[str(src), str(tgt)] for src, tgt in keep]
    result = session.run(
        f"MATCH (a:{src_label})-[r:{rel_type}]->(b:{tgt_label}) "
        f"WHERE NOT [toString(a.`{src_key}`), toString(b.`{tgt_key}`)] IN $keep "
        f"DELETE r",
        keep=pairs,
    )
    return int(result.consume().counters.relationships_deleted)
