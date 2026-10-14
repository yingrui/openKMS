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


# --- entity-level OPENKMS extensions (what the core spec cannot express) ---------


def test_extension_omits_empty_values():
    from app.services.data_layer.semantic_model import _extension

    assert _extension({"required": False, "filters": None, "joins": [], "columns": {}}) == []
    ext = _extension({"required": True, "filters": None})
    assert ext == [{"vendor_name": "OPENKMS", "data": '{"required": true}'}]


def test_entity_extension_round_trips_and_ignores_other_vendors():
    from app.services.data_layer.semantic_model import _entity_extension

    entity = {
        "name": "r",
        "custom_extensions": [
            {"vendor_name": "SNOWFLAKE", "data": '{"x": 1}'},
            {"vendor_name": "openkms", "data": '{"required": true}'},
        ],
    }
    assert _entity_extension(entity) == {"required": True}
    assert _entity_extension({"name": "r"}) == {}
    assert _entity_extension({"custom_extensions": [{"vendor_name": "OPENKMS", "data": "{"}]}) == {}


def test_source_column_is_derived_from_a_bare_expression():
    from app.services.data_layer.semantic_model import _source_column

    def expr(sql):
        return {"dialects": [{"dialect": "ANSI_SQL", "expression": sql}]}

    assert _source_column(expr('"trade_date"')) == "trade_date"
    assert _source_column(expr("trade_date")) == "trade_date"
    assert _source_column(expr('DATE_TRUNC(\'month\', trade_date)')) is None
    assert _source_column(None) is None
