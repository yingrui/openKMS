"""qa-agent URL + agent_skills forwarding helpers."""

from types import SimpleNamespace

from app.services.content.knowledge_bases.qa_agent_proxy import (
    CORE_AGENT_SKILLS,
    agent_kb_path,
    ask_agent_body,
    resolve_agent_skills,
)


def test_resolve_agent_skills_defaults_to_core():
    assert resolve_agent_skills(SimpleNamespace(agent_skills=None)) == list(CORE_AGENT_SKILLS)
    assert resolve_agent_skills(SimpleNamespace(agent_skills=[])) == list(CORE_AGENT_SKILLS)


def test_resolve_agent_skills_keeps_explicit_list():
    skills = ["ontology", "insurance_calculator"]
    assert resolve_agent_skills(SimpleNamespace(agent_skills=skills)) == skills


def test_agent_kb_path():
    assert (
        agent_kb_path("http://qa-agent:8103/", "kb-1", "ask/stream")
        == "http://qa-agent:8103/knowledge-bases/kb-1/ask/stream"
    )


def test_ask_agent_body_includes_skills():
    kb = SimpleNamespace(agent_skills=["catalog"], agent_config=None)
    body = ask_agent_body(
        kb=kb,
        question="q",
        conversation_history=[],
        access_token="t",
        session_id="s1",
    )
    assert body["agent_skills"] == ["catalog"]
    assert body["session_id"] == "s1"
    assert "knowledge_base_id" not in body


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
