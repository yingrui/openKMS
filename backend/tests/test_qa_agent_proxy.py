"""qa-agent URL + tool-ledger forwarding helpers."""

from types import SimpleNamespace

from app.services.content.knowledge_bases.qa_agent_proxy import (
    agent_kb_path,
    ask_agent_body,
)
from app.services.workforce.agent_config import CORE_AGENT_SKILLS, kb_tools_for, resolve_tools


def test_a_knowledge_base_folds_its_two_fields_into_one_ledger():
    """A KB still stores a capability list plus `sandbox.enabled`; the wire carries one ledger."""
    kb = SimpleNamespace(agent_skills=["catalog"], agent_config={"sandbox": {"enabled": True}})
    assert kb_tools_for(kb) == {"catalog": "all", "code_execution": "all"}


def test_no_capability_list_means_the_core_set():
    assert resolve_tools(None) == {capability: "all" for capability in CORE_AGENT_SKILLS}


def test_agent_kb_path():
    assert (
        agent_kb_path("http://qa-agent:8103/", "kb-1", "ask/stream")
        == "http://qa-agent:8103/knowledge-bases/kb-1/ask/stream"
    )


def test_ask_agent_body_carries_the_ledger():
    kb = SimpleNamespace(agent_skills=["catalog"], agent_config=None)
    body = ask_agent_body(
        kb=kb,
        question="q",
        conversation_history=[],
        access_token="t",
        session_id="s1",
    )
    assert body["agent_tools"] == {"catalog": "all"}
    assert body["session_id"] == "s1"
    assert "knowledge_base_id" not in body


def test_the_body_names_the_skill_registry_only_when_skills_are_installed():
    """Two registries share a slug space, so the reader must be told which one the ids belong to."""
    kb = SimpleNamespace(agent_skills=["catalog"], agent_config=None)
    without = ask_agent_body(kb=kb, question="q", conversation_history=[], access_token="t")
    assert "skills_registry" not in without

    body = ask_agent_body(
        kb=kb,
        question="q",
        conversation_history=[],
        access_token="t",
        installed_skills={"contract-review": "1"},
        skills_registry="workforce",
    )
    assert body["installed_skills"] == {"contract-review": "1"}
    assert body["skills_registry"] == "workforce"


def test_every_field_the_agent_reports_survives_the_proxy():
    """The proxy rebuilt the response by hand and silently dropped three new fields, one at a time.

    This asserts the *contract* rather than a list of names: whatever keys the agent sends that the response model knows
    about must arrive with the agent's value.
    """
    import inspect

    from app.schemas.knowledge_base import AskResponse

    known = set(AskResponse.model_fields)
    agent_payload = {
        "answer": "a",
        "sources": [],
        "grounding": {"traceable": 1, "total": 2, "ratio": 0.5, "untraced": [7.0]},
        "langfuse_trace_id": "trace-1",
        "warnings": ["1 of 2 numbers are unsourced"],
        "verified": False,
    }
    forwarded = {k: v for k, v in agent_payload.items() if k in known}
    assert set(forwarded) == {"answer", "sources", "grounding", "langfuse_trace_id", "warnings", "verified"}

    source = inspect.getsource(__import__("app.api.knowledge_bases_search", fromlist=["x"]).ask_question)
    for field in known - {"answer", "sources"}:
        assert f"{field}=" in source or f'"{field}"' in source, f"proxy does not forward {field}"
