"""explorer — Data Explorer reports (persisted analyses)."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def _read_text(ns: argparse.Namespace) -> str | None:
    if getattr(ns, "narrative_file", None):
        return Path(ns.narrative_file).read_text(encoding="utf-8")
    return getattr(ns, "narrative", None)


def _read_charts(ns: argparse.Namespace) -> list[dict[str, Any]] | None:
    path = getattr(ns, "charts_file", None)
    if not path:
        return None
    return json.loads(Path(path).read_text(encoding="utf-8"))


def cmd_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/explorer-reports")
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/explorer-reports/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name}
    if ns.question:
        body["question"] = ns.question
    if ns.dataset_id:
        body["dataset_id"] = ns.dataset_id
    narrative = _read_text(ns)
    if narrative:
        body["narrative"] = narrative
    charts = _read_charts(ns)
    if charts is not None:
        body["charts"] = charts
    confirm_or_abort("create explorer report", "POST", "/api/explorer-reports", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/explorer-reports", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.name:
        body["name"] = ns.name
    if ns.status:
        body["status"] = ns.status
    narrative = _read_text(ns)
    if narrative is not None:
        body["narrative"] = narrative
    charts = _read_charts(ns)
    if charts is not None:
        body["charts"] = charts
    if not body:
        raise SystemExit("Nothing to update.")
    path = f"/api/explorer-reports/{ns.id}"
    confirm_or_abort("update explorer report", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/explorer-reports/{ns.id}"
    confirm_or_abort("delete explorer report", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted explorer report {ns.id}")


def add_subparser(sub) -> None:
    p = sub.add_parser("explorer", help="Data Explorer reports")
    sp = p.add_subparsers(dest="explorer_cmd", required=True)

    ls = sp.add_parser("reports-list", help="List explorer reports")
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("reports-get", help="Get an explorer report")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    cr = sp.add_parser("reports-create", help="Create an explorer report")
    cr.add_argument("--name", required=True)
    cr.add_argument("--question", default=None)
    cr.add_argument("--dataset-id", default=None)
    cr.add_argument("--narrative", default=None)
    cr.add_argument("--narrative-file", default=None)
    cr.add_argument("--charts-file", default=None, help="JSON file: [{title, insight, columns, rows}]")
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    up = sp.add_parser("reports-update", help="Update an explorer report")
    up.add_argument("--id", required=True)
    up.add_argument("--name", default=None)
    up.add_argument("--status", default=None, choices=("draft", "ready"))
    up.add_argument("--narrative", default=None)
    up.add_argument("--narrative-file", default=None)
    up.add_argument("--charts-file", default=None)
    add_write_flags(up)
    up.set_defaults(fn=cmd_update)

    dl = sp.add_parser("reports-delete", help="Delete an explorer report")
    dl.add_argument("--id", required=True)
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_delete)
