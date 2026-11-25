"""Logic functions: rendering, validation, and what a run leaves behind.

The model is faked (`FunctionModel`), so these tests are about the flow semantics and the trace — not about an
provider. That is the half we can pin: prompts are rendered before the call, an unsupported node is refused before
anything is saved, a bad answer is a node failure rather than a truncated one, and every node lands in the trace with
the prompt that was actually sent.
"""

from __future__ import annotations

import json

import pytest
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.services.ontology.logic_runtime import (
    FlowError,
    missing_references,
    render_template,
    run_flow,
    validate_flow_spec,
)

SCHEMA = {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]}


def _spec(**node):
    return {"nodes": [{"id": "n1", "kind": "model", "prompt": "Q: {{input.q}}", **node}]}


def _handler(reply: str):
    def handler(_messages, _info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[TextPart(reply)])

    return handler


async def _factory(_model_id: str | None):
    return FunctionModel(_handler(json.dumps({"answer": "42"})))


class TestValidation:
    def test_rejects_a_missing_or_empty_node_list(self):
        assert validate_flow_spec(None) == ["flow_spec must be an object"]
        assert validate_flow_spec({}) == ["flow_spec.nodes must be a non-empty list"]

    def test_rejects_node_kinds_that_are_not_implemented_yet(self):
        errors = validate_flow_spec({"nodes": [{"id": "n1", "kind": "transform"}]})
        assert any("'transform' is not supported yet" in e for e in errors)

    def test_rejects_duplicate_ids_and_missing_prompts(self):
        errors = validate_flow_spec(
            {
                "nodes": [
                    {"id": "n1", "kind": "model", "prompt": "a"},
                    {"id": "n1", "kind": "model", "prompt": ""},
                ]
            }
        )
        assert any("duplicated" in e for e in errors)
        assert any("prompt is required" in e for e in errors)

    def test_accepts_a_single_model_node(self):
        assert validate_flow_spec(_spec(output_schema=SCHEMA)) == []


class TestTemplate:
    def test_substitutes_inputs_and_earlier_node_outputs(self):
        rendered = render_template(
            "q={{input.q}} prev={{n1.answer}}",
            {"input": {"q": "life"}, "n1": {"answer": "42"}},
        )
        assert rendered == "q=life prev=42"

    def test_serialises_objects_instead_of_printing_repr(self):
        rendered = render_template("{{input.obj}}", {"input": {"obj": {"a": 1}}})
        assert json.loads(rendered) == {"a": 1}

    def test_reports_what_the_prompt_asked_for_and_did_not_get(self):
        assert missing_references("{{input.q}} {{input.nope}}", {"input": {"q": "x"}}) == [
            "input.nope"
        ]


class TestRun:
    @pytest.mark.asyncio
    async def test_a_model_node_returns_the_structured_output_and_traces_the_prompt(self):
        outcome = await run_flow(
            _spec(output_schema=SCHEMA), {"q": "life"}, model_factory=_factory
        )

        assert outcome.status == "ok"
        assert outcome.output == {"answer": "42"}
        node = outcome.trace["nodes"][0]
        assert node["ok"] is True
        assert node["prompt_sent"] == "Q: life"
        assert node["usage"]["requests"] == 1
        assert node["duration_ms"] >= 0

    @pytest.mark.asyncio
    async def test_the_output_reference_picks_which_node_answers(self):
        spec = {
            "nodes": [
                {"id": "a", "kind": "model", "prompt": "first", "output_schema": SCHEMA},
                {"id": "b", "kind": "model", "prompt": "second", "output_schema": SCHEMA},
            ],
            "output": "{{a}}",
        }
        outcome = await run_flow(spec, {}, model_factory=_factory)

        assert outcome.status == "ok"
        assert len(outcome.trace["nodes"]) == 2
        assert outcome.output == {"answer": "42"}

    @pytest.mark.asyncio
    async def test_a_model_error_fails_the_node_and_says_which_one(self):
        async def factory(_model_id: str | None):
            return FunctionModel(_handler("not json at all"))

        outcome = await run_flow(
            _spec(output_schema=SCHEMA), {"q": "life"}, model_factory=factory
        )

        assert outcome.status == "error"
        assert outcome.error is not None and outcome.error.startswith("n1:")
        assert outcome.trace["nodes"][0]["ok"] is False
        # The prompt is kept even on failure: that is the only way to see what was asked.
        assert outcome.trace["nodes"][0]["prompt_sent"] == "Q: life"

    @pytest.mark.asyncio
    async def test_an_unavailable_model_is_a_flow_error_not_a_crash(self):
        async def factory(_model_id: str | None):
            raise FlowError("no usable model 'model_x'")

        outcome = await run_flow(_spec(), {}, model_factory=factory)

        assert outcome.status == "error"
        assert "no usable model" in (outcome.error or "")

    @pytest.mark.asyncio
    async def test_an_invalid_spec_never_calls_a_model(self):
        called = False

        async def factory(_model_id: str | None):
            nonlocal called
            called = True
            return FunctionModel(_handler("{}"))

        outcome = await run_flow({"nodes": [{"id": "n1", "kind": "loop"}]}, {}, model_factory=factory)

        assert outcome.status == "error"
        assert called is False


