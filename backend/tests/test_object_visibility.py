"""Row policy reaching the object layer: translated to filters, or refused with a reason."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.explorer.object_visibility import (
    NOT_APPLIED,
    _filters_from_policy,
    object_scope_filters,
)
from app.services.ontology.object_query import PropertyFilter


class _Session:
    def __init__(self, models: list[object]):
        self.models = models

    async def execute(self, _query):
        rows = self.models

        class _Result:
            def scalars(self):
                return self

            def all(self):
                return rows

        return _Result()


def _scope(owner: str = "ds-1") -> SimpleNamespace:
    graph = SimpleNamespace()

    def _owner_of(_graph, _columns, _column):
        return owner

    return SimpleNamespace(graph=graph, columns_by_dataset={}, claims={"region": "华东"})


def test_a_public_dataset_needs_no_filters():
    obj_type = SimpleNamespace(dataset_id="ds-public")
    assert asyncio.run(object_scope_filters(_Session([]), None, obj_type)) == []


def test_a_type_without_a_dataset_has_no_policy_source():
    obj_type = SimpleNamespace(dataset_id=None)
    assert asyncio.run(object_scope_filters(_Session([]), None, obj_type)) == []


def test_policy_operators_map_onto_the_object_set_vocabulary(monkeypatch):
    import app.services.explorer.object_visibility as module

    monkeypatch.setattr(module, "_owner_of", lambda graph, columns, column: "ds-1")
    filters = _filters_from_policy(
        policy=[
            {"column": "region", "op": "=", "claim": "region"},
            {"column": "exposure", "op": "between", "value": [10, 20]},
            {"column": "status", "op": "is_not_null"},
        ],
        claims={"region": "华东"},
        dataset_id="ds-1",
        scope=_scope(),
    )
    assert filters == [
        PropertyFilter(prop="region", op="eq", value="华东"),
        PropertyFilter(prop="exposure", op="ge", value=10),
        PropertyFilter(prop="exposure", op="le", value=20),
        PropertyFilter(prop="status", op="is_not_null", value=None),
    ]


def test_a_condition_on_another_dataset_is_refused_rather_than_dropped():
    with pytest.raises(HTTPException) as exc:
        _filters_from_policy(
            policy=[{"column": "industry", "op": "=", "value": "银行"}],
            claims={},
            dataset_id="ds-1",
            scope=_scope(owner="ds-2"),
        )
    assert exc.value.status_code == 403
    assert exc.value.detail == NOT_APPLIED
