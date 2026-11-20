"""The tool catalogue: one description per tool, and it is the one the model receives.

These tests exist because the screen used to keep its own copy of the capability list and one sentence per capability,
while the model received the full tool descriptions. Two copies, and the screen's was the poorer one.
"""
from __future__ import annotations

from qa_agent.skills import ALL_SKILL_IDS, CORE_SKILL_IDS
from qa_agent.tool_catalog import tool_catalog

CATALOG = tool_catalog()


def _capability(skill_id: str) -> dict:
    return next(item for item in CATALOG["capabilities"] if item["id"] == skill_id)


def test_every_selectable_capability_is_listed_with_its_tools():
    assert [item["id"] for item in CATALOG["capabilities"]] == list(ALL_SKILL_IDS)
    for item in CATALOG["capabilities"]:
        assert item["tools"], f"{item['id']} lists no tools"
        assert item["name"]


def test_core_matches_the_runtime_default():
    assert {item["id"] for item in CATALOG["capabilities"] if item["core"]} == set(CORE_SKILL_IDS)


def test_descriptions_are_the_tool_descriptions():
    for item in CATALOG["capabilities"]:
        for tool in item["tools"]:
            assert tool["description"], f"{tool['name']} has no description"
            # Anthropic's tool-definition guidance: what it does, when to use it, parameters, caveats — 3-4 sentences.
            assert len(tool["description"]) >= 60, tool["name"]
            assert tool["parameters"] is not None


def test_code_execution_carries_its_policy():
    env = CATALOG["environment"]
    assert [t["name"] for t in env["tools"]] == ["run_python_tool", "run_command_tool"]
    policy = env["policy"]
    assert "python" in policy["builtin_allow"]
    assert "curl" not in policy["builtin_allow"]
    assert policy["writable"] == "out/"
    assert policy["allowlist"] == "additive"
    assert policy["timeout_seconds"] > 0


def test_no_capability_ships_prose_of_its_own():
    """A capability is its tools. A hand-written paragraph per capability used to ride along and drift from them."""
    for item in CATALOG["capabilities"]:
        assert "prompt" not in item
        assert "description" not in item


def test_the_environment_tools_carry_a_display_name():
    """`Python` and `Shell` read better than `run_python_tool`, but the callable name has to stay: it is what a tool
    call and a trace contain."""
    labels = {t["name"]: t.get("label") for t in CATALOG["environment"]["tools"]}
    assert labels == {"run_python_tool": "Python", "run_command_tool": "Shell"}


def test_descriptions_are_not_shown_with_their_source_indentation():
    """A docstring's folded lines are joined; only paragraph breaks survive, so a paragraph does not arrive with a
    ragged four-space gutter down its left side."""
    for capability in CATALOG["capabilities"]:
        for tool in capability["tools"]:
            assert "\n    " not in tool["description"], tool["name"]
