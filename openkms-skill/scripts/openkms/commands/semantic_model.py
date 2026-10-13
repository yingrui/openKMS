"""semantic-model — export / import the Ossie semantic model."""
from __future__ import annotations

import argparse
import json
import pathlib

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_export(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/semantic-model", params={"format": ns.format})
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
        "/api/semantic-model/import",
        {"file": str(path), "bytes": path.stat().st_size},
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/semantic-model/import", json=doc)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("semantic-model", help="Export / import the Ossie semantic model")
    sp = p.add_subparsers(dest="sm_cmd", required=True)

    se = sp.add_parser("export", help="Export the semantic model (datasets, relationships, metrics, queries)")
    se.add_argument("--format", choices=("json", "yaml"), default="json")
    se.set_defaults(fn=cmd_export)

    si = sp.add_parser("import", help="Import a semantic model document (JSON)")
    si.add_argument("--file", required=True)
    add_write_flags(si)
    si.set_defaults(fn=cmd_import)
