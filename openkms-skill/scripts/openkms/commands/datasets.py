"""datasets — list / get / rows / metadata / create."""
from __future__ import annotations

import argparse
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, str] = {}
    if ns.data_source_id:
        params["data_source_id"] = ns.data_source_id
    with client() as s:
        r = s.get("/api/datasets", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_rows(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit is not None:
        params["limit"] = ns.limit
    if ns.offset is not None:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}/rows", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_metadata(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}/metadata")
    r.raise_for_status()
    print_json(r.json())


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "data_source_id": ns.data_source_id,
        "schema_name": ns.schema_name,
        "table_name": ns.table_name,
    }
    if ns.display_name:
        body["display_name"] = ns.display_name
    confirm_or_abort(
        action=f"create dataset {ns.schema_name}.{ns.table_name}",
        method="POST",
        path="/api/datasets",
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post("/api/datasets", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_profile(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}/profile")
    r.raise_for_status()
    print_json(r.json())


def cmd_schema_history(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}/schema-history")
    r.raise_for_status()
    print_json(r.json())


def cmd_lineage(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}/lineage")
    r.raise_for_status()
    print_json(r.json())


def _parse_join_columns(raw: str) -> list[dict[str, str]]:
    pairs: list[dict[str, str]] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if "=" not in part:
            raise SystemExit(f"Invalid column pair '{part}' (expected source=target).")
        src, tgt = part.split("=", 1)
        pairs.append({"source": src.strip(), "target": tgt.strip()})
    if not pairs:
        raise SystemExit("At least one column pair is required.")
    return pairs


def cmd_joins_list(ns: argparse.Namespace) -> None:
    params = {"dataset_id": ns.id} if ns.id else None
    with client() as s:
        r = s.get("/api/dataset-joins", params=params)
    r.raise_for_status()
    print_json(r.json())


def cmd_joins_add(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {
        "source_dataset_id": ns.source_id,
        "target_dataset_id": ns.target_id,
        "cardinality": ns.cardinality,
        "join_columns": _parse_join_columns(ns.columns),
    }
    if ns.name:
        body["name"] = ns.name
    confirm_or_abort("add dataset join", "POST", "/api/dataset-joins", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/dataset-joins", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_joins_delete(ns: argparse.Namespace) -> None:
    path = f"/api/dataset-joins/{ns.join_id}"
    confirm_or_abort("delete dataset join", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted dataset join {ns.join_id}")


def cmd_ingest(ns: argparse.Namespace) -> None:
    from pathlib import Path

    path = Path(ns.file)
    if not path.is_file():
        raise SystemExit(f"Not a file: {path}")
    mode = "append" if ns.append else "overwrite"
    plan = {
        "file": str(path.resolve()),
        "data_source_id": ns.data_source_id,
        "schema_name": ns.schema_name,
        "table_name": ns.table_name,
        "mode": mode,
    }
    confirm_or_abort(
        "ingest file into a dataset table",
        "POST",
        "/api/datasets/ingests",
        plan,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        with path.open("rb") as f:
            r = s.post(
                "/api/datasets/ingests",
                files={"file": (path.name, f)},
                data={"data_source_id": ns.data_source_id},
            )
        r.raise_for_status()
        ingest_id = r.json()["id"]
        pr = s.post(f"/api/datasets/ingests/{ingest_id}/preview")
        pr.raise_for_status()
        lr = s.post(
            f"/api/datasets/ingests/{ingest_id}/load",
            json={"schema_name": ns.schema_name, "table_name": ns.table_name, "mode": mode},
        )
        lr.raise_for_status()
    print_json(lr.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("datasets", help="Ontology / connector datasets")
    sp = p.add_subparsers(dest="dset_cmd", required=True)

    ls = sp.add_parser("list", help="List datasets")
    ls.add_argument("--data-source-id", default=None)
    ls.set_defaults(fn=cmd_list)

    gt = sp.add_parser("get", help="Get dataset")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    rows = sp.add_parser("rows", help="Paginated rows (GET …/rows)")
    rows.add_argument("--id", required=True)
    rows.add_argument("--limit", type=int, default=None)
    rows.add_argument("--offset", type=int, default=None)
    rows.set_defaults(fn=cmd_rows)

    md = sp.add_parser("metadata", help="Column metadata (GET …/metadata)")
    md.add_argument("--id", required=True)
    md.set_defaults(fn=cmd_metadata)

    cr = sp.add_parser("create", help="Register dataset row (POST /api/datasets)")
    cr.add_argument("--data-source-id", required=True)
    cr.add_argument("--schema-name", required=True)
    cr.add_argument("--table-name", required=True)
    cr.add_argument("--display-name", default=None)
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    pf = sp.add_parser("profile", help="Computed column profile (GET …/profile)")
    pf.add_argument("--id", required=True)
    pf.set_defaults(fn=cmd_profile)

    sh = sp.add_parser("schema-history", help="Schema snapshots (GET …/schema-history)")
    sh.add_argument("--id", required=True)
    sh.set_defaults(fn=cmd_schema_history)

    ln = sp.add_parser("lineage", help="Read-time lineage (GET …/lineage)")
    ln.add_argument("--id", required=True)
    ln.set_defaults(fn=cmd_lineage)

    jl = sp.add_parser("joins", help="Registered dataset joins (data-engineering ER model)")
    jsp = jl.add_subparsers(dest="dset_join_cmd", required=True)
    jll = jsp.add_parser("list", help="List joins for a dataset")
    jll.add_argument("--id", default=None, dest="id")
    jll.set_defaults(fn=cmd_joins_list)
    jla = jsp.add_parser("add", help="Add a join")
    jla.add_argument("--source-id", required=True)
    jla.add_argument("--target-id", required=True)
    jla.add_argument("--cardinality", default="one-to-many", choices=("one-to-one", "one-to-many"))
    jla.add_argument("--columns", required=True, help='column pairs, e.g. "ts_code=ts_code"')
    jla.add_argument("--name", default=None)
    add_write_flags(jla)
    jla.set_defaults(fn=cmd_joins_add)
    jld = jsp.add_parser("delete", help="Delete a join")
    jld.add_argument("--join-id", required=True)
    add_write_flags(jld)
    jld.set_defaults(fn=cmd_joins_delete)

    ing = sp.add_parser("ingest", help="Upload a file and load it into a data-layer table")
    ing.add_argument("--file", required=True)
    ing.add_argument("--data-source-id", required=True)
    ing.add_argument("--schema", required=True, dest="schema_name")
    ing.add_argument("--table", required=True, dest="table_name")
    ing.add_argument("--append", action="store_true", help="append to an existing table (default: overwrite)")
    add_write_flags(ing)
    ing.set_defaults(fn=cmd_ingest)
