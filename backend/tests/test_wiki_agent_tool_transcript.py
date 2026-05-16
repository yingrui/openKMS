"""Wiki agent: persisted tool outputs are replayed into the model context."""

from __future__ import annotations

from app.services.agent.wiki_runner import (
    WIKI_TOOL_TRANSCRIPTS_KEY,
    assistant_lc_content_from_db_row,
    truncate_wiki_tool_output_for_storage,
)


def test_truncate_wiki_tool_output_for_storage() -> None:
    long = "x" * 100_000
    max_len = 100
    out = truncate_wiki_tool_output_for_storage(long, max_len=max_len)
    assert len(out) <= max_len
    assert "truncated" in out


def test_assistant_lc_content_from_db_row_merges_traces() -> None:
    merged = assistant_lc_content_from_db_row(
        "Here is my answer.",
        {WIKI_TOOL_TRANSCRIPTS_KEY: [{"name": "list_wiki_pages", "output": "- page a"}]},
    )
    assert "Here is my answer." in merged
    assert "### Tool `list_wiki_pages` result" in merged
    assert "- page a" in merged
    assert "---" in merged


def test_assistant_lc_content_from_db_row_tools_only() -> None:
    merged = assistant_lc_content_from_db_row(
        "",
        {WIKI_TOOL_TRANSCRIPTS_KEY: [{"name": "get_wiki_page", "output": "# Title\nbody"}]},
    )
    assert merged.startswith("### Tool `get_wiki_page` result")
    assert "body" in merged


def test_assistant_lc_content_from_db_row_no_traces() -> None:
    assert assistant_lc_content_from_db_row("visible only", None) == "visible only"
    assert assistant_lc_content_from_db_row("x", {}) == "x"
