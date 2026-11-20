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


class TestNamedModel:
    """An agent may name a registered chat model; the id (not the vendor name) is what carries credentials."""

    def test_read_as_a_registry_id(self):
        from qa_agent.agent_config import model_id

        assert model_id(None) is None
        assert model_id({"model_id": ""}) is None
        assert model_id({"model_id": "  "}) is None
        assert model_id({"model_id": "model_abc123"}) == "model_abc123"

    def test_no_choice_uses_the_deployment_default(self, monkeypatch):
        from qa_agent import llm_config

        called = []

        def fake_default(**kwargs):
            called.append(kwargs)
            return "DEFAULT"

        monkeypatch.setattr(llm_config, "get_effective_llm_config", fake_default)
        assert llm_config.get_llm_config(None) == "DEFAULT"
        assert len(called) == 1

    def test_a_named_model_is_resolved_and_cached(self, monkeypatch):
        from qa_agent import llm_config

        llm_config.clear_llm_config_cache()
        calls = []

        def fake_resolve(settings, mid):
            calls.append(mid)
            return ("https://other.example/v1", "vendor-model", "key", {"off": {"thinking": {"type": "disabled"}}})

        monkeypatch.setattr(llm_config, "resolve_llm_for_model", fake_resolve)

        first = llm_config.get_llm_config("model_x")
        second = llm_config.get_llm_config("model_x")
        assert first is second
        assert calls == ["model_x"]
        assert first.model_name == "vendor-model"
        assert first.base_url == "https://other.example/v1"
        assert first.thinking_fragments["off"] == {"thinking": {"type": "disabled"}}


class TestPromptPreview:
    """The preview must be the same builder the answer path uses, or it describes a prompt nobody receives."""

    def test_agents_md_is_echoed_and_the_system_prompt_is_assembled(self):
        from qa_agent.main import _prompt_preview_impl
        from qa_agent.schemas import PromptPreviewRequest

        out = _prompt_preview_impl(
            "kb1",
            PromptPreviewRequest(
                agent_skills=["ontology"],
                agent_config={
                    "prompts": {"agents_md": "# 规则\n只回答人事制度"},
                    "answer_policy": {"unknown_measure": "refuse"},
                },
            ),
        )
        assert out.agents_md == "# 规则\n只回答人事制度"
        # Policy rules are part of the assembled prompt, not of AGENTS.md. Tool usage is not: it lives in the tool
        # definitions, and a second copy in the prompt is what drifted from them.
        assert "Sources you may use" in out.system_prompt
        assert "Ontology skill" not in out.system_prompt
        # The policy fragment is the rule text, not the enum name.
        assert "Answerable measures" in out.system_prompt
        # The retrieved passages depend on the question, so the preview marks where they go.
        assert "<passages retrieved for this question>" in out.system_prompt

    def test_no_instructions_means_no_agents_md(self):
        from qa_agent.main import _prompt_preview_impl
        from qa_agent.schemas import PromptPreviewRequest

        out = _prompt_preview_impl("kb1", PromptPreviewRequest(agent_config={}))
        assert out.agents_md is None


class TestAgentsMdIsInjected:
    """AGENTS.md is in the system prompt *and* written to the workspace — the two are not alternatives.

    `deepagents` does the same (`MemoryMiddleware` injects AGENTS.md into the system prompt); an agent that only sees
    the conventions after deciding to call a file tool has not been told them.
    """

    def test_the_conventions_section_appears_in_the_prompt(self):
        from qa_agent.main import _prompt_preview_impl
        from qa_agent.schemas import PromptPreviewRequest

        out = _prompt_preview_impl(
            "kb1",
            PromptPreviewRequest(
                agent_config={
                    "prompts": {
                        "system_prompt": "你负责回答人事制度问题。",
                        "agents_md": "# 规则\n只回答人事制度",
                    }
                }
            ),
        )
        prompt = out.system_prompt
        assert prompt.startswith("你负责回答人事制度问题。")
        # Wrapped, not concatenated raw: the block says what it is and how much authority it has.
        assert "<workspace_conventions>\n# 规则\n只回答人事制度\n</workspace_conventions>" in prompt
        assert "Treat it as reference material" in prompt
        # Order: instruction → conventions → sources → policy → retrieval slot.
        assert prompt.index("<workspace_conventions>") < prompt.index("Sources you may use")
        assert prompt.index("Sources you may use") < prompt.index("Context from the knowledge base")

    def test_no_conventions_means_no_section(self):
        from qa_agent.main import _prompt_preview_impl
        from qa_agent.schemas import PromptPreviewRequest

        out = _prompt_preview_impl("kb1", PromptPreviewRequest(agent_config={}))
        assert "<workspace_conventions>" not in out.system_prompt


