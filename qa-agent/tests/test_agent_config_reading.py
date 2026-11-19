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


class TestThinkingTransportShape:
    """The toggle is spelled differently per vendor, and the wrong spelling is ignored rather than rejected.

    Measured on `deepseek-flash` (2026-11-19): `enable_thinking: false` still returned a reasoning chain, while
    `{"thinking": {"type": "disabled"}}` returned none. So the shape is data the provider supplies, not a branch
    here: this code only merges the fragment for the choice, and sends nothing when there is no fragment.
    """

    DEEPSEEK = {
        "on": {"thinking": {"type": "enabled"}},
        "off": {"thinking": {"type": "disabled"}},
    }

    def test_the_chosen_fragment_is_merged(self):
        from qa_agent.llm_chat import qa_agent_chat_extra_body

        assert qa_agent_chat_extra_body(thinking=False, fragments=self.DEEPSEEK) == {
            "thinking": {"type": "disabled"}
        }
        assert qa_agent_chat_extra_body(thinking=True, fragments=self.DEEPSEEK) == {
            "thinking": {"type": "enabled"}
        }

    def test_any_vendor_spelling_works_because_it_is_data(self):
        from qa_agent.llm_chat import qa_agent_chat_extra_body

        dashscope = {"off": {"enable_thinking": False}}
        assert qa_agent_chat_extra_body(thinking=False, fragments=dashscope) == {"enable_thinking": False}

        openai_effort = {"on": {"reasoning_effort": "high"}, "off": {"reasoning_effort": "none"}}
        assert qa_agent_chat_extra_body(thinking=False, fragments=openai_effort) == {"reasoning_effort": "none"}

    def test_a_provider_with_only_one_fragment_sends_nothing_for_the_other(self):
        from qa_agent.llm_chat import qa_agent_chat_extra_body

        # Anthropic has a token budget rather than an off switch: "think" is expressible, "don't think" is not.
        anthropic = {"on": {"thinking": {"type": "enabled", "budget_tokens": 4000}}}
        assert qa_agent_chat_extra_body(thinking=False, fragments=anthropic) == {}
        assert qa_agent_chat_extra_body(thinking=True, fragments=anthropic) == {
            "thinking": {"type": "enabled", "budget_tokens": 4000}
        }

    def test_no_fragments_and_no_choice_send_nothing(self):
        from qa_agent.llm_chat import qa_agent_chat_extra_body

        assert qa_agent_chat_extra_body(thinking=False, fragments={}) == {}
        assert qa_agent_chat_extra_body(thinking=None, fragments=self.DEEPSEEK) == {}


class TestMaxTokensGoesOutAsWritten:
    """`max_tokens`, not `max_completion_tokens` — checked on the payload, not assumed from the docs.

    `langchain_openai` rewrites a first-class `max_tokens` to `max_completion_tokens` before sending, so a gateway
    that only reads the former would never see it. Riding in `extra_body` keeps the key we claim to send.
    """

    def _payload(self, **kwargs):
        from qa_agent.llm_chat import make_qa_chat_openai

        llm = make_qa_chat_openai(
            base_url="https://api.deepseek.com/v1",
            api_key="x",
            model_name="deepseek-flash",
            temperature=0.3,
            streaming=False,
            **kwargs,
        )
        return llm._get_request_payload([{"role": "user", "content": "hi"}])

    def test_the_wire_keeps_max_tokens(self):
        payload = self._payload(max_tokens=800)
        assert "max_completion_tokens" not in payload
        assert payload["extra_body"]["max_tokens"] == 800

    def test_unset_stays_unset(self):
        payload = self._payload()
        assert "max_tokens" not in payload.get("extra_body", {})
        assert "max_completion_tokens" not in payload

    def test_the_agents_value_wins_over_a_provider_fragment(self):
        payload = self._payload(max_tokens=800, thinking_fragments={"on": {"max_tokens": 5}})
        # Configured on the agent, so it beats whatever a provider fragment happens to contain.
        assert payload["extra_body"]["max_tokens"] == 800


class TestReasoningEffort:
    """Effort is a first-class OpenAI field, so it needs no fragment — but it is meaningless with thinking off."""

    def test_read_and_validated(self):
        from qa_agent.agent_config import reasoning_effort

        assert reasoning_effort(None) is None
        assert reasoning_effort({"generation": {"reasoning_effort": "max"}}) == "max"
        assert reasoning_effort({"generation": {"reasoning_effort": "turbo"}}) is None

    def _payload(self, **kwargs):
        from qa_agent.llm_chat import make_qa_chat_openai

        llm = make_qa_chat_openai(
            base_url="https://open.bigmodel.cn/api/paas/v4",
            api_key="x",
            model_name="glm-5.3-flash",
            temperature=1.0,
            streaming=False,
            **kwargs,
        )
        return llm._get_request_payload([{"role": "user", "content": "hi"}])

    def test_sent_at_the_top_level_when_thinking_is_on(self):
        payload = self._payload(thinking=True, reasoning_effort="max")
        assert payload["reasoning_effort"] == "max"

    def test_dropped_when_thinking_is_off(self):
        payload = self._payload(thinking=False, reasoning_effort="max")
        assert "reasoning_effort" not in payload
