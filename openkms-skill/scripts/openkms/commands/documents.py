"""documents — upload (existing) + list / get / markdown (new)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from ..config import load_config
from .._io import print_json, write_or_print


def _document_channel_id(ns: argparse.Namespace) -> str:
    direct = (getattr(ns, "channel_id", None) or "").strip()
    if direct:
        return direct
    cfg = load_config()
    return (cfg.get("default_document_channel_id") or "").strip()


def cmd_upload(ns: argparse.Namespace) -> None:
    path = Path(ns.file)
    if not path.is_file():
        print(f"Not a file: {path}", file=sys.stderr)
        sys.exit(1)
    chid = _document_channel_id(ns)
    if not chid:
        print(
            "Missing channel: pass --channel-id or set default_document_channel_id in config.yml.",
            file=sys.stderr,
        )
        sys.exit(2)
    preview = {"channel_id": chid, "file": str(path.resolve())}
    confirm_or_abort(
        "upload document",
        "POST",
        "/api/documents/upload",
        preview,
        ns.yes,
        ns.dry_run,
    )
    with client() as s, path.open("rb") as f:
        r = s.post(
            "/api/documents/upload",
            files={"file": (path.name, f, "application/octet-stream")},
            data={"channel_id": chid},
        )
    r.raise_for_status()
    print_json(r.json())


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str | int] = {}
    chid = _document_channel_id(ns)
    if chid:
        params["channel_id"] = chid
    if ns.search:
        params["search"] = ns.search
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get("/api/documents", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/documents/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_markdown(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/documents/{ns.id}")
    r.raise_for_status()
    data = r.json()
    md = data.get("markdown")
    if md is None:
        print(f"document {ns.id} has no markdown field in response", file=sys.stderr)
        sys.exit(1)
    write_or_print(md, ns.out or None)


def add_subparser(sub) -> None:
    p = sub.add_parser("documents", help="Documents")
    sp = p.add_subparsers(dest="doc_cmd", required=True)

    up = sp.add_parser("upload", help="Upload file to channel")
    up.add_argument(
        "--channel-id",
        default="",
        help="document channel UUID (or set default_document_channel_id in config.yml)",
    )
    up.add_argument("--file", required=True)
    add_write_flags(up)
    up.set_defaults(fn=cmd_upload)

    ls = sp.add_parser("list", help="List documents (GET /api/documents)")
    ls.add_argument(
        "--channel-id",
        default="",
        help="filter by channel (or use default_document_channel_id from config.yml)",
    )
    ls.add_argument("--search", default="")
    ls.add_argument("--limit", type=int, default=0)
    ls.add_argument("--offset", type=int, default=0)
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get document by ID (GET /api/documents/{id})")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    md = sp.add_parser(
        "markdown",
        help="Print or save document markdown (extracts .markdown from GET /api/documents/{id})",
    )
    md.add_argument("--id", required=True)
    md.add_argument("--out", default="", help="Output file path; omit to print to stdout")
    md.set_defaults(fn=cmd_markdown)
