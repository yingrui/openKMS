"""Entity-level row scope: a condition constrains entities, not one physical table.

The case that motivated this: a model joins `daily_basic` (fact, holds the metric) to
`stock_basic` (dimension, holds `industry`). A resource restricted to
`industry = '半导体'` must constrain a query whose base is `daily_basic` — otherwise the
restriction looks configured but enforces nothing, because the query never reads the table the
condition was written against.

Everything here is pure: the graph is built from plain rows.
"""

from __future__ import annotations

import pytest

from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.services.data.entity_scope import (
    EntityScope,
    EntityScopeError,
    ModelGraph,
    compile_entity_scope,
)


def _ds(dataset_id: str, table: str, label: str | None = None) -> Dataset:
    return Dataset(
        id=dataset_id,
        data_source_id="src",
        kind="table",
        schema_name="tushare",
        table_name=table,
        display_name=label,
    )


def _join(join_id: str, from_id: str, to_id: str, col: str = "ts_code") -> DatasetJoin:
    return DatasetJoin(
        id=join_id,
        from_dataset_id=from_id,
        to_dataset_id=to_id,
        from_columns=[col],
        to_columns=[col],
    )


FACT = "ds_fact"
DIM = "ds_dim"


def _graph() -> ModelGraph:
    return ModelGraph.build(
        [FACT, DIM],
        {
            FACT: _ds(FACT, "daily_basic", "Daily basic"),
            DIM: _ds(DIM, "stock_basic", "Stock basic"),
        },
        [_join("j1", FACT, DIM)],
    )


def _scope(policy: list[dict], columns: dict[str, set[str]] | None = None) -> EntityScope:
    return EntityScope(
        graph=_graph(),
        policy=policy,
        claims={},
        columns_by_dataset=columns
        or {FACT: {"ts_code", "close"}, DIM: {"ts_code", "industry"}},
    )


def test_a_condition_on_the_base_table_is_a_plain_predicate():
    scope = _scope([{"column": "close", "op": ">", "value": 10}])
    where, params = compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert len(where) == 1
    assert where[0].startswith('base."close"')
    assert list(params.values()) == [10]


def test_a_condition_on_a_dimension_reaches_a_fact_based_query():
    """The whole point: `industry` lives on the dimension, the metric reads the fact."""
    scope = _scope([{"column": "industry", "op": "=", "value": "半导体"}])
    where, params = compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert len(where) == 1
    sql = where[0]
    assert sql.startswith("EXISTS (SELECT 1 FROM")
    # Correlated back to the query's own base, not to a fixed table.
    assert 'base."ts_code"' in sql
    assert "tushare" in sql and "stock_basic" in sql
    assert list(params.values()) == ["半导体"]


def test_the_same_scope_applies_directly_when_the_base_is_the_dimension():
    scope = _scope([{"column": "industry", "op": "=", "value": "半导体"}])
    where, _ = compile_entity_scope(scope, base_dataset_id=DIM, base_alias="base")
    assert where[0].startswith('base."industry"')
    assert "EXISTS" not in where[0]


def test_a_qualified_column_names_its_dataset():
    scope = _scope([{"column": "stock_basic.industry", "op": "=", "value": "bank"}])
    where, _ = compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert "EXISTS" in where[0]


def test_an_ambiguous_column_is_refused():
    """`ts_code` exists on both datasets; guessing one would silently change the meaning."""
    scope = _scope([{"column": "ts_code", "op": "=", "value": "000001.SZ"}])
    with pytest.raises(EntityScopeError) as excinfo:
        compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert excinfo.value.failure.code == "ROW_POLICY_AMBIGUOUS_COLUMN"


def test_an_unknown_column_is_refused():
    scope = _scope([{"column": "nope", "op": "=", "value": 1}])
    with pytest.raises(EntityScopeError) as excinfo:
        compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert excinfo.value.failure.code == "ROW_POLICY_UNKNOWN_COLUMN"


