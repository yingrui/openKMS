"""kb — knowledge bases: list / get / search / ask / wiki-spaces / index."""
from __future__ import annotations

import argparse

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/knowledge-bases")
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/knowledge-bases/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_search(ns: argparse.Namespace) -> None:
    body: dict[str, object] = {"query": ns.q}
    if ns.limit:
        body["top_k"] = ns.limit
    with client() as s:
        r = s.post(f"/api/knowledge-bases/{ns.id}/search", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_ask(ns: argparse.Namespace) -> None:
    body = {"question": ns.question}
    with client() as s:
        r = s.post(f"/api/knowledge-bases/{ns.id}/ask", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_wiki_spaces_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/knowledge-bases/{ns.kb_id}/wiki-spaces")
    r.raise_for_status()
    print_json(r.json())


def cmd_wiki_spaces_reindex(ns: argparse.Namespace) -> None:
    path = (
        f"/api/knowledge-bases/{ns.kb_id}/wiki-spaces/{ns.space_id}/index-job"
    )
    confirm_or_abort(
        "queue KB wiki-space reindex",
        "POST",
        path,
        None,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post(path)
    r.raise_for_status()
    print_json(r.json())


def cmd_index(ns: argparse.Namespace) -> None:
    path = f"/api/knowledge-bases/{ns.id}/index-job"
    confirm_or_abort(
        "queue full KB reindex",
        "POST",
        path,
        None,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post(path)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("kb", help="Knowledge bases")
    sp = p.add_subparsers(dest="kb_cmd", required=True)

    sp.add_parser("list", help="List KBs (GET /api/knowledge-bases)").set_defaults(fn=cmd_list)

    g = sp.add_parser("get", help="Get KB with stats (GET /api/knowledge-bases/{id})")
    g.add_argument("--id", required=True)
    g.set_defaults(fn=cmd_get)

    se = sp.add_parser("search", help="Semantic search over chunks + FAQs (POST .../search)")
    se.add_argument("--id", required=True)
    se.add_argument("--q", required=True, help="Query string")
    se.add_argument("--limit", type=int, default=0)
    se.set_defaults(fn=cmd_search)

    a = sp.add_parser("ask", help="Ask the QA agent for a grounded answer (POST .../ask)")
    a.add_argument("--id", required=True)
    a.add_argument("--question", required=True)
    a.set_defaults(fn=cmd_ask)

    idx = sp.add_parser(
        "index",
        help="Queue full KB reindex — documents, linked wiki spaces, FAQ embeddings (POST .../index-job)",
    )
    idx.add_argument("--id", required=True, help="Knowledge base id")
    add_write_flags(idx)
    idx.set_defaults(fn=cmd_index)

    ws = sp.add_parser("wiki-spaces", help="Wiki spaces linked to a knowledge base")
    wsp = ws.add_subparsers(dest="kb_wiki_spaces_cmd", required=True)

    wsl = wsp.add_parser(
        "list",
        help="List wiki spaces linked to a KB (GET .../wiki-spaces)",
    )
    wsl.add_argument("--kb-id", required=True, help="Knowledge base id")
    wsl.set_defaults(fn=cmd_wiki_spaces_list)

    wsr = wsp.add_parser(
        "reindex",
        help=(
            "Re-index wiki pages from one linked space into the KB "
            "(POST .../wiki-spaces/{space_id}/index-job); replaces that space's wiki chunks"
        ),
    )
    wsr.add_argument("--kb-id", required=True, help="Knowledge base id")
    wsr.add_argument("--space-id", required=True, help="Linked wiki space id")
    add_write_flags(wsr)
    wsr.set_defaults(fn=cmd_wiki_spaces_reindex)
