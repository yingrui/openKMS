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

    def test_the_network_is_none_unless_asked(self):
        assert parse_agent_config({"sandbox": {"enabled": True}}).sandbox.network == "none"
        assert parse_agent_config({"sandbox": {"enabled": True, "network": "bridge"}}).sandbox.network == "bridge"

    def test_ceilings_are_bounded(self):
        with pytest.raises(ValidationError):
            parse_agent_config({"sandbox": {"timeout_seconds": 1}})
        with pytest.raises(ValidationError):
            parse_agent_config({"sandbox": {"memory_mb": 32}})

    def test_an_invented_network_mode_is_refused(self):
        with pytest.raises(ValidationError):
            parse_agent_config({"sandbox": {"network": "host"}})
