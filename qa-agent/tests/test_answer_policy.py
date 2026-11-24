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


class TestGroundingComparesAgainstFetchedMaterial:
    """A number is "made up" only when it is in nothing this turn fetched.

    The two questions are different: *can the reader check it* (sources) and *did the agent invent it* (everything the
    tools returned). A structural answer counts a schema — which is deliberately not a source — so grounding against
    sources alone declared the count fabricated and the policy replaced the whole answer with a refusal.
    """

    def test_a_count_from_a_tool_output_is_grounded(self):
        from qa_agent.evidence import ground

        answer = "这个本体共有 34 个对象类型。"
        # The tool states the count it means: a number the answer quotes has to exist in the material, and a list of 34
        # entries does not contain the word "34".
        schema_json = '{"object_type_count": 34, "object_types": [' + ",".join(
            '{"id": "ot-%d"}' % i for i in range(34)
        ) + "]}"
        # No sources: the schema is not a citation.
        report = ground([], answer, material=[schema_json])
        assert report.total == 1
        assert report.traceable == 1
        assert report.untraced == []

    def test_an_invented_count_is_still_caught(self):
        from qa_agent.evidence import ground

        answer = "这个本体共有 999 个对象类型。"
        schema_json = '{"object_types": [' + ",".join('{"id": "ot-%d"}' % i for i in range(34)) + "]}"
        report = ground([], answer, material=[schema_json])
        assert report.traceable == 0
        assert report.untraced == [999.0]

    def test_without_material_the_old_behaviour_stands(self):
        from qa_agent.evidence import ground

        report = ground([], "共有 34 个对象类型。")
        assert report.traceable == 0


class TestCitationRuleAsksWhatRan:
    """`require_citations` means "cite the material you used", not "every answer must have a source".

    A structural answer ("this graph has 34 object types") draws on a schema that is deliberately not a citation. With
    only structural tools having run, the citation rule demanded evidence that cannot exist and refused the answer.
    """

    def _policy(self, *, citable: bool | None):
        from qa_agent.agent import _apply_answer_policy

        return _apply_answer_policy(
            "共 3 个分组。",
            agent_config={"answer_policy": {"require_citations": "require"}},
            grounding=None,
            ground_mode="off",
            sources=[],
            warnings=[],
            tool_ran=True,
            citable_tool_ran=citable,
        )

    def test_a_structural_turn_is_not_refused_for_missing_citations(self):
        answer, refused, refusal, _warnings = self._policy(citable=False)
        assert refused is False
        assert refusal is None
        assert answer == "共 3 个分组。"

    def test_a_turn_that_did_read_the_corpus_still_needs_a_source(self):
        _answer, refused, refusal, _warnings = self._policy(citable=True)
        assert refused is True
        assert refusal == {"reason": "no_citations", "contact": None}

    def test_unknown_defaults_to_the_strict_reading(self):
        # Callers that do not say keep the old behaviour rather than silently loosening the rule.
        _answer, refused, _refusal, _warnings = self._policy(citable=None)
        assert refused is True
