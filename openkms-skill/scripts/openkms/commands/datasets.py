"""datasets — list / get / rows / metadata / create."""
from __future__ import annotations

import argparse
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str] = {}
    if ns.data_source_id:
        params["data_source_id"] = ns.data_source_id
    with client() as s:
        r = s.get("/api/datasets", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_rows(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit is not None:
        params["limit"] = ns.limit
    if ns.offset is not None:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}/rows", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_metadata(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}/metadata")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "data_source_id": ns.data_source_id,
        "schema_name": ns.schema_name,
        "table_name": ns.table_name,
    }
    if ns.display_name:
        body["display_name"] = ns.display_name
    confirm_or_abort(
        action=f"create dataset {ns.schema_name}.{ns.table_name}",
        method="POST",
        path="/api/datasets",
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/datasets", json=body)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("datasets", help="Ontology / connector datasets")
    sp = p.add_subparsers(dest="dset_cmd", required=True)

    ls = sp.add_parser("list", help="List datasets")
    ls.add_argument("--data-source-id", default=None)
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get dataset")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    rows = sp.add_parser("rows", help="Paginated rows (GET …/rows)")
    rows.add_argument("--id", required=True)
    rows.add_argument("--limit", type=int, default=None)
    rows.add_argument("--offset", type=int, default=None)
    rows.set_defaults(fn=cmd_rows)

    md = sp.add_parser("metadata", help="Column metadata (GET …/metadata)")
    md.add_argument("--id", required=True)
    md.set_defaults(fn=cmd_metadata)

    cr = sp.add_parser("create", help="Register dataset row (POST /api/datasets)")
    cr.add_argument("--data-source-id", required=True)
    cr.add_argument("--schema-name", required=True)
    cr.add_argument("--table-name", required=True)
    cr.add_argument("--display-name", default=None)
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)
