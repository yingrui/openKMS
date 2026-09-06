"""ontology action-types — list/get/create/update/execute/logs."""
from __future__ import annotations

import argparse
import json
import sys
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


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/ontology/action-types")
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/ontology/action-types/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "api_name": ns.api_name,
        "display_name": ns.display_name,
        "object_type_id": ns.object_type_id,
        "rule_type": ns.rule_type,
    }
    if ns.description:
        body["description"] = ns.description
    if ns.function_id:
        body["function_id"] = ns.function_id
    if ns.function_version is not None:
        body["function_version"] = ns.function_version
    if ns.parameters_json:
        body["parameters"] = _parse_json_arg("parameters-json", ns.parameters_json)
    confirm_or_abort(
        action=f"create action type {ns.api_name!r}",
        method="POST",
        path="/api/ontology/action-types",
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/ontology/action-types", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.display_name is not None:
        body["display_name"] = ns.display_name
    if ns.description is not None:
        body["description"] = ns.description
    if ns.rule_type is not None:
        body["rule_type"] = ns.rule_type
    if ns.function_id is not None:
        body["function_id"] = ns.function_id
    if ns.function_version is not None:
        body["function_version"] = ns.function_version
    if ns.parameters_json is not None:
        body["parameters"] = _parse_json_arg("parameters-json", ns.parameters_json)
    if ns.status is not None:
        body["status"] = ns.status
    if not body:
        print("update: nothing to update", file=sys.stderr)
        sys.exit(2)
    path = f"/api/ontology/action-types/{ns.id}"
    confirm_or_abort(
        action=f"update action type {ns.id}",
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


def cmd_execute(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "input": _parse_json_arg("input-json", ns.input_json) if ns.input_json else {},
    }
    if ns.object_id:
        body["object_id"] = ns.object_id
    path = f"/api/ontology/action-types/{ns.id}/execute"
    confirm_or_abort(
        action=f"execute action type {ns.id}",
        method="POST",
        path=path,
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_logs(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/ontology/action-types/{ns.id}/logs")
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("action-types", help="Ontology Action types")
    sp = p.add_subparsers(dest="at_cmd", required=True)

    sp.add_parser("list", help="List action types").set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get action type")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    cr = sp.add_parser("create", help="Create action type")
    cr.add_argument("--api-name", required=True)
    cr.add_argument("--display-name", required=True)
    cr.add_argument("--object-type-id", required=True)
    cr.add_argument("--description", default=None)
    cr.add_argument(
        "--rule-type",
        required=True,
        choices=["object_create", "object_modify", "object_delete", "function"],
        help=(
            "Prefer object_create / object_modify / object_delete (built-in; no Function). "
            "Use function only when custom FoO logic is required."
        ),
    )
    cr.add_argument("--function-id", default=None)
    cr.add_argument("--function-version", type=int, default=None)
    cr.add_argument("--parameters-json", default=None)
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    up = sp.add_parser("update", help="Patch action type")
    up.add_argument("--id", required=True)
    up.add_argument("--display-name", default=None)
    up.add_argument("--description", default=None)
    up.add_argument("--rule-type", default=None)
    up.add_argument("--function-id", default=None)
    up.add_argument("--function-version", type=int, default=None)
    up.add_argument("--parameters-json", default=None)
    up.add_argument("--status", default=None)
    add_write_flags(up)
    up.set_defaults(fn=cmd_update)

    ex = sp.add_parser("execute", help="Execute action type")
    ex.add_argument("--id", required=True)
    ex.add_argument("--object-id", default=None)
    ex.add_argument("--input-json", default="{}")
    add_write_flags(ex)
    ex.set_defaults(fn=cmd_execute)

    lg = sp.add_parser("logs", help="List action execution logs")
    lg.add_argument("--id", required=True)
    lg.set_defaults(fn=cmd_logs)
