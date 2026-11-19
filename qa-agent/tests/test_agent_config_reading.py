"""Reading the KB's agent configuration: every field defaults to today's behaviour."""
import pytest

from qa_agent.agent_config import top_k, unknown_measure_policy, workspace_enabled


class TestTopK:
    def test_absent_config_is_the_old_hard_coded_five(self):
        assert top_k(None) == 5
        assert top_k({}) == 5

    def test_a_configured_depth_is_used(self):
        assert top_k({"retrieval": {"top_k": 12}}) == 12

    @pytest.mark.parametrize("bad", [0, -1, 51, "7", None, 2.5])
    def test_an_out_of_range_or_wrong_typed_value_falls_back(self, bad):
        assert top_k({"retrieval": {"top_k": bad}}) == 5


class TestPolicy:
    def test_default_is_what_the_agent_did_before(self):
        assert unknown_measure_policy(None) == "try_anyway"

    def test_refuse_is_honoured(self):
        assert unknown_measure_policy({"answer_policy": {"unknown_measure": "refuse"}}) == "refuse"

    def test_an_unknown_value_does_not_become_a_silent_refusal(self):
        assert unknown_measure_policy({"answer_policy": {"unknown_measure": "maybe"}}) == "try_anyway"


class TestWorkspace:
    def test_off_unless_asked_for(self):
        assert workspace_enabled(None) is False
        assert workspace_enabled({"workspace": {}}) is False

    def test_enabled(self):
        assert workspace_enabled({"workspace": {"enabled": True}}) is True


class TestToolRoundBudget:
    def test_unset_keeps_the_old_unbounded_behaviour(self):
        from qa_agent.agent_config import max_tool_rounds

        assert max_tool_rounds(None) is None
        assert max_tool_rounds({"orchestration": {}}) is None

    def test_a_configured_budget_is_used(self):
        from qa_agent.agent_config import max_tool_rounds

        assert max_tool_rounds({"orchestration": {"max_tool_rounds": 4}}) == 4

    def test_an_out_of_range_value_is_ignored(self):
        from qa_agent.agent_config import max_tool_rounds

        assert max_tool_rounds({"orchestration": {"max_tool_rounds": 0}}) is None
        assert max_tool_rounds({"orchestration": {"max_tool_rounds": 500}}) is None


class TestGenerationParams:
    """Generation settings are request parameters. Unset must leave the key out entirely, not send a null."""

    def test_unset_means_the_gateway_decides(self):
        from qa_agent.agent_config import max_tokens, top_p

        assert top_p(None) is None
        assert max_tokens(None) is None
        assert top_p({"generation": {}}) is None
        assert max_tokens({"generation": {}}) is None

    def test_configured_values_are_read(self):
        from qa_agent.agent_config import max_tokens, top_p

        cfg = {"generation": {"top_p": 0.9, "max_tokens": 800}}
        assert top_p(cfg) == 0.9
        assert max_tokens(cfg) == 800

    def test_out_of_range_values_fall_back_to_the_gateway(self):
        from qa_agent.agent_config import max_tokens, top_p

        assert top_p({"generation": {"top_p": 1.5}}) is None
        assert max_tokens({"generation": {"max_tokens": 0}}) is None
        assert max_tokens({"generation": {"max_tokens": 10**9}}) is None


class TestRetrievalRerank:
    """Reranking is the knowledge source's choice, so this reads `retrieval`, not `generation`."""

    def test_unset_follows_the_deployment(self):
        from qa_agent.agent_config import rerank_override

        assert rerank_override(None) is None
        assert rerank_override({"retrieval": {}}) is None

    def test_a_boolean_choice_is_honoured(self):
        from qa_agent.agent_config import rerank_override

        assert rerank_override({"retrieval": {"rerank": False}}) is False
        assert rerank_override({"retrieval": {"rerank": True}}) is True

    def test_a_non_boolean_is_not_a_choice(self):
        from qa_agent.agent_config import rerank_override

        assert rerank_override({"retrieval": {"rerank": "yes"}}) is None
