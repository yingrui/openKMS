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