class TestDraftExecution:
    """The editor runs what is on screen; that path must not depend on a saved version."""

    @pytest.mark.asyncio
    async def test_a_draft_runs_the_spec_it_is_given(self):
        from app.services.ontology.execution_service import dry_run_flow

        fn = type("Fn", (), {"source": "logic"})()
        outcome = await dry_run_flow(
            None,  # no db use: the model factory is injected instead of reading the registry
            fn,
            flow_spec=_spec(output_schema=SCHEMA),
            input_payload={"q": "life"},
            model_factory=_factory,
        )

        assert outcome.status == "ok"
        assert outcome.output == {"answer": "42"}
        assert outcome.execution_id is None, "a draft run is not an execution record"

    @pytest.mark.asyncio
    async def test_a_code_function_has_no_flow_to_run(self):
        from fastapi import HTTPException

        from app.services.ontology.execution_service import dry_run_flow

        fn = type("Fn", (), {"source": "code"})()
        with pytest.raises(HTTPException) as exc:
            await dry_run_flow(None, fn, flow_spec=_spec(), input_payload={})
        assert exc.value.status_code == 400


class TestTypedInputs:
    """Declared inputs are a contract: AIP Logic's input board, minus the object/object-set types we do not have."""

    @pytest.mark.asyncio
    async def test_a_missing_input_names_itself(self):
        spec = {"inputs": [{"name": "email", "type": "string"}], **_spec()}
        outcome = await run_flow(spec, {}, model_factory=_factory)
        assert outcome.status == "error"
        assert outcome.error == "input 'email' is missing"

    @pytest.mark.asyncio
    async def test_a_mistyped_input_is_refused_before_the_model_is_called(self):
        called = False

        async def factory(_model_id: str | None):
            nonlocal called
            called = True
            return FunctionModel(_handler("{}"))

        spec = {"inputs": [{"name": "count", "type": "integer"}], **_spec()}
        outcome = await run_flow(spec, {"count": "three"}, model_factory=factory)
        assert outcome.status == "error"
        assert "expected integer but got str" in (outcome.error or "")
        assert called is False

    @pytest.mark.asyncio
    async def test_a_boolean_is_not_a_number(self):
        spec = {"inputs": [{"name": "n", "type": "number"}], **_spec()}
        outcome = await run_flow(spec, {"n": True}, model_factory=_factory)
        assert outcome.status == "error"
        assert "got boolean" in (outcome.error or "")

    @pytest.mark.asyncio
    async def test_an_object_input_is_accepted_and_readable_by_path(self):
        spec = {
            "inputs": [{"name": "customer", "type": "object"}],
            "nodes": [
                {"id": "n1", "kind": "model", "prompt": "Name: {{input.customer.name}}", "output_schema": SCHEMA}
            ],
        }
        outcome = await run_flow(spec, {"customer": {"name": "Ada"}}, model_factory=_factory)
        assert outcome.status == "ok"
        assert outcome.trace["nodes"][0]["prompt_sent"] == "Name: Ada"


