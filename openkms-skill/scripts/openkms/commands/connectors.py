"""connectors — kinds / CRUD-lite / sync / provision / probe / search."""
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


def cmd_kinds(ns: argparse.Namespace) -> None:
    params: dict[str, str] = {}
    if ns.category:
        params["category"] = ns.category
    with client() as s:
        r = s.get("/api/connectors/kinds", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str] = {}
    if ns.category:
        params["category"] = ns.category
    with client() as s:
        r = s.get("/api/connectors", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/connectors/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name, "kind": ns.kind, "enabled": not ns.disabled}
    if ns.inputs_json:
        body["inputs"] = _parse_json_arg("inputs-json", ns.inputs_json)
    if ns.outputs_json:
        body["outputs"] = _parse_json_arg("outputs-json", ns.outputs_json)
    if ns.settings_json:
        body["settings"] = _parse_json_arg("settings-json", ns.settings_json)
    if ns.secrets_json:
        body["secrets"] = _parse_json_arg("secrets-json", ns.secrets_json)

    confirm_body = {**body}
    if "secrets" in confirm_body:
        confirm_body["secrets"] = {k: "***" for k in confirm_body["secrets"]}
    confirm_or_abort(
        action=f"create connector {ns.name!r}",
        method="POST",
        path="/api/connectors",
        body=confirm_body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/connectors", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.name is not None:
        body["name"] = ns.name
    if ns.inputs_json is not None:
        body["inputs"] = _parse_json_arg("inputs-json", ns.inputs_json)
    if ns.outputs_json is not None:
        body["outputs"] = _parse_json_arg("outputs-json", ns.outputs_json)
    if ns.settings_json is not None:
        body["settings"] = _parse_json_arg("settings-json", ns.settings_json)
    if ns.secrets_json is not None:
        body["secrets"] = _parse_json_arg("secrets-json", ns.secrets_json)
    if ns.enabled is not None:
        body["enabled"] = ns.enabled
    if not body:
        print("update: nothing to update", file=sys.stderr)
        sys.exit(2)

    confirm_body = {**body}
    if "secrets" in confirm_body:
        confirm_body["secrets"] = {k: "***" for k in confirm_body["secrets"]}
    path = f"/api/connectors/{ns.id}"
    confirm_or_abort(
        action=f"update connector {ns.id}",
        method="PUT",
        path=path,
        body=confirm_body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_sync(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.start_date:
        body["start_date"] = ns.start_date
    if ns.end_date:
        body["end_date"] = ns.end_date
    if (ns.start_date and not ns.end_date) or (ns.end_date and not ns.start_date):
        print("sync: pass both --start-date and --end-date, or neither", file=sys.stderr)
        sys.exit(2)
    path = f"/api/connectors/{ns.id}/sync"
    confirm_or_abort(
        action=f"queue sync for connector {ns.id}",
        method="POST",
        path=path,
        body=body or None,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_provision_dataset(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "kind": ns.kind,
        "slot": ns.slot,
        "data_source_id": ns.data_source_id,
    }
    if ns.schema_name:
        body["schema_name"] = ns.schema_name
    if ns.table_name:
        body["table_name"] = ns.table_name
    if ns.display_name:
        body["display_name"] = ns.display_name
    path = "/api/connectors/provision-dataset"
    confirm_or_abort(
        action=f"provision dataset for slot {ns.slot!r}",
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


def cmd_probe(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"api_name": ns.api_name}
    for key in ("ts_code", "trade_date", "start_date", "end_date"):
        val = getattr(ns, key, None)
        if val:
            body[key] = val
    if ns.limit is not None:
        body["limit"] = ns.limit
    if ns.offset is not None:
        body["offset"] = ns.offset
    path = f"/api/connectors/{ns.id}/probe"
    confirm_or_abort(
        action=f"probe connector {ns.id}",
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


def cmd_search(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"query": ns.query}
    if ns.params_json:
        body["params"] = _parse_json_arg("params-json", ns.params_json)
    path = f"/api/connectors/{ns.id}/search"
    confirm_or_abort(
        action=f"search via connector {ns.id}",
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


def add_subparser(sub) -> None:
    p = sub.add_parser("connectors", help="Connectors (Tushare sync, search tools, …)")
    sp = p.add_subparsers(dest="conn_cmd", required=True)

    kinds = sp.add_parser("kinds", help="List connector kinds")
    kinds.add_argument("--category", default=None, help="sync | search_tool")
    kinds.set_defaults(fn=cmd_kinds)

    ls = sp.add_parser("list", help="List connectors")
    ls.add_argument("--category", default=None)
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get connector")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    cr = sp.add_parser("create", help="Create connector")
    cr.add_argument("--name", required=True)
    cr.add_argument("--kind", required=True)
    cr.add_argument("--inputs-json", default=None)
    cr.add_argument("--outputs-json", default=None, help='e.g. \'{"stock_basic":"dataset-id"}\'')
    cr.add_argument("--settings-json", default=None)
    cr.add_argument("--secrets-json", default=None, help='e.g. \'{"TUSHARE_TOKEN":"…"}\'')
    cr.add_argument("--disabled", action="store_true", help="Create with enabled=false")
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    up = sp.add_parser("update", help="Update connector (PUT)")
    up.add_argument("--id", required=True)
    up.add_argument("--name", default=None)
    up.add_argument("--inputs-json", default=None)
    up.add_argument("--outputs-json", default=None)
    up.add_argument("--settings-json", default=None)
    up.add_argument("--secrets-json", default=None)
    up.add_argument("--enabled", action="store_true", default=None)
    up.add_argument("--disabled", action="store_false", dest="enabled", default=None)
    add_write_flags(up)
    up.set_defaults(fn=cmd_update)

    sy = sp.add_parser("sync", help="Queue sync job (POST …/sync); poll with jobs get")
    sy.add_argument("--id", required=True)
    sy.add_argument("--start-date", default=None, help="ISO date YYYY-MM-DD (with --end-date)")
    sy.add_argument("--end-date", default=None)
    add_write_flags(sy)
    sy.set_defaults(fn=cmd_sync)

    pd = sp.add_parser("provision-dataset", help="Create PG table + Dataset for a sync slot")
    pd.add_argument("--kind", required=True)
    pd.add_argument("--slot", required=True)
    pd.add_argument("--data-source-id", required=True)
    pd.add_argument("--schema-name", default=None)
    pd.add_argument("--table-name", default=None)
    pd.add_argument("--display-name", default=None)
    add_write_flags(pd)
    pd.set_defaults(fn=cmd_provision_dataset)

    pr = sp.add_parser("probe", help="Tushare live probe (no dataset writes)")
    pr.add_argument("--id", required=True)
    pr.add_argument("--api-name", default="daily")
    pr.add_argument("--ts-code", default=None)
    pr.add_argument("--trade-date", default=None)
    pr.add_argument("--start-date", default=None)
    pr.add_argument("--end-date", default=None)
    pr.add_argument("--limit", type=int, default=None)
    pr.add_argument("--offset", type=int, default=None)
    add_write_flags(pr)
    pr.set_defaults(fn=cmd_probe)

    se = sp.add_parser("search", help="Run search_tool connector")
    se.add_argument("--id", required=True)
    se.add_argument("--query", required=True)
    se.add_argument("--params-json", default=None)
    add_write_flags(se)
    se.set_defaults(fn=cmd_search)
