"""SQL Lab under a row restriction: the base table is always constrained, or the statement is refused.

Raw SQL has no generic rewrite, so the rule is narrow and testable. The base relation is given
a fixed alias (`rpbase`) and every condition is compiled against that alias — a condition that
lives on a *dimension* still references the base through the alias, which is why the alias has
to be predictable rather than the caller's own.

Anything the substitution would break is rejected instead of run unfiltered.
"""

from __future__ import annotations

import pytest

from app.services.data_layer.model_sql import constrain_base_policy
from app.services.data_layer.query import QueryError

CONDITIONS = ['rpbase."region" = :rp0']
ALIAS = "rpbase"


def _constrain(sql: str) -> str:
    return constrain_base_policy(
        sql,
        base_schema="public",
        base_table="orders",
        conditions=CONDITIONS,
        base_alias=ALIAS,
    )


def test_no_policy_returns_the_statement_untouched():
    sql = 'SELECT * FROM "public"."orders"'
    assert (
        constrain_base_policy(sql, base_schema="public", base_table="orders", conditions=[])
        == sql
    )


def test_a_plain_from_becomes_a_filtered_subquery_with_the_fixed_alias():
    out = _constrain('SELECT * FROM "public"."orders"')
    assert out.startswith('SELECT * FROM (SELECT * FROM "public"."orders" WHERE')
    assert f') AS "{ALIAS}"' in out
    # The surviving table name sits inside the filtered subquery, never as a bare scan.
    assert out.count('"public"."orders"') == 1


def test_an_existing_alias_is_refused_with_the_alias_to_use():
    """Renaming it silently would break the caller's own qualified columns."""
    with pytest.raises(QueryError, match=ALIAS):
        _constrain('SELECT o.amount FROM "public"."orders" o')


def test_join_to_the_base_table_is_constrained_too():
    """A statement may join the base table; that reference is substituted like the FROM one."""
    out = _constrain(
        'SELECT * FROM "public"."customers" c JOIN orders ON orders.customer_id = c.id'
    )
    assert 'FROM "public"."customers" c' in out
    assert out.count(f') AS "{ALIAS}"') == 1


def test_a_dimension_only_statement_is_not_restricted_on_the_base_table():
    out = _constrain('SELECT * FROM "public"."customers"')
    assert out == 'SELECT * FROM "public"."customers"'


def test_schema_qualified_column_paths_are_refused():
    """`"s"."t"."c"` cannot survive the substitution — refuse, do not leak."""
    with pytest.raises(QueryError, match="schema.table.column"):
        _constrain('SELECT "public"."orders"."amount" FROM "public"."orders"')


def test_unqualified_base_table_in_one_schema_is_constrained():
    out = _constrain('SELECT * FROM orders')
    assert f') AS "{ALIAS}"' in out


def test_the_where_clause_of_the_statement_is_preserved():
    out = _constrain('SELECT * FROM orders WHERE amount > 10')
    assert f') AS "{ALIAS}" WHERE amount > 10' in out


def test_a_base_dataset_without_a_physical_table_is_refused():
    with pytest.raises(QueryError, match="no physical table"):
        constrain_base_policy(
            'SELECT 1', base_schema=None, base_table=None, conditions=CONDITIONS
        )
