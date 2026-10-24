"""Delete duplicate graph nodes for one object type, keeping one per key.

Hand-created object types (no backing dataset) picked up a second generation of nodes in an earlier
indexing experiment: the same object appears once with a ``__rid`` property and once without. The
copy without ``__rid`` is also the one the object API cannot address (its instance id renders as
"-"), so it is noise in every list. This removes those copies.

Edges are carried over: before an extra node goes, each of its relationships is MERGEd onto the
keeper, so nothing a duplicate was pointing at is lost. The full property set of every deleted node
is written to ``/tmp/dedupe_object_nodes.json`` first.

    uv run python scripts/dedupe_object_nodes.py --label AlphaFactor            # dry run
    uv run python scripts/dedupe_object_nodes.py --label AlphaFactor --apply

The Neo4j data source is the deployment's default; pass ``--data-source-id`` to override.
"""

from __future__ import annotations

import argparse
import asyncio
import collections
import json
import sys

from sqlalchemy import select

from app.database import async_session_maker
from app.models.data_source import DataSource
from app.models.object_type import ObjectType
from app.services.ontology.neo4j_async import run_with_neo4j_driver

SNAPSHOT = "/tmp/dedupe_object_nodes.json"


def _key_predicate(keys: list[str], var: str = "k") -> str:
    return " AND ".join(f"{var}.`{k}` = $k{i}" for i, k in enumerate(keys))


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True, help="Neo4j label, e.g. AlphaFactor")
    parser.add_argument("--data-source-id", default=None)
    parser.add_argument("--apply", action="store_true", help="delete; otherwise only report")
    args = parser.parse_args()

    async with async_session_maker() as db:
        if args.data_source_id:
            ds = await db.get(DataSource, args.data_source_id)
        else:
            # Only guess when there is nothing to guess between.
            candidates = (
                await db.execute(select(DataSource).where(DataSource.kind == "neo4j"))
            ).scalars().all()
            if len(candidates) != 1:
                raise SystemExit(
                    f"pass --data-source-id: {len(candidates)} Neo4j sources configured"
                )
            ds = candidates[0]
        if ds is None:
            raise SystemExit(f"unknown data source {args.data_source_id}")
        object_type = (
            await db.execute(select(ObjectType).where(ObjectType.neo4j_label == args.label))
        ).scalars().first()
        if object_type is None:
            raise SystemExit(f"no object type with neo4j label {args.label}")
        keys = list(object_type.key_properties or ["name"])

    def find(driver):
        with driver.session() as s:
            return s.run(
                f"MATCH (f:`{args.label}`) "
                f"RETURN elementId(f) AS eid, f.__rid AS rid, properties(f) AS props"
            ).data()

    rows = await run_with_neo4j_driver(ds, find)
    by_key: dict[tuple, list[dict]] = collections.defaultdict(list)
    for row in rows:
        by_key[tuple(str(row["props"].get(k)) for k in keys)].append(row)

    doomed: list[dict] = []
    kept: list[dict] = []
    for key, nodes in by_key.items():
        nodes.sort(key=lambda n: (n["rid"] is None, n["rid"] or ""))  # rid-bearing first
        keeper, extras = nodes[0], nodes[1:]
        if keeper["rid"] is None and extras:
            print(f"  ! {key} has no rid-bearing node; keeping the first anyway", file=sys.stderr)
        kept.append(keeper)
        doomed.extend(extras)

    print(f"{len(rows)} nodes · {len(by_key)} keys · keep {len(kept)} · delete {len(doomed)}")
    for node in doomed:
        print("  -", {k: node["props"].get(k) for k in keys})
    with open(SNAPSHOT, "w") as fh:
        json.dump(doomed, fh, ensure_ascii=False, indent=1, default=str)
    print(f"snapshot: {SNAPSHOT}")

    if not args.apply or not doomed:
        if not args.apply:
            print("dry run: pass --apply to delete")
        return

    def move_and_delete(driver):
        moved = deleted = 0
        with driver.session() as s:
            for node in doomed:
                key = {f"k{i}": node["props"].get(k) for i, k in enumerate(keys)}
                # Re-attach the keeper to everything the duplicate touched, in the same direction.
                for name, pattern in (("in", "(a)-[r]->(f)"), ("out", "(f)-[r]->(b)")):
                    rows_edges = s.run(
                        f"MATCH (f) WHERE elementId(f) = $eid MATCH {pattern} "
                        "RETURN type(r) AS rel, elementId(a) AS other",
                        eid=node["eid"],
                    ).data() if name == "in" else s.run(
                        f"MATCH (f) WHERE elementId(f) = $eid MATCH {pattern} "
                        "RETURN type(r) AS rel, elementId(b) AS other",
                        eid=node["eid"],
                    ).data()
                    for edge in rows_edges:
                        other = edge["other"]
                        if name == "in":
                            s.run(
                                f"MATCH (k:`{args.label}`) WHERE {_key_predicate(keys)} "
                                "MATCH (o) WHERE elementId(o) = $other "
                                f"MERGE (o)-[:`{edge['rel']}`]->(k)",
                                other=other,
                                **key,
                            )
                        else:
                            s.run(
                                f"MATCH (k:`{args.label}`) WHERE {_key_predicate(keys)} "
                                "MATCH (o) WHERE elementId(o) = $other "
                                f"MERGE (k)-[:`{edge['rel']}`]->(o)",
                                other=other,
                                **key,
                            )
                        moved += 1
                deleted += s.run(
                    "MATCH (f) WHERE elementId(f) = $eid DETACH DELETE f RETURN 1 AS gone",
                    eid=node["eid"],
                ).single()["gone"]
        return moved, deleted

    moved, deleted = await run_with_neo4j_driver(ds, move_and_delete)
    print(f"deleted {deleted} nodes · re-attached {moved} edges to their keepers")

    def verify(driver):
        with driver.session() as s:
            return s.run(
                f"MATCH (f:`{args.label}`) "
                "RETURN count(f) AS nodes, count(DISTINCT f.__rid) AS rids"
            ).single().data()

    print("after:", await run_with_neo4j_driver(ds, verify))


if __name__ == "__main__":
    asyncio.run(main())
