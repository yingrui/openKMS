#!/usr/bin/env python3
"""openKMS skill CLI — thin wrappers over the public REST API (Bearer personal API key)."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
import yaml

SKILL_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = SKILL_ROOT / "config.yml"


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.is_file():
        print(
            f"Missing {CONFIG_PATH}. Copy config.yml.example to config.yml and set api_base_url and api_key.",
            file=sys.stderr,
        )
        sys.exit(2)
    raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        print("config.yml must be a mapping.", file=sys.stderr)
        sys.exit(2)
    base = str(raw.get("api_base_url", "")).strip().rstrip("/")
    key = str(raw.get("api_key", "")).strip()
    if not base or not key:
        print("config.yml must define api_base_url and api_key.", file=sys.stderr)
        sys.exit(2)
    return {"api_base_url": base, "api_key": key, "raw": raw}


def client() -> httpx.Client:
    c = load_config()
    return httpx.Client(
        base_url=c["api_base_url"],
        headers={"Authorization": f"Bearer {c['api_key']}"},
        timeout=120.0,
    )


def _print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, default=str))


def _html_to_markish(html: str) -> str:
    t = re.sub(r"(?is)<script[^>]*>.*?</script>", "", html)
    t = re.sub(r"(?is)<style[^>]*>.*?</style>", "", t)
    t = re.sub(r"(?is)<br\s*/?>", "\n", t)
    t = re.sub(r"(?is)</p>", "\n\n", t)
    t = re.sub(r"(?is)<[^>]+>", "", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def cmd_ping(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/auth/me")
    r.raise_for_status()
    _print_json(r.json())


def cmd_doc_channels_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/document-channels")
    r.raise_for_status()
    _print_json(r.json())


def cmd_doc_channels_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name, "sort_order": ns.sort_order}
    if ns.description:
        body["description"] = ns.description
    if ns.parent_id:
        body["parent_id"] = ns.parent_id
    with client() as s:
        r = s.post("/api/document-channels", json=body)
    r.raise_for_status()
    _print_json(r.json())


def cmd_article_channels_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/article-channels")
    r.raise_for_status()
    _print_json(r.json())


def cmd_article_channels_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name, "sort_order": ns.sort_order}
    if ns.description:
        body["description"] = ns.description
    if ns.parent_id:
        body["parent_id"] = ns.parent_id
    with client() as s:
        r = s.post("/api/article-channels", json=body)
    r.raise_for_status()
    _print_json(r.json())


def cmd_documents_upload(ns: argparse.Namespace) -> None:
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
    _print_json(r.json())


def cmd_articles_create(ns: argparse.Namespace) -> None:
    md = ns.markdown or ""
    if ns.markdown_file:
        md = Path(ns.markdown_file).read_text(encoding="utf-8")
    body: dict[str, Any] = {"channel_id": ns.channel_id, "name": ns.name, "markdown": md or None}
    if ns.origin_url:
        body["origin_article_id"] = ns.origin_url
    with client() as s:
        r = s.post("/api/articles", json=body)
    r.raise_for_status()
    _print_json(r.json())


def cmd_articles_from_url(ns: argparse.Namespace) -> None:
    with httpx.Client(timeout=60.0, follow_redirects=True) as u:
        fr = u.get(ns.url)
    fr.raise_for_status()
    ctype = (fr.headers.get("content-type") or "").lower()
    text = fr.text
    if "html" in ctype:
        body_md = _html_to_markish(text)
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
    _print_json(r.json())


def cmd_eval_list(ns: argparse.Namespace) -> None:
    params = {}
    if ns.kb_id:
        params["knowledge_base_id"] = ns.kb_id
    with client() as s:
        r = s.get("/api/evaluation-datasets", params=params or None)
    r.raise_for_status()
    _print_json(r.json())


def cmd_eval_create(ns: argparse.Namespace) -> None:
    body = {"name": ns.name, "knowledge_base_id": ns.kb_id}
    if ns.description:
        body["description"] = ns.description
    with client() as s:
        r = s.post("/api/evaluation-datasets", json=body)
    r.raise_for_status()
    _print_json(r.json())


def cmd_kb_faq_create(ns: argparse.Namespace) -> None:
    body = {"question": ns.question, "answer": ns.answer}
    with client() as s:
        r = s.post(f"/api/knowledge-bases/{ns.kb_id}/faqs", json=body)
    r.raise_for_status()
    _print_json(r.json())


def cmd_wiki_spaces_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/wiki-spaces")
    r.raise_for_status()
    _print_json(r.json())


def cmd_wiki_spaces_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name.strip()}
    if ns.description:
        body["description"] = ns.description.strip()
    with client() as s:
        r = s.post("/api/wiki-spaces", json=body)
    r.raise_for_status()
    _print_json(r.json())


def cmd_wiki_put_page(ns: argparse.Namespace) -> None:
    raw = Path(ns.file).read_text(encoding="utf-8")
    path_enc = quote(ns.path.strip("/").lstrip("/"), safe="")
    body = {"title": ns.title, "body": raw, "metadata": None}
    with client() as s:
        r = s.put(f"/api/wiki-spaces/{ns.space_id}/pages/by-path/{path_enc}", json=body)
    r.raise_for_status()
    _print_json(r.json())


def main() -> None:
    p = argparse.ArgumentParser(prog="openkms-skill")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("ping", help="GET /api/auth/me").set_defaults(fn=cmd_ping)

    dcl = sub.add_parser("document-channels", help="Document channels")
    dcl_sub = dcl.add_subparsers(dest="dcl_cmd", required=True)
    dcl_sub.add_parser("list", help="List tree").set_defaults(fn=cmd_doc_channels_list)
    dcc = dcl_sub.add_parser("create", help="Create channel")
    dcc.add_argument("--name", required=True)
    dcc.add_argument("--description", default="")
    dcc.add_argument("--parent-id", default="")
    dcc.add_argument("--sort-order", type=int, default=0)
    dcc.set_defaults(fn=cmd_doc_channels_create)

    acl = sub.add_parser("article-channels", help="Article channels")
    acl_sub = acl.add_subparsers(dest="acl_cmd", required=True)
    acl_sub.add_parser("list", help="List tree").set_defaults(fn=cmd_article_channels_list)
    acc = acl_sub.add_parser("create", help="Create channel")
    acc.add_argument("--name", required=True)
    acc.add_argument("--description", default="")
    acc.add_argument("--parent-id", default="")
    acc.add_argument("--sort-order", type=int, default=0)
    acc.set_defaults(fn=cmd_article_channels_create)

    du = sub.add_parser("documents", help="Documents")
    du_sub = du.add_subparsers(dest="doc_cmd", required=True)
    dup = du_sub.add_parser("upload", help="Upload file to channel")
    dup.add_argument("--channel-id", required=True)
    dup.add_argument("--file", required=True)
    dup.set_defaults(fn=cmd_documents_upload)

    ar = sub.add_parser("articles", help="Articles")
    ar_sub = ar.add_subparsers(dest="ar_cmd", required=True)
    arc = ar_sub.add_parser("create", help="Create article")
    arc.add_argument("--channel-id", required=True)
    arc.add_argument("--name", required=True)
    arc.add_argument("--markdown", default="")
    arc.add_argument("--markdown-file", default="")
    arc.add_argument("--origin-url", default="")
    arc.set_defaults(fn=cmd_articles_create)
    aru = ar_sub.add_parser("from-url", help="Fetch URL and create article (HTML simplified)")
    aru.add_argument("--channel-id", required=True)
    aru.add_argument("--url", required=True)
    aru.add_argument("--name", default="")
    aru.set_defaults(fn=cmd_articles_from_url)

    ev = sub.add_parser("evaluation-datasets", help="Evaluation datasets")
    ev_sub = ev.add_subparsers(dest="ev_cmd", required=True)
    evl = ev_sub.add_parser("list", help="List datasets")
    evl.add_argument("--kb-id", default="")
    evl.set_defaults(fn=cmd_eval_list)
    evc = ev_sub.add_parser("create", help="Create dataset")
    evc.add_argument("--name", required=True)
    evc.add_argument("--kb-id", required=True)
    evc.add_argument("--description", default="")
    evc.set_defaults(fn=cmd_eval_create)

    fq = sub.add_parser("kb-faq", help="Knowledge base FAQs")
    fq_sub = fq.add_subparsers(dest="fq_cmd", required=True)
    fqc = fq_sub.add_parser("create", help="Create FAQ pair")
    fqc.add_argument("--kb-id", required=True)
    fqc.add_argument("--question", required=True)
    fqc.add_argument("--answer", required=True)
    fqc.set_defaults(fn=cmd_kb_faq_create)

    wk = sub.add_parser("wiki-spaces", help="Wiki spaces")
    wk_sub = wk.add_subparsers(dest="wk_cmd", required=True)
    wk_sub.add_parser("list", help="List spaces").set_defaults(fn=cmd_wiki_spaces_list)
    wkc = wk_sub.add_parser("create", help="Create space")
    wkc.add_argument("--name", required=True)
    wkc.add_argument("--description", default="")
    wkc.set_defaults(fn=cmd_wiki_spaces_create)

    wp = sub.add_parser("wiki", help="Wiki pages")
    wp_sub = wp.add_subparsers(dest="wp_cmd", required=True)
    wpp = wp_sub.add_parser("put-page", help="Upsert page by path (PUT by-path)")
    wpp.add_argument("--space-id", required=True)
    wpp.add_argument("--path", required=True, help="Obsidian-style path, e.g. notes/hello")
    wpp.add_argument("--title", required=True)
    wpp.add_argument("--file", required=True, help="Markdown file")
    wpp.set_defaults(fn=cmd_wiki_put_page)

    ns = p.parse_args()
    try:
        ns.fn(ns)
    except httpx.HTTPStatusError as e:
        detail = e.response.text
        try:
            detail = json.dumps(e.response.json(), indent=2)
        except Exception:
            pass
        print(f"HTTP {e.response.status_code}\n{detail}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
