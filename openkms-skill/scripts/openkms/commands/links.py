"""links — link types + link instances + Neo4j sync.

Wraps backend routes under /api/link-types/*. Every write subcommand requires
explicit confirmation (--yes, --dry-run, or interactive y/N on a TTY).

Note: when a link type is m2m and dataset-backed, the server rejects POST/DELETE
on instances (the junction dataset is the source of truth). Surface those 4xx
errors instead of trying to bypass.
"""
from __future__ import annotations

import argparse
import sys
from typing import Any

from ..client import client
from .._confirm import add_write_flags, confirm_or_abort
from .._io import print_json


CARDINALITY_CHOICES = ("one-to-one", "one-to-many", "many-to-one", "many-to-many")


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
def cmd_list(ns: argparse.Namespace) -> None:
    params = {"count_from_neo4j": "true"} if ns.count_from_neo4j else None
    with client() as s:
        r = s.get("/api/link-types", params=params)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    params = {"count_from_neo4j": "true"} if ns.count_from_neo4j else None
    with client() as s:
        r = s.get(f"/api/link-types/{ns.id}", params=params)
    r.raise_for_status()
    print_json(r.json())


def cmd_instances_list(ns: argparse.Namespace) -> None:
    params: dict[str, str | int] = {}
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(f"/api/link-types/{ns.type_id}/links", params=params or None)
    r.raise_for_status()
    print_json(r.json())


