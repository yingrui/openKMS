"""The tool loop has a budget, and reaching it is visible rather than silent."""
from langchain_core.messages import AIMessage, HumanMessage

from qa_agent.agent import should_continue, tool_rounds_used


def _ask_for_tools(n: int):
    """`n` separate assistant turns, each requesting a tool — one round each."""
    return [
        AIMessage(content="", tool_calls=[{"name": "t", "args": {}, "id": f"c{i}"}])
        for i in range(n)
    ]


class TestCounting:
    def test_counts_assistant_turns_that_requested_tools(self):
        messages = [HumanMessage(content="q"), *_ask_for_tools(1), AIMessage(content="answer")]
        assert tool_rounds_used(messages) == 1

    def test_a_final_answer_is_not_a_round(self):
        assert tool_rounds_used([HumanMessage(content="q"), AIMessage(content="answer")]) == 0


class TestBudget:
    def test_without_a_budget_the_loop_continues(self):
        state = {"messages": [*_ask_for_tools(5)], "max_tool_rounds": None}
        assert should_continue(state) == "tools"

    def test_under_the_budget_it_continues(self):
        state = {"messages": [*_ask_for_tools(2)], "max_tool_rounds": 3}
        assert should_continue(state) == "tools"

    def test_at_the_budget_it_wraps_up_instead_of_stopping_mid_tool_call(self):
        # Ending here produced an empty answer: the model had requested a tool and never spoke again.
        state = {"messages": [*_ask_for_tools(3)], "max_tool_rounds": 3}
        assert should_continue(state) == "finalize"

    def test_the_graph_has_a_finalize_node_and_ends_after_it(self):
        graph = __import__("qa_agent.agent", fromlist=["build_graph"]).build_graph()
        nodes = set(graph.nodes)
        assert {"generate", "tools", "finalize"} <= nodes

    def test_no_tool_calls_always_ends(self):
        state = {"messages": [AIMessage(content="done")], "max_tool_rounds": 3}
        assert should_continue(state) == "__end__"

    def test_an_empty_transcript_ends(self):
        assert should_continue({"messages": []}) == "__end__"


class TestFinalizeTranscript:
    """A wrap-up turn must produce a transcript the model API accepts."""

    def test_every_pending_tool_call_gets_a_result(self):
        from langchain_core.messages import ToolMessage

        from qa_agent.agent import _answer_pending_tool_calls

        pending = AIMessage(
            content="",
            tool_calls=[
                {"name": "a", "args": {}, "id": "c1"},
                {"name": "b", "args": {}, "id": "c2"},
            ],
        )
        out = _answer_pending_tool_calls([HumanMessage(content="q"), pending])
        results = [m for m in out if isinstance(m, ToolMessage)]
        assert [m.tool_call_id for m in results] == ["c1", "c2"]
        assert all("budget" in m.content for m in results)

    def test_a_transcript_with_nothing_pending_is_untouched(self):
        from qa_agent.agent import _answer_pending_tool_calls

        messages = [HumanMessage(content="q"), AIMessage(content="answer")]
        assert _answer_pending_tool_calls(messages) == messages
