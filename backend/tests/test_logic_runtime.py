"""Logic functions: rendering, validation, and what a run leaves behind.

The model is faked (`FunctionModel`), so these tests are about the flow semantics and the trace — not about an
provider. That is the half we can pin: prompts are rendered before the call, an unsupported node is refused before
anything is saved, a bad answer is a node failure rather than a truncated one, and every node lands in the trace with
the prompt that was actually sent.
"""

from __future__ import annotations

import json

import pytest
from pydantic_ai.messages import ModelResponse, TextPart
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
