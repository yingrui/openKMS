"""Skill id filtering and path KB resolution."""

from qa_agent.schemas import resolve_kb_id
from qa_agent.skills import (
    ALL_SKILL_IDS,
    CORE_SKILL_IDS,
    get_all_skill_tools,
    get_skill_prompt_fragments,
    normalize_skill_ids,
)


def test_normalize_none_or_empty_is_core():
    assert normalize_skill_ids(None) == list(CORE_SKILL_IDS)
    assert normalize_skill_ids([]) == list(CORE_SKILL_IDS)


def test_normalize_keeps_known_order_and_drops_unknown():
    assert normalize_skill_ids(
        ["product_comparator", "nope", "ontology", "product_comparator"]
    ) == ["product_comparator", "ontology"]


def test_core_prompt_excludes_insurance_demo():
    prompt = get_skill_prompt_fragments(None)
    assert "保险收益计算器" not in prompt
    assert "保费快速估算" not in prompt
    assert "产品横向对比" not in prompt
    assert "Ontology skill" in prompt


def test_insurance_prompt_when_opted_in():
    prompt = get_skill_prompt_fragments(["ontology", "insurance_calculator"])
    assert "保险收益计算器" in prompt
    assert len(get_all_skill_tools(list(ALL_SKILL_IDS))) > len(
        get_all_skill_tools(list(CORE_SKILL_IDS))
    )


def test_resolve_kb_id_path_wins():
    assert resolve_kb_id("kb-a", None) == "kb-a"
    assert resolve_kb_id("kb-a", "kb-a") == "kb-a"


def test_resolve_kb_id_mismatch():
    try:
        resolve_kb_id("kb-a", "kb-b")
        raise AssertionError("expected ValueError")
    except ValueError as e:
        assert "mismatch" in str(e)
