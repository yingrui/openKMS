"""SQL Lab under a row policy: the base table is always filtered, or the statement is refused.

Raw SQL has no generic rewrite, so the rule is narrow and testable: every reference to the
restricted table becomes a filtered subquery, and anything the substitution would break is
rejected rather than run unfiltered.
"""

from __future__ import annotations

import pytest

from app.services.data_layer.model_sql import constrain_base_policy
from app.services.data_layer.query import QueryError

CONDITIONS = ['"region" = :rp0']


def _constrain(sql: str) -> str:
    return constrain_base_policy(
        sql,
        base_schema="public",
        base_table="orders",
        conditions=CONDITIONS,
    )


def test_no_policy_returns_the_statement_untouched():
    sql = 'SELECT * FROM "public"."orders"'
    assert (
        constrain_base_policy(sql, base_schema="public", base_table="orders", conditions=[])
        == sql
    )


def test_a_plain_from_is_replaced_by_a_filtered_subquery():
    out = _constrain('SELECT * FROM "public"."orders"')
    assert out.startswith('SELECT * FROM (SELECT * FROM "public"."orders" WHERE "region" = :rp0)')
    # The surviving table name is inside the filtered subquery, never a bare scan.
    assert out.count('"public"."orders"') == 1


def test_an_existing_alias_survives_as_the_subquery_alias():
    out = _constrain('SELECT o.amount FROM "public"."orders" o')
    assert 'FROM (SELECT * FROM "public"."orders" WHERE "region" = :rp0) o' in out


def test_join_to_the_base_table_is_constrained_too():
    out = _constrain(
        'SELECT * FROM "public"."customers" c '
        'JOIN "public"."orders" o ON o.customer_id = c.id'
    )
    assert 'FROM "public"."customers" c' in out
    assert 'JOIN (SELECT * FROM "public"."orders" WHERE "region" = :rp0) o ON' in out


def test_a_dimension_only_statement_is_not_gated_on_the_base_table():
    out = _constrain('SELECT * FROM "public"."customers"')
    assert out == 'SELECT * FROM "public"."customers"'


def test_schema_qualified_column_paths_are_refused():
    """`"s"."t"."c"` cannot survive the subquery substitution — refuse, do not leak."""
    with pytest.raises(QueryError, match="schema.table.column"):
        _constrain('SELECT "public"."orders"."amount" FROM "public"."orders"')


def test_unqualified_base_table_in_one_schema_is_constrained():
    out = _constrain('SELECT * FROM orders')
    assert '(SELECT * FROM "public"."orders" WHERE "region" = :rp0) AS "orders"' in out


def test_the_where_clause_of_the_statement_is_preserved():
    out = _constrain('SELECT * FROM orders WHERE amount > 10')
    assert 'WHERE "region" = :rp0) AS "orders" WHERE amount > 10' in out


def test_a_base_dataset_without_a_physical_table_is_refused():
    with pytest.raises(QueryError, match="no physical table"):
        constrain_base_policy(
            'SELECT 1', base_schema=None, base_table=None, conditions=CONDITIONS
        )
