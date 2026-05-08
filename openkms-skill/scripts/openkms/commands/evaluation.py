"""evaluation-datasets + evaluation-runs.

Existing: evaluation-datasets list/create.
New:      evaluation-datasets get/items/run; evaluation-runs list/get/compare.
"""
from __future__ import annotations

import argparse
from typing import Any

from ..client import client
from .._io import print_json


# ---------- evaluation-datasets ----------

def cmd_ds_list(ns: argparse.Namespace) -> None:
    params: dict[str, str] = {}
    if ns.kb_id:
        params["knowledge_base_id"] = ns.kb_id
    with client() as s:
        r = s.get("/api/evaluation-datasets", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name, "knowledge_base_id": ns.kb_id}
    if ns.description:
        body["description"] = ns.description
    with client() as s:
        r = s.post("/api/evaluation-datasets", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/evaluation-datasets/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_items(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(f"/api/evaluation-datasets/{ns.id}/items", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_run(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.type:
        body["evaluation_type"] = ns.type
    with client() as s:
        r = s.post(f"/api/evaluation-datasets/{ns.id}/run", json=body or None)
    r.raise_for_status()
    print_json(r.json())


# ---------- evaluation-runs ----------

def cmd_runs_list(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(
            f"/api/evaluation-datasets/{ns.dataset_id}/runs",
            params=params or None,
        )
    r.raise_for_status()
    print_json(r.json())


def cmd_runs_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/evaluation-datasets/{ns.dataset_id}/runs/{ns.run_id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_runs_compare(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(
            f"/api/evaluation-datasets/{ns.dataset_id}/runs/compare",
            params={"run_a": ns.run_a, "run_b": ns.run_b},
        )
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    # ----- evaluation-datasets -----
    ds = sub.add_parser("evaluation-datasets", help="Evaluation datasets")
    ds_sub = ds.add_subparsers(dest="ev_cmd", required=True)

    ls = ds_sub.add_parser("list", help="List datasets")
    ls.add_argument("--kb-id", default="")
    ls.set_defaults(fn=cmd_ds_list)

    cr = ds_sub.add_parser("create", help="Create dataset")
    cr.add_argument("--name", required=True)
    cr.add_argument("--kb-id", required=True)
    cr.add_argument("--description", default="")
    cr.set_defaults(fn=cmd_ds_create)

    gt = ds_sub.add_parser("get", help="Get dataset (GET /api/evaluation-datasets/{id})")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_ds_get)

    it = ds_sub.add_parser("items", help="List dataset items (paginated)")
    it.add_argument("--id", required=True)
    it.add_argument("--limit", type=int, default=0)
    it.add_argument("--offset", type=int, default=0)
    it.set_defaults(fn=cmd_ds_items)

    rn = ds_sub.add_parser("run", help="Trigger an evaluation run")
    rn.add_argument("--id", required=True)
    rn.add_argument(
        "--type",
        default="",
        choices=["", "search_retrieval", "qa_answer"],
        help="Restrict run to one evaluation type; default runs both",
    )
    rn.set_defaults(fn=cmd_ds_run)

    # ----- evaluation-runs -----
    rs = sub.add_parser("evaluation-runs", help="Evaluation runs (saved)")
    rs_sub = rs.add_subparsers(dest="er_cmd", required=True)

    rls = rs_sub.add_parser("list", help="List runs for a dataset")
    rls.add_argument("--dataset-id", required=True)
    rls.add_argument("--limit", type=int, default=0)
    rls.add_argument("--offset", type=int, default=0)
    rls.set_defaults(fn=cmd_runs_list)

    rgt = rs_sub.add_parser("get", help="Get full run with per-item results")
    rgt.add_argument("--dataset-id", required=True)
    rgt.add_argument("--run-id", required=True)
    rgt.set_defaults(fn=cmd_runs_get)

    rcp = rs_sub.add_parser("compare", help="Compare two runs (GET .../runs/compare)")
    rcp.add_argument("--dataset-id", required=True)
    rcp.add_argument("--run-a", required=True)
    rcp.add_argument("--run-b", required=True)
    rcp.set_defaults(fn=cmd_runs_compare)
