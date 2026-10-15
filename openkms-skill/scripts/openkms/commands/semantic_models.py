"""semantic-models — named scopes over the shared data layer (Ossie)."""
from __future__ import annotations

import argparse
import json
import pathlib

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def _split(raw: str | None) -> list[str]:
    return [x.strip() for x in (raw or "").split(",") if x.strip()]


def cmd_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/semantic-models")
    r.raise_for_status()
    print_json(r.json())


def cmd_add(ns: argparse.Namespace) -> None:
    body: dict[str, object] = {"name": ns.name, "dataset_ids": _split(ns.datasets)}
    if ns.description:
        body["description"] = ns.description
    confirm_or_abort("create semantic model", "POST", "/api/semantic-models", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/semantic-models", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_export(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/semantic-models/{ns.id}/export", params={"format": ns.format})
    r.raise_for_status()
    if ns.format == "yaml":
        print(r.text)
    else:
        print_json(r.json())


def cmd_import(ns: argparse.Namespace) -> None:
    path = pathlib.Path(ns.file)
    doc = json.loads(path.read_text(encoding="utf-8"))
    confirm_or_abort(
        "import semantic model",
        "POST",
        "/api/semantic-models/import",
        {"file": str(path), "bytes": path.stat().st_size},
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/semantic-models/import", json=doc)
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/semantic-models/{ns.id}"
    confirm_or_abort("delete semantic model", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted semantic model {ns.id}")


def cmd_fields_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/semantic-models/{ns.id}/fields")
    r.raise_for_status()
    print_json(r.json())


def cmd_fields_add(ns: argparse.Namespace) -> None:
    body: dict[str, object] = {"dataset_id": ns.dataset_id, "name": ns.name}
    if ns.column:
        body["column_name"] = ns.column
    if ns.expression:
        body["expression"] = {"dialects": [{"dialect": "ANSI_SQL", "expression": ns.expression}]}
    if ns.datatype:
        body["datatype"] = ns.datatype
    if ns.label:
        body["label"] = ns.label
    if ns.description:
        body["description"] = ns.description
    if ns.is_time is not None:
        body["dimension"] = {"is_time": ns.is_time}
    if ns.ai_instructions:
        body["ai_context"] = {"instructions": ns.ai_instructions}
    confirm_or_abort(
        "add field", "POST", f"/api/semantic-models/{ns.id}/fields", body, ns.yes, ns.dry_run
    )
    with client() as s:
        r = s.post(f"/api/semantic-models/{ns.id}/fields", json=body)
    r.raise_for_status()
    print_json(r.json())


def _filter_value(op: str, raw: str | None):
    """`in` takes a comma-separated list, `between` takes two, everything else a scalar."""
    if op in ("is_null", "is_not_null"):
        return None
    if op == "in":
        return [v.strip() for v in (raw or "").split(",") if v.strip()]
    if op == "between":
        lo, _, hi = (raw or "").partition(",")
        return [lo.strip(), hi.strip()]
    return raw


def cmd_query(ns: argparse.Namespace) -> None:
    """One ad-hoc question: a metric over fields, with filters, an order and a limit."""
    body: dict[str, object] = {
        "metric": ns.metric,
        "group_by": [
            {"field": f, "granularity": ns.granularity} if ns.granularity else {"field": f}
            for f in _split(ns.group_by)
        ],
        "filters": [
            {"field": f, "op": ns.filter_op, "value": _filter_value(ns.filter_op, ns.filter_value)}
            for f in _split(ns.filter_field)
        ],
        "order_by": [{"field": ns.order_by, "direction": ns.order_direction}] if ns.order_by else [],
        "limit": ns.limit,
    }
    with client() as s:
        r = s.post(f"/api/semantic-models/{ns.id}/query", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_fields_delete(ns: argparse.Namespace) -> None:
    path = f"/api/semantic-models/{ns.id}/fields/{ns.field_id}"
    confirm_or_abort("delete field", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted field {ns.field_id}")


def add_subparser(sub) -> None:
    p = sub.add_parser("semantic-models", help="Named semantic models (Ossie scopes)")
    sp = p.add_subparsers(dest="semantic_models_cmd", required=True)

    sl = sp.add_parser("list", help="List semantic models")
    sl.set_defaults(fn=cmd_list)

    sa = sp.add_parser("add", help="Create a semantic model")
    sa.add_argument("--name", required=True)
    sa.add_argument("--datasets", default=None, help="comma-separated dataset ids (scope)")
    sa.add_argument("--description", default=None)
    add_write_flags(sa)
    sa.set_defaults(fn=cmd_add)

    se = sp.add_parser("export", help="Export one model as an Ossie document")
    se.add_argument("--id", required=True)
    se.add_argument("--format", choices=("json", "yaml"), default="json")
    se.set_defaults(fn=cmd_export)

    si = sp.add_parser("import", help="Import a semantic-model document (JSON)")
    si.add_argument("--file", required=True)
    add_write_flags(si)
    si.set_defaults(fn=cmd_import)

    sd = sp.add_parser("delete", help="Delete a semantic model")
    sd.add_argument("--id", required=True)
    add_write_flags(sd)
    sd.set_defaults(fn=cmd_delete)

    fields = sp.add_parser("fields", help="Model-scoped fields (column ref / expression + role)")
    fsp = fields.add_subparsers(dest="semantic_model_fields_cmd", required=True)
    fl = fsp.add_parser("list", help="List a model's fields")
    fl.add_argument("--id", required=True)
    fl.set_defaults(fn=cmd_fields_list)
    fa = fsp.add_parser("add", help="Add a field")
    fa.add_argument("--id", required=True)
    fa.add_argument("--dataset-id", required=True)
    fa.add_argument("--name", required=True)
    fa.add_argument("--column", default=None, help="source column (plain field)")
    fa.add_argument("--expression", default=None, help="ANSI_SQL fragment (computed field)")
    fa.add_argument("--datatype", default=None, help="Ossie DataType (String|Integer|Decimal|...")
    fa.add_argument("--label", default=None, help="display label")
    fa.add_argument("--description", default=None)
    fa.add_argument(
        "--is-time",
        action="store_true",
        dest="is_time",
        default=None,
        help="time dimension (is_time: true)",
    )
    fa.add_argument(
        "--no-is-time",
        action="store_false",
        dest="is_time",
        help="regular dimension — opts a temporal column out (is_time: false)",
    )
    fa.add_argument("--ai-instructions", default=None, dest="ai_instructions")
    add_write_flags(fa)
    fa.set_defaults(fn=cmd_fields_add)
    fd = fsp.add_parser("delete", help="Delete a field")
    fd.add_argument("--id", required=True)
    fd.add_argument("--field-id", required=True)
    add_write_flags(fd)
    fd.set_defaults(fn=cmd_fields_delete)

    sp_prev = sp.add_parser("query", help="One ad-hoc question (metric × fields × filters × order × limit)")
    sp_prev.add_argument("--id", required=True)
    sp_prev.add_argument("--metric", required=True, help="metric id or name")
    sp_prev.add_argument("--group-by", default=None, help="comma-separated field ids or names")
    sp_prev.add_argument("--granularity", default=None, help="date_trunc grain for the time dimensions")
    sp_prev.add_argument("--filter-field", default=None, help="comma-separated fields to filter the same way")
    sp_prev.add_argument("--filter-op", default="=", help="=, !=, >, >=, <, <=, like, in, between, is_null, is_not_null")
    sp_prev.add_argument("--filter-value", default=None, help="value (comma-separated for in; 'a,b' for between)")
    sp_prev.add_argument("--order-by", default=None, help="'value' or a grouped field name")
    sp_prev.add_argument("--order-direction", default="desc", choices=("asc", "desc"))
    sp_prev.add_argument("--limit", type=int, default=100)
    sp_prev.set_defaults(fn=cmd_query)
