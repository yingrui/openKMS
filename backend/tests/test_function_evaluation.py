"""Evaluating a Function: the comparison policy, and that a broken case does not end the run.

The comparison is the part worth pinning: an expectation names the keys that must match, and everything else in the
output is free. Whole-object equality fails on a timestamp and teaches nobody anything.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.workspace.evaluations import function_execute


class TestComparison:
    def test_every_declared_key_must_match(self):
        passed, why = function_execute.compare_expected(
            {"summary": "double charged", "urgent": True},
            {"summary": "double charged", "urgent": True, "request_id": "req-1"},
        )
        assert passed is True
        assert "summary" in why

    def test_an_extra_output_key_is_not_a_failure(self):
        passed, _ = function_execute.compare_expected({"amount": 1}, {"amount": 1, "trace_id": "abc"})
        assert passed is True

    def test_a_missing_key_is_named(self):
        passed, why = function_execute.compare_expected({"summary": "x"}, {"other": "x"})
        assert passed is False
        assert "summary: missing" in why

    def test_a_different_value_is_shown_both_ways(self):
        passed, why = function_execute.compare_expected({"urgent": False}, {"urgent": True})
        assert passed is False
        assert "expected false" in why and "got true" in why

    def test_numbers_compare_by_value_and_strings_ignore_outer_space(self):
        assert function_execute.compare_expected({"score": 1}, {"score": 1.0})[0] is True
        assert function_execute.compare_expected({"name": "Ada"}, {"name": " Ada "})[0] is True

    def test_a_non_object_output_fails_with_the_type_it_got(self):
        passed, why = function_execute.compare_expected({"a": 1}, "just text")
        assert passed is False
        assert "got str" in why

    def test_no_expectation_means_nothing_to_compare(self):
        passed, why = function_execute.compare_expected(None, {"a": 1})
        assert passed is False
        assert "No expected output" in why


class TestRun:
    @pytest.mark.asyncio
    async def test_one_broken_case_does_not_end_the_run(self, monkeypatch):
        items = [
            SimpleNamespace(id="i1", query="", input_payload={"q": "a"}, expected_output={"answer": "42"}),
            SimpleNamespace(id="i2", query="", input_payload={"q": "b"}, expected_output={"answer": "42"}),
        ]

        async def no_judge(_db, _model_id):
            raise AssertionError("a deterministic case must not need a judge")

        class FakeDb:
            async def get(self, model, pk):
                if getattr(model, "__name__", "") == "OntologyFunction":
                    return SimpleNamespace(id="fn-1", api_name="fn", source="logic", display_name="Fn")
                return None

            async def execute(self, _stmt):
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: items))

        calls = {"n": 0}

        async def execute_function_by_id(_db, _fn_id, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise HTTPException(status_code=400, detail="input 'q' is missing")
            return SimpleNamespace(
                status="ok",
                output={"answer": "42", "extra": True},
                error=None,
                execution_id="ex-2",
                duration_ms=12,
                trace={"nodes": [{"id": "n1", "kind": "model", "ok": True}]},
            )

        monkeypatch.setattr(
            function_execute.execution_service, "execute_function_by_id", execute_function_by_id
        )
        # Both cases miss exactly (i1 fails to execute, i2 matches), so the judge is never built.
        monkeypatch.setattr(function_execute, "resolve_model", no_judge)

        rows = await function_execute.run_function_evaluation(
            FakeDb(),
            SimpleNamespace(id="ev-1", function_id="fn-1"),
            access_token="t",
        )

        assert [row["evaluation_item_id"] for row in rows] == ["i1", "i2"]
        assert rows[0]["passed"] is False
        assert "missing" in rows[0]["reasoning"]
        assert rows[1]["passed"] is True
        assert rows[1]["detail"]["trace_nodes"] == [{"id": "n1", "kind": "model", "ok": True}]

    def test_the_version_is_part_of_the_record(self):
        fn = SimpleNamespace(id="fn-1", api_name="forecast", source="logic")
        snapshot = function_execute.version_snapshot(fn, 4)
        assert snapshot == {
            "target": "function",
            "function_id": "fn-1",
            "function_api_name": "forecast",
            "version": 4,
            "source": "logic",
        }


class TestJudge:
    @pytest.mark.asyncio
    async def test_a_verdict_is_passed_through_with_its_prompt_version(self, monkeypatch):
        from pydantic_ai.models.function import AgentInfo, FunctionModel
        from pydantic_ai.messages import ModelResponse, TextPart

        def handler(_messages, _info: AgentInfo) -> ModelResponse:
            return ModelResponse(parts=[TextPart('{"verdict": "pass", "reasoning": "same meaning"}')])

        verdict = await function_execute.judge_output(
            model=FunctionModel(handler),
            expectation="double charged",
            output={"summary": "Duplicate charge"},
            input_payload={},
        )

        assert verdict["verdict"] == "pass"
        assert verdict["reasoning"] == "same meaning"
        assert verdict["prompt_version"].startswith("function-judge-")

    @pytest.mark.asyncio
    async def test_an_unusable_reply_is_undecided_not_a_failure(self):
        from pydantic_ai.models.function import AgentInfo, FunctionModel
        from pydantic_ai.messages import ModelResponse, TextPart

        def handler(_messages, _info: AgentInfo) -> ModelResponse:
            return ModelResponse(parts=[TextPart('{"verdict": "maybe", "reasoning": "unclear"}')])

        verdict = await function_execute.judge_output(
            model=FunctionModel(handler), expectation="x", output={}, input_payload={}
        )

        assert verdict["verdict"] == "undecided"

    @pytest.mark.asyncio
    async def test_the_judge_can_rescue_an_answer_exact_comparison_rejected(self, monkeypatch):
        items = [
            SimpleNamespace(
                id="i1", query="", input_payload={"q": "a"}, expected_output={"summary": "double charged"}
            )
        ]

        class FakeDb:
            async def get(self, model, pk):
                return SimpleNamespace(id="fn-1", api_name="fn", source="logic", display_name="Fn")

            async def execute(self, _stmt):
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: items))

        async def execute_function_by_id(_db, _fn_id, **_kwargs):
            return SimpleNamespace(
                status="ok",
                output={"summary": "Duplicate charge"},
                error=None,
                execution_id="ex-1",
                duration_ms=9,
                trace={"nodes": []},
            )

        async def fake_judge(**_kwargs):
            return {"verdict": "pass", "reasoning": "same event", "prompt_version": "function-judge-1"}

        async def fake_model(_db, _model_id):
            return object()

        monkeypatch.setattr(function_execute.execution_service, "execute_function_by_id", execute_function_by_id)
        monkeypatch.setattr(function_execute, "judge_output", fake_judge)
        monkeypatch.setattr(function_execute, "resolve_model", fake_model)

        rows = await function_execute.run_function_evaluation(
            FakeDb(), SimpleNamespace(id="ev-1", function_id="fn-1"), access_token="t"
        )

        assert rows[0]["passed"] is True
        assert "judge accepted it" in rows[0]["reasoning"]
        assert rows[0]["detail"]["judge"]["verdict"] == "pass"


class TestTargetValidation:
    """An evaluation measures exactly one thing, and the kind has to agree with the target."""

    @pytest.mark.asyncio
    async def test_both_targets_are_refused(self):
        from app.api.evaluations import create_evaluation
        from app.schemas.evaluation import EvaluationCreate

        with pytest.raises(HTTPException) as exc:
            await create_evaluation(
                EvaluationCreate(name="x", knowledge_base_id="kb-1", function_id="fn-1", kind="function"),
                SimpleNamespace(state=SimpleNamespace(openkms_jwt_payload={})),
                db=SimpleNamespace(),
            )
        assert "exactly one thing" in str(exc.value.detail)

    @pytest.mark.asyncio
    async def test_no_target_is_refused(self):
        from app.api.evaluations import create_evaluation
        from app.schemas.evaluation import EvaluationCreate

        with pytest.raises(HTTPException) as exc:
            await create_evaluation(
                EvaluationCreate(name="x"),
                SimpleNamespace(state=SimpleNamespace(openkms_jwt_payload={})),
                db=SimpleNamespace(),
            )
        assert "exactly one thing" in str(exc.value.detail)

    @pytest.mark.asyncio
    async def test_a_function_target_needs_the_function_kind(self):
        from app.api.evaluations import create_evaluation
        from app.schemas.evaluation import EvaluationCreate

        with pytest.raises(HTTPException) as exc:
            await create_evaluation(
                EvaluationCreate(name="x", function_id="fn-1", kind="answer"),
                SimpleNamespace(state=SimpleNamespace(openkms_jwt_payload={})),
                db=SimpleNamespace(),
            )
        assert "kind must be 'function'" in str(exc.value.detail)


class TestDeepLinkFilter:
    """The editor's "Evaluate" button relies on `?function_id=` narrowing the list to one function's evaluations."""

    @pytest.mark.asyncio
    async def test_the_list_filter_is_applied_and_the_row_names_the_function(self, monkeypatch):
        from app.services.workspace.evaluations import evaluation_read

        captured: dict = {}

        class FakeDb:
            def __init__(self):
                self.calls = 0

            async def execute(self, stmt):
                self.calls += 1
                rendered = str(stmt)
                if "count" in rendered.lower():
                    return SimpleNamespace(scalar_one=lambda: 1)
                if "FROM evaluations" in rendered:
                    captured["where"] = rendered
                    return SimpleNamespace(
                        scalars=lambda: SimpleNamespace(
                            all=lambda: [
                                SimpleNamespace(
                                    id="ev-1",
                                    name="for fn",
                                    kind="function",
                                    knowledge_base_id=None,
                                    function_id="fn-1",
                                    wiki_space_id=None,
                                    semantic_model_id=None,
                                    data_resource_id=None,
                                    description=None,
                                    created_at="2026-11-24",
                                    updated_at="2026-11-24",
                                )
                            ]
                        )
                    )
                if "ontology_functions" in rendered:
                    return SimpleNamespace(all=lambda: [("fn-1", "forecast", "Forecast")])
                return SimpleNamespace(all=lambda: [])

        async def readable(*_args, **_kwargs):
            return [], False

        async def counts(*_args, **_kwargs):
            return {"ev-1": 2}

        monkeypatch.setattr(evaluation_read, "readable_id_filter", readable)
        monkeypatch.setattr(evaluation_read, "item_counts_batch", counts)

        request = SimpleNamespace(state=SimpleNamespace(openkms_jwt_payload={"sub": "u1"}))
        page = await evaluation_read.list_evaluations_page(
            FakeDb(), request, knowledge_base_id=None, limit=10, offset=0, function_id="fn-1"
        )

        assert "function_id" in captured["where"]
        assert page.items[0].function_api_name == "forecast"
        assert page.items[0].function_display_name == "Forecast"
