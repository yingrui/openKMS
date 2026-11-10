"""A KB's published prompt replaces the base instruction, and nothing else."""
import pytest

from qa_agent.agent import DEFAULT_BASE_INSTRUCTION, _build_system_prompt


class TestOverride:
    def test_without_an_override_the_built_in_instruction_is_used(self):
        text = _build_system_prompt([], ["catalog"], None, None)
        assert DEFAULT_BASE_INSTRUCTION in text

    def test_a_published_prompt_replaces_it(self):
        text = _build_system_prompt([], ["catalog"], None, "You are a quant research assistant.")
        assert "quant research assistant" in text
        assert DEFAULT_BASE_INSTRUCTION not in text

    def test_an_empty_override_falls_back(self):
        assert DEFAULT_BASE_INSTRUCTION in _build_system_prompt([], [], None, "   ")

    def test_the_skills_and_rules_survive_an_override(self):
        text = _build_system_prompt([], ["catalog"], {"unknown_measure": "refuse"}, "Custom base.")
        assert "Custom base." in text
        assert "Catalog skill" in text          # tool descriptions are assembled here, not in the prompt
        assert "available_measures" in text     # a policy rule cannot be talked away by a prompt edit
