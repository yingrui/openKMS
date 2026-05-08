"""search — global search across documents/articles/wiki/KBs (GET /api/search)."""
from __future__ import annotations

import argparse

from ..client import client
from .._io import print_json


def cmd_search(ns: argparse.Namespace) -> None:
    params: dict[str, str | int] = {"q": ns.q}
    if ns.types:
        params["types"] = ns.types
    if ns.document_channel_id:
        params["document_channel_id"] = ns.document_channel_id
    if ns.article_channel_id:
        params["article_channel_id"] = ns.article_channel_id
    if ns.updated_after:
        params["updated_after"] = ns.updated_after
    if ns.updated_before:
        params["updated_before"] = ns.updated_before
    if ns.limit:
        params["limit"] = ns.limit
    with client() as s:
        r = s.get("/api/search", params=params)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("search", help="GET /api/search (unified search)")
    p.add_argument("--q", required=True, help="Search term (substring, case-insensitive)")
    p.add_argument(
        "--types",
        default="",
        help="Comma list: documents,articles,wiki_spaces,knowledge_bases (default: all)",
    )
    p.add_argument("--document-channel-id", default="")
    p.add_argument("--article-channel-id", default="")
    p.add_argument("--updated-after", default="", help="ISO-8601 timestamp")
    p.add_argument("--updated-before", default="", help="ISO-8601 timestamp")
    p.add_argument("--limit", type=int, default=0, help="1-100, default 30")
    p.set_defaults(fn=cmd_search)
