"""evaluations + evaluation-runs CLI (HTTP paths under /api/evaluations)."""
from __future__ import annotations

import argparse
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_ds_list(ns: argparse.Namespace) -> None:
    params: dict[str, str] = {}
    if ns.kb_id:
        params["knowledge_base_id"] = ns.kb_id
    with client() as s:
        r = s.get("/api/evaluations", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name, "knowledge_base_id": ns.kb_id}
    if ns.description:
        body["description"] = ns.description
    confirm_or_abort(
        "create evaluation",
        "POST",
        "/api/evaluations",
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/evaluations", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/evaluations/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_items(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(f"/api/evaluations/{ns.id}/items", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_run(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.type:
        body["evaluation_type"] = ns.type
    path = f"/api/evaluations/{ns.id}/run"
    preview = body if body else None
    confirm_or_abort("trigger evaluation run", "POST", path, preview, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_runs_list(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(
            f"/api/evaluations/{ns.evaluation_id}/runs",
            params=params or None,
        )
    r.raise_for_status()
    print_json(r.json())


def cmd_runs_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/evaluations/{ns.evaluation_id}/runs/{ns.run_id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_runs_compare(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(
            f"/api/evaluations/{ns.evaluation_id}/runs/compare",
            params={"run_a": ns.run_a, "run_b": ns.run_b},
        )
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    ds = sub.add_parser("evaluations", help="Evaluations (KB QA)")
    ds_sub = ds.add_subparsers(dest="ev_cmd", required=True)

    ls = ds_sub.add_parser("list", help="List evaluations")
    ls.add_argument("--kb-id", default="")
    ls.set_defaults(fn=cmd_ds_list)

    cr = ds_sub.add_parser("create", help="Create evaluation")
    cr.add_argument("--name", required=True)
    cr.add_argument("--kb-id", required=True)
    cr.add_argument("--description", default="")
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_ds_create)

    gt = ds_sub.add_parser("get", help="Get evaluation (GET /api/evaluations/{id})")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_ds_get)

    it = ds_sub.add_parser("items", help="List evaluation items (paginated)")
    it.add_argument("--id", required=True)
    it.add_argument("--limit", type=int, default=0)
    it.add_argument("--offset", type=int, default=0)
    it.set_defaults(fn=cmd_ds_items)

    rn = ds_sub.add_parser("run", help="Trigger an evaluation run")
    rn.add_argument("--id", required=True)
    rn.add_argument(
        "--type",
        default="",
        choices=["", "search_retrieval", "qa_answer", "wiki_content_coverage"],
        help="evaluation_type; default search_retrieval",
    )
    add_write_flags(rn)
    rn.set_defaults(fn=cmd_ds_run)

    rs = sub.add_parser("evaluation-runs", help="Evaluation runs (saved)")
    rs_sub = rs.add_subparsers(dest="er_cmd", required=True)

    rls = rs_sub.add_parser("list", help="List runs for an evaluation")
    rls.add_argument("--evaluation-id", required=True, dest="evaluation_id")
    rls.add_argument("--limit", type=int, default=0)
    rls.add_argument("--offset", type=int, default=0)
    rls.set_defaults(fn=cmd_runs_list)

    rgt = rs_sub.add_parser("get", help="Get full run with per-item results")
    rgt.add_argument("--evaluation-id", required=True, dest="evaluation_id")
    rgt.add_argument("--run-id", required=True)
    rgt.set_defaults(fn=cmd_runs_get)

    rcp = rs_sub.add_parser("compare", help="Compare two runs (GET .../runs/compare)")
    rcp.add_argument("--evaluation-id", required=True, dest="evaluation_id")
    rcp.add_argument("--run-a", required=True)
    rcp.add_argument("--run-b", required=True)
    rcp.set_defaults(fn=cmd_runs_compare)
