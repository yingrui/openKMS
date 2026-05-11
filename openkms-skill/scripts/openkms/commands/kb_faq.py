"""kb-faq — create (existing) + list (new)."""
from __future__ import annotations

import argparse

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_create(ns: argparse.Namespace) -> None:
    path = f"/api/knowledge-bases/{ns.kb_id}/faqs"
    body = {"question": ns.question, "answer": ns.answer}
    confirm_or_abort("create KB FAQ", "POST", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit:
        params["limit"] = ns.limit
    if ns.offset:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(f"/api/knowledge-bases/{ns.kb_id}/faqs", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("kb-faq", help="Knowledge base FAQs")
    sp = p.add_subparsers(dest="fq_cmd", required=True)

    c = sp.add_parser("create", help="Create FAQ pair")
    c.add_argument("--kb-id", required=True)
    c.add_argument("--question", required=True)
    c.add_argument("--answer", required=True)
    add_write_flags(c)
    c.set_defaults(fn=cmd_create)

    ls = sp.add_parser("list", help="List FAQs (GET .../faqs)")
    ls.add_argument("--kb-id", required=True)
    ls.add_argument("--limit", type=int, default=0)
    ls.add_argument("--offset", type=int, default=0)
    ls.set_defaults(fn=cmd_list)
