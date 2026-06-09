"""Tests for LangGraph → project stream event mapping."""

from __future__ import annotations

from app.services.deep_agents.stream_accumulator import ProjectStreamAccumulator
from app.services.deep_agents.stream_events import LangGraphStreamAdapter


def test_subagent_end_uses_start_label():
    adapter = LangGraphStreamAdapter()
    start_parts = adapter.parts_from_event(
        {
            "event": "on_tool_start",
            "name": "task",
            "run_id": "r1",
            "data": {"input": "research insurance products"},
        }
    )
    assert any(p.get("type") == "subagent_start" for p in start_parts)

    end_parts = adapter.parts_from_event(
        {
            "event": "on_tool_end",
            "name": "task",
            "run_id": "r1",
            "data": {"output": "done"},
        }
    )
    subagent_end = next(p for p in end_parts if p.get("type") == "subagent_end")
    assert subagent_end["name"] == "research insurance products"


def test_write_todos_emits_on_tool_end_output():
    adapter = LangGraphStreamAdapter()
    parts = adapter.parts_from_event(
        {
            "event": "on_tool_end",
            "name": "write_todos",
            "run_id": "r1",
            "data": {
                "output": (
                    "Updated todo list to "
                    "[{'content': 'Search', 'status': 'completed'}, "
                    "{'content': 'Download', 'status': 'in_progress'}]"
                ),
            },
        }
    )
    todo_parts = [p for p in parts if p.get("type") == "todo"]
    assert len(todo_parts) == 1
    assert todo_parts[0]["todos"][0]["status"] == "completed"
    assert todo_parts[0]["todos"][1]["status"] == "in_progress"


def test_accumulator_collects_tool_input_on_end():
    acc = ProjectStreamAccumulator()
    acc.absorb(
        {
            "type": "tool_start",
            "run_id": "r1",
            "name": "execute",
            "input": "ls",
        }
    )
    acc.absorb(
        {
            "type": "tool_end",
            "run_id": "r1",
            "name": "execute",
            "output": "file.txt",
        }
    )
    assert acc.tool_traces == [{"name": "execute", "output": "file.txt", "input": "ls"}]
    assert acc.absorb({"type": "interrupt", "interrupt": {}}) == "interrupt"
