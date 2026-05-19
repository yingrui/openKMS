"""evaluations + evaluation-runs CLI (HTTP paths under /api/evaluations)."""
from __future__ import annotations

import argparse
import sys
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
    ws = (getattr(ns, "wiki_space_id", None) or "").strip()
    if ws:
        body["wiki_space_id"] = ws
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


def cmd_ds_items_list(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(f"/api/evaluations/{ns.id}/items", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.name is not None:
        body["name"] = ns.name
    if ns.description is not None:
        body["description"] = ns.description
    if ns.clear_wiki_space:
        body["wiki_space_id"] = None
    elif ns.wiki_space_id is not None:
        body["wiki_space_id"] = ns.wiki_space_id
    kb = getattr(ns, "knowledge_base_id", None)
    if kb is not None and str(kb).strip():
        body["knowledge_base_id"] = str(kb).strip()
    if not body:
        print(
            "evaluations update: pass at least one of --name, --description, "
            "--knowledge-base-id, --wiki-space-id, or --clear-wiki-space",
            file=sys.stderr,
        )
        sys.exit(2)
    path = f"/api/evaluations/{ns.id}"
    confirm_or_abort("update evaluation", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_item_add(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "query": ns.query,
        "expected_answer": ns.expected_answer,
        "sort_order": ns.sort_order,
    }
    if ns.topic is not None:
        body["topic"] = ns.topic
    path = f"/api/evaluations/{ns.id}/items"
    confirm_or_abort("add evaluation item", "POST", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_item_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.query is not None:
        body["query"] = ns.query
    if ns.expected_answer is not None:
        body["expected_answer"] = ns.expected_answer
    if ns.topic is not None:
        body["topic"] = ns.topic
    if ns.sort_order is not None:
        body["sort_order"] = ns.sort_order
    if not body:
        print(
            "evaluations items update: pass at least one of "
            "--query, --expected-answer, --topic, --sort-order",
            file=sys.stderr,
        )
        sys.exit(2)
    path = f"/api/evaluations/{ns.id}/items/{ns.item_id}"
    confirm_or_abort("update evaluation item", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_ds_item_delete(ns: argparse.Namespace) -> None:
    path = f"/api/evaluations/{ns.id}/items/{ns.item_id}"
    confirm_or_abort("delete evaluation item", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    if r.content:
        print_json(r.json())
    else:
        print_json({"ok": True})


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
    ds = sub.add_parser(
        "evaluations",
        help="Evaluations (KB search/QA + optional wiki content coverage)",
    )
    ds_sub = ds.add_subparsers(dest="ev_cmd", required=True)

    ls = ds_sub.add_parser("list", help="List evaluations")
    ls.add_argument("--kb-id", default="")
    ls.set_defaults(fn=cmd_ds_list)

    cr = ds_sub.add_parser("create", help="Create evaluation")
    cr.add_argument("--name", required=True)
    cr.add_argument("--kb-id", required=True)
    cr.add_argument(
        "--wiki-space-id",
        default="",
        help="optional wiki space id (required on server for wiki_content_coverage runs)",
    )
    cr.add_argument("--description", default="")
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_ds_create)

    gt = ds_sub.add_parser("get", help="Get evaluation (GET /api/evaluations/{id})")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_ds_get)

    it = ds_sub.add_parser("items", help="List or add/update/delete evaluation items")
    it_sub = it.add_subparsers(dest="items_cmd", required=True)

    it_ls = it_sub.add_parser("list", help="List items (paginated)")
    it_ls.add_argument("--id", required=True, help="evaluation id")
    it_ls.add_argument("--limit", type=int, default=0)
    it_ls.add_argument("--offset", type=int, default=0)
    it_ls.set_defaults(fn=cmd_ds_items_list)

    it_add = it_sub.add_parser("add", help="Add one item (POST …/items)")
    it_add.add_argument("--id", required=True, help="evaluation id")
    it_add.add_argument("--query", required=True)
    it_add.add_argument("--expected-answer", required=True)
    it_add.add_argument("--topic", default=None, help="optional topic label")
    it_add.add_argument("--sort-order", type=int, default=0)
    add_write_flags(it_add)
    it_add.set_defaults(fn=cmd_ds_item_add)

    it_up = it_sub.add_parser("update", help="Update one item (PUT …/items/{item_id})")
    it_up.add_argument("--id", required=True, help="evaluation id")
    it_up.add_argument("--item-id", required=True, dest="item_id")
    it_up.add_argument("--query", default=None)
    it_up.add_argument("--expected-answer", default=None)
    it_up.add_argument("--topic", default=None)
    it_up.add_argument("--sort-order", type=int, default=None)
    add_write_flags(it_up)
    it_up.set_defaults(fn=cmd_ds_item_update)

    it_del = it_sub.add_parser("delete", help="Delete one item (DELETE …/items/{item_id})")
    it_del.add_argument("--id", required=True, help="evaluation id")
    it_del.add_argument("--item-id", required=True, dest="item_id")
    add_write_flags(it_del)
    it_del.set_defaults(fn=cmd_ds_item_delete)

    up = ds_sub.add_parser(
        "update",
        help="Update evaluation metadata (PUT /api/evaluations/{id}); keeps the same id and run history",
    )
    up.add_argument("--id", required=True)
    up.add_argument("--name", default=None, help="new name (omit to leave unchanged)")
    up.add_argument("--description", default=None, help="new description (omit to leave unchanged)")
    up.add_argument(
        "--knowledge-base-id",
        default=None,
        metavar="ID",
        help="link this knowledge base for future runs (omit to leave unchanged)",
    )
    wiki_g = up.add_mutually_exclusive_group()
    wiki_g.add_argument(
        "--wiki-space-id",
        default=None,
        metavar="ID",
        help="link this wiki space (omit to leave unchanged)",
    )
    wiki_g.add_argument(
        "--clear-wiki-space",
        action="store_true",
        help="remove wiki space link from this evaluation",
    )
    add_write_flags(up)
    up.set_defaults(fn=cmd_ds_update)

    rn = ds_sub.add_parser("run", help="Trigger an evaluation run")
    rn.add_argument("--id", required=True)
    rn.add_argument(
        "--type",
        default="",
        choices=["", "search_retrieval", "qa_answer", "wiki_content_coverage"],
        help=(
            "evaluation_type: search_retrieval (default), qa_answer, or wiki_content_coverage "
            "(wiki coverage needs evaluations linked to a wiki space via create --wiki-space-id or UI)"
        ),
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
