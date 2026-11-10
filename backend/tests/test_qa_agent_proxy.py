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
