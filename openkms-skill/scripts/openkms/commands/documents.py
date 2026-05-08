"""documents — upload (existing) + list / get / markdown (new)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ..client import client
from .._io import print_json, write_or_print


def cmd_upload(ns: argparse.Namespace) -> None:
    path = Path(ns.file)
    if not path.is_file():
        print(f"Not a file: {path}", file=sys.stderr)
        sys.exit(1)
    with client() as s, path.open("rb") as f:
        r = s.post(
            "/api/documents/upload",
            files={"file": (path.name, f, "application/octet-stream")},
            data={"channel_id": ns.channel_id},
        )
    r.raise_for_status()
    print_json(r.json())


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str | int] = {}
    if ns.channel_id:
        params["channel_id"] = ns.channel_id
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
    up.add_argument("--channel-id", required=True)
    up.add_argument("--file", required=True)
    up.set_defaults(fn=cmd_upload)

    ls = sp.add_parser("list", help="List documents (GET /api/documents)")
    ls.add_argument("--channel-id", default="")
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
