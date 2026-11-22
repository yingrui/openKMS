"""The allow list travels in the tool description, per request.

The model chooses a program before it runs anything; a description that only says "the allow list" makes it guess, and
the refusal it gets back costs a round. The list is per agent, so it is appended to a copy of the tool rather than
written into the module-level one.
"""
from __future__ import annotations

from qa_agent.agent import _with_allow_list
from qa_agent.sandbox import sandbox_config
from qa_agent.skills.sandbox import run_command, sandbox_tools


def _tools():
    return list(sandbox_tools)


def test_the_description_names_the_programs_this_agent_may_start():
    tools = _with_allow_list(_tools(), sandbox_config({"sandbox": {"enabled": True, "allow_commands": ["mytool"]}}))
    description = next(t.description for t in tools if t.name == "run_command")
    assert "Allowed programs:" in description
    assert "cat" in description  # a built-in
    assert "mytool" in description  # this agent's own addition
    assert "curl" not in description


def test_the_shared_tool_is_not_mutated():
    _with_allow_list(_tools(), sandbox_config({"sandbox": {"enabled": True, "allow_commands": ["mytool"]}}))
    assert "Allowed programs:" not in run_command.description
    # …and a second agent does not inherit the first one's list.
    other = _with_allow_list(_tools(), sandbox_config({"sandbox": {"enabled": True}}))
    assert "mytool" not in next(t.description for t in other if t.name == "run_command")


def test_without_code_execution_the_tools_are_returned_untouched():
    tools = _with_allow_list(_tools(), sandbox_config(None))
    assert [t.name for t in tools] == [t.name for t in sandbox_tools]
    assert "Allowed programs:" not in tools[0].description
