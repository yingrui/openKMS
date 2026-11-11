"""Catalog SQL Lab tool is cited in answer sources."""

from langchain_core.messages import AIMessage, ToolMessage

from qa_agent.kb_answer_sources import (
    select_display_sources,
    source_from_catalog_tool,
    sources_from_catalog_tools,
)
from qa_agent.skills.catalog import catalog_tools

_SQL_OUT = (
    '{"sql": "SELECT * FROM (\\nSELECT 1 AS n\\n) AS _ok_sql_lab LIMIT 10",'
    ' "columns": ["n"], "rows": [{"n": 1}], "row_count": 1}'
)


def test_sql_tool_registered():
    names = {getattr(t, "name", None) for t in catalog_tools}
    assert "sql_semantic_model_tool" in names
    assert "query_semantic_model_tool" in names


def test_source_from_catalog_tool_stream_path():
    src = source_from_catalog_tool(
        "sql_semantic_model_tool",
        {"model_id": "m1", "sql": "SELECT 1 AS n", "limit": 10},
        _SQL_OUT,
        index=0,
    )
    assert src is not None
    assert src.data_query and src.data_query["mode"] == "sql"
    assert src.data_query["model_id"] == "m1"


def test_select_display_sources_prefers_streamed_catalog():
    cat = source_from_catalog_tool(
        "sql_semantic_model_tool",
        {"model_id": "m1", "sql": "SELECT 1"},
        _SQL_OUT,
    )
    assert cat is not None
    out = select_display_sources([], messages=None, streamed_catalog=[cat])
    assert out == [cat]


def test_sources_from_sql_lab_tool():
    ai = AIMessage(
        content="",
        tool_calls=[
            {
                "id": "c1",
                "name": "sql_semantic_model_tool",
                "args": {"model_id": "m1", "sql": "SELECT 1 AS n", "limit": 10},
            }
        ],
    )
    tool = ToolMessage(
        content=_SQL_OUT,
        tool_call_id="c1",
        name="sql_semantic_model_tool",
    )
    sources = sources_from_catalog_tools([ai, tool])
    assert sources is not None
    assert len(sources) == 1
    assert sources[0].source_type == "semantic_model"
    assert "SQL Lab" in (sources[0].source_name or "")
    dq = sources[0].data_query or {}
    assert dq.get("mode") == "sql"
    assert dq.get("model_id") == "m1"
    assert "SELECT" in str(dq.get("sql") or "")
    assert dq.get("columns") == ["n"]
    assert dq.get("rows") == [{"n": 1}]
    assert dq.get("row_count") == 1


def test_metric_mode_source_keeps_the_arguments_it_was_asked_with():
    """In metric mode the SQL is generated and its values are parameterised, so the arguments are the judgeable record."""
    src = source_from_catalog_tool(
        "query_semantic_model_tool",
        {
            "model_id": "m1",
            "metric": "平均市盈率",
            "group_by": [{"field": "industry"}],
            "filters": [{"field": "list_status", "op": "=", "value": "L"}],
            "base_dataset": "ds-1",
            "joins": ["rel-1"],
            "resource_id": "res-1",
        },
        _SQL_OUT,
        index=0,
    )
    dq = (src.data_query if src else None) or {}
    assert dq["mode"] == "metric"
    assert dq["group_by"] == [{"field": "industry"}]
    assert dq["filters"] == [{"field": "list_status", "op": "=", "value": "L"}]
    assert (dq["base_dataset"], dq["joins"], dq["resource_id"]) == ("ds-1", ["rel-1"], "res-1")
