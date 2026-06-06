"""pipelines — list document processing pipelines (read-only)."""
from __future__ import annotations

import argparse

from ..client import client
from .._io import print_json


def cmd_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/pipelines")
    r.raise_for_status()
    data = r.json()
    if ns.table:
        items = data.get("items") or []
        for p in items:
            active = "active" if p.get("is_active", True) else "inactive"
            pid = p.get("id", "")
            name = p.get("name", "")
            print(f"{pid}\t{name}\t{active}")
        return
    print_json(data)


def add_subparser(sub) -> None:
    p = sub.add_parser("pipelines", help="Document processing pipelines")
    sp = p.add_subparsers(dest="pl_cmd", required=True)
    lp = sp.add_parser("list", help="List pipelines (GET /api/pipelines)")
    lp.add_argument(
        "--table",
        action="store_true",
        help="Print id, name, and active status as tab-separated lines instead of JSON",
    )
    lp.set_defaults(fn=cmd_list)
