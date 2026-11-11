"""An evaluation's `kind` decides what its items are and which run types are allowed.

Without it the same dataset could be run as retrieval, as QA, or as a data-query set, and the editor had no way to know
which columns mattered — which is how a data-query set ended up carrying `[correct]` in its answer column.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.evaluations import _validate_item_for_kind, _validate_kind_inputs
from app.schemas.evaluation import KIND_RUN_TYPES
from app.services.workspace.evaluations.execute import ALLOWED_EVALUATION_TYPES


class TestKindInputs:
    def test_a_query_evaluation_must_name_its_model(self):
        with pytest.raises(HTTPException, match="semantic model"):
            _validate_kind_inputs("query", semantic_model_id=None, wiki_space_id=None)
        _validate_kind_inputs("query", semantic_model_id="model-1", wiki_space_id=None)

    def test_a_content_evaluation_must_name_its_wiki_space(self):
        with pytest.raises(HTTPException, match="wiki space"):
            _validate_kind_inputs("content", semantic_model_id=None, wiki_space_id=None)
        _validate_kind_inputs("content", semantic_model_id=None, wiki_space_id="wiki-1")

    def test_an_answer_evaluation_needs_neither(self):
        _validate_kind_inputs("answer", semantic_model_id=None, wiki_space_id=None)


class TestItemShape:
    def test_a_query_item_needs_a_query_and_no_answer(self):
        ev = SimpleNamespace(kind="query")
        with pytest.raises(HTTPException, match="expected_query"):
            _validate_item_for_kind(ev, expected_answer=None, expected_query=None)
        _validate_item_for_kind(ev, expected_answer=None, expected_query=[{"expected": {"sql": "select 1"}}])

    def test_an_answer_item_needs_an_answer(self):
        ev = SimpleNamespace(kind="answer")
        with pytest.raises(HTTPException, match="expected answer"):
            _validate_item_for_kind(ev, expected_answer="  ", expected_query=None)
        _validate_item_for_kind(ev, expected_answer="4 家", expected_query=None)


class TestRunTypes:
    def test_every_run_type_belongs_to_exactly_one_kind(self):
        seen = [t for types in KIND_RUN_TYPES.values() for t in types]
        assert sorted(seen) == sorted(ALLOWED_EVALUATION_TYPES)
        assert len(seen) == len(set(seen))

    def test_a_query_set_cannot_be_run_as_retrieval(self):
        assert "data_query" in KIND_RUN_TYPES["query"]
        assert "search_retrieval" not in KIND_RUN_TYPES["query"]
