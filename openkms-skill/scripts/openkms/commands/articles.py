"""articles — create / from-url (existing) + list / get / markdown (new)."""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any

import httpx

from ..client import client
from .._io import html_to_markish, print_json, write_or_print


def cmd_create(ns: argparse.Namespace) -> None:
    md = ns.markdown or ""
    if ns.markdown_file:
        md = Path(ns.markdown_file).read_text(encoding="utf-8")
    body: dict[str, Any] = {"channel_id": ns.channel_id, "name": ns.name, "markdown": md or None}
    if ns.origin_url:
        body["origin_article_id"] = ns.origin_url
    with client() as s:
        r = s.post("/api/articles", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_from_url(ns: argparse.Namespace) -> None:
    with httpx.Client(timeout=60.0, follow_redirects=True) as u:
        fr = u.get(ns.url)
    fr.raise_for_status()
    ctype = (fr.headers.get("content-type") or "").lower()
    text = fr.text
    if "html" in ctype:
        body_md = html_to_markish(text)
        title = ns.name
        if not title:
            m = re.search(r"(?is)<title[^>]*>([^<]+)</title>", text)
            title = (m.group(1).strip() if m else "") or "Imported page"
    else:
        body_md = text.strip()
        title = ns.name or "Imported page"
    with client() as s:
        r = s.post(
            "/api/articles",
            json={
                "channel_id": ns.channel_id,
                "name": title[:512],
                "markdown": body_md,
                "origin_article_id": ns.url[:512],
            },
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
        r = s.get("/api/articles", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/articles/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_markdown(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/articles/{ns.id}")
    r.raise_for_status()
    data = r.json()
    md = data.get("markdown")
    if md is None:
        print(f"article {ns.id} has no markdown field in response", file=sys.stderr)
        sys.exit(1)
    write_or_print(md, ns.out or None)


def add_subparser(sub) -> None:
    p = sub.add_parser("articles", help="Articles")
    sp = p.add_subparsers(dest="ar_cmd", required=True)

    cr = sp.add_parser("create", help="Create article")
    cr.add_argument("--channel-id", required=True)
    cr.add_argument("--name", required=True)
    cr.add_argument("--markdown", default="")
    cr.add_argument("--markdown-file", default="")
    cr.add_argument("--origin-url", default="")
    cr.set_defaults(fn=cmd_create)

    fu = sp.add_parser("from-url", help="Fetch URL and create article (HTML simplified)")
    fu.add_argument("--channel-id", required=True)
    fu.add_argument("--url", required=True)
    fu.add_argument("--name", default="")
    fu.set_defaults(fn=cmd_from_url)

    ls = sp.add_parser("list", help="List articles (GET /api/articles)")
    ls.add_argument("--channel-id", default="")
    ls.add_argument("--search", default="")
    ls.add_argument("--limit", type=int, default=0)
    ls.add_argument("--offset", type=int, default=0)
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get article by ID (GET /api/articles/{id})")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    md = sp.add_parser(
        "markdown",
        help="Print or save article markdown (extracts .markdown from GET /api/articles/{id})",
    )
    md.add_argument("--id", required=True)
    md.add_argument("--out", default="", help="Output file path; omit to print to stdout")
    md.set_defaults(fn=cmd_markdown)
