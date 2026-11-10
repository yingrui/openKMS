"""The policies a KB can switch on: their defaults change nothing, and their effects are scoped."""
from qa_agent import agent_config as cfg
from qa_agent.agent import _policy_fragments
from qa_agent.evidence import grounding_warnings
from qa_agent.schemas import GroundingReport


class TestDefaults:
    def test_unconfigured_adds_no_rules(self):
        assert _policy_fragments(None) == ""
        assert _policy_fragments({}) == ""

    def test_defaults_match_todays_behaviour(self):
        assert cfg.unknown_measure_policy(None) == "try_anyway"
        assert cfg.require_schema_lookup(None) is False
        assert cfg.require_grounded_numbers(None) == "off"


class TestFragments:
    def test_refuse_adds_the_answerable_measures_rule(self):
        text = _policy_fragments({"unknown_measure": "refuse"})
        assert "available_measures" in text
        assert "do **not** substitute" in text

    def test_schema_lookup_adds_the_look_first_rule(self):
        assert "Look before you query" in _policy_fragments({"require_schema_lookup": True})

    def test_both_together(self):
        text = _policy_fragments({"unknown_measure": "refuse", "require_schema_lookup": True})
        assert "available_measures" in text and "Look before you query" in text

    def test_try_anyway_adds_nothing_even_with_others_set(self):
        assert _policy_fragments({"unknown_measure": "try_anyway"}) == ""


class TestGroundingWarnings:
    R = GroundingReport(traceable=7, total=12, ratio=0.58, untraced=[12.0, 20010827.0])

    def test_off_says_nothing(self):
        assert grounding_warnings(self.R, "off") == []

    def test_mark_names_how_many_and_which(self):
        warnings = grounding_warnings(self.R, "mark")
        assert len(warnings) == 1
        assert "5 of 12" in warnings[0]
        assert "20,010,827" in warnings[0]  # readable, not scientific notation

    def test_a_fully_grounded_answer_has_nothing_to_warn_about(self):
        assert grounding_warnings(GroundingReport(traceable=3, total=3, ratio=1.0), "mark") == []

    def test_an_answer_without_numbers_is_not_warned_about(self):
        assert grounding_warnings(GroundingReport(traceable=0, total=0, ratio=1.0), "enforce") == []
