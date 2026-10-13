"""queries — model-level saved queries (Ossie saved_queries)."""
from __future__ import annotations

import argparse
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def _split(raw: str | None) -> list[str]:
    return [x.strip() for x in (raw or "").split(",") if x.strip()]


def _parse_metrics(raw: str | None) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for part in _split(raw):
        alias, _, metric_id = part.partition("=")
        metric_id = metric_id.strip() or alias.strip()
        out.append({"name": alias.strip(), "metric_id": metric_id})
    return out


def _parse_filter(raw: str) -> dict[str, Any]:
    parts = raw.split(":", 2)
    if len(parts) < 2:
        raise SystemExit(f"Invalid filter '{raw}' (expected column:op[:value]).")
    column, op = parts[0].strip(), parts[1].strip()
    value = parts[2].strip() if len(parts) == 3 and parts[2].strip() else None
    return {"column": column, "op": op, "value": value}


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str] = {}
    if ns.semantic_model_id:
        params["semantic_model_id"] = ns.semantic_model_id
    if ns.base_dataset_id:
        params["base_dataset_id"] = ns.base_dataset_id
    with client() as s:
        r = s.get("/api/queries", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_add(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "name": ns.name,
        "semantic_model_id": ns.semantic_model_id,
        "base_dataset_id": ns.base_dataset_id,
        "metrics": _parse_metrics(ns.metrics),
        "group_by": _split(ns.group_by),
        "joins": _split(ns.joins),
    }
    if ns.definition:
        body["description"] = ns.definition
    if ns.filter:
        body["filters"] = [_parse_filter(f) for f in ns.filter]
    confirm_or_abort("add query", "POST", "/api/queries", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/queries", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_run(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/queries/{ns.query_id}/run")
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/queries/{ns.query_id}"
    confirm_or_abort("delete query", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted query {ns.query_id}")


def add_subparser(sub) -> None:
    p = sub.add_parser("queries", help="Model-level saved queries (metrics + dimensions + filter)")
    sp = p.add_subparsers(dest="queries_cmd", required=True)

    ql = sp.add_parser("list", help="List saved queries")
    ql.add_argument("--semantic-model-id", default=None)
    ql.add_argument("--base-dataset-id", default=None)
    ql.set_defaults(fn=cmd_list)

    qa = sp.add_parser("add", help="Add a saved query")
    qa.add_argument("--name", required=True)
    qa.add_argument("--semantic-model-id", required=True)
    qa.add_argument("--base-dataset-id", required=True)
    qa.add_argument("--metrics", default=None, help='comma-separated "alias=metric_id" (alias optional)')
    qa.add_argument("--group-by", default=None, help="comma-separated field names")
    qa.add_argument("--joins", default=None, help="comma-separated relationship ids")
    qa.add_argument(
        "--filter",
        action="append",
        default=None,
        help="repeatable column:op[:value], e.g. --filter 'trade_date:>=:2024-01-01'",
    )
    qa.add_argument("--definition", default=None)
    add_write_flags(qa)
    qa.set_defaults(fn=cmd_add)

    qr = sp.add_parser("run", help="Run a saved query (read-only)")
    qr.add_argument("--query-id", required=True)
    qr.set_defaults(fn=cmd_run)

    qd = sp.add_parser("delete", help="Delete a saved query")
    qd.add_argument("--query-id", required=True)
    add_write_flags(qd)
    qd.set_defaults(fn=cmd_delete)