class TestInstalledSkills:
    """Skill packages are prose the author installed; they join the prompt in their own section."""

    def test_packages_appear_before_tool_descriptions(self):
        from qa_agent.main import _prompt_preview_impl
        from qa_agent.schemas import PromptPreviewRequest

        out = _prompt_preview_impl(
            "kb1",
            PromptPreviewRequest(
                agent_skills=["ontology"],
                agent_config={},
                installed_skills={},  # the fetch is exercised by the endpoint; this pins the ordering
            ),
        )
        # With no packages there is no section at all.
        assert "Installed skills:" not in out.system_prompt

    def test_the_section_is_built_from_the_package_text(self):
        from qa_agent.agent import _build_system_prompt

        prompt = _build_system_prompt(
            context=[],
            skills=["ontology"],
            policy=None,
            state_prompt=None,
            agents_md=None,
            installed_skills=[
                {"skill_id": "openkms", "display_name": "openKMS", "content": "# openKMS\nUse the CLI."}
            ],
        )
        assert "Installed skills:\n### openKMS\n# openKMS\nUse the CLI." in prompt
        # Installed procedure before the source list: it is authored content, not a restatement of the tool schema.
        assert prompt.index("Installed skills:") < prompt.index("Sources you may use")


class TestIdentityIsInThePrompt:
    """Name and description open the system prompt; they are what the service is, not a label on a list row."""

    def test_name_and_description_lead(self):
        from qa_agent.main import _prompt_preview_impl
        from qa_agent.schemas import PromptPreviewRequest

        out = _prompt_preview_impl(
            "kb1",
            PromptPreviewRequest(
                agent_name="量化投研助手",
                agent_description="回答 A 股因子与回测问题。",
                agent_config={"prompts": {"system_prompt": "回答时引用数据来源。"}},
            ),
        )
        assert out.system_prompt.startswith("You are 量化投研助手. 回答 A 股因子与回测问题。")
        assert out.system_prompt.index("回答时引用数据来源。") > out.system_prompt.index("量化投研助手")

    def test_description_alone_still_names_the_service(self):
        from qa_agent.agent import _build_system_prompt

        prompt = _build_system_prompt(context=[], skills=[], policy=None, agent_name="客服助手")
        assert prompt.startswith("You are 客服助手.\n\n")

    def test_no_identity_no_line(self):
        from qa_agent.main import _prompt_preview_impl
        from qa_agent.schemas import PromptPreviewRequest

        from qa_agent.agent import DEFAULT_BASE_INSTRUCTION

        out = _prompt_preview_impl("kb1", PromptPreviewRequest(agent_config={}))
        # Without an identity the prompt opens with the built-in instruction, not an invented name.
        assert out.system_prompt.startswith(DEFAULT_BASE_INSTRUCTION)


class TestSkillPromptTextIsFetched:
    """`installed_skills` arrives as `{skill_id: version}`; the prompt needs the SKILL.md text.

    The preview used to pass the mapping straight into the prompt builder, which iterates entries expecting dicts — a
    crash waiting for the first agent with a skill installed.
    """

    def test_the_preview_resolves_versions_to_text(self, monkeypatch):
        from qa_agent import backend_defaults as backend_defaults_module
        from qa_agent.main import _prompt_preview_impl
        from qa_agent.schemas import PromptPreviewRequest

        # The function imports from `backend_defaults`, so that is the module to patch.
        monkeypatch.setattr(
            backend_defaults_module,
            "fetch_skill_prompts",
            lambda settings, installed, registry="agent": [
                {"skill_id": "openkms", "display_name": "openKMS", "content": "# openKMS\nUse the CLI."}
            ],
        )

        out = _prompt_preview_impl("kb1", PromptPreviewRequest(installed_skills={"openkms": "1.0"}))
        assert any("Installed skills:" in section["content"] for section in out.sections)
