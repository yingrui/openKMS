"""Skill id filtering and path KB resolution."""

from qa_agent.schemas import resolve_kb_id
from qa_agent.skills import (
    ALL_SKILL_IDS,
    CORE_SKILL_IDS,
    get_all_skill_tools,
    normalize_skill_ids,
)


def test_normalize_none_or_empty_is_core():
    assert normalize_skill_ids(None) == list(CORE_SKILL_IDS)
    assert normalize_skill_ids([]) == list(CORE_SKILL_IDS)


def test_normalize_keeps_known_order_and_drops_unknown():
    assert normalize_skill_ids(
        ["workspace", "nope", "ontology", "workspace"]
    ) == ["workspace", "ontology"]


def test_core_tools_exclude_the_optional_capability():
    core = get_all_skill_tools(list(CORE_SKILL_IDS))
    assert core, "core capabilities must provide tools"
    assert len(get_all_skill_tools(list(ALL_SKILL_IDS))) > len(core)


def test_a_capability_is_its_tools_and_nothing_else():
    # A capability used to also ship a prose block into the prompt. That block is gone: the tool definitions are the
    # description, and a second copy is what drifted from them.
    assert not hasattr(__import__("qa_agent.skills", fromlist=["x"]), "get_skill_prompt_fragments")


def test_resolve_kb_id_path_wins():
    assert resolve_kb_id("kb-a", None) == "kb-a"
    assert resolve_kb_id("kb-a", "kb-a") == "kb-a"


def test_resolve_kb_id_mismatch():
    try:
        resolve_kb_id("kb-a", "kb-b")
        raise AssertionError("expected ValueError")
    except ValueError as e:
        assert "mismatch" in str(e)
