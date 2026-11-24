"""The tools answer "what may I read" from the request, not from a knowledge-base route.

That route was deleted in `3b8cde9d` (a knowledge base no longer scopes Catalog data), and the tools kept calling it:
`list_ontology_groups` answered `404 Not Found`, and `get_ontology_schema` failed on its normal path. The bindings now
travel with the request, resolved from the agent, so the scope is the agent's bindings and no call is needed.
"""
from __future__ import annotations

import pytest

from qa_agent import request_context

SCOPE = {
    "semantic_models": [{"id": "sm-1", "name": "Stock"}],
    "ontology_groups": [{"id": "og-1", "name": "量化交易"}],
}


@pytest.fixture
def scope():
    handle = request_context.set_request_data_scope(SCOPE)
    try:
        yield SCOPE
    finally:
        request_context.reset_request_data_scope(handle)


def test_the_scope_reaches_the_prompt(scope):
    """The listing tools are gone, so the bound data has to be in the prompt — the ids the data tools accept."""
    from qa_agent.agent import prompt_sections

    sections = dict(
        prompt_sections([], None, None, None, None, "量化投研专家", None, scope)
    )
    block = sections["bound_data"]
    assert "Stock" in block and "sm-1" in block
    assert "量化交易" in block and "og-1" in block


def test_no_binding_means_no_section():
    from qa_agent.agent import prompt_sections

    sections = dict(prompt_sections([], None, None, None, None, None, None, None))
    assert "bound_data" not in sections


def test_the_enumeration_tools_are_no_longer_offered():
    # A tool that answers "what may I read" is a round trip for a fact the prompt already states.
    from qa_agent.skills import (
        catalog_tools,
        ontology_tools,
        tools_for,
    )

    names = {"catalog": [t.name for t in catalog_tools], "ontology": [t.name for t in ontology_tools]}
    assert "list_semantic_models" not in names["catalog"]
    assert "list_ontology_groups" not in names["ontology"]
    offered = {tool.name for tool in tools_for({"catalog": "all", "ontology": "all"})}
    assert offered == {"get_semantic_model", "query_semantic_model", "run_sql", "get_ontology_schema", "run_cypher"}
