"""metric-rules — reconciliation rules (指标勾稽) and their alerts.

A rule watches one metric and states what must hold: a threshold (`condition`) or one or more identities
between metrics (`identities`). Running it yields pass / fail / unknown for a period and scope; a failure
that carries advice opens an alert. Rules live under `/api/metric-rules`, alerts under `/api/metric-events`.

Exactly one of `condition` / `identities` is required; both are JSON on the CLI.
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def _json_arg(value: str, flag: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        print(f"--{flag}: invalid JSON ({exc})", file=sys.stderr)
        sys.exit(2)


# --- rules --------------------------------------------------------------------------------------


def cmd_list(ns: argparse.Namespace) -> None:
    params = {"metric_id": ns.metric_id} if ns.metric_id else None
    with client() as s:
        r = s.get("/api/metric-rules", params=params)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/metric-rules/{ns.rule_id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_add(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name, "metric_id": ns.metric_id}
    if ns.condition is not None:
        body["condition"] = _json_arg(ns.condition, "condition")
    if ns.identities is not None:
        body["identities"] = _json_arg(ns.identities, "identities")
    if not ("condition" in body or "identities" in body):
        raise SystemExit("Pass exactly one of --condition / --identities.")
    if "condition" in body and "identities" in body:
        raise SystemExit("Pass exactly one of --condition / --identities.")
    for field, value in (
        ("description", ns.description),
        ("severity", ns.severity),
        ("conclusion", ns.conclusion),
        ("suggestion", ns.suggestion),
        ("owner", ns.owner),
        ("rule_id", ns.rule_id),
        ("status", ns.status),
    ):
        if value is not None and value != "":
            body[field] = value
    if ns.group_by is not None:
        body["group_by"] = {"field": ns.group_by}
    if ns.run_params is not None:
        body["run_params"] = _json_arg(ns.run_params, "run-params")
    confirm_or_abort("add rule", "POST", "/api/metric-rules", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/metric-rules", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    for field, value in (
        ("name", ns.name),
        ("description", ns.description),
        ("metric_id", ns.metric_id),
        ("severity", ns.severity),
        ("conclusion", ns.conclusion),
        ("suggestion", ns.suggestion),
        ("owner", ns.owner),
        ("rule_id", ns.new_rule_id),
        ("status", ns.status),
    ):
        if value is not None:
            body[field] = value
    if ns.condition is not None:
        body["condition"] = _json_arg(ns.condition, "condition")
    if ns.identities is not None:
        body["identities"] = _json_arg(ns.identities, "identities")
    if ns.group_by is not None:
        body["group_by"] = {"field": ns.group_by}
    if ns.run_params is not None:
        body["run_params"] = _json_arg(ns.run_params, "run-params")
    if not body:
        raise SystemExit("Nothing to update — pass at least one field.")
    path = f"/api/metric-rules/{ns.rule_id}"
    confirm_or_abort("update rule", "PATCH", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/metric-rules/{ns.rule_id}"
    confirm_or_abort("delete rule", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted rule {ns.rule_id}")


def cmd_evaluate(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"dry_run": bool(ns.simulate)}
    if ns.values is not None:
        body["values"] = _json_arg(ns.values, "values")
    with client() as s:
        r = s.post(f"/api/metric-rules/{ns.rule_id}/evaluate", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_evaluate_all(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.metric_id is not None:
        body["metric_id"] = ns.metric_id
    if ns.values is not None:
        body["values"] = _json_arg(ns.values, "values")
    with client() as s:
        r = s.post("/api/metric-rules/evaluate", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_rule_events(ns: argparse.Namespace) -> None:
    params: dict[str, Any] = {"limit": ns.limit, "offset": ns.offset}
    if ns.status:
        params["status"] = ns.status
    with client() as s:
        r = s.get(f"/api/metric-rules/{ns.rule_id}/events", params=params)
    r.raise_for_status()
    print_json(r.json())


# --- events -------------------------------------------------------------------------------------


def cmd_events_list(ns: argparse.Namespace) -> None:
    params: dict[str, Any] = {"limit": ns.limit, "offset": ns.offset}
    for key in ("metric_id", "rule_id", "status", "severity"):
        value = getattr(ns, key)
        if value:
            params[key] = value
    if ns.open_only:
        params["open_only"] = True
    with client() as s:
        r = s.get("/api/metric-events", params=params)
    r.raise_for_status()
    print_json(r.json())


def cmd_events_summary(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/metric-events/summary")
    r.raise_for_status()
    print_json(r.json())


def cmd_events_patch(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    for field, value in (("status", ns.status), ("assignee", ns.assignee), ("note", ns.note)):
        if value is not None:
            body[field] = value
    if not body:
        raise SystemExit("Nothing to update — pass --status / --assignee / --note.")
    path = f"/api/metric-events/{ns.event_id}"
    confirm_or_abort("update alert", "PATCH", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


# --- registration -------------------------------------------------------------------------------


def add_rules_subparser(sub) -> None:
    p = sub.add_parser("rules", help="Reconciliation rules (指标勾稽): thresholds, identities, runs, alerts")
    sp = p.add_subparsers(dest="rules_cmd", required=True)

    rl = sp.add_parser("list", help="List rules")
    rl.add_argument("--metric-id", default=None, help="narrow to the rule's watched metric")
    rl.set_defaults(fn=cmd_list)

    rg = sp.add_parser("get", help="Get one rule")
    rg.add_argument("--rule-id", required=True)
    rg.set_defaults(fn=cmd_get)

    ra = sp.add_parser("add", help="Add a rule")
    ra.add_argument("--name", required=True)
    ra.add_argument("--metric-id", required=True, help="the metric this rule watches")
    group = ra.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--condition",
        help='threshold as JSON, e.g. \'{"left":{"metric":"<id>"},"op":">","right":{"value":1}}\'',
    )
    group.add_argument(
        "--identities",
        help='metric identities as a JSON array, e.g. \'[{"target":{"metric":"A"},"members":[{"metric":"B","weight":1}]}]\'',
    )
    ra.add_argument("--description", default=None)
    ra.add_argument("--severity", default="P1", choices=("P0", "P1", "P2"))
    ra.add_argument("--conclusion", default=None)
    ra.add_argument("--suggestion", default=None)
    ra.add_argument("--owner", default=None)
    ra.add_argument("--rule-id", default=None, help="stable slug (auto-generated from the name if omitted)")
    ra.add_argument("--status", default="active", choices=("active", "paused"))
    ra.add_argument("--group-by", default=None, help="dimension field the rule is checked per (e.g. scenario_id)")
    ra.add_argument("--run-params", default=None, help='run parameters as JSON, e.g. \'{"arguments":[{"key":"cycle","kind":"filter","field":"cycle","role":"period","required":true}]}\'')
    add_write_flags(ra)
    ra.set_defaults(fn=cmd_add)

    ru = sp.add_parser("update", help="Update a rule (partial)")
    ru.add_argument("--rule-id", required=True, help="the rule to update")
    ru.add_argument("--new-rule-id", dest="new_rule_id", default=None, help="rename the slug")
    ru.add_argument("--name", default=None)
    ru.add_argument("--description", default=None)
    ru.add_argument("--metric-id", default=None)
    ru.add_argument("--condition", default=None)
    ru.add_argument("--identities", default=None)
    ru.add_argument("--severity", default=None, choices=("P0", "P1", "P2"))
    ru.add_argument("--conclusion", default=None)
    ru.add_argument("--suggestion", default=None)
    ru.add_argument("--owner", default=None)
    ru.add_argument("--status", default=None, choices=("active", "paused"))
    ru.add_argument("--group-by", default=None)
    ru.add_argument("--run-params", default=None)
    add_write_flags(ru)
    ru.set_defaults(fn=cmd_update)

    rd = sp.add_parser("delete", help="Delete a rule (its alerts go with it)")
    rd.add_argument("--rule-id", required=True)
    add_write_flags(rd)
    rd.set_defaults(fn=cmd_delete)

    re_ = sp.add_parser("evaluate", help="Run one rule for a period and scope")
    re_.add_argument("--rule-id", required=True)
    re_.add_argument("--values", default=None, help='values for the rule\'s declared arguments, e.g. \'{"cycle":"2026-W46","scenario":["S1"]}\'')
    re_.add_argument("--simulate", action="store_true", help="dry run: compute verdicts, publish no alerts")
    re_.set_defaults(fn=cmd_evaluate)

    rea = sp.add_parser("evaluate-all", help="Run every active rule, or one metric's")
    rea.add_argument("--metric-id", default=None)
    rea.add_argument("--values", default=None)
    rea.set_defaults(fn=cmd_evaluate_all)

    ree = sp.add_parser("events", help="A rule's alerts")
    ree.add_argument("--rule-id", required=True)
    ree.add_argument("--status", default=None, choices=("open", "dismissed", "resolved"))
    ree.add_argument("--limit", type=int, default=50)
    ree.add_argument("--offset", type=int, default=0)
    ree.set_defaults(fn=cmd_rule_events)


def add_events_subparser(sub) -> None:
    p = sub.add_parser("events", help="Reconciliation alerts (metric-events)")
    sp = p.add_subparsers(dest="events_cmd", required=True)

    el = sp.add_parser("list", help="Alerts, newest first")
    el.add_argument("--metric-id", default=None)
    el.add_argument("--rule-id", default=None)
    el.add_argument("--status", default=None, choices=("open", "dismissed", "resolved"))
    el.add_argument("--severity", default=None, choices=("P0", "P1", "P2"))
    el.add_argument("--open-only", action="store_true")
    el.add_argument("--limit", type=int, default=50)
    el.add_argument("--offset", type=int, default=0)
    el.set_defaults(fn=cmd_events_list)

    es = sp.add_parser("summary", help="Open/total alerts per metric")
    es.set_defaults(fn=cmd_events_summary)

    ep = sp.add_parser("patch", help="Resolve / dismiss / reopen / assign an alert")
    ep.add_argument("--event-id", required=True)
    ep.add_argument("--status", default=None, choices=("open", "dismissed", "resolved"))
    ep.add_argument("--assignee", default=None)
    ep.add_argument("--note", default=None)
    add_write_flags(ep)
    ep.set_defaults(fn=cmd_events_patch)
