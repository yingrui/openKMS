"""article-channels — list / create / update."""
from __future__ import annotations

import argparse
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def _print_tree(channels: list[dict], indent: int = 0) -> None:
    for c in channels:
        prefix = "  " * indent + "├─ " if indent > 0 else ""
        print(f"{prefix}{c['name']}  ({c['id']})")
        if c.get("children"):
            _print_tree(c["children"], indent + 1)


def cmd_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/article-channels")
    r.raise_for_status()
    data = r.json()
    if ns.tree:
        _print_tree(data)
    else:
        print_json(data)


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name, "sort_order": ns.sort_order}
    if ns.description:
        body["description"] = ns.description
    if ns.parent_id:
        body["parent_id"] = ns.parent_id
    confirm_or_abort(
        "create article channel",
        "POST",
        "/api/article-channels",
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/article-channels", json=body)
    r.raise_for_status()
    print_json(r.json())


def _article_update_body(ns: argparse.Namespace) -> dict[str, Any]:
    body: dict[str, Any] = {}
    if ns.name is not None:
        body["name"] = ns.name
    if ns.description is not None:
        body["description"] = ns.description
    if ns.parent_id is not None:
        body["parent_id"] = ns.parent_id
    if ns.sort_order is not None:
        body["sort_order"] = ns.sort_order
    return body


def cmd_update(ns: argparse.Namespace) -> None:
    body = _article_update_body(ns)
    path = f"/api/article-channels/{ns.id}"
    confirm_or_abort(
        "update article channel",
        "PUT",
        path,
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("article-channels", help="Article channels")
    sp = p.add_subparsers(dest="acl_cmd", required=True)
    lp = sp.add_parser("list", help="List channel tree (JSON or --tree)")
    lp.add_argument("--tree", action="store_true", help="Print indented tree to stdout instead of JSON")
    lp.set_defaults(fn=cmd_list)
    c = sp.add_parser("create", help="Create channel")
    c.add_argument("--name", required=True)
    c.add_argument("--description", default="")
    c.add_argument("--parent-id", default="")
    c.add_argument("--sort-order", type=int, default=0)
    add_write_flags(c)
    c.set_defaults(fn=cmd_create)
    u = sp.add_parser("update", help="Update channel (rename, reparent, sort_order)")
    u.add_argument("--id", required=True)
    u.add_argument("--name", default=None)
    u.add_argument("--description", default=None)
    u.add_argument("--parent-id", default=None)
    u.add_argument("--sort-order", type=int, default=None)
    add_write_flags(u)
    u.set_defaults(fn=cmd_update)
