"""ontology groups — list/get/create/update."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def _parse_json_arg(label: str, value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError as e:
        print(f"--{label}: invalid JSON ({e})", file=sys.stderr)
        sys.exit(2)


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/ontology/groups")
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/ontology/groups/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"display_name": ns.display_name}
    if ns.description:
        body["description"] = ns.description
    if ns.object_type_ids_json:
        body["object_type_ids"] = _parse_json_arg("object-type-ids-json", ns.object_type_ids_json)
    confirm_or_abort(
        action=f"create ontology group {ns.display_name!r}",
        method="POST",
        path="/api/ontology/groups",
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/ontology/groups", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.display_name is not None:
        body["display_name"] = ns.display_name
    if ns.description is not None:
        body["description"] = ns.description
    if ns.object_type_ids_json is not None:
        body["object_type_ids"] = _parse_json_arg("object-type-ids-json", ns.object_type_ids_json)
    if not body:
        print("update: nothing to update", file=sys.stderr)
        sys.exit(2)
    path = f"/api/ontology/groups/{ns.id}"
    confirm_or_abort(
        action=f"update ontology group {ns.id}",
        method="PATCH",
        path=path,
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("groups", help="Ontology groups")
    sp = p.add_subparsers(dest="og_cmd", required=True)

    sp.add_parser("list", help="List groups").set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get group")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    cr = sp.add_parser("create", help="Create group")
    cr.add_argument("--display-name", required=True)
    cr.add_argument("--description", default=None)
    cr.add_argument("--object-type-ids-json", default=None, help='JSON array of object type ids')
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    up = sp.add_parser("update", help="Patch group")
    up.add_argument("--id", required=True)
    up.add_argument("--display-name", default=None)
    up.add_argument("--description", default=None)
    up.add_argument("--object-type-ids-json", default=None)
    add_write_flags(up)
    up.set_defaults(fn=cmd_update)
