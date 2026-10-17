"""stories — Data Insights stories: a document of findings, each with its own source.

A **story** is the document (a question + a narrative); each **finding** in it owns its source
(a dataset *or* a semantic model), the query it came from, and the result of its last run. So one
story can put a model metric beside a raw-dataset health check.
"""
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


def _read_findings(ns: argparse.Namespace) -> list[dict[str, Any]] | None:
    r"""`--findings-file`: JSON array; each entry names **its own** source and query.

    `[{title?, insight?, source_kind\|dataset_id\|semantic_model_id, query, chart?}]`
    """
    path = getattr(ns, "findings_file", None)
    if not path:
        return None
    findings = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(findings, list):
        raise SystemExit("--findings-file must be a JSON array of findings")
    for i, finding in enumerate(findings):
        if not isinstance(finding, dict):
            raise SystemExit(f"finding {i} must be an object")
        if not (finding.get("dataset_id") or finding.get("semantic_model_id")):
            raise SystemExit(
                f"finding {i} names no source: give it dataset_id or semantic_model_id"
            )
    return findings


def cmd_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/stories")
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/stories/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name}
    if ns.question:
        body["question"] = ns.question
    narrative = _read_text(ns)
    if narrative:
        body["narrative"] = narrative
    findings = _read_findings(ns)
    if findings is not None:
        body["findings"] = findings
    confirm_or_abort("create story", "POST", "/api/stories", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/stories", json=body)
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
    findings = _read_findings(ns)
    if findings is not None:
        body["findings"] = findings
    if not body:
        raise SystemExit("Nothing to update.")
    path = f"/api/stories/{ns.id}"
    confirm_or_abort("update story", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_run(ns: argparse.Namespace) -> None:
    """Run every finding against **its own** source and keep the results."""
    path = f"/api/stories/{ns.id}/run"
    confirm_or_abort("run story", "POST", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path)
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/stories/{ns.id}"
    confirm_or_abort("delete story", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted story {ns.id}")


def add_subparser(sub) -> None:
    p = sub.add_parser("stories", help="Data Insights stories")
    sp = p.add_subparsers(dest="explorer_cmd", required=True)

    ls = sp.add_parser("list", help="List stories")
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get a story (its findings carry the results)")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    cr = sp.add_parser("create", help="Create a story")
    cr.add_argument("--name", required=True)
    cr.add_argument("--question", default=None)
    cr.add_argument("--narrative", default=None)
    cr.add_argument("--narrative-file", default=None)
    cr.add_argument(
        "--findings-file",
        default=None,
        help='JSON file: [{title?, insight?, dataset_id|semantic_model_id, query, chart?}] — every finding names its own source',
    )
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    up = sp.add_parser("update", help="Update a story")
    up.add_argument("--id", required=True)
    up.add_argument("--name", default=None)
    up.add_argument("--status", default=None, choices=("draft", "ready"))
    up.add_argument("--narrative", default=None)
    up.add_argument("--narrative-file", default=None)
    up.add_argument("--findings-file", default=None)
    add_write_flags(up)
    up.set_defaults(fn=cmd_update)

    rn = sp.add_parser("run", help="Run every finding against its own source")
    rn.add_argument("--id", required=True)
    add_write_flags(rn)
    rn.set_defaults(fn=cmd_run)

    dl = sp.add_parser("delete", help="Delete a story")
    dl.add_argument("--id", required=True)
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_delete)
