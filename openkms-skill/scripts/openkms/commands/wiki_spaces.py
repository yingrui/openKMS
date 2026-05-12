"""wiki-spaces — list / create / linked documents."""
from __future__ import annotations

import argparse
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/wiki-spaces")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name.strip()}
    if ns.description:
        body["description"] = ns.description.strip()
    confirm_or_abort("create wiki space", "POST", "/api/wiki-spaces", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/wiki-spaces", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_documents_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/wiki-spaces/{ns.space_id}/documents")
    r.raise_for_status()
    print_json(r.json())


def cmd_documents_link(ns: argparse.Namespace) -> None:
    path = f"/api/wiki-spaces/{ns.space_id}/documents"
    body: dict[str, Any] = {"document_id": ns.document_id}
    confirm_or_abort(
        "link document to wiki space",
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


def cmd_documents_unlink(ns: argparse.Namespace) -> None:
    path = f"/api/wiki-spaces/{ns.space_id}/documents/{ns.document_id}"
    confirm_or_abort(
        "unlink document from wiki space",
        "DELETE",
        path,
        None,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"unlinked document {ns.document_id} from wiki space {ns.space_id}")


def add_subparser(sub) -> None:
    p = sub.add_parser("wiki-spaces", help="Wiki spaces")
    sp = p.add_subparsers(dest="wk_cmd", required=True)
    sp.add_parser("list", help="List spaces").set_defaults(fn=cmd_list)
    c = sp.add_parser("create", help="Create space")
    c.add_argument("--name", required=True)
    c.add_argument("--description", default="")
    add_write_flags(c)
    c.set_defaults(fn=cmd_create)

    doc = sp.add_parser("documents", help="Channel documents linked to a wiki space (same as UI linked documents)")
    dsp = doc.add_subparsers(dest="wk_doc_cmd", required=True)
    dl = dsp.add_parser("list", help="List linked documents (GET …/documents)")
    dl.add_argument("--space-id", required=True)
    dl.set_defaults(fn=cmd_documents_list)
    lk = dsp.add_parser("link", help="Link an existing document (POST …/documents)")
    lk.add_argument("--space-id", required=True)
    lk.add_argument("--document-id", required=True)
    add_write_flags(lk)
    lk.set_defaults(fn=cmd_documents_link)
    ul = dsp.add_parser("unlink", help="Remove link only (DELETE …/documents/{document_id})")
    ul.add_argument("--space-id", required=True)
    ul.add_argument("--document-id", required=True)
    add_write_flags(ul)
    ul.set_defaults(fn=cmd_documents_unlink)
