"""comments — list / create / reply / update / delete."""
from __future__ import annotations

import argparse
import sys
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json

_RESOURCE_TYPES = ("article", "document", "knowledge_base", "wiki_space", "project")


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str | int] = {
        "resource_type": ns.resource_type,
        "resource_id": ns.resource_id,
    }
    if ns.limit is not None:
        params["limit"] = ns.limit
    if ns.offset is not None:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get("/api/comments", params=params)
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "resource_type": ns.resource_type,
        "resource_id": ns.resource_id,
        "body": ns.body,
        "rank": ns.rank,
    }
    confirm_or_abort("create comment", "POST", "/api/comments", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/comments", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_reply(ns: argparse.Namespace) -> None:
    path = f"/api/comments/{ns.id}/replies"
    body = {"body": ns.body}
    confirm_or_abort("reply to comment", "POST", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.body is not None:
        body["body"] = ns.body
    if ns.rank is not None:
        body["rank"] = ns.rank
    if not body:
        print("update: nothing to update", file=sys.stderr)
        sys.exit(2)
    path = f"/api/comments/{ns.id}"
    confirm_or_abort("update comment", "PATCH", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/comments/{ns.id}"
    confirm_or_abort("delete comment", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted comment {ns.id}")


def add_subparser(sub) -> None:
    p = sub.add_parser("comments", help="Comments and ratings on resources")
    sp = p.add_subparsers(dest="cm_cmd", required=True)

    ls = sp.add_parser("list", help="List comments for a resource")
    ls.add_argument("--resource-type", required=True, choices=_RESOURCE_TYPES)
    ls.add_argument("--resource-id", required=True)
    ls.add_argument("--limit", type=int, default=None)
    ls.add_argument("--offset", type=int, default=None)
    ls.set_defaults(fn=cmd_list)

    cr = sp.add_parser("create", help="Create top-level comment with rank 0–5")
    cr.add_argument("--resource-type", required=True, choices=_RESOURCE_TYPES)
    cr.add_argument("--resource-id", required=True)
    cr.add_argument("--body", required=True)
    cr.add_argument("--rank", type=int, required=True)
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    rp = sp.add_parser("reply", help="Reply to a top-level comment")
    rp.add_argument("--id", required=True, help="parent comment id")
    rp.add_argument("--body", required=True)
    add_write_flags(rp)
    rp.set_defaults(fn=cmd_reply)

    up = sp.add_parser("update", help="Update own comment")
    up.add_argument("--id", required=True)
    up.add_argument("--body", default=None)
    up.add_argument("--rank", type=int, default=None)
    add_write_flags(up)
    up.set_defaults(fn=cmd_update)

    dl = sp.add_parser("delete", help="Delete own comment")
    dl.add_argument("--id", required=True)
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_delete)
