"""ontology functions — list/get/create/versions/validate/publish/execute/delete."""
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


def _read_source(ns: argparse.Namespace) -> str | None:
    if ns.source_code_file:
        return Path(ns.source_code_file).read_text(encoding="utf-8")
    if getattr(ns, "source_code", None):
        return ns.source_code
    return None


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/ontology/functions")
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/ontology/functions/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "api_name": ns.api_name,
        "display_name": ns.display_name,
    }
    if ns.description:
        body["description"] = ns.description
    if ns.object_type_id:
        body["object_type_id"] = ns.object_type_id
    source = _read_source(ns)
    if source is not None:
        body["source_code"] = source
    if ns.input_schema_json:
        body["input_schema"] = _parse_json_arg("input-schema-json", ns.input_schema_json)
    if ns.output_schema_json:
        body["output_schema"] = _parse_json_arg("output-schema-json", ns.output_schema_json)

    confirm_or_abort(
        action=f"create function {ns.api_name!r}",
        method="POST",
        path="/api/ontology/functions",
        body={**body, "source_code": f"<{len(body.get('source_code', '') or '')} chars>" if body.get("source_code") else None},
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/ontology/functions", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_save_version(ns: argparse.Namespace) -> None:
    source = _read_source(ns)
    if not source:
        print("save-version: require --source-code-file or --source-code", file=sys.stderr)
        sys.exit(2)
    body: dict[str, Any] = {"source_code": source}
    if ns.input_schema_json:
        body["input_schema"] = _parse_json_arg("input-schema-json", ns.input_schema_json)
    if ns.output_schema_json:
        body["output_schema"] = _parse_json_arg("output-schema-json", ns.output_schema_json)
    path = f"/api/ontology/functions/{ns.id}/versions"
    confirm_or_abort(
        action=f"save version for function {ns.id}",
        method="POST",
        path=path,
        body={**body, "source_code": f"<{len(source)} chars>"},
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_validate(ns: argparse.Namespace) -> None:
    source = _read_source(ns)
    if not source:
        print("validate: require --source-code-file or --source-code", file=sys.stderr)
        sys.exit(2)
    body: dict[str, Any] = {"source_code": source}
    if ns.input_schema_json:
        body["input_schema"] = _parse_json_arg("input-schema-json", ns.input_schema_json)
    if ns.output_schema_json:
        body["output_schema"] = _parse_json_arg("output-schema-json", ns.output_schema_json)
    path = f"/api/ontology/functions/{ns.id}/validate"
    confirm_or_abort(
        action=f"validate function {ns.id}",
        method="POST",
        path=path,
        body={**body, "source_code": f"<{len(source)} chars>"},
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_publish(ns: argparse.Namespace) -> None:
    path = f"/api/ontology/functions/{ns.id}/publish"
    confirm_or_abort(
        action=f"publish function {ns.id}",
        method="POST",
        path=path,
        body=None,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(path)
    r.raise_for_status()
    print_json(r.json())


def cmd_execute(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "input": _parse_json_arg("input-json", ns.input_json) if ns.input_json else {},
        "use_published": bool(ns.use_published),
    }
    if ns.version_id:
        body["version_id"] = ns.version_id
    path = f"/api/ontology/functions/{ns.id}/execute"
    confirm_or_abort(
        action=f"execute function {ns.id}",
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


def cmd_execute_by_api_name(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "input": _parse_json_arg("input-json", ns.input_json) if ns.input_json else {},
        "use_published": True,
    }
    path = f"/api/ontology/functions/by-api-name/{ns.api_name}/execute"
    confirm_or_abort(
        action=f"execute published function {ns.api_name!r}",
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


def cmd_executions(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/ontology/functions/{ns.id}/executions")
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/ontology/functions/{ns.id}"
    confirm_or_abort(
        action=f"delete function {ns.id}",
        method="DELETE",
        path=path,
        body=None,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted function {ns.id}")


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.display_name is not None:
        body["display_name"] = ns.display_name
    if ns.description is not None:
        body["description"] = ns.description
    if ns.object_type_id is not None:
        body["object_type_id"] = ns.object_type_id
    if ns.status is not None:
        body["status"] = ns.status
    if ns.development_status is not None:
        body["development_status"] = ns.development_status
    if not body:
        print("update: provide at least one field to change", file=sys.stderr)
        sys.exit(2)
    path = f"/api/ontology/functions/{ns.id}"
    confirm_or_abort(
        action=f"update function {ns.id}",
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


def add_subparser(sub) -> None:
    p = sub.add_parser("functions", help="Ontology Functions (Python logic)")
    sp = p.add_subparsers(dest="fn_cmd", required=True)

    sp.add_parser("list", help="List functions").set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get function")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    up = sp.add_parser("update", help="Patch function metadata/status (PATCH /api/ontology/functions/{id})")
    up.add_argument("--id", required=True)
    up.add_argument("--display-name", default=None)
    up.add_argument("--description", default=None)
    up.add_argument("--object-type-id", default=None)
    up.add_argument("--status", choices=["active", "archived"], default=None)
    up.add_argument("--development-status", default=None)
    add_write_flags(up)
    up.set_defaults(fn=cmd_update)

    cr = sp.add_parser("create", help="Create function (+ optional initial source)")
    cr.add_argument("--api-name", required=True)
    cr.add_argument("--display-name", required=True)
    cr.add_argument("--description", default=None)
    cr.add_argument("--object-type-id", default=None)
    cr.add_argument("--source-code-file", default=None)
    cr.add_argument("--source-code", default=None)
    cr.add_argument("--input-schema-json", default=None)
    cr.add_argument("--output-schema-json", default=None)
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    sv = sp.add_parser("save-version", help="Save a new draft version")
    sv.add_argument("--id", required=True)
    sv.add_argument("--source-code-file", default=None)
    sv.add_argument("--source-code", default=None)
    sv.add_argument("--input-schema-json", default=None)
    sv.add_argument("--output-schema-json", default=None)
    add_write_flags(sv)
    sv.set_defaults(fn=cmd_save_version)

    va = sp.add_parser("validate", help="Validate function source")
    va.add_argument("--id", required=True)
    va.add_argument("--source-code-file", default=None)
    va.add_argument("--source-code", default=None)
    va.add_argument("--input-schema-json", default=None)
    va.add_argument("--output-schema-json", default=None)
    add_write_flags(va)
    va.set_defaults(fn=cmd_validate)

    pb = sp.add_parser("publish", help="Publish latest validated version")
    pb.add_argument("--id", required=True)
    add_write_flags(pb)
    pb.set_defaults(fn=cmd_publish)

    ex = sp.add_parser("execute", help="Execute by function id")
    ex.add_argument("--id", required=True)
    ex.add_argument("--input-json", default="{}")
    ex.add_argument("--version-id", default=None)
    ex.add_argument("--use-published", action="store_true")
    add_write_flags(ex)
    ex.set_defaults(fn=cmd_execute)

    ea = sp.add_parser("execute-by-api-name", help="Execute published function by api_name")
    ea.add_argument("--api-name", required=True)
    ea.add_argument("--input-json", default="{}")
    add_write_flags(ea)
    ea.set_defaults(fn=cmd_execute_by_api_name)

    el = sp.add_parser("executions", help="List recent executions")
    el.add_argument("--id", required=True)
    el.set_defaults(fn=cmd_executions)

    dl = sp.add_parser("delete", help="Delete function (DELETE /api/ontology/functions/{id})")
    dl.add_argument("--id", required=True)
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_delete)
