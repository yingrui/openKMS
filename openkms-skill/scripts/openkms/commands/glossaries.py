"""glossaries — CRUD for glossaries, terms, export/import, AI suggest."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def _parse_json_arg(label: str, value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError as e:
        print(f"--{label}: invalid JSON ({e})", file=sys.stderr)
        sys.exit(2)


# --- Glossary ---


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/glossaries")
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/glossaries/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name.strip()}
    if ns.description:
        body["description"] = ns.description.strip()
    confirm_or_abort("create glossary", "POST", "/api/glossaries", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/glossaries", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.name is not None:
        body["name"] = ns.name
    if ns.description is not None:
        body["description"] = ns.description
    if not body:
        print("glossaries update: nothing to update (no fields supplied)", file=sys.stderr)
        sys.exit(2)
    path = f"/api/glossaries/{ns.id}"
    confirm_or_abort("update glossary", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/glossaries/{ns.id}"
    confirm_or_abort("delete glossary", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted glossary {ns.id}")


def cmd_export(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/glossaries/{ns.glossary_id}/export")
    r.raise_for_status()
    print_json(r.json())


def cmd_import(ns: argparse.Namespace) -> None:
    raw = Path(ns.terms_file).read_text(encoding="utf-8")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"invalid JSON in --terms-file: {e}", file=sys.stderr)
        sys.exit(2)
    if isinstance(payload, list):
        body: dict[str, Any] = {"terms": payload, "mode": ns.mode}
    elif isinstance(payload, dict):
        body = dict(payload)
        if "terms" not in body:
            print("--terms-file: object must contain a 'terms' array", file=sys.stderr)
            sys.exit(2)
        if ns.mode != "append":
            body["mode"] = ns.mode
        elif "mode" not in body:
            body["mode"] = "append"
    else:
        print("--terms-file: top-level value must be an object or array", file=sys.stderr)
        sys.exit(2)
    path = f"/api/glossaries/{ns.glossary_id}/import"
    confirm_or_abort("import glossary terms", "POST", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


# --- Terms ---


def cmd_terms_list(ns: argparse.Namespace) -> None:
    params: dict[str, str] = {}
    if ns.search:
        params["search"] = ns.search
    with client() as s:
        r = s.get(f"/api/glossaries/{ns.glossary_id}/terms", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_terms_get(ns: argparse.Namespace) -> None:
    path = f"/api/glossaries/{ns.glossary_id}/terms/{ns.term_id}"
    with client() as s:
        r = s.get(path)
    r.raise_for_status()
    print_json(r.json())


def cmd_terms_create(ns: argparse.Namespace) -> None:
    if not (ns.primary_en or "").strip() and not (ns.primary_cn or "").strip():
        print("terms create: provide at least one of --primary-en or --primary-cn", file=sys.stderr)
        sys.exit(2)
    body: dict[str, Any] = {}
    if ns.primary_en:
        body["primary_en"] = ns.primary_en
    if ns.primary_cn:
        body["primary_cn"] = ns.primary_cn
    if ns.definition:
        body["definition"] = ns.definition
    if ns.synonyms_en_json:
        se = _parse_json_arg("synonyms-en-json", ns.synonyms_en_json)
        if not isinstance(se, list):
            print("--synonyms-en-json: must be a JSON array of strings", file=sys.stderr)
            sys.exit(2)
        body["synonyms_en"] = se
    if ns.synonyms_cn_json:
        sc = _parse_json_arg("synonyms-cn-json", ns.synonyms_cn_json)
        if not isinstance(sc, list):
            print("--synonyms-cn-json: must be a JSON array of strings", file=sys.stderr)
            sys.exit(2)
        body["synonyms_cn"] = sc
    path = f"/api/glossaries/{ns.glossary_id}/terms"
    confirm_or_abort("create glossary term", "POST", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_terms_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.primary_en is not None:
        body["primary_en"] = ns.primary_en
    if ns.primary_cn is not None:
        body["primary_cn"] = ns.primary_cn
    if ns.definition is not None:
        body["definition"] = ns.definition
    if ns.synonyms_en_json is not None:
        se = _parse_json_arg("synonyms-en-json", ns.synonyms_en_json)
        if not isinstance(se, list):
            print("--synonyms-en-json: must be a JSON array of strings", file=sys.stderr)
            sys.exit(2)
        body["synonyms_en"] = se
    if ns.synonyms_cn_json is not None:
        sc = _parse_json_arg("synonyms-cn-json", ns.synonyms_cn_json)
        if not isinstance(sc, list):
            print("--synonyms-cn-json: must be a JSON array of strings", file=sys.stderr)
            sys.exit(2)
        body["synonyms_cn"] = sc
    if not body:
        print("terms update: nothing to update (no fields supplied)", file=sys.stderr)
        sys.exit(2)
    path = f"/api/glossaries/{ns.glossary_id}/terms/{ns.term_id}"
    confirm_or_abort("update glossary term", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_terms_delete(ns: argparse.Namespace) -> None:
    path = f"/api/glossaries/{ns.glossary_id}/terms/{ns.term_id}"
    confirm_or_abort("delete glossary term", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted term {ns.term_id}")


def cmd_terms_suggest(ns: argparse.Namespace) -> None:
    if not (ns.primary_en or "").strip() and not (ns.primary_cn or "").strip():
        print("terms suggest: provide at least one of --primary-en or --primary-cn", file=sys.stderr)
        sys.exit(2)
    body: dict[str, Any] = {}
    if ns.primary_en:
        body["primary_en"] = ns.primary_en
    if ns.primary_cn:
        body["primary_cn"] = ns.primary_cn
    path = f"/api/glossaries/{ns.glossary_id}/terms/suggest"
    confirm_or_abort(
        "suggest glossary term (LLM)",
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


def add_subparser(sub) -> None:
    p = sub.add_parser("glossaries", help="Glossaries and terms")
    sp = p.add_subparsers(dest="gl_cmd", required=True)

    sp.add_parser("list", help="List glossaries").set_defaults(fn=cmd_list)
    g = sp.add_parser("get", help="Get one glossary")
    g.add_argument("--id", required=True)
    g.set_defaults(fn=cmd_get)

    c = sp.add_parser("create", help="Create glossary")
    c.add_argument("--name", required=True)
    c.add_argument("--description", default="")
    add_write_flags(c)
    c.set_defaults(fn=cmd_create)

    u = sp.add_parser("update", help="Update glossary metadata")
    u.add_argument("--id", required=True)
    u.add_argument("--name", default=None)
    u.add_argument("--description", default=None)
    add_write_flags(u)
    u.set_defaults(fn=cmd_update)

    d = sp.add_parser("delete", help="Delete glossary and all its terms")
    d.add_argument("--id", required=True)
    add_write_flags(d)
    d.set_defaults(fn=cmd_delete)

    ex = sp.add_parser("export", help="Export glossary terms as JSON payload")
    ex.add_argument("--glossary-id", required=True)
    ex.set_defaults(fn=cmd_export)

    im = sp.add_parser("import", help="Bulk-import terms (append or replace)")
    im.add_argument("--glossary-id", required=True)
    im.add_argument(
        "--terms-file",
        required=True,
        help="JSON: {terms:[...], mode?} or a bare array of term objects",
    )
    im.add_argument(
        "--mode",
        choices=("append", "replace"),
        default="append",
        help="when --terms-file is a bare array, sets import mode (default append)",
    )
    add_write_flags(im)
    im.set_defaults(fn=cmd_import)

    tp = sp.add_parser("terms", help="Terms under a glossary")
    tsp = tp.add_subparsers(dest="gl_term_cmd", required=True)

    tl = tsp.add_parser("list", help="List terms (optional substring search)")
    tl.add_argument("--glossary-id", required=True)
    tl.add_argument("--search", default="")
    tl.set_defaults(fn=cmd_terms_list)

    tg = tsp.add_parser("get", help="Get one term")
    tg.add_argument("--glossary-id", required=True)
    tg.add_argument("--term-id", required=True)
    tg.set_defaults(fn=cmd_terms_get)

    tc = tsp.add_parser("create", help="Create term (at least one primary label)")
    tc.add_argument("--glossary-id", required=True)
    tc.add_argument("--primary-en", default="")
    tc.add_argument("--primary-cn", default="")
    tc.add_argument("--definition", default="")
    tc.add_argument(
        "--synonyms-en-json",
        default="",
        help='JSON array of English synonyms, e.g. \'["foo","bar"]\'',
    )
    tc.add_argument("--synonyms-cn-json", default="")
    add_write_flags(tc)
    tc.set_defaults(fn=cmd_terms_create)

    tu = tsp.add_parser("update", help="Patch term fields")
    tu.add_argument("--glossary-id", required=True)
    tu.add_argument("--term-id", required=True)
    tu.add_argument("--primary-en", default=None)
    tu.add_argument("--primary-cn", default=None)
    tu.add_argument("--definition", default=None)
    tu.add_argument("--synonyms-en-json", default=None)
    tu.add_argument("--synonyms-cn-json", default=None)
    add_write_flags(tu)
    tu.set_defaults(fn=cmd_terms_update)

    td = tsp.add_parser("delete", help="Delete one term")
    td.add_argument("--glossary-id", required=True)
    td.add_argument("--term-id", required=True)
    add_write_flags(td)
    td.set_defaults(fn=cmd_terms_delete)

    ts = tsp.add_parser(
        "suggest",
        help="LLM suggestion for translation / synonyms (requires default LLM in app)",
    )
    ts.add_argument("--glossary-id", required=True)
    ts.add_argument("--primary-en", default="")
    ts.add_argument("--primary-cn", default="")
    add_write_flags(ts)
    ts.set_defaults(fn=cmd_terms_suggest)