class TestTools:
    """One `query_objects` tool: the model asks, we call openKMS as the caller, only granted properties come back."""

    def _spec_with_tool(self, **tool):
        return {
            "nodes": [
                {
                    "id": "n1",
                    "kind": "model",
                    "prompt": "Find similar complaints",
                    "output_schema": SCHEMA,
                    "tools": [
                        {
                            "kind": "query_objects",
                            "object_type": "Complaint",
                            "properties": ["title"],
                            "limit": 3,
                            **tool,
                        }
                    ],
                }
            ]
        }

    def test_tool_configuration_is_validated(self):
        errors = validate_flow_spec(
            {
                "nodes": [
                    {
                        "id": "n1",
                        "kind": "model",
                        "prompt": "x",
                        "tools": [{"kind": "query_objects", "object_type": "", "limit": 99}],
                    }
                ]
            }
        )
        assert any("object_type is required" in e for e in errors)
        assert any("between 1 and" in e for e in errors)

    @pytest.mark.asyncio
    async def test_the_model_asks_and_only_granted_properties_reach_it(self):
        seen: list[dict] = []
        turns = {"n": 0}
        second_turn: list[str] = []

        async def runner(tool: dict, arguments: dict) -> list[dict]:
            seen.append({"tool": tool, "arguments": arguments})
            # `body` was not granted: it must not appear in what the model receives.
            return [{"title": "Charged twice", "body": "secret detail"}]

        def handler(messages, _info: AgentInfo) -> ModelResponse:
            turns["n"] += 1
            if turns["n"] == 1:
                return ModelResponse(
                    parts=[ToolCallPart(tool_name="query_objects_Complaint", args={"search": "invoice"})]
                )
            second_turn.append(json.dumps(messages, default=str))
            return ModelResponse(parts=[TextPart(json.dumps({"answer": "42"}))])

        async def factory(_model_id: str | None):
            return FunctionModel(handler)

        outcome = await run_flow(
            self._spec_with_tool(), {}, model_factory=factory, tool_runner=runner
        )

        assert outcome.status == "ok", outcome.error
        assert outcome.output == {"answer": "42"}
        # The flow's own configuration, not the model's arguments, decides what is read.
        assert seen[0]["tool"]["object_type"] == "Complaint"
        assert seen[0]["tool"]["limit"] == 3
        assert "invoice" in json.dumps(seen[0]["arguments"])

        node = outcome.trace["nodes"][0]
        assert node["tool_calls"][0]["tool"] == "query_objects"
        assert node["tool_calls"][0]["ok"] is True
        assert node["tool_calls"][0]["rows"] == 1

        fed_back = "".join(second_turn)
        assert "Charged twice" in fed_back
        assert "secret detail" not in fed_back, "an ungranted property must not reach the model"

    @pytest.mark.asyncio
    async def test_a_denied_read_fails_through_to_the_node(self):
        async def runner(_tool: dict, _arguments: dict) -> list[dict]:
            raise FlowError("not allowed to read 'Complaint'")

        turns = {"n": 0}

        def handler(_messages, _info: AgentInfo) -> ModelResponse:
            turns["n"] += 1
            if turns["n"] == 1:
                return ModelResponse(
                    parts=[ToolCallPart(tool_name="query_objects_Complaint", args={"search": "x"})]
                )
            return ModelResponse(parts=[TextPart(json.dumps({"answer": "42"}))])

        async def factory(_model_id: str | None):
            return FunctionModel(handler)

        outcome = await run_flow(
            self._spec_with_tool(), {}, model_factory=factory, tool_runner=runner
        )

        assert outcome.status == "error"
        assert "not allowed to read" in (outcome.error or "")
        assert outcome.trace["nodes"][0]["ok"] is False


