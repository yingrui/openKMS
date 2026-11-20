"""Retrieval is a tool now, not a node that runs before generation.

These tests pin the two facts that replaced `orchestration.retrieve`: the graph has no retrieval node, and the agent
finds the corpus through `search_knowledge_base` when its tool ledger enables `knowledge_search`.
"""
from __future__ import annotations

from qa_agent.skills import tools_for


def test_the_graph_starts_at_generation():
    from qa_agent import agent as agent_module

    assert not hasattr(agent_module, "retrieve_node")


def test_the_config_no_longer_carries_a_retrieve_mode():
    import qa_agent.agent_config as agent_config

    assert not hasattr(agent_config, "retrieve_mode")


def test_the_knowledge_base_is_reached_through_the_tool():
    names = [tool.name for tool in tools_for({"knowledge_search": "all"})]
    assert names == ["search_knowledge_base"]


def test_without_the_capability_there_is_no_corpus_access():
    names = [tool.name for tool in tools_for({"catalog": "all"})]
    assert "search_knowledge_base" not in names