def test_an_unreachable_owner_is_refused_not_ignored():
    """No join path means the restriction cannot be enforced; running unfiltered is a leak."""
    orphan = "ds_orphan"
    graph = ModelGraph.build(
        [FACT, orphan],
        {FACT: _ds(FACT, "daily_basic"), orphan: _ds(orphan, "industry_map")},
        [],
    )
    scope = EntityScope(
        graph=graph,
        policy=[{"column": "industry", "op": "=", "value": "x"}],
        claims={},
        columns_by_dataset={FACT: {"ts_code"}, orphan: {"industry"}},
    )
    with pytest.raises(EntityScopeError) as excinfo:
        compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert excinfo.value.failure.code == "ROW_POLICY_NO_PATH"


def test_the_direct_relationship_wins_over_a_longer_detour():
    """A direct FK is the unique shortest path, so it is used rather than refused."""
    mid = "ds_mid"
    graph = ModelGraph.build(
        [FACT, DIM, mid],
        {
            FACT: _ds(FACT, "daily_basic"),
            DIM: _ds(DIM, "stock_basic"),
            mid: _ds(mid, "calendar"),
        },
        [_join("j1", FACT, DIM), _join("j2", FACT, mid), _join("j3", mid, DIM)],
    )
    assert graph.path_between(FACT, DIM) == ("j1",)


def test_two_equal_length_paths_are_ambiguous():
    """Both routes are equally direct but reach the rows differently; refuse to pick one."""
    a, b = "ds_a", "ds_b"
    graph = ModelGraph.build(
        [FACT, DIM, a, b],
        {
            FACT: _ds(FACT, "daily_basic"),
            DIM: _ds(DIM, "stock_basic"),
            a: _ds(a, "by_code"),
            b: _ds(b, "by_isin"),
        },
        [
            _join("j1", FACT, a),
            _join("j2", a, DIM, col="code"),
            _join("j3", FACT, b),
            _join("j4", b, DIM, col="isin"),
        ],
    )
    assert graph.path_between(FACT, DIM) is None


def test_multiple_conditions_are_all_enforced():
    scope = _scope(
        [
            {"column": "close", "op": ">", "value": 10},
            {"column": "industry", "op": "=", "value": "半导体"},
        ]
    )
    where, params = compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert len(where) == 2
    assert "EXISTS" in where[1]
    assert sorted(params.values(), key=str) == sorted([10, "半导体"], key=str)


def test_an_empty_policy_compiles_to_nothing():
    where, params = compile_entity_scope(_scope([]), base_dataset_id=FACT, base_alias="base")
    assert where == [] and params == {}


# --- Conditions on one owner share a subquery, but only when that is provably equivalent -----
# Two separate `EXISTS` clauses let *different* owner rows satisfy different conditions; one
# `EXISTS … AND …` demands a single row satisfy all of them. Merging is therefore only safe when
# a base row can match at most one owner row — the path walks many → one throughout, and the final
# hop lands on the owner's declared key.

def _graph_with_keys(pk: list[str] | None = None, unique: list[list[str]] | None = None) -> ModelGraph:
    dim = _ds(DIM, "stock_basic")
    dim.primary_key_columns = pk
    dim.unique_keys = unique or []
    return ModelGraph.build(
        [FACT, DIM],
        {FACT: _ds(FACT, "daily_basic"), DIM: dim},
        [_join("j1", FACT, DIM)],
    )


def _scope_on(graph: ModelGraph, policy: list[dict]) -> EntityScope:
    return EntityScope(
        graph=graph,
        policy=policy,
        claims={},
        columns_by_dataset={FACT: {"ts_code", "close"}, DIM: {"ts_code", "industry", "area"}},
    )


TWO_ON_DIM = [
    {"column": "industry", "op": "=", "value": "半导体"},
    {"column": "area", "op": "=", "value": "华东"},
]


def test_conditions_on_a_keyed_owner_share_one_subquery():
    scope = _scope_on(_graph_with_keys(pk=["ts_code"]), TWO_ON_DIM)
    where, params = compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert len(where) == 1
    assert where[0].count("EXISTS") == 1
    # Both predicates are inside the single subquery, joined by AND.
    assert '"industry"' in where[0] and '"area"' in where[0]
    assert len(params) == 2


def test_conditions_are_not_merged_without_a_declared_key():
    """No key declared: the owner may match several rows, so keep the conditions independent."""
    scope = _scope_on(_graph_with_keys(pk=None), TWO_ON_DIM)
    where, _ = compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert len(where) == 2
    assert all("EXISTS" in w for w in where)