class TestCallFunctionTool:
    """Calling a published function from a flow: same depth/cycle guard the SDK path has."""

    def _spec(self, **tool):
        return {
            "nodes": [
                {
                    "id": "n1",
                    "kind": "model",
                    "prompt": "Use the tool",
                    "output_schema": SCHEMA,
                    "tools": [{"kind": "call_function", "function": "findSimilarComplaint", **tool}],
                }
            ]
        }

    def test_the_function_name_is_required(self):
        errors = validate_flow_spec(
            {"nodes": [{"id": "n1", "kind": "model", "prompt": "x", "tools": [{"kind": "call_function"}]}]}
        )
        assert any("function is required" in e for e in errors)

    @pytest.mark.asyncio
    async def test_the_model_can_call_a_published_function(self):
        asked: list[dict] = []
        turns = {"n": 0}

        async def runner(tool: dict, arguments: dict):
            asked.append({"tool": tool, "arguments": arguments})
            return {"similar": ["a", "b"]}

        def handler(_messages, _info: AgentInfo) -> ModelResponse:
            turns["n"] += 1
            if turns["n"] == 1:
                return ModelResponse(
                    parts=[ToolCallPart(tool_name="call_findSimilarComplaint", args={"text": "invoice"})]
                )
            return ModelResponse(parts=[TextPart(json.dumps({"answer": "42"}))])

        async def factory(_model_id: str | None):
            return FunctionModel(handler)

        outcome = await run_flow(self._spec(), {}, model_factory=factory, tool_runner=runner)

        assert outcome.status == "ok", outcome.error
        assert asked[0]["tool"]["function"] == "findSimilarComplaint"
        assert asked[0]["arguments"] == {"text": "invoice"}
        call = outcome.trace["nodes"][0]["tool_calls"][0]
        assert call["tool"] == "call_function"
        assert call["ok"] is True
        assert call["function"] == "findSimilarComplaint"

    @pytest.mark.asyncio
    async def test_a_cycle_is_refused_by_the_runner(self):
        from app.services.ontology.logic_tools import call_function

        with pytest.raises(FlowError) as exc:
            await call_function(
                caller_token="t",
                tool={"kind": "call_function", "function": "a"},
                arguments={},
                call_stack=("a",),
            )
        assert "cycle detected" in str(exc.value)


class TestCallFunctionSchema:
    """The target's published input schema becomes the tool's parameters, so the model does not guess."""

    @pytest.mark.asyncio
    async def test_the_resolved_schema_is_what_the_model_is_offered(self):
        offered: dict = {}

        def handler(_messages, info: AgentInfo) -> ModelResponse:
            # The tools the provider actually sees, with the parameters we resolved for the target function.
            offered["tools"] = list(info.model_request_parameters.function_tools or [])
            return ModelResponse(parts=[TextPart(json.dumps({"answer": "42"}))])

        async def runner(_tool: dict, _arguments: dict):
            return {"ok": True}

        async def factory(_model_id: str | None):
            return FunctionModel(handler)

        async def resolver(_api_name: str) -> dict | None:
            return {
                "type": "object",
                "properties": {"portfolio": {"type": "string"}},
                "required": ["portfolio"],
            }

        spec = {
            "nodes": [
                {
                    "id": "n1",
                    "kind": "model",
                    "prompt": "x",
                    "output_schema": SCHEMA,
                    "tools": [{"kind": "call_function", "function": "startSimulation"}],
                }
            ]
        }
        outcome = await run_flow(
            spec, {}, model_factory=factory, tool_runner=runner, schema_resolver=resolver
        )

        assert outcome.status == "ok"
        assert outcome.status == "ok", outcome.error
        names = [tool.name for tool in offered["tools"]]
        assert "call_startSimulation" in names
        # The target's own input schema is what the model is asked to fill in — not a free-form object.
        schema = next(tool.parameters_json_schema for tool in offered["tools"] if tool.name == "call_startSimulation")
        assert schema["required"] == ["portfolio"]


class TestActionNode:
    """An `action` node composes an edit batch; nothing is applied until an Action calls the function."""

    def _spec(self, **node):
        return {
            "nodes": [
                {"id": "n1", "kind": "model", "prompt": "Summarise", "output_schema": SCHEMA},
                {
                    "id": "n2",
                    "kind": "action",
                    "action_type": "addHolding",
                    "params": {"name": "{{n1.answer}}"},
                    **node,
                },
            ]
        }

    def test_an_action_node_needs_a_type(self):
        errors = validate_flow_spec({"nodes": [{"id": "n1", "kind": "action"}]})
        assert any("action_type is required" in e for e in errors)

    @pytest.mark.asyncio
    async def test_the_action_receives_rendered_params_and_returns_edits(self):
        asked: list[tuple[str, dict]] = []

        async def planner(api_name: str, params: dict) -> list[dict]:
            asked.append((api_name, params))
            return [{"op": "create", "object_type": "Holding", "properties": {"name": params["name"]}}]

        outcome = await run_flow(self._spec(), {}, model_factory=_factory, action_planner=planner)

        assert outcome.status == "ok", outcome.error
        assert asked == [("addHolding", {"name": "42"})]
        assert outcome.output == {
            "edits": [{"op": "create", "object_type": "Holding", "properties": {"name": "42"}}]
        }
        node = outcome.trace["nodes"][1]
        assert node["kind"] == "action"
        assert node["ok"] is True
        assert node["params"] == {"name": "42"}

    @pytest.mark.asyncio
    async def test_an_action_failure_stops_the_flow_and_is_traced(self):
        async def planner(_api_name: str, _params: dict) -> list[dict]:
            raise FlowError("create requires at least one property value in input")

        outcome = await run_flow(self._spec(), {}, model_factory=_factory, action_planner=planner)

        assert outcome.status == "error"
        assert outcome.error is not None and outcome.error.startswith("n2:")
        assert outcome.trace["nodes"][1]["ok"] is False


