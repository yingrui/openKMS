"""datasets — the Catalog: list/register/describe/keys/AI context/relationships/quality/ingest."""
from __future__ import annotations

import argparse
import json
from typing import Any

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_list(ns: argparse.Namespace) -> None:
    params: dict[str, Any] = {}
    if ns.data_source_id:
        params["data_source_id"] = ns.data_source_id
    if ns.search:
        params["search"] = ns.search
    if ns.limit is not None:
        params["limit"] = ns.limit
    if ns.offset is not None:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get("/api/datasets", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_discover(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/datasets/from-source/{ns.data_source_id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def _row_filter(raw: str) -> dict[str, Any]:
    """`"column op value"` → the API's filter object.

    Values: `between` takes `a..b`, `in` takes a comma list, `is_null`/`is_not_null` take none.
    """
    parts = raw.split(None, 2)
    if len(parts) < 2:
        raise SystemExit(f'--filter needs "column op value", got: {raw!r}')
    column, op = parts[0], parts[1]
    value = parts[2] if len(parts) > 2 else None
    if op in ("is_null", "is_not_null"):
        return {"field": column, "op": op}
    if value is None:
        raise SystemExit(f'--filter {op} needs a value: {raw!r}')
    if op == "between":
        bounds = [v.strip() for v in value.split("..", 1)]
        if len(bounds) != 2 or not all(bounds):
            raise SystemExit(f'--filter between needs "a..b", got: {value!r}')
        return {"field": column, "op": op, "value": bounds}
    if op == "in":
        values = [v.strip() for v in value.split(",") if v.strip()]
        return {"field": column, "op": op, "value": values}
    return {"field": column, "op": op, "value": value}


def cmd_rows(ns: argparse.Namespace) -> None:
    """Browse a dataset table: filters + sort + paging (read-only)."""
    body: dict[str, Any] = {
        "filters": [_row_filter(raw) for raw in ns.filter or []],
        "limit": ns.limit if ns.limit is not None else 100,
        "offset": ns.offset if ns.offset is not None else 0,
    }
    if ns.sort:
        body["sort"] = ns.sort
    if ns.order:
        body["order"] = ns.order
    if ns.after:
        body["after"] = ns.after
    with client() as s:
        r = s.post(f"/api/datasets/{ns.id}/rows/query", json=body)
    r.raise_for_status()
    print_json(r.json())


def _aggregate(raw: str) -> dict[str, Any]:
    """`"fn[:column][=name]"` → the API's aggregate object (`count` needs no column)."""
    spec, _, name = raw.partition("=")
    fn, _, column = spec.partition(":")
    body: dict[str, Any] = {"fn": fn.strip().lower()}
    if column.strip():
        body["column"] = column.strip()
    if name.strip():
        body["name"] = name.strip()
    return body


def cmd_aggregate(ns: argparse.Namespace) -> None:
    """Summarise a dataset table: group by columns (optionally by grain) + aggregates."""
    group_by: list[dict[str, Any]] = [
        {"column": c, "granularity": ns.granularity} if ns.granularity else {"column": c}
        for c in _split_csv(ns.group_by)
    ]
    body: dict[str, Any] = {
        "group_by": group_by,
        "aggregates": [_aggregate(raw) for raw in ns.aggregate or []],
        "filters": [_row_filter(raw) for raw in ns.filter or []],
        "limit": ns.limit if ns.limit is not None else 100,
        "offset": ns.offset if ns.offset is not None else 0,
    }
    if ns.order_by:
        body["order_by"] = [{"field": ns.order_by, "direction": ns.order_direction or "asc"}]
    with client() as s:
        r = s.post(f"/api/datasets/{ns.id}/aggregate", json=body)
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
    if ns.domain is not None:
        body["domain"] = ns.domain
    if ns.tags is not None:
        body["tags"] = _split_csv(ns.tags)
    if ns.business_definition is not None:
        body["business_definition"] = ns.business_definition
    if ns.sensitivity is not None:
        body["sensitivity"] = ns.sensitivity
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


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/datasets/{ns.id}"
    confirm_or_abort("delete dataset", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted dataset {ns.id}")


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
        "/api/dataset-ingests",
        plan,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        with path.open("rb") as f:
            r = s.post(
                "/api/dataset-ingests",
                files={"file": (path.name, f)},
                data={"data_source_id": ns.data_source_id},
            )
        r.raise_for_status()
        ingest_id = r.json()["id"]
        pr = s.post(f"/api/dataset-ingests/{ingest_id}/preview")
        pr.raise_for_status()
        lr = s.post(
            f"/api/dataset-ingests/{ingest_id}/load",
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
    if ns.sql:
        config["sql"] = ns.sql
    if ns.expect:
        config["expect"] = ns.expect
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


def cmd_quality_update(ns: argparse.Namespace) -> None:
    body: dict[str, Any] = {}
    if ns.name is not None:
        body["name"] = ns.name
    if ns.column is not None:
        body["column_name"] = ns.column
    if ns.severity is not None:
        body["severity"] = ns.severity
    if ns.enabled is not None:
        body["enabled"] = ns.enabled == "true"
    if ns.config is not None:
        try:
            body["config"] = json.loads(ns.config)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"--config must be a JSON object: {exc}") from exc
    if not body:
        raise SystemExit("Nothing to update — pass at least one field.")
    path = f"/api/datasets/{ns.id}/quality-rules/{ns.rule_id}"
    confirm_or_abort("update quality rule", "PUT", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.put(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_quality_runs(ns: argparse.Namespace) -> None:
    """A rule's run history — newest first, and the numbers behind `passed` / `failed`.

    Running a rule answers with the *rule*, which carries only `last_status`; how many rows were
    checked and how many failed lives here, and that is the answer a caller acts on.
    """
    with client() as s:
        r = s.get(f"/api/datasets/{ns.id}/quality-rules/{ns.rule_id}/runs")
    r.raise_for_status()
    print_json(r.json())


def cmd_quality_run(ns: argparse.Namespace) -> None:
    path = f"/api/datasets/{ns.id}/quality-rules/{ns.rule_id}/run"
    confirm_or_abort("run quality rule", "POST", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path)
        r.raise_for_status()
        if ns.dry_run:
            print_json(r.json())
            return
        # Report the run it produced, not the rule: `checked_count` / `failed_count` are the answer.
        history = s.get(f"/api/datasets/{ns.id}/quality-rules/{ns.rule_id}/runs")
    history.raise_for_status()
    runs = history.json()
    runs = runs if isinstance(runs, list) else runs.get("items", [])
    print_json(runs[0] if runs else r.json())


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
    ls.add_argument("--search", default=None, help="match name / schema / table")
    ls.add_argument("--limit", type=int, default=None)
    ls.add_argument("--offset", type=int, default=None)
    ls.set_defaults(fn=cmd_list)

    disc = sp.add_parser("discover", help="Tables a data source can register (GET …/from-source)")
    disc.add_argument("--data-source-id", required=True)
    disc.set_defaults(fn=cmd_discover)

    gt = sp.add_parser("get", help="Get dataset")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_get)

    rows = sp.add_parser("rows", help="Browse rows (POST …/rows/query): filters + sort + paging")
    rows.add_argument("--id", required=True)
    rows.add_argument(
        "--filter",
        action="append",
        default=None,
        help='repeatable: "column op value" (between = "a..b", in = "a,b"; no value for is_null)',
    )
    rows.add_argument("--limit", type=int, default=None)
    rows.add_argument("--offset", type=int, default=None)
    rows.add_argument("--sort", default=None, help="column to sort by")
    rows.add_argument("--order", choices=("asc", "desc"), default=None)
    rows.add_argument("--after", default=None, help="keyset cursor: last value of --sort (needs --sort)")
    rows.set_defaults(fn=cmd_rows)

    ag = sp.add_parser("aggregate", help="Group + aggregate a table (POST …/aggregate)")
    ag.add_argument("--id", required=True)
    ag.add_argument("--group-by", required=True, help="comma-separated columns")
    ag.add_argument(
        "--granularity",
        default=None,
        choices=("day", "week", "month", "quarter", "year"),
        help="date_trunc grain applied to every --group-by column (date columns only)",
    )
    ag.add_argument(
        "--aggregate",
        action="append",
        required=True,
        help='repeatable: "fn[:column][=name]" — count, sum:amount, avg:pe_ttm=avg_pe',
    )
    ag.add_argument(
        "--filter",
        action="append",
        default=None,
        help='repeatable: "column op value" (between = "a..b", in = "a,b")',
    )
    ag.add_argument("--order-by", default=None, help="a group-by column or an aggregate name")
    ag.add_argument("--order-direction", choices=("asc", "desc"), default=None)
    ag.add_argument("--limit", type=int, default=None)
    ag.add_argument("--offset", type=int, default=None)
    ag.set_defaults(fn=cmd_aggregate)

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
    up.add_argument("--domain", default=None)
    up.add_argument("--tags", default=None, help="comma-separated")
    up.add_argument("--business-definition", default=None, dest="business_definition")
    up.add_argument(
        "--sensitivity",
        default=None,
        choices=("public", "internal", "confidential", "restricted", ""),
        help='"" clears it',
    )
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

    dl = sp.add_parser("delete", help="Delete a dataset (DELETE /api/datasets/{id})")
    dl.add_argument("--id", required=True)
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_delete)

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
    qa.add_argument(
        "--expect",
        choices=("zero", "nonzero"),
        default=None,
        help="for --type sql: what the number means. `zero` (default) = rows that break the rule, >0 "
        "fails; `nonzero` = a coverage check, where finding nothing (=0) is the failure.",
    )
    qa.add_argument(
        "--sql",
        default=None,
        help="for --type sql: a single read-only SELECT returning ONE number = the count of violating "
        "rows (>0 fails). Must reference {{table}}; {{column}} is optional.",
    )
    add_write_flags(qa)
    qa.set_defaults(fn=cmd_quality_add)
    qu = qsp.add_parser("update", help="Update a quality rule (PUT …/quality-rules/{rule_id})")
    qu.add_argument("--id", required=True)
    qu.add_argument("--rule-id", required=True)
    qu.add_argument("--name", default=None)
    qu.add_argument("--column", default=None)
    qu.add_argument("--severity", default=None)
    qu.add_argument("--enabled", choices=("true", "false"), default=None)
    qu.add_argument(
        "--config",
        default=None,
        help='JSON object replacing the rule config, e.g. \'{"min": 0}\'',
    )
    add_write_flags(qu)
    qu.set_defaults(fn=cmd_quality_update)
    qs = qsp.add_parser("runs", help="A rule's run history (newest first, with the numbers)")
    qs.add_argument("--id", required=True)
    qs.add_argument("--rule-id", required=True)
    qs.set_defaults(fn=cmd_quality_runs)

    qr = qsp.add_parser("run", help="Run a quality rule (prints the run it produced)")
    qr.add_argument("--id", required=True)
    qr.add_argument("--rule-id", required=True)
    add_write_flags(qr)
    qr.set_defaults(fn=cmd_quality_run)
    qd = qsp.add_parser("delete", help="Delete a quality rule")
    qd.add_argument("--id", required=True)
    qd.add_argument("--rule-id", required=True)
    add_write_flags(qd)
    qd.set_defaults(fn=cmd_quality_delete)

