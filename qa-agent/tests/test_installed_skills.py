"""An installed skill's SKILL.md reaches the prompt on **both** paths.

The streamed path always passed `installed_skill_packages` into the graph state. The non-streaming one fetched
them, paid the HTTP round-trip, and never handed them over — so a KB answer without streaming silently answered
without its installed skills. Nothing failed; the variable was simply unused (ruff F841).
"""
from __future__ import annotations

from unittest.mock import patch

from qa_agent import agent as agent_module

PACKAGES = [{"id": "pkg-1", "name": "wiki-style", "content": "Always cite the page title."}]


class _FakeGraph:
    def __init__(self) -> None:
        self.state: dict | None = None

    def invoke(self, state: dict, config: dict | None = None):
        self.state = state
        return {"context": [], "messages": []}


class _FakeLlm:
    model_name = "test-model"
    thinking_fragments = []


def _invoke_and_capture() -> dict:
    graph = _FakeGraph()
    with (
        patch.object(agent_module, "get_agent", return_value=graph),
        patch.object(agent_module, "fetch_skill_prompts", return_value=PACKAGES) as fetch,
        patch.object(agent_module, "_llm_for_model", return_value=_FakeLlm()),
        patch("qa_agent.langfuse_client.build_langgraph_trace_config", return_value={}),
        patch("qa_agent.langfuse_client.current_trace_id", return_value=None),
    ):
        agent_module.invoke_agent(
            question="what is this?",
            conversation_history=[],
            knowledge_base_id="kb-1",
            access_token="t",
            installed_skills={"pkg-1": "1.0.0"},
        )
    fetch.assert_called_once()
    assert graph.state is not None
    return graph.state


def test_a_non_streaming_answer_carries_the_installed_skill_prompts():
    state = _invoke_and_capture()
    assert state["installed_skill_packages"] == PACKAGES


def test_no_installed_skills_still_sets_an_empty_list():
    with (
        patch.object(agent_module, "get_agent", return_value=_FakeGraph()),
        patch.object(agent_module, "fetch_skill_prompts", return_value=[]),
        patch.object(agent_module, "_llm_for_model", return_value=_FakeLlm()),
        patch("qa_agent.langfuse_client.build_langgraph_trace_config", return_value={}),
        patch("qa_agent.langfuse_client.current_trace_id", return_value=None),
    ):
        agent_module.invoke_agent(
            question="q",
            conversation_history=[],
            knowledge_base_id="kb-1",
            access_token="t",
            installed_skills=None,
        )