class TestConditionNode:
    """Branches: the first `when` that holds wins, an empty `when` is the fallback, and the branch's last node answers."""

    def _spec(self, branches, *, when_output="ok"):
        return {
            "nodes": [
                {"id": "n1", "kind": "model", "prompt": "pre", "output_schema": SCHEMA},
                {"id": "c1", "kind": "condition", "branches": branches},
            ]
        }

    def _branch(self, when, text):
        return {
            "when": when,
            "nodes": [{"id": f"b-{text}", "kind": "model", "prompt": text, "output_schema": SCHEMA}],
        }

    def test_only_one_branch_may_be_the_fallback(self):
        errors = validate_flow_spec(
            {
                "nodes": [
                    {
                        "id": "c1",
                        "kind": "condition",
                        "branches": [
                            {"when": "", "nodes": [{"id": "a", "kind": "model", "prompt": "x"}]},
                            {"when": "", "nodes": [{"id": "b", "kind": "model", "prompt": "y"}]},
                        ],
                    }
                ]
            }
        )
        assert any("only one branch may omit" in e for e in errors)

    def test_the_fallback_must_be_last(self):
        # First matching branch wins, so a fallback in the middle would swallow the branches after it.
        errors = validate_flow_spec(
            {
                "nodes": [
                    {
                        "id": "c1",
                        "kind": "condition",
                        "branches": [
                            {"when": "", "nodes": [{"id": "a", "kind": "model", "prompt": "x"}]},
                            {"when": "{{n1.x}}", "nodes": [{"id": "b", "kind": "model", "prompt": "y"}]},
                        ],
                    }
                ]
            }
        )
        assert any("fallback branch must be last" in e for e in errors)

    def test_a_nested_condition_is_refused(self):
        errors = validate_flow_spec(
            {
                "nodes": [
                    {
                        "id": "c1",
                        "kind": "condition",
                        "branches": [
                            {"when": "x", "nodes": [{"id": "c2", "kind": "condition", "branches": []}]}
                        ],
                    }
                ]
            }
        )
        assert any("no nested conditions" in e for e in errors)

    @pytest.mark.asyncio
    async def test_the_matching_branch_runs_and_answers(self):
        prompts: list[str] = []

        def handler(messages, _info: AgentInfo) -> ModelResponse:
            prompts.append(str(messages[-1]))
            return ModelResponse(parts=[TextPart(json.dumps({"answer": "42"}))])

        async def factory(_model_id: str | None):
            return FunctionModel(handler)

        spec = self._spec(
            [
                self._branch("{{input.urgent}}", "urgent path"),
                self._branch("", "normal path"),
            ]
        )
        outcome = await run_flow(spec, {"urgent": "true"}, model_factory=factory)

        assert outcome.status == "ok", outcome.error
        assert any("urgent path" in prompt for prompt in prompts)
        assert not any("normal path" in prompt for prompt in prompts)
        node = outcome.trace["nodes"][1]
        assert node["kind"] == "condition"
        assert node["branch"] == "{{input.urgent}}"
        assert node["output"] == {"answer": "42"}
        assert node["nodes"][0]["id"] == "b-urgent path"

    @pytest.mark.asyncio
    async def test_the_fallback_runs_when_nothing_matches(self):
        prompts: list[str] = []

        def handler(messages, _info: AgentInfo) -> ModelResponse:
            prompts.append(str(messages[-1]))
            return ModelResponse(parts=[TextPart(json.dumps({"answer": "42"}))])

        async def factory(_model_id: str | None):
            return FunctionModel(handler)

        spec = self._spec([self._branch("{{input.urgent}}", "urgent path"), self._branch("", "normal path")])
        outcome = await run_flow(spec, {"urgent": "false"}, model_factory=factory)

        assert outcome.status == "ok"
        assert any("normal path" in prompt for prompt in prompts)
        assert outcome.trace["nodes"][1]["branch"] == "(fallback)"

    @pytest.mark.asyncio
    async def test_no_match_and_no_fallback_is_an_error_naming_the_node(self):
        spec = self._spec([self._branch("{{input.urgent}}", "urgent path")])
        outcome = await run_flow(spec, {"urgent": ""}, model_factory=_factory)

        assert outcome.status == "error"
        assert outcome.error is not None and outcome.error.startswith("c1:")
        assert "no branch matched" in outcome.error

    @pytest.mark.asyncio
    async def test_a_branch_can_edit_the_ontology(self):
        async def planner(api_name: str, params: dict) -> list[dict]:
            return [{"op": "create", "object_type": "Holding", "properties": params}]

        spec = {
            "nodes": [
                {"id": "n1", "kind": "model", "prompt": "pre", "output_schema": SCHEMA},
                {
                    "id": "c1",
                    "kind": "condition",
                    "branches": [
                        {
                            "when": "{{n1.answer}}",
                            "nodes": [
                                {"id": "a1", "kind": "action", "action_type": "addHolding",
                                 "params": {"ts_code": "{{n1.answer}}"}}
                            ],
                        }
                    ],
                },
            ]
        }
        outcome = await run_flow(spec, {}, model_factory=_factory, action_planner=planner)

        assert outcome.status == "ok", outcome.error
        assert outcome.output == {"edits": [{"op": "create", "object_type": "Holding", "properties": {"ts_code": "42"}}]}


