"""Semantic-model export/import helper tests (pure, no DB)."""
from app.services.data_layer.semantic_model import _resolve_dataset


def test_resolve_dataset_prefers_id():
    by_id = {"d1": "d1"}
    by_source = {"local.public.t": "d2"}
    by_name = {"t": "d3"}
    assert _resolve_dataset("d1", by_id, by_source, by_name) == "d1"


def test_resolve_dataset_falls_back_to_source_then_name():
    by_id: dict[str, str] = {}
    by_source = {"local.public.t": "d2"}
    by_name = {"t": "d3"}
    assert _resolve_dataset("local.public.t", by_id, by_source, by_name) == "d2"
    assert _resolve_dataset("t", by_id, by_source, by_name) == "d3"


def test_resolve_dataset_unresolved_and_non_string():
    assert _resolve_dataset("missing", {}, {}, {}) is None
    assert _resolve_dataset(None, {}, {}, {}) is None
