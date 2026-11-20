"""metrics — model-level metric definitions (Ossie SQL expressions)."""
from __future__ import annotations

import argparse
import json
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str] = {}
    if ns.semantic_model_id:
        params["semantic_model_id"] = ns.semantic_model_id
    if ns.base_dataset_id:
        params["base_dataset_id"] = ns.base_dataset_id
    with client() as s:
        r = s.get("/api/metrics", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_add(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "name": ns.name,
        "semantic_model_id": ns.semantic_model_id,
        "base_dataset_id": ns.base_dataset_id,
        "additivity": ns.additivity,
        "expression": {"dialects": {"ANSI_SQL": ns.expression}},
    }
    if ns.datatype:
        body["datatype"] = ns.datatype
    if ns.definition:
        body["business_definition"] = ns.definition
    if ns.joins:
        body["joins"] = [j.strip() for j in ns.joins.split(",") if j.strip()]
    if ns.time_dimension:
        body["time_dimension"] = ns.time_dimension
    if ns.filters:
        body["filters"] = json.loads(ns.filters)
    if ns.ai_instructions:
        body["ai_context"] = {"instructions": ns.ai_instructions}
    confirm_or_abort("add metric", "POST", "/api/metrics", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/metrics", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    for field, value in (
        ("name", ns.name),
        ("business_definition", ns.definition),
        ("additivity", ns.additivity),
        ("datatype", ns.datatype),
        ("time_dimension", ns.time_dimension),
        ("semantic_model_id", ns.semantic_model_id),
        ("base_dataset_id", ns.base_dataset_id),
    ):
        if value is not None:
            body[field] = value
    if ns.expression:
        body["expression"] = {"dialects": {"ANSI_SQL": ns.expression}}
    if ns.filters is not None:
        body["filters"] = json.loads(ns.filters)
    if ns.joins is not None:
        body["joins"] = [j.strip() for j in ns.joins.split(",") if j.strip()]
    if not body:
        raise SystemExit("Nothing to update — pass at least one field.")
    path = f"/api/metrics/{ns.metric_id}"
    confirm_or_abort("update metric", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_compute(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/metrics/{ns.metric_id}/compute")
    r.raise_for_status()
    print_json(r.json())


def cmd_runs(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/metrics/{ns.metric_id}/runs")
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/metrics/{ns.metric_id}"
    confirm_or_abort("delete metric", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted metric {ns.metric_id}")


def add_subparser(sub) -> None:
    p = sub.add_parser("metrics", help="Model-level metrics (Ossie SQL expressions)")
    sp = p.add_subparsers(dest="metrics_cmd", required=True)

    ml = sp.add_parser("list", help="List metrics")
    ml.add_argument("--semantic-model-id", default=None)
    ml.add_argument("--base-dataset-id", default=None)
    ml.set_defaults(fn=cmd_list)

    ma = sp.add_parser("add", help="Add a metric")
    ma.add_argument("--name", required=True)
    ma.add_argument("--semantic-model-id", required=True)
    ma.add_argument("--base-dataset-id", required=True)
    ma.add_argument("--expression", required=True, help='aggregate SQL fragment, e.g. "SUM(amount)"')
    ma.add_argument(
        "--additivity",
        default="additive",
        choices=("additive", "non_additive"),
        help="may this number be summed across groups? a ratio/rate/price is non_additive",
    )
    ma.add_argument(
        "--time-dimension",
        default=None,
        help="the model field that carries the period (e.g. cycle); the metric is then filtered by it",
    )
    ma.add_argument(
        "--filters",
        default=None,
        help='JSON array of {column, op, value} that scopes the metric, e.g. \'[{"column":"channel","op":"==","value":"线上"}]\'',
    )
    ma.add_argument(
        "--datatype",
        default=None,
        choices=("String", "Integer", "Decimal", "Float", "Boolean", "Date", "Time", "DateTime", "DateTimeTz", "Opaque"),
        help="Ossie DataType of the aggregate (Decimal for money / ratios)",
    )
    ma.add_argument("--joins", default=None, help="comma-separated relationship ids")
    ma.add_argument("--definition", default=None)
    ma.add_argument("--ai-instructions", default=None, dest="ai_instructions")
    add_write_flags(ma)
    ma.set_defaults(fn=cmd_add)

    mu = sp.add_parser("update", help="Update a metric (partial)")
    mu.add_argument("--metric-id", required=True)
    mu.add_argument("--name", default=None)
    mu.add_argument("--semantic-model-id", default=None)
    mu.add_argument("--base-dataset-id", default=None)
    mu.add_argument("--expression", default=None)
    mu.add_argument("--additivity", default=None, choices=("additive", "non_additive"))
    mu.add_argument("--datatype", default=None)
    mu.add_argument("--time-dimension", default=None, help="model field that carries the period ('' clears it)")
    mu.add_argument("--filters", default=None, help="JSON array ({column, op, value}); [] clears")
    mu.add_argument("--joins", default=None, help="comma-separated relationship ids; empty string clears")
    mu.add_argument("--definition", default=None)
    add_write_flags(mu)
    mu.set_defaults(fn=cmd_update)

    mc = sp.add_parser("compute", help="Compute a metric (read-only)")
    mc.add_argument("--metric-id", required=True)
    mc.set_defaults(fn=cmd_compute)

    mr = sp.add_parser("runs", help="Recent runs of a metric")
    mr.add_argument("--metric-id", required=True)
    mr.set_defaults(fn=cmd_runs)

    md = sp.add_parser("delete", help="Delete a metric")
    md.add_argument("--metric-id", required=True)
    add_write_flags(md)
    md.set_defaults(fn=cmd_delete)
