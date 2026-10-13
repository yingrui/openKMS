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


def _split_csv(raw: str) -> list[str]:
    return [x.strip() for x in raw.split(",") if x.strip()]


def _parse_unique_keys(raw: str) -> list[list[str]]:
    return [_split_csv(group) for group in raw.split(";") if group.strip()]


def cmd_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.display_name is not None:
        body["display_name"] = ns.display_name
    if ns.description is not None:
        body["description"] = ns.description
    if ns.primary_key is not None:
        body["primary_key_columns"] = _split_csv(ns.primary_key)
    if ns.unique_keys is not None:
        body["unique_keys"] = _parse_unique_keys(ns.unique_keys)
    if ns.ai_instructions is not None or ns.ai_synonyms is not None or ns.ai_examples is not None:
        body["ai_context"] = {
            "instructions": ns.ai_instructions or "",
            "synonyms": _split_csv(ns.ai_synonyms or ""),
            "examples": _split_csv(ns.ai_examples or ""),
        }
    if ns.editable is not None:
        body["is_editable"] = ns.editable == "true"
    if not body:
        raise SystemExit("Nothing to update — pass at least one field.")
    path = f"/api/datasets/{ns.id}"
    confirm_or_abort("update dataset", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_column_description(ns: argparse.Namespace) -> None:
    path = f"/api/datasets/{ns.id}/columns/{ns.column}"
    body = {"description": ns.description or None}
    confirm_or_abort("set column description", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
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


def _parse_join_columns(raw: str) -> tuple[list[str], list[str]]:
    from_cols: list[str] = []
    to_cols: list[str] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if "=" not in part:
            raise SystemExit(f"Invalid column pair '{part}' (expected from=to).")
        frm, to = part.split("=", 1)
        from_cols.append(frm.strip())
        to_cols.append(to.strip())
    if not from_cols:
        raise SystemExit("At least one column pair is required.")
    return from_cols, to_cols


def cmd_joins_list(ns: argparse.Namespace) -> None:
    params = {"dataset_id": ns.id} if ns.id else None
    with client() as s:
        r = s.get("/api/dataset-joins", params=params)
    r.raise_for_status()
    print_json(r.json())


def cmd_joins_add(ns: argparse.Namespace) -> None:
    from_cols, to_cols = _parse_join_columns(ns.columns)
    body: dict[str, Any] = {
        "from_dataset_id": ns.from_id,
        "to_dataset_id": ns.to_id,
        "from_columns": from_cols,
        "to_columns": to_cols,
        "required": bool(ns.required),
    }
    if ns.name:
        body["name"] = ns.name
    confirm_or_abort("add relationship", "POST", "/api/dataset-joins", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/dataset-joins", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_joins_delete(ns: argparse.Namespace) -> None:
    path = f"/api/dataset-joins/{ns.join_id}"
    confirm_or_abort("delete relationship", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted relationship {ns.join_id}")


def cmd_fields_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}/fields")
    r.raise_for_status()
    print_json(r.json())


def cmd_fields_add(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {"name": ns.name}
    if ns.column:
        body["column_name"] = ns.column
    if ns.expression:
        body["expression"] = {"dialects": {"ANSI_SQL": ns.expression}}
    if ns.datatype:
        body["datatype"] = ns.datatype
    if ns.is_time:
        body["dimension"] = {"is_time": True}
    if ns.ai_instructions:
        body["ai_context"] = {"instructions": ns.ai_instructions}
    confirm_or_abort("add field", "POST", f"/api/datasets/{ns.id}/fields", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(f"/api/datasets/{ns.id}/fields", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_fields_delete(ns: argparse.Namespace) -> None:
    path = f"/api/datasets/{ns.id}/fields/{ns.field_id}"
    confirm_or_abort("delete field", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted field {ns.field_id}")


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


def cmd_quality_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}/quality-rules")
    r.raise_for_status()
    print_json(r.json())


def cmd_quality_add(ns: argparse.Namespace) -> None:
    config: dict[str, Any] = {}
    if ns.min is not None:
        config["min"] = ns.min
    if ns.max is not None:
        config["max"] = ns.max
    if ns.ref_dataset_id:
        config["ref_dataset_id"] = ns.ref_dataset_id
    if ns.ref_column:
        config["ref_column"] = ns.ref_column
    if ns.max_age_days is not None:
        config["max_age_days"] = ns.max_age_days
    body: dict[str, Any] = {
        "name": ns.name,
        "rule_type": ns.rule_type,
        "column_name": ns.column or None,
        "config": config,
    }
    path = f"/api/datasets/{ns.id}/quality-rules"
    confirm_or_abort("add quality rule", "POST", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_quality_run(ns: argparse.Namespace) -> None:
    path = f"/api/datasets/{ns.id}/quality-rules/{ns.rule_id}/run"
    confirm_or_abort("run quality rule", "POST", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path)
    r.raise_for_status()
    print_json(r.json())


def cmd_quality_delete(ns: argparse.Namespace) -> None:
    path = f"/api/datasets/{ns.id}/quality-rules/{ns.rule_id}"
    confirm_or_abort("delete quality rule", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted quality rule {ns.rule_id}")


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

    up = sp.add_parser("update", help="Update dataset fields (PUT /api/datasets/{id})")
    up.add_argument("--id", required=True)
    up.add_argument("--display-name", default=None)
    up.add_argument("--description", default=None)
    up.add_argument("--primary-key", default=None, help="comma-separated columns")
    up.add_argument(
        "--unique-keys",
        default=None,
        help='keys separated by ";", columns by "," (e.g. "a,b;c")',
    )
    up.add_argument("--ai-instructions", default=None)
    up.add_argument("--ai-synonyms", default=None, help="comma-separated")
    up.add_argument("--ai-examples", default=None, help="comma-separated")
    up.add_argument("--editable", choices=("true", "false"), default=None)
    add_write_flags(up)
    up.set_defaults(fn=cmd_update)

    cd = sp.add_parser("column-description", help="Set a column's description (PUT …/columns/{col})")
    cd.add_argument("--id", required=True)
    cd.add_argument("--column", required=True)
    cd.add_argument("--description", default=None)
    add_write_flags(cd)
    cd.set_defaults(fn=cmd_column_description)

    pf = sp.add_parser("profile", help="Computed column profile (GET …/profile)")
    pf.add_argument("--id", required=True)
    pf.set_defaults(fn=cmd_profile)

    sh = sp.add_parser("schema-history", help="Schema snapshots (GET …/schema-history)")
    sh.add_argument("--id", required=True)
    sh.set_defaults(fn=cmd_schema_history)

    ln = sp.add_parser("lineage", help="Read-time lineage (GET …/lineage)")
    ln.add_argument("--id", required=True)
    ln.set_defaults(fn=cmd_lineage)

    jl = sp.add_parser("joins", help="Dataset relationships (Ossie foreign keys)")
    jsp = jl.add_subparsers(dest="dset_join_cmd", required=True)
    jll = jsp.add_parser("list", help="List relationships for a dataset")
    jll.add_argument("--id", default=None, dest="id")
    jll.set_defaults(fn=cmd_joins_list)
    jla = jsp.add_parser("add", help="Add a relationship (from many -> to one)")
    jla.add_argument("--from-id", required=True, help="dataset on the many side (holds the FK)")
    jla.add_argument("--to-id", required=True, help="dataset on the one side (referenced key)")
    jla.add_argument(
        "--required",
        action="store_true",
        help="require a matching row (INNER); default keeps rows without a match (LEFT)",
    )
    jla.add_argument("--columns", required=True, help='FK=key pairs, e.g. "ts_code=ts_code"')
    jla.add_argument("--name", default=None)
    add_write_flags(jla)
    jla.set_defaults(fn=cmd_joins_add)
    jld = jsp.add_parser("delete", help="Delete a relationship")
    jld.add_argument("--join-id", required=True)
    add_write_flags(jld)
    jld.set_defaults(fn=cmd_joins_delete)

    fld = sp.add_parser("fields", help="Semantic fields (column refs + computed expressions)")
    fsp = fld.add_subparsers(dest="dset_field_cmd", required=True)
    fll = fsp.add_parser("list", help="List fields")
    fll.add_argument("--id", required=True)
    fll.set_defaults(fn=cmd_fields_list)
    fla = fsp.add_parser("add", help="Add a field")
    fla.add_argument("--id", required=True)
    fla.add_argument("--name", required=True)
    fla.add_argument("--column", default=None, help="source column (plain field)")
    fla.add_argument("--expression", default=None, help="ANSI_SQL fragment (computed field)")
    fla.add_argument("--datatype", default=None)
    fla.add_argument("--is-time", action="store_true", dest="is_time", help="mark a time dimension")
    fla.add_argument("--ai-instructions", default=None, dest="ai_instructions")
    add_write_flags(fla)
    fla.set_defaults(fn=cmd_fields_add)
    fldel = fsp.add_parser("delete", help="Delete a field")
    fldel.add_argument("--id", required=True)
    fldel.add_argument("--field-id", required=True)
    add_write_flags(fldel)
    fldel.set_defaults(fn=cmd_fields_delete)

    ing = sp.add_parser("ingest", help="Upload a file and load it into a data-layer table")
    ing.add_argument("--file", required=True)
    ing.add_argument("--data-source-id", required=True)
    ing.add_argument("--schema", required=True, dest="schema_name")
    ing.add_argument("--table", required=True, dest="table_name")
    ing.add_argument("--append", action="store_true", help="append to an existing table (default: overwrite)")
    add_write_flags(ing)
    ing.set_defaults(fn=cmd_ingest)

    q = sp.add_parser("quality", help="Data-quality rules (declarative)")
    qsp = q.add_subparsers(dest="dset_quality_cmd", required=True)
    ql = qsp.add_parser("list", help="List quality rules")
    ql.add_argument("--id", required=True)
    ql.set_defaults(fn=cmd_quality_list)
    qa = qsp.add_parser("add", help="Add a quality rule")
    qa.add_argument("--id", required=True)
    qa.add_argument("--name", required=True)
    qa.add_argument("--type", dest="rule_type", required=True)
    qa.add_argument("--column", default=None)
    qa.add_argument("--min", default=None)
    qa.add_argument("--max", default=None)
    qa.add_argument("--ref-dataset-id", default=None)
    qa.add_argument("--ref-column", default=None)
    qa.add_argument("--max-age-days", type=int, default=None)
    add_write_flags(qa)
    qa.set_defaults(fn=cmd_quality_add)
    qr = qsp.add_parser("run", help="Run a quality rule")
    qr.add_argument("--id", required=True)
    qr.add_argument("--rule-id", required=True)
    add_write_flags(qr)
    qr.set_defaults(fn=cmd_quality_run)
    qd = qsp.add_parser("delete", help="Delete a quality rule")
    qd.add_argument("--id", required=True)
    qd.add_argument("--rule-id", required=True)
    add_write_flags(qd)
    qd.set_defaults(fn=cmd_quality_delete)