# ---------------------------------------------------------------------------
# Write — types
# ---------------------------------------------------------------------------
def cmd_create_type(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "name": ns.name,
        "source_object_type_id": ns.source_type_id,
        "target_object_type_id": ns.target_type_id,
        "cardinality": ns.cardinality,
    }
    if ns.description:
        body["description"] = ns.description
    if ns.dataset_id:
        body["dataset_id"] = ns.dataset_id
    if ns.source_key_property:
        body["source_key_property"] = ns.source_key_property
    if ns.target_key_property:
        body["target_key_property"] = ns.target_key_property
    if ns.source_dataset_column:
        body["source_dataset_column"] = ns.source_dataset_column
    if ns.target_dataset_column:
        body["target_dataset_column"] = ns.target_dataset_column

    confirm_or_abort(
        action=f"create link type {ns.name!r}",
        method="POST",
        path="/api/link-types",
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/link-types", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_update_type(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    for arg, key in (
        ("name", "name"),
        ("description", "description"),
        ("source_type_id", "source_object_type_id"),
        ("target_type_id", "target_object_type_id"),
        ("cardinality", "cardinality"),
        ("dataset_id", "dataset_id"),
        ("source_key_property", "source_key_property"),
        ("target_key_property", "target_key_property"),
        ("source_dataset_column", "source_dataset_column"),
        ("target_dataset_column", "target_dataset_column"),
    ):
        v = getattr(ns, arg)
        if v is not None:
            body[key] = v

    if not body:
        print("update-type: nothing to update (no fields supplied)", file=sys.stderr)
        sys.exit(2)

    path = f"/api/link-types/{ns.id}"
    confirm_or_abort(
        action=f"update link type {ns.id}",
        method="PUT",
        path=path,
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_delete_type(ns: argparse.Namespace) -> None:
    path = f"/api/link-types/{ns.id}"
    confirm_or_abort(
        action=f"delete link type {ns.id}",
        method="DELETE",
        path=path,
        body=None,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted link type {ns.id}")


# ---------------------------------------------------------------------------
# Write — instances
# ---------------------------------------------------------------------------
def cmd_instances_create(ns: argparse.Namespace) -> None:
    body = {
        "source_object_id": ns.source_object_id,
        "target_object_id": ns.target_object_id,
    }
    path = f"/api/link-types/{ns.type_id}/links"
    confirm_or_abort(
        action=f"create link instance ({ns.source_object_id} -> {ns.target_object_id})",
        method="POST",
        path=path,
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_instances_delete(ns: argparse.Namespace) -> None:
    path = f"/api/link-types/{ns.type_id}/links/{ns.id}"
    confirm_or_abort(
        action=f"delete link instance {ns.id}",
        method="DELETE",
        path=path,
        body=None,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted link instance {ns.id}")


# ---------------------------------------------------------------------------
# Write — Neo4j sync
# ---------------------------------------------------------------------------
def cmd_sync_neo4j(ns: argparse.Namespace) -> None:
    body = {"neo4j_data_source_id": ns.neo4j_data_source_id}
    confirm_or_abort(
        action="sync link types to Neo4j (MERGE relationships)",
        method="POST",
        path="/api/link-types/index-to-neo4j",
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/link-types/index-to-neo4j", json=body)
    r.raise_for_status()
    print_json(r.json())


# ---------------------------------------------------------------------------
# argparse wiring
# ---------------------------------------------------------------------------
def add_subparser(sub) -> None:
    p = sub.add_parser("links", help="Link types + instances (PostgreSQL ontology layer)")
    sp = p.add_subparsers(dest="link_cmd", required=True)

    # ---- Read ----
    ls = sp.add_parser("list", help="List link types (GET /api/link-types)")
    ls.add_argument("--count-from-neo4j", action="store_true")
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get link type (GET /api/link-types/{id})")
    gt.add_argument("--id", required=True)
    gt.add_argument("--count-from-neo4j", action="store_true")
    gt.set_defaults(fn=cmd_get)

    # ---- Write — types ----
    ct = sp.add_parser("create-type", help="Create link type (POST /api/link-types)")
    ct.add_argument("--name", required=True)
    ct.add_argument("--source-type-id", required=True)
    ct.add_argument("--target-type-id", required=True)
    ct.add_argument("--cardinality", default="one-to-many", choices=CARDINALITY_CHOICES)
    ct.add_argument("--description", default="")
    ct.add_argument("--dataset-id", default="")
    ct.add_argument("--source-key-property", default="")
    ct.add_argument("--target-key-property", default="")
    ct.add_argument("--source-dataset-column", default="")
    ct.add_argument("--target-dataset-column", default="")
    add_write_flags(ct)
    ct.set_defaults(fn=cmd_create_type)

    ut = sp.add_parser("update-type", help="Update link type (PUT /api/link-types/{id})")
    ut.add_argument("--id", required=True)
    ut.add_argument("--name", default=None)
    ut.add_argument("--description", default=None)
    ut.add_argument("--source-type-id", default=None)
    ut.add_argument("--target-type-id", default=None)
    ut.add_argument(
        "--cardinality",
        default=None,
        help=f"one of {CARDINALITY_CHOICES}",  # not validated client-side; server rejects invalid values
    )
    ut.add_argument("--dataset-id", default=None)
    ut.add_argument("--source-key-property", default=None)
    ut.add_argument("--target-key-property", default=None)
    ut.add_argument("--source-dataset-column", default=None)
    ut.add_argument("--target-dataset-column", default=None)
    add_write_flags(ut)
    ut.set_defaults(fn=cmd_update_type)

    dt = sp.add_parser("delete-type", help="Delete link type (DELETE /api/link-types/{id})")
    dt.add_argument("--id", required=True)
    add_write_flags(dt)
    dt.set_defaults(fn=cmd_delete_type)

    # ---- Read — instances ----
    inst = sp.add_parser("instances", help="Link instances under a type")
    isp = inst.add_subparsers(dest="inst_cmd", required=True)

    ils = isp.add_parser("list", help="List instances (GET /api/link-types/{id}/links)")
    ils.add_argument("--type-id", required=True)
    ils.add_argument("--limit", type=int, default=0)
    ils.add_argument("--offset", type=int, default=0)
    ils.set_defaults(fn=cmd_instances_list)

    # ---- Write — instances ----
    icr = isp.add_parser(
        "create",
        help="Create instance (POST /api/link-types/{id}/links). 4xx if type is m2m+dataset.",
    )
    icr.add_argument("--type-id", required=True)
    icr.add_argument("--source-object-id", required=True)
    icr.add_argument("--target-object-id", required=True)
    add_write_flags(icr)
    icr.set_defaults(fn=cmd_instances_create)

    idl = isp.add_parser("delete", help="Delete instance (DELETE /api/link-types/{type-id}/links/{id})")
    idl.add_argument("--type-id", required=True)
    idl.add_argument("--id", required=True)
    add_write_flags(idl)
    idl.set_defaults(fn=cmd_instances_delete)

    # ---- Write — sync ----
    sn = sp.add_parser(
        "sync-neo4j",
        help="MERGE all link instances into Neo4j (POST /api/link-types/index-to-neo4j)",
    )
    sn.add_argument("--neo4j-data-source-id", required=True)
    add_write_flags(sn)
    sn.set_defaults(fn=cmd_sync_neo4j)
