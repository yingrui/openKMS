"""The per-KB agent config: defaults equal today's behaviour, and a typo is an error, not a default."""
import pytest
from pydantic import ValidationError

from app.schemas.kb_agent_config import AgentConfig, parse_agent_config


class TestDefaults:
    def test_an_empty_config_changes_nothing(self):
        config = parse_agent_config(None)
        assert config.retrieval.top_k == 5           # the value that used to be hard-coded in the agent
        assert config.workspace.enabled is False
        assert config.answer_policy.unknown_measure == "try_anyway"
        assert config.answer_policy.require_grounded_numbers == "off"
        assert config.orchestration.profile == "rag_tools"

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

    def test_workspace_is_opt_in(self):
        assert parse_agent_config({"workspace": {"enabled": True}}).workspace.enabled is True


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
        assert generation.temperature is None
        assert generation.thinking is None

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
        with pytest.raises(ValidationError):
            parse_agent_config({"generation": {"top_p": 0.9}})
