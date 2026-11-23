"""What a `search_knowledge_base` passage has to keep on the way back.

Retrieval used to run before generation, so its `SourceItem`s reached the response intact. Now the passages travel as
JSON through a tool call and are rebuilt from the transcript — and the rebuild read a subset of the fields. Every answer
lost its retrieval mode, per-stage scores and document metadata: the sources still listed documents, but nothing said
they came from a semantic search.
"""
from __future__ import annotations

import json

from langchain_core.messages import ToolMessage

from qa_agent.kb_answer_sources import select_display_sources, sources_from_kb_search_tools
from qa_agent.schemas import SourceItem

PASSAGE = {
    "id": "chunk-1",
    "source_type": "chunk",
    "source_name": "量化因子手册.pdf",
    "content": "IC 是因子暴露与下期收益的秩相关。",
    "score": 0.42,
    "document_id": "doc-1",
    "wiki_page_id": None,
    "wiki_space_id": None,
    "chunk_index": 12,
    "doc_metadata": {"page": 3, "section": "因子评价"},
    "retrieval_mode": "hybrid",
    "retrieval_debug": {"dense_score": 0.61, "bm25_score": 4.2, "rrf_score": 0.03, "rerank_score": 0.42},
}


def _transcript(passage: dict | None = None) -> list[ToolMessage]:
    payload = {"query": "IC", "passages": [passage or PASSAGE]}
    return [ToolMessage(content=json.dumps(payload, ensure_ascii=False), name="search_knowledge_base", tool_call_id="t1")]


def test_a_passage_keeps_its_retrieval_provenance():
    sources = sources_from_kb_search_tools(_transcript())
    assert sources is not None
    source = sources[0]
    assert source.retrieval_mode == "hybrid"
    assert source.retrieval_debug == PASSAGE["retrieval_debug"]
    assert source.doc_metadata == {"page": 3, "section": "因子评价"}


def test_the_display_selection_uses_the_same_rows():
    # `select_display_sources` prefers page index / catalog / ontology, then the search; none of those ran here.
    sources = select_display_sources([], messages=_transcript())
    assert [s.id for s in sources] == ["chunk-1"]
    assert sources[0].retrieval_mode == "hybrid"


def test_an_old_payload_without_the_new_fields_still_builds():
    old = {k: v for k, v in PASSAGE.items() if k not in ("doc_metadata", "retrieval_mode", "retrieval_debug")}
    sources = sources_from_kb_search_tools(_transcript(old))
    assert sources is not None
    # Missing provenance is absent, not invented: the answer says "no retrieval detail" instead of "dense, score 0".
    assert sources[0].retrieval_mode is None
    assert sources[0].retrieval_debug is None


def test_the_tool_serialises_the_provenance_it_was_given(monkeypatch):
    """The tool is the other half of the round trip: drop the fields there and the rebuild has nothing to read."""
    from qa_agent.skills import kb_search

    hit = SourceItem(
        id="chunk-2",
        source_type="chunk",
        content="换手率是因子信号变化的频率。",
        score=0.3,
        source_name="手册.pdf",
        chunk_index=4,
        doc_metadata={"page": 9},
        retrieval_mode="dense",
        retrieval_debug={"dense_score": 0.3},
    )
    monkeypatch.setattr(kb_search, "retrieve", lambda *a, **k: [hit])
    monkeypatch.setattr(kb_search, "get_tool_knowledge_base_id", lambda _cfg: "kb-1")
    monkeypatch.setattr(kb_search, "get_tool_access_token", lambda _cfg: "token")

    payload = json.loads(kb_search.search_knowledge_base.invoke({"query": "换手率", "config": {}}))
    passage = payload["passages"][0]
    assert passage["retrieval_mode"] == "dense"
    assert passage["retrieval_debug"] == {"dense_score": 0.3}
    assert passage["doc_metadata"] == {"page": 9}