def test_a_declared_unique_key_also_allows_merging():
    scope = _scope_on(_graph_with_keys(pk=None, unique=[["ts_code"]]), TWO_ON_DIM)
    where, _ = compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert len(where) == 1


def test_conditions_stay_separate_when_the_path_walks_one_to_many():
    """Reached backwards, an owner row is not unique per base row — merging would narrow rows."""
    dim = _ds(DIM, "stock_basic")
    dim.primary_key_columns = ["ts_code"]
    graph = ModelGraph.build(
        [FACT, DIM],
        {FACT: _ds(FACT, "daily_basic"), DIM: dim},
        [
            # DIM on the many side: the same dimension row points at several fact rows.
            DatasetJoin(
                id="j1",
                from_dataset_id=DIM,
                to_dataset_id=FACT,
                from_columns=["ts_code"],
                to_columns=["ts_code"],
            )
        ],
    )
    scope = _scope_on(graph, TWO_ON_DIM)
    where, _ = compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert len(where) == 2


def test_a_single_condition_is_unchanged_by_the_merge_path():
    scope = _scope_on(_graph_with_keys(pk=["ts_code"]), [TWO_ON_DIM[0]])
    where, _ = compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert len(where) == 1
    assert where[0].count("EXISTS") == 1


def test_conditions_on_different_owners_stay_apart():
    other = "ds_other"
    graph = ModelGraph.build(
        [FACT, DIM, other],
        {
            FACT: _ds(FACT, "daily_basic"),
            DIM: _graph_with_keys(pk=["ts_code"]).datasets[DIM],
            other: _ds(other, "industry_map"),
        },
        [_join("j1", FACT, DIM), _join("j2", FACT, other)],
    )
    scope = EntityScope(
        graph=graph,
        policy=TWO_ON_DIM,
        claims={},
        columns_by_dataset={
            FACT: {"ts_code", "close"},
            DIM: {"ts_code", "industry"},
            other: {"ts_code", "area"},
        },
    )
    where, _ = compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert len(where) == 2


def test_a_base_condition_and_a_merged_owner_condition_coexist():
    scope = _scope_on(
        _graph_with_keys(pk=["ts_code"]),
        [{"column": "close", "op": ">", "value": 10}, *TWO_ON_DIM],
    )
    where, params = compile_entity_scope(scope, base_dataset_id=FACT, base_alias="base")
    assert len(where) == 2
    assert where[0].startswith('base."close"')
    assert where[1].count("EXISTS") == 1
    assert len(params) == 3


def test_merging_and_not_merging_select_the_same_rows_on_a_unique_owner():
    """The equivalence the merge relies on, checked by running both forms."""
    import sqlite3

    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE daily_basic(ts_code TEXT, close REAL)")
    conn.execute("CREATE TABLE stock_basic(ts_code TEXT PRIMARY KEY, industry TEXT, area TEXT)")
    conn.executemany(
        "INSERT INTO stock_basic VALUES(?,?,?)",
        [("A", "半导体", "华东"), ("B", "半导体", "华北"), ("C", "银行", "华东")],
    )
    conn.executemany(
        "INSERT INTO daily_basic VALUES(?,?)",
        [("A", 1.0), ("B", 2.0), ("C", 3.0)],
    )

    merged, merged_params = compile_entity_scope(
        _scope_on(_graph_with_keys(pk=["ts_code"]), TWO_ON_DIM),
        base_dataset_id=FACT,
        base_alias="base",
    )
    separate, separate_params = compile_entity_scope(
        _scope_on(_graph_with_keys(pk=None), TWO_ON_DIM),
        base_dataset_id=FACT,
        base_alias="base",
    )
    assert len(merged) == 1 and len(separate) == 2

    def rows(where: list[str], params: dict) -> list[str]:
        sql = (
            f'SELECT base.ts_code FROM daily_basic base WHERE {" AND ".join(where)} '
            f"ORDER BY base.ts_code"
        )
        # The compiled SQL uses `:name`; sqlite3 wants positional or named dicts.
        sql = sql.replace('"tushare"."stock_basic"', "stock_basic")
        return [r[0] for r in conn.execute(sql, params).fetchall()]

    assert rows(merged, merged_params) == ["A"]
    assert rows(separate, separate_params) == ["A"]
