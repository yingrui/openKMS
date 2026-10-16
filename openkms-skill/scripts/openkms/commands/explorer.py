"""explorer — Data Explorer reports: a question over a dataset **or** a semantic model."""
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


def _read_blocks(ns: argparse.Namespace) -> list[dict[str, Any]] | None:
    """`--blocks-file`: JSON `[{title, insight?, query}]` — the query is the source's own spec."""
    path = getattr(ns, "blocks_file", None)
    if not path:
        return None
    blocks = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(blocks, list):
        raise SystemExit("--blocks-file must be a JSON array of blocks")
    return blocks


def _source_body(ns: argparse.Namespace) -> dict[str, Any]:
    """The report's source: a dataset or a semantic model (never both)."""
    kind = getattr(ns, "source_kind", None)
    dataset_id = getattr(ns, "dataset_id", None)
    model_id = getattr(ns, "semantic_model_id", None)
    if kind == "semantic_model" and not model_id:
        raise SystemExit("--source-kind semantic_model needs --semantic-model-id")
    if kind == "dataset" and not dataset_id:
        raise SystemExit("--source-kind dataset needs --dataset-id")
    if kind is None and not dataset_id and not model_id:
        raise SystemExit("Pick a source: --dataset-id or --semantic-model-id")
    body: dict[str, Any] = {}
    if kind:
        body["source_kind"] = kind
    if dataset_id:
        body["dataset_id"] = dataset_id
        body.setdefault("source_kind", "dataset")
    if model_id:
        body["semantic_model_id"] = model_id
        body.setdefault("source_kind", "semantic_model")
    return body


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
    body: dict[str, Any] = {"name": ns.name, **_source_body(ns)}
    if ns.question:
        body["question"] = ns.question
    narrative = _read_text(ns)
    if narrative:
        body["narrative"] = narrative
    blocks = _read_blocks(ns)
    if blocks is not None:
        body["blocks"] = blocks
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
    if ns.dataset_id or ns.semantic_model_id or ns.source_kind:
        body.update(_source_body(ns))
    blocks = _read_blocks(ns)
    if blocks is not None:
        body["blocks"] = blocks
    if not body:
        raise SystemExit("Nothing to update.")
    path = f"/api/explorer-reports/{ns.id}"
    confirm_or_abort("update explorer report", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_run(ns: argparse.Namespace) -> None:
    """Run every block against the report's source and keep the results."""
    path = f"/api/explorer-reports/{ns.id}/run"
    confirm_or_abort("run explorer report", "POST", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path)
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
    cr.add_argument("--dataset-id", default=None, help="source: a Catalog dataset")
    cr.add_argument("--semantic-model-id", default=None, help="source: a semantic model")
    cr.add_argument(
        "--source-kind",
        default=None,
        choices=("dataset", "semantic_model"),
        help="usually inferred from --dataset-id / --semantic-model-id",
    )
    cr.add_argument("--narrative", default=None)
    cr.add_argument("--narrative-file", default=None)
    cr.add_argument(
        "--blocks-file",
        default=None,
        help="JSON file: [{title, insight?, query}] — query is the source's spec (dataset rows query, or a model metric query)",
    )
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    up = sp.add_parser("reports-update", help="Update an explorer report")
    up.add_argument("--id", required=True)
    up.add_argument("--name", default=None)
    up.add_argument("--status", default=None, choices=("draft", "ready"))
    up.add_argument("--narrative", default=None)
    up.add_argument("--narrative-file", default=None)
    up.add_argument("--dataset-id", default=None)
    up.add_argument("--semantic-model-id", default=None)
    up.add_argument("--source-kind", default=None, choices=("dataset", "semantic_model"))
    up.add_argument("--blocks-file", default=None)
    add_write_flags(up)
    up.set_defaults(fn=cmd_update)

    rn = sp.add_parser("reports-run", help="Run a report's blocks against its source")
    rn.add_argument("--id", required=True)
    add_write_flags(rn)
    rn.set_defaults(fn=cmd_run)

    dl = sp.add_parser("reports-delete", help="Delete an explorer report")
    dl.add_argument("--id", required=True)
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_delete)