def test_a_streamed_turn_shows_the_search_as_its_sources():
    """The chat only ever sees tool output as stream events: the collector must record the search, not just catalog."""
    from qa_agent.agent import _StreamCollector

    collector = _StreamCollector()
    collector.observe(
        {
            "event": "on_tool_end",
            "name": "search_knowledge_base",
            "run_id": "r1",
            "data": {"input": {"query": "MIL"}, "output": json.dumps({"query": "MIL", "passages": [PASSAGE]})},
        }
    )
    assert [s.id for s in collector.ledger.items("searched")] == ["chunk-1"]
    sources = collector.sources([])
    # No page section, no catalog, no ontology: the corpus search is what this turn actually used.
    assert [s.id for s in sources] == ["chunk-1"]
    assert sources[0].retrieval_mode == "hybrid"


def test_the_same_passage_is_recorded_once():
    from qa_agent.agent import _StreamCollector

    collector = _StreamCollector()
    event = {
        "event": "on_tool_end",
        "name": "search_knowledge_base",
        "run_id": "r1",
        "data": {"input": {"query": "MIL"}, "output": json.dumps({"query": "MIL", "passages": [PASSAGE]})},
    }
    collector.observe(event)
    collector.observe(event)
    assert len(collector.ledger.items("searched")) == 1


def test_a_failed_search_output_is_not_an_error():
    from qa_agent.agent import _StreamCollector

    collector = _StreamCollector()
    collector.observe(
        {
            "event": "on_tool_end",
            "name": "search_knowledge_base",
            "run_id": "r1",
            "data": {"input": {"query": "MIL"}, "output": "Error: no knowledge base in scope."},
        }
    )
    assert collector.ledger.items("searched") == []


WEB_RESULT = {
    "title": "中证指数修订上证红利指数编制方案",
    "url": "https://example.com/news/1",
    "content": "修订后的编制方案将于 11 月 13 日实施。",
    "publisher": "example.com",
    "published_at": "2026-11-20",
}


def test_a_web_result_becomes_a_source_with_its_url():
    from qa_agent.kb_answer_sources import sources_from_web_search_payload

    sources = sources_from_web_search_payload(json.dumps({"query": "q", "results": [WEB_RESULT]}))
    assert len(sources) == 1
    source = sources[0]
    assert (source.source_type, source.url) == ("web", WEB_RESULT["url"])
    assert source.source_name == WEB_RESULT["title"]
    # Not a retrieval similarity: the provider ranked, and a made-up score reads like one.
    assert source.score == 0.0
    assert source.doc_metadata == {"publisher": "example.com", "published_at": "2026-11-20"}


def test_a_web_result_without_a_url_is_dropped():
    from qa_agent.kb_answer_sources import sources_from_web_search_payload

    broken = {k: v for k, v in WEB_RESULT.items() if k != "url"}
    assert sources_from_web_search_payload(json.dumps({"results": [broken]})) == []


def test_the_web_is_appended_to_internal_evidence_not_substituted_for_it():
    from langchain_core.messages import ToolMessage

    from qa_agent.kb_answer_sources import select_display_sources

    messages = [
        ToolMessage(content=json.dumps({"query": "IC", "passages": [PASSAGE]}), name="search_knowledge_base", tool_call_id="t1"),
        ToolMessage(content=json.dumps({"query": "news", "results": [WEB_RESULT]}), name="search_web", tool_call_id="t2"),
    ]
    sources = select_display_sources([], messages=messages)
    assert [s.source_type for s in sources] == ["chunk", "web"]
    # The internal hit keeps its provenance; the external one keeps its link.
    assert sources[0].retrieval_mode == "hybrid"
    assert sources[1].url == WEB_RESULT["url"]


def test_the_same_page_twice_is_one_source():
    from langchain_core.messages import ToolMessage

    from qa_agent.kb_answer_sources import select_display_sources

    payload = json.dumps({"query": "news", "results": [WEB_RESULT]})
    messages = [
        ToolMessage(content=payload, name="search_web", tool_call_id="t1"),
        ToolMessage(content=payload, name="search_web", tool_call_id="t2"),
    ]
    sources = select_display_sources([], messages=messages)
    assert len(sources) == 1
