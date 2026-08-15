"""jobs — list / get / retry job runs."""
from __future__ import annotations

import argparse

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str | int] = {}
    if ns.document_id:
        params["document_id"] = ns.document_id
    if ns.knowledge_base_id:
        params["knowledge_base_id"] = ns.knowledge_base_id
    if ns.connector_id:
        params["connector_id"] = ns.connector_id
    if ns.status:
        params["status"] = ns.status
    if ns.search:
        params["search"] = ns.search
    if ns.limit is not None:
        params["limit"] = ns.limit
    if ns.offset is not None:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get("/api/jobs", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/jobs/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_retry(ns: argparse.Namespace) -> None:
    path = f"/api/jobs/{ns.id}/retry"
    confirm_or_abort(
        action=f"retry job {ns.id}",
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
    p = sub.add_parser("jobs", help="Job runs (sync, index, pipeline, …)")
    sp = p.add_subparsers(dest="jobs_cmd", required=True)

    ls = sp.add_parser("list", help="List jobs (GET /api/jobs)")
    ls.add_argument("--document-id", default=None)
    ls.add_argument("--knowledge-base-id", default=None)
    ls.add_argument("--connector-id", default=None)
    ls.add_argument("--status", default=None)
    ls.add_argument("--search", default=None)
    ls.add_argument("--limit", type=int, default=None)
    ls.add_argument("--offset", type=int, default=None)
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get job detail including events / worker_log")
    gt.add_argument("--id", required=True, type=int)
    gt.set_defaults(fn=cmd_get)

    rt = sp.add_parser("retry", help="Retry a job (POST …/retry)")
    rt.add_argument("--id", required=True, type=int)
    add_write_flags(rt)
    rt.set_defaults(fn=cmd_retry)
