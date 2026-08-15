"""data-sources — list / get / create / test (no neo4j-delete-all)."""
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


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit is not None:
        params["limit"] = ns.limit
    if ns.offset is not None:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get("/api/data-sources", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/data-sources/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "name": ns.name,
        "kind": ns.kind,
        "host": ns.host,
        "username": ns.username,
    }
    if ns.port is not None:
        body["port"] = ns.port
    if ns.database is not None:
        body["database"] = ns.database
    if ns.password is not None:
        body["password"] = ns.password
    if ns.options_json:
        body["options"] = _parse_json_arg("options-json", ns.options_json)

    confirm_or_abort(
        action=f"create data source {ns.name!r}",
        method="POST",
        path="/api/data-sources",
        body={**body, "password": "***" if body.get("password") else None},
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/data-sources", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_test(ns: argparse.Namespace) -> None:
    path = f"/api/data-sources/{ns.id}/test"
    confirm_or_abort(
        action=f"test data source {ns.id}",
        method="POST",
        path=path,
        body=None,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(path)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("data-sources", help="Data sources (PostgreSQL / Neo4j)")
    sp = p.add_subparsers(dest="ds_cmd", required=True)

    ls = sp.add_parser("list", help="List data sources (GET /api/data-sources)")
    ls.add_argument("--limit", type=int, default=None)
    ls.add_argument("--offset", type=int, default=None)
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get one data source")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    cr = sp.add_parser("create", help="Create data source")
    cr.add_argument("--name", required=True)
    cr.add_argument("--kind", required=True, help="postgresql | neo4j")
    cr.add_argument("--host", required=True)
    cr.add_argument("--port", type=int, default=None)
    cr.add_argument("--database", default=None)
    cr.add_argument("--username", required=True)
    cr.add_argument("--password", default=None)
    cr.add_argument("--options-json", default=None, help="JSON object for options")
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    te = sp.add_parser("test", help="Test connection (POST …/test)")
    te.add_argument("--id", required=True)
    add_write_flags(te)
    te.set_defaults(fn=cmd_test)
