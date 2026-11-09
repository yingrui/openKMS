"""SQL Lab shape checks and table allowlist (pure)."""
from __future__ import annotations

import pytest

from app.models.dataset import Dataset
from app.services.data.model_sql import (
    assert_tables_allowed,
    extract_relations,
    normalize_lab_sql,
    wrap_with_limit,
)
from app.services.data.query import QueryError


def test_normalize_accepts_select_and_with():
    assert normalize_lab_sql("SELECT 1").startswith("SELECT")
    assert normalize_lab_sql("WITH x AS (SELECT 1) SELECT * FROM x").lower().startswith("with")


def test_normalize_rejects_dml_and_multi_statement():
    with pytest.raises(QueryError):
        normalize_lab_sql("DELETE FROM t")
    with pytest.raises(QueryError):
        normalize_lab_sql("SELECT 1; SELECT 2")


def test_extract_relations_finds_schema_table_and_bare():
    rels = extract_relations('SELECT * FROM "public"."daily" JOIN other o ON true')
    assert ("public", "daily") in rels
    assert (None, "other") in rels


def test_extract_skips_subquery_open_paren():
    rels = extract_relations("SELECT * FROM (SELECT 1) AS q")
    assert rels == set()


def _ds(schema: str, table: str, *, ds_id: str = "ds") -> Dataset:
    return Dataset(
        id=f"{schema}.{table}",
        data_source_id=ds_id,
        kind="table",
        schema_name=schema,
        table_name=table,
    )


def test_allowlist_accepts_model_tables():
    assert_tables_allowed(
        'SELECT * FROM "public"."a" JOIN "public"."b" ON true',
        [_ds("public", "a"), _ds("public", "b")],
    )


def test_allowlist_rejects_unknown_table():
    with pytest.raises(QueryError, match="not in this semantic model"):
        assert_tables_allowed(
            'SELECT * FROM "public"."secret"',
            [_ds("public", "a")],
        )


def test_allowlist_ambiguous_bare_name():
    with pytest.raises(QueryError, match="ambiguous"):
        assert_tables_allowed(
            "SELECT * FROM a",
            [_ds("public", "a"), _ds("other", "a")],
        )


def test_wrap_with_limit():
    out = wrap_with_limit("SELECT 1", 10)
    assert "LIMIT 10" in out
    assert "SELECT 1" in out
