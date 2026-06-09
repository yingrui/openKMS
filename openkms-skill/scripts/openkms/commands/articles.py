"""articles — create / from-url (existing) + list / get / markdown (new)."""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any

import httpx

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from ..config import load_config
from .._io import html_to_markish, print_json, write_or_print

# Same values as backend `DocumentRelationType` (articles API reuses them).
_ARTICLE_RELATION_TYPES = ("supersedes", "amends", "implements", "see_also")


def _article_channel_id(ns: argparse.Namespace) -> str:
    direct = (getattr(ns, "channel_id", None) or "").strip()
    if direct:
        return direct
    cfg = load_config()
    return (cfg.get("default_article_channel_id") or "").strip()


def cmd_create(ns: argparse.Namespace) -> None:
    chid = _article_channel_id(ns)
    if not chid:
        print(
            "Missing channel: pass --channel-id or set default_article_channel_id in config.yml.",
            file=sys.stderr,
        )
        sys.exit(2)
    md = ns.markdown or ""
    if ns.markdown_file:
        md = Path(ns.markdown_file).read_text(encoding="utf-8")
    body: dict[str, Any] = {"channel_id": chid, "name": ns.name, "markdown": md or None}
    if ns.origin_url:
        body["origin_article_id"] = ns.origin_url
    confirm_or_abort("create article", "POST", "/api/articles", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/articles", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_from_url(ns: argparse.Namespace) -> None:
    chid = _article_channel_id(ns)
    if not chid:
        print(
            "Missing channel: pass --channel-id or set default_article_channel_id in config.yml.",
            file=sys.stderr,
        )
        sys.exit(2)
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
    body = {
        "channel_id": chid,
        "name": title[:512],
        "markdown": body_md,
        "origin_article_id": ns.url[:512],
    }
    confirm_or_abort(
        "create article from URL",
        "POST",
        "/api/articles",
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/articles", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str | int] = {}
    chid = _article_channel_id(ns)
    if chid:
        params["channel_id"] = chid
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


def cmd_relationships_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/articles/{ns.id}/relationships")
    r.raise_for_status()
    print_json(r.json())


def cmd_relationships_create(ns: argparse.Namespace) -> None:
    path = f"/api/articles/{ns.id}/relationships"
    body: dict[str, Any] = {
        "target_article_id": ns.target_id,
        "relation_type": ns.relation_type,
    }
    if ns.note:
        body["note"] = ns.note
    confirm_or_abort(
        "create article relationship (outgoing edge)",
        "POST",
        path,
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_reviews_latest(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/articles/{ns.id}/reviews/latest")
    r.raise_for_status()
    print_json(r.json())


def cmd_reviews_list(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit:
        params["limit"] = ns.limit
    with client() as s:
        r = s.get(f"/api/articles/{ns.id}/reviews", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_review_run(ns: argparse.Namespace) -> None:
    path = f"/api/articles/{ns.id}/review"
    body: dict[str, Any] = {}
    if ns.model_id:
        body["model_id"] = ns.model_id
    if ns.prompt:
        body["prompt"] = ns.prompt
    confirm_or_abort(
        "run article content review (LLM rubric)",
        "POST",
        path,
        body or None,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post(path, json=body or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_relationships_delete(ns: argparse.Namespace) -> None:
    path = f"/api/articles/{ns.id}/relationships/{ns.relationship_id}"
    confirm_or_abort(
        "delete article relationship (outgoing only)",
        "DELETE",
        path,
        None,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted relationship {ns.relationship_id} from article {ns.id}")


def add_subparser(sub) -> None:
    p = sub.add_parser("articles", help="Articles")
    sp = p.add_subparsers(dest="ar_cmd", required=True)

    cr = sp.add_parser("create", help="Create article")
    cr.add_argument(
        "--channel-id",
        default="",
        help="article channel UUID (or set default_article_channel_id in config.yml)",
    )
    cr.add_argument("--name", required=True)
    cr.add_argument("--markdown", default="")
    cr.add_argument("--markdown-file", default="")
    cr.add_argument("--origin-url", default="")
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    fu = sp.add_parser("from-url", help="Fetch URL and create article (HTML simplified)")
    fu.add_argument(
        "--channel-id",
        default="",
        help="article channel UUID (or set default_article_channel_id in config.yml)",
    )
    fu.add_argument("--url", required=True)
    fu.add_argument("--name", default="")
    add_write_flags(fu)
    fu.set_defaults(fn=cmd_from_url)

    ls = sp.add_parser("list", help="List articles (GET /api/articles)")
    ls.add_argument(
        "--channel-id",
        default="",
        help="filter by channel (or use default_article_channel_id from config.yml)",
    )
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

    rev = sp.add_parser(
        "review",
        help="LLM content review (channel rubric; requires review model on article channel)",
    )
    rvr = rev.add_subparsers(dest="ar_review_cmd", required=True)
    rrun = rvr.add_parser("run", help="Run a new review and persist result")
    rrun.add_argument("--id", required=True, dest="id", help="article id")
    rrun.add_argument("--model-id", default="", help="override channel review_model_id")
    rrun.add_argument("--prompt", default="", help="override channel review_prompt")
    add_write_flags(rrun)
    rrun.set_defaults(fn=cmd_review_run)

    revs = sp.add_parser("reviews", help="Persisted content review history")
    rvsp = revs.add_subparsers(dest="ar_reviews_cmd", required=True)
    rvlatest = rvsp.add_parser("latest", help="Latest rubric review for an article")
    rvlatest.add_argument("--id", required=True, dest="id", help="article id")
    rvlatest.set_defaults(fn=cmd_reviews_latest)
    rvlist = rvsp.add_parser("list", help="Recent reviews (newest first)")
    rvlist.add_argument("--id", required=True, dest="id", help="article id")
    rvlist.add_argument("--limit", type=int, default=0, help="max rows (server default 20, cap 50)")
    rvlist.set_defaults(fn=cmd_reviews_list)

    rel = sp.add_parser(
        "relationships",
        help="Lineage edges between articles (outgoing/incoming; same relation types as documents)",
    )
    rsp = rel.add_subparsers(dest="ar_rel_cmd", required=True)
    rls = rsp.add_parser("list", help="List outgoing and incoming relationships")
    rls.add_argument("--id", required=True, dest="id", help="article id")
    rls.set_defaults(fn=cmd_relationships_list)
    rcr = rsp.add_parser(
        "create",
        help="Create outgoing edge: this article → target (e.g. supersedes, amends)",
    )
    rcr.add_argument("--id", required=True, dest="id", help="source article id")
    rcr.add_argument("--target-id", required=True, help="target article id")
    rcr.add_argument(
        "--relation-type",
        required=True,
        choices=_ARTICLE_RELATION_TYPES,
        help="edge type",
    )
    rcr.add_argument("--note", default="")
    add_write_flags(rcr)
    rcr.set_defaults(fn=cmd_relationships_create)
    rdl = rsp.add_parser(
        "delete",
        help="Delete an outgoing relationship by id (source must be --id)",
    )
    rdl.add_argument("--id", required=True, dest="id", help="source article id")
    rdl.add_argument("--relationship-id", required=True)
    add_write_flags(rdl)
    rdl.set_defaults(fn=cmd_relationships_delete)
