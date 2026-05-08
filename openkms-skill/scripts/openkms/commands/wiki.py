"""wiki — put-page (existing) + list-pages / get-page (new)."""
from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import quote

from ..client import client
from .._io import print_json


def cmd_put_page(ns: argparse.Namespace) -> None:
    raw = Path(ns.file).read_text(encoding="utf-8")
    path_enc = quote(ns.path.strip("/").lstrip("/"), safe="")
    body = {"title": ns.title, "body": raw, "metadata": None}
    with client() as s:
        r = s.put(f"/api/wiki-spaces/{ns.space_id}/pages/by-path/{path_enc}", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_list_pages(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(f"/api/wiki-spaces/{ns.space_id}/pages", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_get_page(ns: argparse.Namespace) -> None:
    path_enc = quote(ns.path.strip("/").lstrip("/"), safe="")
    with client() as s:
        r = s.get(f"/api/wiki-spaces/{ns.space_id}/pages/by-path/{path_enc}")
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("wiki", help="Wiki pages")
    sp = p.add_subparsers(dest="wp_cmd", required=True)

    pp = sp.add_parser("put-page", help="Upsert page by path (PUT by-path)")
    pp.add_argument("--space-id", required=True)
    pp.add_argument("--path", required=True, help="Obsidian-style path, e.g. notes/hello")
    pp.add_argument("--title", required=True)
    pp.add_argument("--file", required=True, help="Markdown file")
    pp.set_defaults(fn=cmd_put_page)

    ls = sp.add_parser("list-pages", help="List pages in space (paginated)")
    ls.add_argument("--space-id", required=True)
    ls.add_argument("--limit", type=int, default=0)
    ls.add_argument("--offset", type=int, default=0)
    ls.set_defaults(fn=cmd_list_pages)

    gp = sp.add_parser("get-page", help="Get page by path (GET by-path)")
    gp.add_argument("--space-id", required=True)
    gp.add_argument("--path", required=True, help="Obsidian-style path, e.g. notes/hello")
    gp.set_defaults(fn=cmd_get_page)
