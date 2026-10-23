"""objects — object types + object instances + Neo4j sync.

Wraps backend routes under /api/object-types/*. Every write subcommand requires
explicit confirmation (--yes, --dry-run, or interactive y/N on a TTY).
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from ..client import client
from .._confirm import add_write_flags, confirm_or_abort
from .._io import print_json


def _parse_json_arg(label: str, value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError as e:
        print(f"--{label}: invalid JSON ({e})", file=sys.stderr)
        sys.exit(2)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str | bool] = {}
    if ns.master_data_only:
        params["is_master_data"] = "true"
    if ns.count_from_neo4j:
        params["count_from_neo4j"] = "true"
    with client() as s:
        r = s.get("/api/object-types", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    params = {"count_from_neo4j": "true"} if ns.count_from_neo4j else None
    with client() as s:
        r = s.get(f"/api/object-types/{ns.id}", params=params)
    r.raise_for_status()
    print_json(r.json())


def cmd_instances_list(ns: argparse.Namespace) -> None:
    params: dict[str, str | int] = {}
    if ns.search:
        params["search"] = ns.search
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(f"/api/object-types/{ns.type_id}/objects", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_instances_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/object-types/{ns.type_id}/objects/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


# ---------------------------------------------------------------------------
# Write — types
# ---------------------------------------------------------------------------
def cmd_create_type(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name, "is_master_data": bool(ns.is_master_data)}
    if getattr(ns, "api_name", ""):
        body["api_name"] = ns.api_name
    if ns.description:
        body["description"] = ns.description
    if ns.dataset_id:
        body["dataset_id"] = ns.dataset_id
    if ns.key_properties:
        body["key_properties"] = [k.strip() for k in ns.key_properties.split(",") if k.strip()]
    if ns.display_property:
        body["display_property"] = ns.display_property
    if ns.properties_json:
        body["properties"] = _parse_json_arg("properties-json", ns.properties_json)

    confirm_or_abort(
        action=f"create object type {ns.name!r}",
        method="POST",
        path="/api/object-types",
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/object-types", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_update_type(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.name is not None:
        body["name"] = ns.name
    if getattr(ns, "api_name", None) is not None:
        body["api_name"] = ns.api_name
    if ns.description is not None:
        body["description"] = ns.description
    if ns.dataset_id is not None:
        body["dataset_id"] = ns.dataset_id
    if ns.key_properties is not None:
        body["key_properties"] = [
            k.strip() for k in ns.key_properties.split(",") if k.strip()
        ]
    if ns.is_master_data is not None:
        body["is_master_data"] = bool(ns.is_master_data)
    if ns.display_property is not None:
        body["display_property"] = ns.display_property
    if ns.properties_json is not None:
        body["properties"] = _parse_json_arg("properties-json", ns.properties_json)

    if not body:
        print("update-type: nothing to update (no fields supplied)", file=sys.stderr)
        sys.exit(2)

    path = f"/api/object-types/{ns.id}"
    confirm_or_abort(
        action=f"update object type {ns.id}",
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
    path = f"/api/object-types/{ns.id}"
    confirm_or_abort(
        action=f"delete object type {ns.id}",
        method="DELETE",
        path=path,
        body=None,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted object type {ns.id}")


# ---------------------------------------------------------------------------
# Write — instances
# ---------------------------------------------------------------------------
def cmd_instances_create(ns: argparse.Namespace) -> None:
    data = _parse_json_arg("data-json", ns.data_json)
    if not isinstance(data, dict):
        print("--data-json: must be a JSON object", file=sys.stderr)
        sys.exit(2)
    body = {"data": data}
    path = f"/api/object-types/{ns.type_id}/objects"
    confirm_or_abort(
        action=f"create object instance under type {ns.type_id}",
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


def cmd_instances_update(ns: argparse.Namespace) -> None:
    data = _parse_json_arg("data-json", ns.data_json)
    if not isinstance(data, dict):
        print("--data-json: must be a JSON object", file=sys.stderr)
        sys.exit(2)
    body = {"data": data}
    path = f"/api/object-types/{ns.type_id}/objects/{ns.id}"
    confirm_or_abort(
        action=f"update object instance {ns.id}",
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


def cmd_instances_delete(ns: argparse.Namespace) -> None:
    path = f"/api/object-types/{ns.type_id}/objects/{ns.id}"
    confirm_or_abort(
        action=f"delete object instance {ns.id}",
        method="DELETE",
        path=path,
        body=None,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted object instance {ns.id}")


# ---------------------------------------------------------------------------
# Write — Neo4j sync
# ---------------------------------------------------------------------------
def _sync_path(base: str, prune: bool) -> str:
    return f"{base}?prune=true" if prune else base


def cmd_sync_neo4j(ns: argparse.Namespace) -> None:
    body = {"neo4j_data_source_id": ns.neo4j_data_source_id}
    path = _sync_path("/api/object-types/index-to-neo4j", bool(getattr(ns, "prune", False)))
    confirm_or_abort(
        action="sync object types to Neo4j (MERGE nodes"
        + (", delete nodes whose source row is gone)" if getattr(ns, "prune", False) else ")"),
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


def cmd_sync_neo4j_type(ns: argparse.Namespace) -> None:
    body = {"neo4j_data_source_id": ns.neo4j_data_source_id}
    path = _sync_path(
        f"/api/object-types/{ns.type_id}/index-to-neo4j", bool(getattr(ns, "prune", False))
    )
    confirm_or_abort(
        action=f"sync object type {ns.type_id!r} to Neo4j (MERGE nodes)",
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


# ---------------------------------------------------------------------------
# argparse wiring
# ---------------------------------------------------------------------------
def add_subparser(sub) -> None:
    p = sub.add_parser("objects", help="Object types + instances (PostgreSQL ontology layer)")
    sp = p.add_subparsers(dest="obj_cmd", required=True)

    # ---- Read ----
    ls = sp.add_parser("list", help="List object types (GET /api/object-types)")
    ls.add_argument("--master-data-only", action="store_true")
    ls.add_argument("--count-from-neo4j", action="store_true")
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get object type (GET /api/object-types/{id})")
    gt.add_argument("--id", required=True)
    gt.add_argument("--count-from-neo4j", action="store_true")
    gt.set_defaults(fn=cmd_get)

    # ---- Write — types ----
    ct = sp.add_parser("create-type", help="Create object type (POST /api/object-types)")
    ct.add_argument("--name", required=True)
    ct.add_argument(
        "--api-name",
        default="",
        help=(
            "Frozen identifier code/Cypher use (client(\"WorkItem\"), MATCH (n:WorkItem)). "
            "Generated from --name when it has ASCII parts; REQUIRED for a name with none (e.g. 中文)."
        ),
    )
    ct.add_argument("--description", default="")
    ct.add_argument("--dataset-id", default="")
    ct.add_argument(
        "--key-properties",
        default="",
        help="comma-separated columns that identify an object, e.g. portfolio_id,ts_code",
    )
    ct.add_argument("--is-master-data", action="store_true")
    ct.add_argument("--display-property", default="")
    ct.add_argument(
        "--properties-json",
        default="",
        help='JSON array, e.g. \'[{"name":"icd_code","type":"string","required":false}]\'',
    )
    add_write_flags(ct)
    ct.set_defaults(fn=cmd_create_type)

    ut = sp.add_parser("update-type", help="Update object type (PUT /api/object-types/{id})")
    ut.add_argument("--id", required=True)
    ut.add_argument(
        "--api-name",
        default=None,
        help="Only claimable while the row has none (it is otherwise frozen → 400).",
    )
    ut.add_argument("--name", default=None)
    ut.add_argument("--description", default=None)
    ut.add_argument("--dataset-id", default=None)
    ut.add_argument(
        "--key-properties",
        default=None,
        help="comma-separated columns; empty string clears the key",
    )
    ut.add_argument("--is-master-data", type=lambda s: s.lower() in ("1", "true", "yes"), default=None)
    ut.add_argument("--display-property", default=None)
    ut.add_argument("--properties-json", default=None)
    add_write_flags(ut)
    ut.set_defaults(fn=cmd_update_type)

    dt = sp.add_parser("delete-type", help="Delete object type (DELETE /api/object-types/{id})")
    dt.add_argument("--id", required=True)
    add_write_flags(dt)
    dt.set_defaults(fn=cmd_delete_type)

    # ---- Read — instances ----
    inst = sp.add_parser("instances", help="Object instances under a type")
    isp = inst.add_subparsers(dest="inst_cmd", required=True)

    ils = isp.add_parser("list", help="List instances (GET /api/object-types/{id}/objects)")
    ils.add_argument("--type-id", required=True)
    ils.add_argument("--search", default="")
    ils.add_argument("--limit", type=int, default=0)
    ils.add_argument("--offset", type=int, default=0)
    ils.set_defaults(fn=cmd_instances_list)

    igt = isp.add_parser("get", help="Get instance (GET /api/object-types/{type-id}/objects/{id})")
    igt.add_argument("--type-id", required=True)
    igt.add_argument("--id", required=True)
    igt.set_defaults(fn=cmd_instances_get)

    # ---- Write — instances ----
    icr = isp.add_parser("create", help="Create instance (POST /api/object-types/{id}/objects)")
    icr.add_argument("--type-id", required=True)
    icr.add_argument("--data-json", required=True, help='JSON object of property values')
    add_write_flags(icr)
    icr.set_defaults(fn=cmd_instances_create)

    iup = isp.add_parser("update", help="Update instance (PUT /api/object-types/{type-id}/objects/{id})")
    iup.add_argument("--type-id", required=True)
    iup.add_argument("--id", required=True)
    iup.add_argument("--data-json", required=True)
    add_write_flags(iup)
    iup.set_defaults(fn=cmd_instances_update)

    idl = isp.add_parser("delete", help="Delete instance (DELETE /api/object-types/{type-id}/objects/{id})")
    idl.add_argument("--type-id", required=True)
    idl.add_argument("--id", required=True)
    add_write_flags(idl)
    idl.set_defaults(fn=cmd_instances_delete)

    # ---- Write — sync ----
    sn = sp.add_parser(
        "sync-neo4j",
        help="MERGE all indexable object types into Neo4j (POST /api/object-types/index-to-neo4j): dataset rows or stored instances",
    )
    sn.add_argument(
        "--prune",
        action="store_true",
        help="Also delete graph entries the source no longer has (a type that mirrors an owned table)",
    )
    sn.add_argument(
        "--neo4j-data-source-id",
        required=True,
        help="Required Neo4j data source id (discover via: data-sources list)",
    )
    add_write_flags(sn)
    sn.set_defaults(fn=cmd_sync_neo4j)

    snt = sp.add_parser(
        "sync-neo4j-type",
        help="MERGE one object type into Neo4j (POST /api/object-types/{id}/index-to-neo4j)",
    )
    snt.add_argument("--type-id", required=True)
    snt.add_argument(
        "--prune",
        action="store_true",
        help="Also delete graph entries the source no longer has (a type that mirrors an owned table)",
    )
    snt.add_argument(
        "--neo4j-data-source-id",
        required=True,
        help="Required Neo4j data source id (discover via: data-sources list)",
    )
    add_write_flags(snt)
    snt.set_defaults(fn=cmd_sync_neo4j_type)
