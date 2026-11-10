"""Where context comes from: pre-retrieval, none, or a search tool the model calls."""
from unittest.mock import patch

from langchain_core.messages import AIMessage, HumanMessage

from qa_agent import agent_config as cfg
from qa_agent.agent import retrieve_node


class TestMode:
    def test_default_is_todays_pre_retrieval(self):
        assert cfg.retrieve_mode(None) == "always"
        assert cfg.retrieve_mode({"orchestration": {}}) == "always"

    def test_the_three_modes_are_honoured(self):
        for mode in ("always", "never", "on_miss"):
            assert cfg.retrieve_mode({"orchestration": {"retrieve": mode}}) == mode

    def test_an_unknown_mode_falls_back_to_always(self):
        assert cfg.retrieve_mode({"orchestration": {"retrieve": "sometimes"}}) == "always"


class TestRetrieveNode:
    def test_always_retrieves(self):
        state = {"knowledge_base_id": "kb", "question": "q", "access_token": "t", "top_k": 3, "retrieve_mode": "always"}
        with patch("qa_agent.agent.retrieve", return_value=[object()]) as r:
            assert retrieve_node(state)["context"] != []
        assert r.call_args.kwargs["top_k"] == 3

    def test_never_does_not_retrieve(self):
        state = {"knowledge_base_id": "kb", "question": "q", "access_token": "t", "retrieve_mode": "never"}
        with patch("qa_agent.agent.retrieve") as r:
            assert retrieve_node(state) == {"context": []}
        r.assert_not_called()

    def test_on_miss_does_not_pre_retrieve(self):
        state = {"knowledge_base_id": "kb", "question": "q", "access_token": "t", "retrieve_mode": "on_miss"}
        with patch("qa_agent.agent.retrieve") as r:
            assert retrieve_node(state) == {"context": []}
        r.assert_not_called()

    def test_an_existing_context_is_left_alone(self):
        state = {"context": [object()], "retrieve_mode": "always"}
        assert retrieve_node(state) == {}


class TestOnDemandEvidence:
    """In `on_miss` mode the passages a tool fetched are the answer's evidence, read from the transcript."""

    def _tool_message(self, passages):
        from langchain_core.messages import ToolMessage

        return ToolMessage(
            content=__import__("json").dumps({"query": "q", "passages": passages}, ensure_ascii=False),
            tool_call_id="c1",
            name="search_knowledge_base_tool",
        )

    def test_the_search_tool_returns_readable_json(self):
        from unittest.mock import patch

        from qa_agent import request_context
        from qa_agent.skills.kb_search import search_knowledge_base_tool

        hit = type("H", (), {"id": "c1", "source_type": "document", "source_name": "doc.md", "content": "passage",
                             "score": 0.8, "document_id": "d1", "wiki_page_id": None, "wiki_space_id": None,
                             "chunk_index": 3})()
        h = request_context.set_request_knowledge_base_id("kb1")
        try:
            with patch("qa_agent.skills.kb_search.retrieve", return_value=[hit]):
                payload = __import__("json").loads(search_knowledge_base_tool.func(query="q", _config={}))
        finally:
            request_context.reset_request_knowledge_base_id(h)
        assert payload["passages"][0]["source_name"] == "doc.md"
        assert payload["passages"][0]["chunk_index"] == 3

    def test_passages_become_sources(self):
        from qa_agent.kb_answer_sources import sources_from_kb_search_tools

        out = sources_from_kb_search_tools([
            self._tool_message([{"id": "c1", "source_type": "document", "source_name": "doc.md",
                                 "content": "passage", "score": 0.8, "document_id": "d1", "chunk_index": 3}])
        ])
        assert out is not None and len(out) == 1
        assert out[0].source_name == "doc.md"
        assert out[0].chunk_index == 3

    def test_an_empty_result_yields_no_sources(self):
        from qa_agent.kb_answer_sources import sources_from_kb_search_tools

        assert sources_from_kb_search_tools([self._tool_message([])]) is None

    def test_another_tool_is_ignored(self):
        from langchain_core.messages import ToolMessage

        from qa_agent.kb_answer_sources import sources_from_kb_search_tools

        other = ToolMessage(content='{"passages":[{"content":"x"}]}', tool_call_id="c2", name="run_cypher_tool")
        assert sources_from_kb_search_tools([other]) is None