class TestLoopNode:
    """A loop maps a list through a body; edits keep their order, values may run concurrently."""

    def _spec(self, **node):
        return {
            "nodes": [
                {
                    "id": "n1",
                    "kind": "model",
                    "prompt": "list them",
                    "output_schema": {
                        "type": "object",
                        "properties": {"items": {"type": "array", "items": {"type": "string"}}},
                        "required": ["items"],
                    },
                },
                {
                    "id": "l1",
                    "kind": "loop",
                    "over": "{{n1.items}}",
                    "as": "item",
                    "nodes": [
                        {"id": "x1", "kind": "model", "prompt": "summarise {{item}}", "output_schema": SCHEMA}
                    ],
                    **node,
                },
            ]
        }

    def test_a_loop_needs_a_list_and_a_body(self):
        errors = validate_flow_spec({"nodes": [{"id": "l1", "kind": "loop"}]})
        assert any("over is required" in e for e in errors)
        assert any("nodes must be a non-empty list" in e for e in errors)

    def test_a_nested_loop_is_refused(self):
        errors = validate_flow_spec(
            {
                "nodes": [
                    {
                        "id": "l1",
                        "kind": "loop",
                        "over": "{{n1.items}}",
                        "nodes": [{"id": "l2", "kind": "loop", "over": "{{x}}", "nodes": []}],
                    }
                ]
            }
        )
        assert any("no nested loops or conditions" in e for e in errors)

    @pytest.mark.asyncio
    async def test_each_item_reaches_the_body_as_the_element_variable(self):
        prompts: list[str] = []
        turns = {"n": 0}

        def handler(messages, _info: AgentInfo) -> ModelResponse:
            text = str(messages[-1])
            prompts.append(text)
            if "list them" in text:
                return ModelResponse(parts=[TextPart(json.dumps({"items": ["alpha", "beta"]}))])
            return ModelResponse(parts=[TextPart(json.dumps({"answer": "42"}))])

        async def factory(_model_id: str | None):
            return FunctionModel(handler)

        outcome = await run_flow(self._spec(), {}, model_factory=factory)

        assert outcome.status == "ok", outcome.error
        body_prompts = [prompt for prompt in prompts if "summarise" in prompt]
        assert any("alpha" in prompt for prompt in body_prompts)
        assert any("beta" in prompt for prompt in body_prompts)
        assert outcome.output == {"items": [{"answer": "42"}, {"answer": "42"}]}
        loop_entry = outcome.trace["nodes"][1]
        assert [row["index"] for row in loop_entry["iterations"]] == [0, 1]

    @pytest.mark.asyncio
    async def test_an_empty_list_produces_no_iterations(self):
        def handler(messages, _info: AgentInfo) -> ModelResponse:
            if "list them" in str(messages[-1]):
                return ModelResponse(parts=[TextPart(json.dumps({"items": []}))])
            return ModelResponse(parts=[TextPart(json.dumps({"answer": "42"}))])

        async def factory(_model_id: str | None):
            return FunctionModel(handler)

        outcome = await run_flow(self._spec(), {}, model_factory=factory)

        assert outcome.status == "ok"
        assert outcome.output == {"items": []}
        assert outcome.trace["nodes"][1]["iterations"] == []

    @pytest.mark.asyncio
    async def test_a_non_list_is_refused_before_any_iteration(self):
        def handler(_messages, _info: AgentInfo) -> ModelResponse:
            return ModelResponse(parts=[TextPart(json.dumps({"items": "not a list"}))])

        async def factory(_model_id: str | None):
            return FunctionModel(handler)

        outcome = await run_flow(self._spec(), {}, model_factory=factory)

        assert outcome.status == "error"
        assert "not a list" in (outcome.error or "")

    @pytest.mark.asyncio
    async def test_edits_from_every_iteration_are_collected_in_order(self):
        seen: list[dict] = []

        async def planner(_api_name: str, params: dict) -> list[dict]:
            seen.append(params)
            return [{"op": "create", "object_type": "Holding", "properties": params}]

        spec = {
            "nodes": [
                {
                    "id": "n1",
                    "kind": "model",
                    "prompt": "list them",
                    "output_schema": {
                        "type": "object",
                        "properties": {"items": {"type": "array", "items": {"type": "string"}}},
                        "required": ["items"],
                    },
                },
                {
                    "id": "l1",
                    "kind": "loop",
                    "over": "{{n1.items}}",
                    "as": "code",
                    "nodes": [
                        {"id": "a1", "kind": "action", "action_type": "addHolding", "params": {"ts_code": "{{code}}"}}
                    ],
                },
            ]
        }

        def handler(messages, _info: AgentInfo) -> ModelResponse:
            if "list them" in str(messages[-1]):
                return ModelResponse(parts=[TextPart(json.dumps({"items": ["AAA", "BBB", "CCC"]}))])
            return ModelResponse(parts=[TextPart(json.dumps({"answer": "42"}))])

        async def factory(_model_id: str | None):
            return FunctionModel(handler)

        outcome = await run_flow(spec, {}, model_factory=factory, action_planner=planner)

        assert outcome.status == "ok", outcome.error
        assert [params["ts_code"] for params in seen] == ["AAA", "BBB", "CCC"]
        assert outcome.output == {
            "edits": [
                {"op": "create", "object_type": "Holding", "properties": {"ts_code": "AAA"}},
                {"op": "create", "object_type": "Holding", "properties": {"ts_code": "BBB"}},
                {"op": "create", "object_type": "Holding", "properties": {"ts_code": "CCC"}},
            ]
        }


