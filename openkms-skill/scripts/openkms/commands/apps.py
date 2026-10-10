"""Module Apps — list / get / create / patch / publish / delete (hosted Kubernetes Services)."""
from __future__ import annotations

import argparse
import json
import sys
from argparse import _SubParsersAction
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from .._io import print_json
from ..client import client


def _parse_bindings_json(raw: str) -> dict[str, Any]:
    bindings = json.loads(raw)
    if not isinstance(bindings, dict):
        print("--bindings-json must be a JSON object", file=sys.stderr)
        sys.exit(1)
    return bindings


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/app-builder/apps")
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/app-builder/apps/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "name": ns.name,
        "api_name": ns.api_name,
        "template_id": "module",
    }
    if ns.description is not None:
        body["description"] = ns.description
    if ns.bindings_json:
        body["bindings"] = _parse_bindings_json(ns.bindings_json)
    path = "/api/app-builder/apps"
    confirm_or_abort(f"create module app {ns.api_name}", "POST", path, body, ns.yes, ns.dry_run)
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
    if not body:
        print(
            "Nothing to patch — pass --name / --description / --bindings-json",
            file=sys.stderr,
        )
        sys.exit(1)
    path = f"/api/app-builder/apps/{ns.id}"
    confirm_or_abort(f"patch app {ns.id}", "PATCH", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_publish(ns: argparse.Namespace) -> None:
    path = f"/api/app-builder/apps/{ns.id}/publish"
    confirm_or_abort(f"publish app {ns.id}", "POST", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json={})
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
    p = sub.add_parser("apps", help="Module Apps (hosted Kubernetes Services)")
    sp = p.add_subparsers(dest="apps_cmd", required=True)

    ls = sp.add_parser("list", help="List apps (GET /api/app-builder/apps)")
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get published app run doc")
    gt.add_argument("id", help="app id, e.g. oa-…")
    gt.set_defaults(fn=cmd_get)

    cr = sp.add_parser("create", help="Register a module app (POST /api/app-builder/apps)")
    cr.add_argument("--name", required=True)
    cr.add_argument("--api-name", required=True)
    cr.add_argument("--description", default=None)
    cr.add_argument(
        "--bindings-json",
        required=True,
        help='Must include k8s, e.g. \'{"k8s":{"cluster_id":"…","namespace":"ns","service":"svc","port":80}}\'',
    )
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    pt = sp.add_parser("patch", help="Patch app metadata / Service binding")
    pt.add_argument("id")
    pt.add_argument("--name", default=None)
    pt.add_argument("--description", default=None)
    pt.add_argument("--bindings-json", default=None, help="JSON with bindings.k8s")
    add_write_flags(pt)
    pt.set_defaults(fn=cmd_patch)

    pb = sp.add_parser("publish", help="Republish (new version snapshot)")
    pb.add_argument("id")
    add_write_flags(pb)
    pb.set_defaults(fn=cmd_publish)

    dl = sp.add_parser("delete", help="Delete app")
    dl.add_argument("id")
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_delete)
