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
    assert out.startswith('SELECT * FROM (SELECT * FROM "public"."orders" AS "rpbase" WHERE')
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


# --- The rewritten statement has to actually run ------------------------------------------
# String assertions missed the bug these cover: the policy predicate referred to `rpbase`,
# which the old rewrite only defined *outside* the subquery it placed the predicate in. Every
# string test passed while PostgreSQL answered `missing FROM-clause entry for table "rpbase"`.

def _executable_rewrite(conditions: list[str]) -> str:
    """Compile a policy against the base, then rewrite it the way SQL Lab does."""
    from app.models.dataset import Dataset
    from app.models.dataset_join import DatasetJoin
    from app.services.data_layer.entity_scope import (
        EntityScope,
        ModelGraph,
        compile_entity_scope,
    )

    def ds(dataset_id: str, table: str) -> Dataset:
        return Dataset(
            id=dataset_id,
            data_source_id="src",
            kind="table",
            schema_name="public",
            table_name=table,
            display_name=table,
        )

    fact, dim = "f", "d"
    graph = ModelGraph.build(
        [fact, dim],
        {fact: ds(fact, "orders"), dim: ds(dim, "customers")},
        [
            DatasetJoin(
                id="j1",
                from_dataset_id=fact,
                to_dataset_id=dim,
                from_columns=["customer_id"],
                to_columns=["id"],
            )
        ],
    )
    scope = EntityScope(
        graph=graph,
        policy=conditions,
        claims={},
        columns_by_dataset={fact: {"id", "customer_id", "amount"}, dim: {"id", "region"}},
    )
    where, params = compile_entity_scope(scope, base_dataset_id=fact, base_alias=ALIAS)
    out = constrain_base_policy(
        'SELECT id, amount FROM "public"."orders"',
        base_schema="public",
        base_table="orders",
        conditions=where,
        base_alias=ALIAS,
    )
    return out, params


def _sqlite_orders_and_customers(tmp_path):
    """A real file DB so the rewrite's `"public"."orders"` can resolve via ATTACH."""
    import sqlite3

    schema_db = tmp_path / "public.db"
    conn = sqlite3.connect(":memory:")
    conn.execute("ATTACH DATABASE ? AS public", (str(schema_db),))
    conn.execute("CREATE TABLE public.orders(id INTEGER, customer_id INTEGER, amount REAL)")
    conn.execute("CREATE TABLE public.customers(id INTEGER, region TEXT)")
    conn.executemany(
        "INSERT INTO public.customers VALUES(?,?)",
        [(1, "east"), (2, "west")],
    )
    conn.executemany(
        "INSERT INTO public.orders VALUES(?,?,?)",
        [(10, 1, 100.0), (11, 2, 200.0), (12, 1, 300.0)],
    )
    conn.commit()
    return conn


def test_a_condition_on_the_base_table_executes(tmp_path):
    sql, params = _executable_rewrite([{"column": "amount", "op": ">", "value": 150}])
    conn = _sqlite_orders_and_customers(tmp_path)
    rows = conn.execute(sql.replace(":rpc0_0", "?"), list(params.values())).fetchall()
    assert sorted(r[1] for r in rows) == [200.0, 300.0]


def test_an_entity_level_condition_executes_as_an_exists(tmp_path):
    """The case the whole feature exists for: `region` lives on the joined table."""
    sql, params = _executable_rewrite([{"column": "region", "op": "=", "value": "east"}])
    assert "EXISTS" in sql
    conn = _sqlite_orders_and_customers(tmp_path)
    rows = conn.execute(sql.replace(":rpc0_0", "?"), list(params.values())).fetchall()
    # Only the east customer's rows survive; the rewrite must not drop or widen them.
    assert sorted(r[1] for r in rows) == [100.0, 300.0]
