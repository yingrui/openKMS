"""The Catalog tool states what the model can answer, not only what its fields are.

The failure this guards: asked for a company's revenue, an agent read a field list, saw fields, picked one it had and
answered anyway. A compact `available_measures` line turns "is this answerable" into a fact in the loop instead of an
inference from a catalogue.
"""
import json
from unittest.mock import patch

from qa_agent.skills.catalog import get_semantic_model_tool

FIELDS = [
    {"id": "f1", "name": "pe_ttm", "column_name": "pe_ttm", "dataset_id": "d1", "datatype": "float"},
    {"id": "f2", "name": "total_mv", "column_name": "total_mv", "dataset_id": "d1", "datatype": "float"},
    {"id": "f3", "name": "industry", "column_name": "industry", "dataset_id": "d2", "datatype": "string"},
]
METRICS = [
    {"id": "m1", "name": "TTM市盈率", "expression": {"dialects": []}, "base_dataset_id": "d1"},
]


class _Config(dict):
    """Stands in for the RunnableConfig that carries the request token and KB id."""


def _call() -> dict:
    config = _Config()
    with patch("qa_agent.skills.catalog.get_tool_access_token", return_value="t"), \
         patch("qa_agent.skills.catalog.get_tool_knowledge_base_id", return_value="kb1"), \
         patch("qa_agent.skills.catalog._ensure_model_in_kb", return_value=[]), \
         patch("qa_agent.skills.catalog.catalog_client.get_semantic_model", return_value={"id": "m", "access_mode": "public"}), \
         patch("qa_agent.skills.catalog.catalog_client.list_model_metrics", return_value=METRICS), \
         patch("qa_agent.skills.catalog.catalog_client.list_model_fields", return_value=FIELDS), \
         patch("qa_agent.skills.catalog._model_tables", return_value=[{"qualified_name": "tushare.daily_basic"}]):
        return json.loads(get_semantic_model_tool.func("model-1", config))


def test_measures_are_listed_without_the_full_catalogue():
    payload = _call()
    assert payload["available_measures"] == ["industry", "pe_ttm", "total_mv"]
    assert payload["available_metrics"] == ["TTM市盈率"]


def test_the_full_field_list_is_still_there():
    payload = _call()
    assert [f["name"] for f in payload["fields"]] == ["pe_ttm", "total_mv", "industry"]


def test_a_measure_the_model_does_not_have_is_absent():
    # 'revenue' is what the failing question asked for; it must not be implied by a non-empty field list.
    assert "revenue" not in _call()["available_measures"]
