"""audit — read the mutation log: what changed, by whom, and whether it worked.

The backend records every POST/PUT/PATCH/DELETE in `audit_events` (a middleware, so no endpoint can forget).
This command is how a person or an agent answers "what did I change?" and "what changed this dataset?" —
`--actor` when every agent has its own key, `--resource-id` when you have the id but not the memory.
"""
from __future__ import annotations

import argparse

from ..client import client
from .._io import print_json


def cmd_audit_list(ns: argparse.Namespace) -> None:
    params: dict[str, object] = {"limit": ns.limit, "offset": ns.offset, "days": ns.days}
    for key, value in (
        ("actor_sub", ns.actor),
        ("resource_type", ns.resource_type),
        ("resource_id", ns.resource_id),
        ("method", ns.method),
        ("path", ns.path),
        ("since", ns.since),
    ):
        if value:
            params[key] = value
    with client() as s:
        r = s.get("/api/console/audit-events", params=params)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("audit", help="the mutation log (audit_events)")
    audit = p.add_subparsers(dest="audit_cmd", required=True)
    ls = audit.add_parser("list", help="GET /api/console/audit-events — newest first")
    ls.add_argument("--actor", default=None, help="the key's owner (`actor_sub`)")
    ls.add_argument("--resource-type", default=None, dest="resource_type", help="e.g. datasets")
    ls.add_argument("--resource-id", default=None, dest="resource_id")
    ls.add_argument("--method", default=None, help="POST / PUT / PATCH / DELETE")
    ls.add_argument("--path", default=None, help="substring of the path")
    ls.add_argument("--since", default=None, help="ISO timestamp")
    ls.add_argument("--limit", type=int, default=50)
    ls.add_argument("--offset", type=int, default=0, help="page through the window")
    ls.add_argument("--days", type=int, default=30, help="the window the log is read over")
    ls.set_defaults(fn=cmd_audit_list)
