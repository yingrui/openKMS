"""explorations — saved object sets (conditions + layout) and the layouts a type opens with.

An exploration stores **conditions, never results**: opening it re-evaluates against current data, which is why a
shared link shows today's rows. The layout is separate: it decides the charts, their order, the sort and the
perspective a type starts with, and can belong to one caller or to everyone.

Conditions are the same strings the UI puts in its URL: `prop:op:value` or `@link/prop:op:value`.
"""
from __future__ import annotations

import argparse
import json
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json

VISIBILITIES = ("private", "shared")


def _chart_entry(raw: str) -> dict[str, Any]:
    """`--chart region` is a count per value; `--chart '{"prop":"region","split":"tier"}'` is the full chart.

    The JSON form exists because a chart stopped being just a property: it can measure something and split by
    something else, and inventing a flag syntax for those would be a second vocabulary for the same object.
    """
    text = raw.strip()
    if text.startswith("{"):
        try:
            entry = json.loads(text)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"--chart is neither a property nor JSON: {exc}") from exc
        if not isinstance(entry, dict) or not entry.get("prop"):
            raise SystemExit("--chart JSON needs at least a `prop`")
        return entry
    return {"prop": text}


def _layout_body(ns: argparse.Namespace) -> dict[str, Any]:
    """`--chart` and `--sort` flags → the layout object the API stores."""
    layout: dict[str, Any] = {}
    if getattr(ns, "chart", None):
        layout["charts"] = [_chart_entry(name) for name in ns.chart]
    if getattr(ns, "column", None):
        layout["columns"] = list(ns.column)
    if getattr(ns, "sort", None):
        layout["sorts"] = [
            {"prop": entry.lstrip("-"), "desc": entry.startswith("-")} for entry in ns.sort
        ]
    return layout


# --- explorations -------------------------------------------------------------------------------


def cmd_list(ns: argparse.Namespace) -> None:
    params = {"object_type_id": ns.object_type_id} if ns.object_type_id else None
    with client() as s:
        r = s.get("/api/explorations", params=params)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/explorations/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_add(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "name": ns.name,
        "object_type_id": ns.object_type_id,
        "filters": ns.filter or [],
        "layout": _layout_body(ns),
        "visibility": ns.visibility,
    }
    confirm_or_abort("add exploration", "POST", "/api/explorations", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/explorations", json=body)
    r.raise_for_status()
    print_json(r.json())


def merge_layout(current: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """The API replaces `layout` wholesale; a patch only names the lists it changes.

    `--chart` alone must not drop the stored sort or column list — those were decisions too.
    """
    merged = dict(current or {})
    merged.update(patch)
    return merged


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.name is not None:
        body["name"] = ns.name
    if ns.visibility is not None:
        body["visibility"] = ns.visibility
    if ns.filter is not None:
        body["filters"] = ns.filter
    patch = _layout_body(ns)
    if patch:
        with client() as s:
            current = s.get(f"/api/explorations/{ns.id}")
        current.raise_for_status()
        body["layout"] = merge_layout(current.json().get("layout") or {}, patch)
    if not body:
        raise SystemExit("Nothing to update — pass at least one field.")
    path = f"/api/explorations/{ns.id}"
    confirm_or_abort("update exploration", "PATCH", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.patch(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/explorations/{ns.id}"
    confirm_or_abort("delete exploration", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted exploration {ns.id}")


# --- layouts ------------------------------------------------------------------------------------


def cmd_layout_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/exploration-layouts", params={"object_type_id": ns.object_type_id})
    r.raise_for_status()
    print_json(r.json())


def cmd_layout_set(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "object_type_id": ns.object_type_id,
        "layout": _layout_body(ns),
        "scope": ns.scope,
    }
    confirm_or_abort("set layout", "PUT", "/api/exploration-layouts", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put("/api/exploration-layouts", json=body)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser(
        "explorations",
        help="Saved object sets (conditions + layout) — the Explorer's artifacts",
    )
    sp = p.add_subparsers(dest="explorations_cmd", required=True)

    ls = sp.add_parser("list", help="List mine plus everything shared")
    ls.add_argument("--object-type-id", default=None)
    ls.set_defaults(fn=cmd_list)

    g = sp.add_parser("get", help="Get one exploration")
    g.add_argument("--id", required=True)
    g.set_defaults(fn=cmd_get)

    a = sp.add_parser("add", help="Save an exploration")
    a.add_argument("--name", required=True)
    a.add_argument("--object-type-id", required=True)
    a.add_argument(
        "--filter",
        action="append",
        default=[],
        help="repeatable: `prop:op:value` or `@link/prop:op:value` (ops: eq/ne/gt/ge/lt/le/in/contains/is_null/is_not_null)",
    )
    a.add_argument(
        "--chart",
        action="append",
        default=[],
        help="repeatable, in order: `region`, or JSON `{\"prop\":\"region\",\"split\":\"tier\"}` / "
        "`{\"prop\":\"region\",\"metric\":\"avg\",\"measure\":\"lead_time_weeks\"}`",
    )
    a.add_argument("--sort", action="append", default=[], help="repeatable: `prop` or `-prop` (descending)")
    a.add_argument(
        "--column",
        action="append",
        default=[],
        help="repeatable: a property the results table shows, in order (its whole column set when given)",
    )
    a.add_argument("--visibility", default="private", choices=VISIBILITIES)
    add_write_flags(a)
    a.set_defaults(fn=cmd_add)

    u = sp.add_parser("update", help="Update a saved exploration (its owner only)")
    u.add_argument("--id", required=True)
    u.add_argument("--name", default=None)
    u.add_argument("--visibility", default=None, choices=VISIBILITIES)
    u.add_argument("--filter", action="append", default=None, help="replaces the whole condition list")
    u.add_argument("--chart", action="append", default=[], help="replaces the chart list")
    u.add_argument("--sort", action="append", default=[], help="replaces the sort list")
    add_write_flags(u)
    u.set_defaults(fn=cmd_update)

    d = sp.add_parser("delete", help="Delete a saved exploration (its owner only)")
    d.add_argument("--id", required=True)
    add_write_flags(d)
    d.set_defaults(fn=cmd_delete)


def add_layout_subparser(sub) -> None:
    p = sub.add_parser(
        "exploration-layouts",
        help="The layout a type opens with: personal wins over global",
    )
    sp = p.add_subparsers(dest="layouts_cmd", required=True)

    g = sp.add_parser("get", help="Effective layout plus what can be chosen")
    g.add_argument("--object-type-id", required=True)
    g.set_defaults(fn=cmd_layout_get)

    s_ = sp.add_parser("set", help="Write a layout (personal, or global with ontology:write)")
    s_.add_argument("--object-type-id", required=True)
    s_.add_argument("--scope", default="personal", choices=("personal", "global"))
    s_.add_argument(
        "--chart",
        action="append",
        default=[],
        help="repeatable, in order: `region`, or the chart as JSON (see `explorations add --help`)",
    )
    s_.add_argument("--sort", action="append", default=[], help="repeatable: `prop` or `-prop`")
    s_.add_argument("--column", action="append", default=[], help="repeatable: results-table column, in order")
    add_write_flags(s_)
    s_.set_defaults(fn=cmd_layout_set)
