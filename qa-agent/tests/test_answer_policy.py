"""A policy that fires refuses in the open.

Three triggers used to end somewhere different: unsourced numbers got a warning appended, an answer with no sources
came back as-is, and a long answer came back whole. A caller cannot branch on that, and a warning is not a contract.
"""
from __future__ import annotations

from types import SimpleNamespace

from qa_agent.agent import _apply_answer_policy
from qa_agent.agent_config import DEFAULT_REFUSAL_TEXT


def _grounding(untraced: list[float]):
    return SimpleNamespace(untraced=untraced)


def _apply(answer: str = "答案", *, policy=None, mode="off", untraced=None, sources=None, tool_ran=True):
    warnings: list[str] = []
    text, refused, refusal, warnings = _apply_answer_policy(
        answer,
        agent_config={"answer_policy": policy or {}},
        grounding=_grounding(untraced or []),
        ground_mode=mode,
        sources=sources or [],
        warnings=warnings,
        tool_ran=tool_ran,
    )
    return text, refused, refusal, warnings


def test_a_clean_answer_is_untouched():
    text, refused, refusal, warnings = _apply()
    assert (text, refused, refusal, warnings) == ("答案", False, None, [])


def test_enforced_grounding_turns_one_unsourced_number_into_a_refusal():
    text, refused, refusal, warnings = _apply(mode="enforce", untraced=[42.0])
    assert refused is True
    assert refusal["reason"] == "unsourced_numbers"
    assert text == DEFAULT_REFUSAL_TEXT  # the answer is replaced, not annotated
    assert any(w.startswith("refused:") for w in warnings)


def test_the_configured_text_and_contact_are_what_the_caller_reads():
    text, _, refusal, _ = _apply(
        mode="enforce",
        untraced=[1.0],
        policy={"refusal": {"text": "请联系客户经理。", "contact": "support@example.com"}},
    )
    assert text == "请联系客户经理。"
    assert refusal["contact"] == "support@example.com"


def test_require_citations_refuses_an_answer_with_no_sources():
    text, refused, refusal, _ = _apply(policy={"require_citations": "require"})
    assert refused is True and refusal["reason"] == "no_citations"
    assert text == DEFAULT_REFUSAL_TEXT


def test_small_talk_is_not_refused_when_no_tool_ran():
    text, refused, _, _ = _apply(policy={"require_citations": "require"}, tool_ran=False)
    assert refused is False and text == "答案"


def test_an_answer_with_sources_survives_require_citations():
    source = SimpleNamespace(id="s1", source_name="手册")
    _, refused, _, _ = _apply(policy={"require_citations": "require"}, sources=[source])
    assert refused is False


def test_a_long_answer_is_cut_and_says_so():
    text, refused, _, warnings = _apply("字" * 50, policy={"max_answer_chars": 10})
    # The floor is 100 characters, so this policy is ignored rather than quietly truncating to 10.
    assert refused is False and text == "字" * 50

    text, refused, _, warnings = _apply("字" * 500, policy={"max_answer_chars": 100})
    assert refused is False
    assert len(text) <= 101 and text.endswith("…")
    assert any(w.startswith("answer_truncated:") for w in warnings)
