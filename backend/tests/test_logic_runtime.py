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
        errors = validate_flow_spec({"nodes": [{"id": "n1", "kind": "action"}]})
        assert any("'action' is not supported yet" in e for e in errors)

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
