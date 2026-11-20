"""The per-KB agent config: defaults equal today's behaviour, and a typo is an error, not a default."""
import pytest
from pydantic import ValidationError

from app.schemas.kb_agent_config import AgentConfig, parse_agent_config


class TestDefaults:
    def test_an_empty_config_changes_nothing(self):
        config = parse_agent_config(None)
        assert config.retrieval.top_k == 5           # the value that used to be hard-coded in the agent
        assert config.answer_policy.unknown_measure == "try_anyway"
        assert config.answer_policy.require_grounded_numbers == "off"
        # The sampling group is unset, so the deployment's values apply.
        assert config.generation.temperature is None
        assert config.generation.top_p is None
        assert config.generation.max_tokens is None

    def test_empty_json_and_none_agree(self):
        assert parse_agent_config({}).model_dump() == parse_agent_config(None).model_dump()

    def test_an_already_parsed_config_passes_through(self):
        config = AgentConfig(retrieval={"top_k": 9})
        assert parse_agent_config(config) is config


class TestValidation:
    def test_a_typo_in_a_field_name_is_an_error(self):
        with pytest.raises(ValidationError):
            parse_agent_config({"retrieval": {"topk": 5}})

    def test_the_skill_list_is_not_in_this_object(self):
        # It lives in `knowledge_bases.agent_skills`; a second copy here is how a screen shows a skill the agent lacks.
        with pytest.raises(ValidationError):
            parse_agent_config({"tools": ["catalog"]})

    def test_top_k_is_bounded(self):
        with pytest.raises(ValidationError):
            parse_agent_config({"retrieval": {"top_k": 0}})
        with pytest.raises(ValidationError):
            parse_agent_config({"retrieval": {"top_k": 51}})

    def test_policy_values_are_an_enum(self):
        with pytest.raises(ValidationError):
            parse_agent_config({"answer_policy": {"unknown_measure": "maybe"}})

    def test_the_workspace_object_is_gone(self):
        """The per-session folder is the `workspace` capability, not a config object. Four fields were stored and none
        were read; `extra="forbid"` is what makes that a validation error rather than quiet dead data."""
        with pytest.raises(ValidationError):
            parse_agent_config({"workspace": {"enabled": True}})


class TestSandbox:
    def test_code_execution_is_off_by_default(self):
        assert parse_agent_config(None).sandbox.enabled is False

    def test_the_timeout_is_bounded(self):
        with pytest.raises(ValidationError):
            parse_agent_config({"sandbox": {"timeout_seconds": 1}})
        assert parse_agent_config({"sandbox": {"timeout_seconds": 60}}).sandbox.timeout_seconds == 60

    def test_a_kb_may_add_commands(self):
        assert parse_agent_config({"sandbox": {"allow_commands": ["csvkit"]}}).sandbox.allow_commands == ["csvkit"]

    def test_it_cannot_name_a_container_any_more(self):
        with pytest.raises(ValidationError):
            parse_agent_config({"sandbox": {"image": "python:3.12"}})


class TestGeneration:
    """Two request parameters, not prompt text: they go to the model call, so a prompt cannot express them."""

    def test_defaults_match_what_the_agent_sent_before(self):
        generation = parse_agent_config(None).generation
        # Unset sampling = the deployment's own values.
        assert generation.temperature is None
        assert generation.top_p is None
        assert generation.max_tokens is None
        # Thinking is the exception: it is a two-state choice, and `off` is what the agent used to send, so a stored
        # "off" changes nothing. It has no "unset" state — the third option could not be explained or honoured.
        assert generation.thinking == "off"

    def test_accepts_a_temperature_in_range(self):
        cfg = parse_agent_config({"generation": {"temperature": 0.7}})
        assert cfg.generation.temperature == 0.7

    @pytest.mark.parametrize("value", [-0.1, 2.1])
    def test_rejects_a_temperature_out_of_range(self, value):
        with pytest.raises(ValidationError):
            parse_agent_config({"generation": {"temperature": value}})

    def test_thinking_is_an_enum(self):
        assert parse_agent_config({"generation": {"thinking": "on"}}).generation.thinking == "on"
        with pytest.raises(ValidationError):
            parse_agent_config({"generation": {"thinking": "maybe"}})

    def test_unknown_generation_keys_are_refused(self):
        # `top_k` belongs to retrieval, so it is not a generation key; `frequency_penalty` was never ours.
        with pytest.raises(ValidationError):
            parse_agent_config({"generation": {"top_k": 5}})
        with pytest.raises(ValidationError):
            parse_agent_config({"generation": {"frequency_penalty": 0.1}})


class TestProviderThinkingFragments:
    """The thinking toggle is spelled differently by every vendor, so the provider stores what to send.

    Measured: `deepseek` honours `{"thinking": {"type": "disabled"}}`; the local qwen gateway ignores every shape.
    A vendor that does not know a field ignores it silently, so a guess produces a no-op that looks like a setting.
    """

    def test_fragments_are_passed_through_untouched(self):
        from app.services.runtime.agent.llm import thinking_fragments

        cfg = {"thinking": {"on": {"enable_thinking": True}, "off": {"enable_thinking": False}}}
        assert thinking_fragments(cfg) == cfg["thinking"]

    def test_a_provider_without_fragments_cannot_be_asked(self):
        from app.services.runtime.agent.llm import thinking_fragments

        assert thinking_fragments(None) == {}
        assert thinking_fragments({}) == {}
        assert thinking_fragments({"thinking": "deepseek"}) == {}

    def test_only_on_and_off_survive(self):
        from app.services.runtime.agent.llm import thinking_fragments

        cfg = {"thinking": {"on": {"a": 1}, "sideways": {"b": 2}, "off": "not-an-object"}}
        assert thinking_fragments(cfg) == {"on": {"a": 1}}

    def test_the_api_stores_them_in_config(self):
        from app.schemas.api_provider import _merge_thinking

        assert _merge_thinking(None, {"off": {"enable_thinking": False}}) == {
            "thinking": {"off": {"enable_thinking": False}}
        }
        # An empty object clears them, which is how a provider says "I cannot be asked".
        assert _merge_thinking({"thinking": {"on": {}}, "other": 1}, {}) == {"other": 1}
        # Leaving it out preserves what is stored, and the old enum key is dropped.
        assert _merge_thinking({"thinking_style": "deepseek", "other": 1}, None) == {
            "thinking_style": "deepseek",
            "other": 1,
        }

    def test_bad_fragments_are_rejected(self):
        import pytest

        from app.schemas.api_provider import normalise_thinking

        for bad in ({"sideways": {}}, {"on": "string"}, ["list"], {"on": {"k": "v" * 3000}}):
            with pytest.raises(ValueError):
                normalise_thinking(bad)
