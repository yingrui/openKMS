"""document-channels — list / create / update."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from ..config import load_config
from .._io import print_json


def _print_tree(channels: list[dict], indent: int = 0) -> None:
    for c in channels:
        prefix = "  " * indent + "├─ " if indent > 0 else ""
        print(f"{prefix}{c['name']}  ({c['id']})")
        if c.get("children"):
            _print_tree(c["children"], indent + 1)


def _resolve_pipeline_id(ns: argparse.Namespace) -> str | None:
    explicit = (getattr(ns, "pipeline_id", None) or "").strip()
    if explicit:
        return explicit
    cfg = load_config()
    return cfg.get("default_pipeline_id")


def _confirm_channel_create(
    ns: argparse.Namespace,
    post_body: dict[str, Any],
    pipeline_id: str | None,
) -> None:
    post_summary = (
        f"[POST] /api/document-channels\n"
        f"{json.dumps(post_body, indent=2, ensure_ascii=False)}"
    )
    if pipeline_id:
        put_body = {"pipeline_id": pipeline_id}
        summary = (
            f"{post_summary}\n\n"
            f"Then set default pipeline:\n"
            f"[PUT] /api/document-channels/{{id}}\n"
            f"{json.dumps(put_body, indent=2, ensure_ascii=False)}"
        )
    else:
        summary = post_summary

    if ns.dry_run:
        print(f"DRY-RUN — would create document channel\n{summary}")
        sys.exit(0)
    if ns.yes:
        return
    if not sys.stdin.isatty():
        print(
            "refusing to create document channel: stdin is not a TTY and --yes was not given",
            file=sys.stderr,
        )
        sys.exit(2)
    print(f"About to create document channel:\n{summary}")
    answer = input("Proceed? [y/N] ").strip().lower()
    if answer not in ("y", "yes"):
        print("aborted", file=sys.stderr)
        sys.exit(1)


def cmd_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/document-channels")
    r.raise_for_status()
    data = r.json()
    if ns.tree:
        _print_tree(data)
    else:
        print_json(data)


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name, "sort_order": ns.sort_order}
    if ns.description:
        body["description"] = ns.description
    if ns.parent_id:
        body["parent_id"] = ns.parent_id
    pipeline_id = _resolve_pipeline_id(ns)
    _confirm_channel_create(ns, body, pipeline_id)
    with client() as s:
        r = s.post("/api/document-channels", json=body)
        r.raise_for_status()
        channel = r.json()
        if pipeline_id:
            r2 = s.put(
                f"/api/document-channels/{channel['id']}",
                json={"pipeline_id": pipeline_id},
            )
            r2.raise_for_status()
            channel = r2.json()
    print_json(channel)


def _document_update_body(ns: argparse.Namespace) -> dict[str, Any]:
    body: dict[str, Any] = {}
    if ns.name is not None:
        body["name"] = ns.name
    if ns.description is not None:
        body["description"] = ns.description
    if ns.parent_id is not None:
        body["parent_id"] = ns.parent_id
    if ns.sort_order is not None:
        body["sort_order"] = ns.sort_order
    if ns.pipeline_id is not None:
        body["pipeline_id"] = ns.pipeline_id
    if ns.extraction_model_id is not None:
        body["extraction_model_id"] = ns.extraction_model_id
    if ns.extraction_schema_json is not None:
        try:
            body["extraction_schema"] = json.loads(ns.extraction_schema_json)
        except json.JSONDecodeError as e:
            print(f"Invalid --extraction-schema-json: {e}", file=sys.stderr)
            sys.exit(1)
    if ns.auto_process is not None:
        body["auto_process"] = ns.auto_process
    return body


def cmd_update(ns: argparse.Namespace) -> None:
    body = _document_update_body(ns)
    path = f"/api/document-channels/{ns.id}"
    confirm_or_abort(
        "update document channel",
        "PUT",
        path,
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("document-channels", help="Document channels")
    sp = p.add_subparsers(dest="dcl_cmd", required=True)
    lp = sp.add_parser("list", help="List channel tree (JSON or --tree)")
    lp.add_argument("--tree", action="store_true", help="Print indented tree to stdout instead of JSON")
    lp.set_defaults(fn=cmd_list)
    c = sp.add_parser("create", help="Create channel")
    c.add_argument("--name", required=True)
    c.add_argument("--description", default="")
    c.add_argument("--parent-id", default="")
    c.add_argument("--sort-order", type=int, default=0)
    c.add_argument(
        "--pipeline-id",
        default=None,
        help="Default document-parse pipeline id (overrides default_pipeline_id in config.yml)",
    )
    add_write_flags(c)
    c.set_defaults(fn=cmd_create)
    u = sp.add_parser("update", help="Update channel (rename, reparent, pipeline, extraction, etc.)")
    u.add_argument("--id", required=True)
    u.add_argument("--name", default=None)
    u.add_argument("--description", default=None)
    u.add_argument("--parent-id", default=None)
    u.add_argument("--sort-order", type=int, default=None)
    u.add_argument("--pipeline-id", default=None)
    u.add_argument("--extraction-model-id", default=None)
    u.add_argument(
        "--extraction-schema-json",
        default=None,
        help="JSON string for extraction_schema (merged into PUT body)",
    )
    u.add_argument("--auto-process", action="store_true", default=None)
    u.add_argument("--no-auto-process", action="store_false", dest="auto_process", default=None)
    add_write_flags(u)
    u.set_defaults(fn=cmd_update)