class TestFunctionBackedAction:
    """A function-backed Action inside a flow: run the bound function, take its edits, apply nothing."""

    @pytest.mark.asyncio
    async def test_edits_come_from_the_bound_function(self, monkeypatch):
        from types import SimpleNamespace

        from app.services.ontology import execution_service as svc

        action_type = SimpleNamespace(
            api_name="createForecastAdjustment",
            rule_type="function",
            function_id="fn-1",
            function_version=None,
            object_type_id="ot-1",
            parameters=None,
        )

        class FakeDb:
            async def execute(self, _stmt):
                return SimpleNamespace(scalar_one_or_none=lambda: action_type)

            async def get(self, _model, _pk):
                return SimpleNamespace(id="ot-1", name="ForecastAdjustment")

        fn = SimpleNamespace(api_name="capacityCreateAdjustment", source="code")
        ver = SimpleNamespace(id="v1", version=1, flow_spec=None)

        async def resolve(_db, _function_id, *, pinned_version=None):
            return fn, ver

        async def run_ofs(**_kwargs):
            from app.services.ontology.execution_service import ExecutionOutcome

            return ExecutionOutcome(
                status="ok",
                output={"edits": [{"op": "create", "object_type": "ForecastAdjustment", "properties": {}}]},
                error=None,
                duration_ms=5,
            )

        monkeypatch.setattr(svc, "resolve_published_version_for_function", resolve)
        monkeypatch.setattr(svc, "_run_ofs", run_ofs)

        edits = await svc.plan_action_edits(FakeDb(), "createForecastAdjustment", {"cycle": "2026-W46"})

        assert edits == [
            {"op": "create", "object_type": "ForecastAdjustment", "properties": {}}
        ]

    @pytest.mark.asyncio
    async def test_an_action_that_writes_outward_is_refused(self, monkeypatch):
        from types import SimpleNamespace

        from app.services.ontology import execution_service as svc

        action_type = SimpleNamespace(
            api_name="confirmForecastAdjustment",
            rule_type="function",
            function_id="fn-2",
            function_version=None,
            object_type_id="ot-1",
            parameters=None,
        )

        class FakeDb:
            async def execute(self, _stmt):
                return SimpleNamespace(scalar_one_or_none=lambda: action_type)

            async def get(self, _model, _pk):
                return SimpleNamespace(id="ot-1", name="ForecastAdjustment")

        fn = SimpleNamespace(api_name="capacityConfirmAdjustment", source="code")
        ver = SimpleNamespace(id="v2", version=1, flow_spec=None)

        async def resolve(_db, _function_id, *, pinned_version=None):
            return fn, ver

        async def run_ofs(**_kwargs):
            from app.services.ontology.execution_service import ExecutionOutcome

            return ExecutionOutcome(status="ok", output={"applied": True}, error=None, duration_ms=5)

        monkeypatch.setattr(svc, "resolve_published_version_for_function", resolve)
        monkeypatch.setattr(svc, "_run_ofs", run_ofs)

        with pytest.raises(FlowError) as exc:
            await svc.plan_action_edits(FakeDb(), "confirmForecastAdjustment", {})

        assert "writes through an external service" in str(exc.value)

    @pytest.mark.asyncio
    async def test_a_cycle_between_action_functions_is_refused(self, monkeypatch):
        from types import SimpleNamespace

        from app.services.ontology import execution_service as svc

        action_type = SimpleNamespace(
            api_name="addHolding",
            rule_type="function",
            function_id="fn-3",
            function_version=None,
            object_type_id="ot-1",
            parameters=None,
        )

        class FakeDb:
            async def execute(self, _stmt):
                return SimpleNamespace(scalar_one_or_none=lambda: action_type)

            async def get(self, _model, _pk):
                return SimpleNamespace(id="ot-1", name="Holding")

        fn = SimpleNamespace(api_name="loopingFn", source="code")
        ver = SimpleNamespace(id="v3", version=1, flow_spec=None)

        async def resolve(_db, _function_id, *, pinned_version=None):
            return fn, ver

        monkeypatch.setattr(svc, "resolve_published_version_for_function", resolve)

        with pytest.raises(FlowError) as exc:
            await svc.plan_action_edits(
                FakeDb(), "addHolding", {}, call_stack=("loopingFn",)
            )

        assert "cycle detected" in str(exc.value)


