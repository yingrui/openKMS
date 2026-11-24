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


def test_one_bound_group_answers_without_asking_which(scope):
    """Exactly one bound group *is* the answer: the extra "pass a group id" turn was noise we introduced."""
    from qa_agent import request_context
    from qa_agent.skills import ontology

    monkeypatch_target = ontology.fetch_ontology_schema
    original_related = ontology.catalog_client.get_ontology_group_related
    ontology.fetch_ontology_schema = lambda _token: {  # type: ignore[assignment]
        "object_types": [{"id": "ot-1", "name": "InsuranceProduct"}],
        "link_types": [],
    }
    ontology.catalog_client.get_ontology_group_related = lambda _t, _g: {  # type: ignore[assignment]
        "object_type_ids": ["ot-1"],
        "link_types": [],
    }
    try:
        out = ontology.get_ontology_schema.invoke({"group_id": "", "config": {}})
    finally:
        ontology.fetch_ontology_schema = monkeypatch_target  # type: ignore[assignment]
        ontology.catalog_client.get_ontology_group_related = original_related  # type: ignore[assignment]
    assert "InsuranceProduct" in out
    assert "pass the group id" not in out
    assert request_context.get_tool_data_scope({})["ontology_groups"][0]["id"] == "og-1"


def test_two_bound_groups_ask_which_one():
    from qa_agent import request_context
    from qa_agent.skills import ontology

    handle = request_context.set_request_data_scope(
        {"semantic_models": [], "ontology_groups": [{"id": "og-1"}, {"id": "og-2"}]}
    )
    original = ontology.fetch_ontology_schema
    ontology.fetch_ontology_schema = lambda _token: {"object_types": [], "link_types": []}  # type: ignore[assignment]
    try:
        out = ontology.get_ontology_schema.invoke({"group_id": "", "config": {}})
    finally:
        ontology.fetch_ontology_schema = original  # type: ignore[assignment]
        request_context.reset_request_data_scope(handle)
    assert "more than one ontology group" in out
