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
from app.services.data_layer.entity_scope import (
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