class TestReferenceTypes:
    """A parameter that is exactly one reference keeps the referenced type; mixed text renders as text."""

    @pytest.mark.asyncio
    async def test_a_boolean_reference_reaches_the_action_as_a_boolean(self):
        seen: list[dict] = []

        async def planner(_api_name: str, params: dict) -> list[dict]:
            seen.append(params)
            return []

        spec = {
            "nodes": [
                {
                    "id": "n1",
                    "kind": "model",
                    "prompt": "decide",
                    "output_schema": {
                        "type": "object",
                        "properties": {"confirm": {"type": "boolean"}, "note": {"type": "string"}},
                        "required": ["confirm", "note"],
                    },
                },
                {
                    "id": "a1",
                    "kind": "action",
                    "action_type": "addHolding",
                    "params": {
                        "confirm": "{{n1.confirm}}",
                        "note": "why: {{n1.note}}",
                        "label": "{{n1.note}}",
                    },
                },
            ]
        }

        def handler(_messages, _info: AgentInfo) -> ModelResponse:
            return ModelResponse(parts=[TextPart(json.dumps({"confirm": True, "note": "yes"}))])

        async def factory(_model_id: str | None):
            return FunctionModel(handler)

        outcome = await run_flow(spec, {}, model_factory=factory, action_planner=planner)

        assert outcome.status == "ok", outcome.error
        assert seen[0]["confirm"] is True, "a whole reference must keep its type"
        assert seen[0]["note"] == "why: yes"
        assert seen[0]["label"] == "yes"
