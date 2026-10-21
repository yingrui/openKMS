"""ontology external-services — the HTTP endpoints a Function may call."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json

PATH = "/api/ontology/external-services"


def _parse_json_arg(label: str, value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError as e:
        print(f"--{label}: invalid JSON ({e})", file=sys.stderr)
        sys.exit(2)


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(PATH)
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "api_name": ns.api_name,
        "display_name": ns.display_name,
        "base_url": ns.base_url,
        "auth_kind": ns.auth_kind,
        "allowed_paths": ns.allowed_paths,
    }
    if ns.description:
        body["description"] = ns.description
    if ns.auth_header_name:
        body["auth_header_name"] = ns.auth_header_name
    if ns.secret:
        body["secret"] = ns.secret
    if ns.timeout_seconds:
        body["timeout_seconds"] = ns.timeout_seconds

    confirm_or_abort(
        action=f"register external service {ns.api_name!r}",
        method="POST",
        path=PATH,
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(PATH, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    for key in ("display_name", "base_url", "auth_kind", "auth_header_name", "secret", "timeout_seconds"):
        value = getattr(ns, key, None)
        if value is not None:
            body[key] = value
    if ns.allowed_paths is not None:
        body["allowed_paths"] = ns.allowed_paths
    if not body:
        print("update: nothing to update (no fields supplied)", file=sys.stderr)
        sys.exit(2)
    path = f"{PATH}/{ns.id}"
    confirm_or_abort(
        action=f"update external service {ns.id}",
        method="PATCH",
        path=path,
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"{PATH}/{ns.id}"
    confirm_or_abort(
        action=f"delete external service {ns.id}",
        method="DELETE",
        path=path,
        body=None,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print_json({"deleted": ns.id})


def add_subparser(sub) -> None:
    p = sub.add_parser("external-services", help="External HTTP services a Function may call")
    sp = p.add_subparsers(dest="ext_cmd", required=True)

    sp.add_parser("list", help="List registered services (secrets are never returned)").set_defaults(
        fn=cmd_list
    )

    cr = sp.add_parser("create", help="Register a service")
    cr.add_argument("--api-name", required=True, help='name the Function uses: client.external("NAME")')
    cr.add_argument("--display-name", required=True)
    cr.add_argument("--base-url", required=True, help="origin only, e.g. http://backend:8200")
    cr.add_argument(
        "--auth-kind", default="none", choices=("none", "bearer", "header", "hmac")
    )
    cr.add_argument("--auth-header-name", default="")
    cr.add_argument("--secret", default="")
    cr.add_argument(
        "--allowed-paths",
        nargs="+",
        required=True,
        help="path prefixes the service may be called on, e.g. /api/jobs",
    )
    cr.add_argument("--timeout-seconds", type=int, default=0)
    cr.add_argument("--description", default="")
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    up = sp.add_parser("update", help="Update a service (omit --secret to keep it)")
    up.add_argument("--id", required=True)
    up.add_argument("--display-name", default=None)
    up.add_argument("--base-url", default=None)
    up.add_argument("--auth-kind", default=None, choices=("none", "bearer", "header", "hmac"))
    up.add_argument("--auth-header-name", default=None)
    up.add_argument("--secret", default=None)
    up.add_argument("--allowed-paths", nargs="+", default=None)
    up.add_argument("--timeout-seconds", type=int, default=None)
    add_write_flags(up)
    up.set_defaults(fn=cmd_update)

    dl = sp.add_parser("delete", help="Delete a service")
    dl.add_argument("--id", required=True)
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_delete)
