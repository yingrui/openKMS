"""App Builder apps — list / get / create / patch / synthesize / publish / delete."""
from __future__ import annotations

import argparse
import json
import sys
from argparse import _SubParsersAction
from pathlib import Path
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from .._io import print_json
from ..client import client


def _load_json_file(path: str) -> Any:
    p = Path(path)
    return json.loads(p.read_text(encoding="utf-8"))


def _parse_bindings_json(raw: str) -> dict[str, Any]:
    bindings = json.loads(raw)
    if not isinstance(bindings, dict):
        print("--bindings-json must be a JSON object", file=sys.stderr)
        sys.exit(1)
    return bindings


def _messages_as_components(app_id: str, messages: list[Any]) -> list[dict[str, Any]]:
    with client() as s:
        design = s.get(f"/api/app-builder/apps/{app_id}/design")
        design.raise_for_status()
        comps = design.json().get("components") or []
    if not comps:
        print("App has no draft components", file=sys.stderr)
        sys.exit(1)
    out: list[dict[str, Any]] = []
    for i, c in enumerate(comps):
        out.append(
            {
                "id": c["id"],
                "name": c.get("name") or "",
                "position": c.get("position") if c.get("position") is not None else i,
                "is_default": bool(c.get("is_default")),
                "messages": messages if i == 0 else (c.get("messages") or []),
            }
        )
    return out


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/app-builder/apps")
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    path = f"/api/app-builder/apps/{ns.id}"
    if ns.design:
        path = f"{path}/design"
    with client() as s:
        r = s.get(path)
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "name": ns.name,
        "api_name": ns.api_name,
        "template_id": ns.template_id or "a2ui",
    }
    if ns.description is not None:
        body["description"] = ns.description
    if ns.bindings_json:
        body["bindings"] = _parse_bindings_json(ns.bindings_json)
    path = "/api/app-builder/apps"
    confirm_or_abort(f"create app {ns.api_name}", "POST", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_patch(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.name is not None:
        body["name"] = ns.name
    if ns.description is not None:
        body["description"] = ns.description
    if ns.bindings_json:
        body["bindings"] = _parse_bindings_json(ns.bindings_json)
    if ns.components_file:
        raw = _load_json_file(ns.components_file)
        if not isinstance(raw, list):
            print("--components-file must be a JSON array of components", file=sys.stderr)
            sys.exit(1)
        body["components"] = raw
    elif ns.a2ui_messages_file:
        raw = _load_json_file(ns.a2ui_messages_file)
        if not isinstance(raw, list):
            print("--a2ui-messages-file must be a JSON array of A2UI messages", file=sys.stderr)
            sys.exit(1)
        body["components"] = _messages_as_components(ns.id, raw)
    if not body:
        print(
            "Nothing to patch — pass --name / --description / --bindings-json / "
            "--components-file / --a2ui-messages-file",
            file=sys.stderr,
        )
        sys.exit(1)
    path = f"/api/app-builder/apps/{ns.id}"
    confirm_or_abort(f"patch app {ns.id}", "PATCH", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_synthesize(ns: argparse.Namespace) -> None:
    path = f"/api/app-builder/apps/{ns.id}/synthesize"
    confirm_or_abort(f"reset layout (synthesize) app {ns.id}", "POST", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path)
    r.raise_for_status()
    print_json(r.json())


def cmd_publish(ns: argparse.Namespace) -> None:
    body: dict[str, Any] | None = None
    if ns.a2ui_messages_file:
        raw = _load_json_file(ns.a2ui_messages_file)
        if not isinstance(raw, list):
            print("--a2ui-messages-file must be a JSON array", file=sys.stderr)
            sys.exit(1)
        body = {"components": _messages_as_components(ns.id, raw)}
    path = f"/api/app-builder/apps/{ns.id}/publish"
    confirm_or_abort(f"publish app {ns.id}", "POST", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/app-builder/apps/{ns.id}"
    confirm_or_abort(f"delete app {ns.id}", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print_json({"ok": True, "id": ns.id})


def add_subparser(sub: _SubParsersAction) -> None:
    p = sub.add_parser("apps", help="Ontology apps (App Builder / Apps runtime)")
    sp = p.add_subparsers(dest="apps_cmd", required=True)

    ls = sp.add_parser("list", help="List apps (GET /api/app-builder/apps)")
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get app run doc or design draft")
    gt.add_argument("id", help="app id, e.g. oa-…")
    gt.add_argument("--design", action="store_true", help="GET …/design (draft A2UI)")
    gt.set_defaults(fn=cmd_get)

    cr = sp.add_parser("create", help="Create stub draft app (POST /api/app-builder/apps)")
    cr.add_argument("--name", required=True)
    cr.add_argument("--api-name", required=True)
    cr.add_argument("--description", default=None)
    cr.add_argument("--template-id", default="a2ui", help="App kind (default a2ui)")
    cr.add_argument(
        "--bindings-json",
        default=None,
        help='Resource allowlist JSON, e.g. \'{"objectTypes":["WorkItem"],"actions":[...]}\'',
    )
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    pt = sp.add_parser("patch", help="Patch app metadata / draft (PATCH /api/app-builder/apps/{id})")
    pt.add_argument("id")
    pt.add_argument("--name", default=None)
    pt.add_argument("--description", default=None)
    pt.add_argument("--bindings-json", default=None, help="Resource allowlist JSON object")
    pt.add_argument("--components-file", metavar="FILE", help="JSON array of draft components")
    pt.add_argument(
        "--a2ui-messages-file",
        metavar="FILE",
        help="JSON array of A2UI messages (replaces first artifact messages)",
    )
    add_write_flags(pt)
    pt.set_defaults(fn=cmd_patch)

    syn = sp.add_parser("synthesize", help="Reset draft to stub layout (POST …/synthesize)")
    syn.add_argument("id")
    add_write_flags(syn)
    syn.set_defaults(fn=cmd_synthesize)

    pb = sp.add_parser("publish", help="Publish draft (POST …/publish)")
    pb.add_argument("id")
    pb.add_argument(
        "--a2ui-messages-file",
        metavar="FILE",
        help="Optional JSON array; publish these messages on the first artifact",
    )
    add_write_flags(pb)
    pb.set_defaults(fn=cmd_publish)

    dl = sp.add_parser("delete", help="Delete app (DELETE /api/app-builder/apps/{id})")
    dl.add_argument("id")
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_delete)
