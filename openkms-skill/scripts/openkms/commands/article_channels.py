"""article-channels — list / create."""
from __future__ import annotations

import argparse
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/article-channels")
    r.raise_for_status()
    print_json(r.json())


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


def add_subparser(sub) -> None:
    p = sub.add_parser("article-channels", help="Article channels")
    sp = p.add_subparsers(dest="acl_cmd", required=True)
    sp.add_parser("list", help="List tree").set_defaults(fn=cmd_list)
    c = sp.add_parser("create", help="Create channel")
    c.add_argument("--name", required=True)
    c.add_argument("--description", default="")
    c.add_argument("--parent-id", default="")
    c.add_argument("--sort-order", type=int, default=0)
    add_write_flags(c)
    c.set_defaults(fn=cmd_create)
