"""wiki-spaces — list / create."""
from __future__ import annotations

import argparse
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/wiki-spaces")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name.strip()}
    if ns.description:
        body["description"] = ns.description.strip()
    confirm_or_abort("create wiki space", "POST", "/api/wiki-spaces", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/wiki-spaces", json=body)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("wiki-spaces", help="Wiki spaces")
    sp = p.add_subparsers(dest="wk_cmd", required=True)
    sp.add_parser("list", help="List spaces").set_defaults(fn=cmd_list)
    c = sp.add_parser("create", help="Create space")
    c.add_argument("--name", required=True)
    c.add_argument("--description", default="")
    add_write_flags(c)
    c.set_defaults(fn=cmd_create)
