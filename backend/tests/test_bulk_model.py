"""Repointing many Logic functions at one model: one new draft each, and nothing published by accident."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.ontology import function_service


class TestReplaceModelInFlow:
    def test_it_walks_branches_and_loops(self):
        spec = {
            "nodes": [
                {"id": "n1", "kind": "model", "model_id": "old", "prompt": "x"},
                {
                    "id": "c1",
                    "kind": "condition",
                    "branches": [
                        {"when": "{{n1}}", "nodes": [{"id": "a", "kind": "model", "model_id": "old", "prompt": "y"}]}
                    ],
                },
                {
                    "id": "l1",
                    "kind": "loop",
                    "over": "[]",
                    "nodes": [{"id": "b", "kind": "model", "model_id": "old", "prompt": "z"}],
                },
            ]
        }
        patched, changed = function_service.replace_model_in_flow(
            spec, from_model_id="old", to_model_id="new"
        )

        assert changed == 3
        assert patched["nodes"][0]["model_id"] == "new"
        assert patched["nodes"][1]["branches"][0]["nodes"][0]["model_id"] == "new"
        assert patched["nodes"][2]["nodes"][0]["model_id"] == "new"
        # The input is not mutated: a caller may still need the version it read.
        assert spec["nodes"][0]["model_id"] == "old"

    def test_a_none_source_matches_every_model_node(self):
        spec = {"nodes": [{"id": "n1", "kind": "model", "model_id": "a", "prompt": "x"}, {"id": "n2", "kind": "model", "prompt": "y"}]}
        patched, changed = function_service.replace_model_in_flow(spec, from_model_id=None, to_model_id="b")

        assert changed == 2
        assert all(node["model_id"] == "b" for node in patched["nodes"])

    def test_a_none_target_means_the_default_model(self):
        spec = {"nodes": [{"id": "n1", "kind": "model", "model_id": "a", "prompt": "x"}]}
        patched, changed = function_service.replace_model_in_flow(spec, from_model_id="a", to_model_id=None)

        assert changed == 1
        assert "model_id" not in patched["nodes"][0]

    def test_only_matching_nodes_change(self):
        spec = {"nodes": [{"id": "n1", "kind": "model", "model_id": "keep", "prompt": "x"}]}
        _, changed = function_service.replace_model_in_flow(spec, from_model_id="other", to_model_id="new")
        assert changed == 0


class TestBulkReplace:
    @pytest.mark.asyncio
    async def test_each_function_gets_a_new_version_and_nothing_is_published(self, monkeypatch):
        calls: list[dict] = []

        async def latest(_db, _function_id):
            return SimpleNamespace(
                id="v1", version=1, flow_spec={"nodes": [{"id": "n1", "kind": "model", "model_id": "old", "prompt": "x"}]},
                source_code="", input_schema=None, output_schema=None,
            )

        async def create(_db, function_id, body, *, created_by, created_by_name):
            calls.append({"function_id": function_id, "flow_spec": body.flow_spec, "created_by": created_by})
            return SimpleNamespace(version=2)

        monkeypatch.setattr(function_service, "latest_version", latest)
        monkeypatch.setattr(function_service, "create_version", create)

        class FakeDb:
            async def execute(self, _stmt):
                return SimpleNamespace(
                    scalar_one_or_none=lambda: SimpleNamespace(id="fn-1", api_name="forecast", source="logic")
                )

        rows = await function_service.bulk_replace_model(
            FakeDb(), ["fn-1"], from_model_id="old", to_model_id="new", created_by="u1", created_by_name="Ada"
        )

        assert rows == [
            {"function_id": "fn-1", "api_name": "forecast", "status": "updated", "changed": 1, "version": 2}
        ]
        assert calls[0]["flow_spec"]["nodes"][0]["model_id"] == "new"
        assert calls[0]["created_by"] == "u1"

    @pytest.mark.asyncio
    async def test_a_code_function_is_reported_not_touched(self, monkeypatch):
        async def latest(_db, _function_id):
            raise AssertionError("a code function has no flow to read")

        monkeypatch.setattr(function_service, "latest_version", latest)

        class FakeDb:
            async def execute(self, _stmt):
                return SimpleNamespace(
                    scalar_one_or_none=lambda: SimpleNamespace(id="fn-2", api_name="legacy", source="code")
                )

        rows = await function_service.bulk_replace_model(
            FakeDb(), ["fn-2"], from_model_id=None, to_model_id="new", created_by=None, created_by_name=None
        )

        assert rows[0]["status"] == "not_logic"

    @pytest.mark.asyncio
    async def test_a_function_whose_nodes_do_not_match_is_unchanged(self, monkeypatch):
        async def latest(_db, _function_id):
            return SimpleNamespace(
                id="v1", version=1, flow_spec={"nodes": [{"id": "n1", "kind": "model", "model_id": "other", "prompt": "x"}]},
                source_code="", input_schema=None, output_schema=None,
            )

        async def create(*_args, **_kwargs):
            raise AssertionError("nothing to change, so nothing to save")

        monkeypatch.setattr(function_service, "latest_version", latest)
        monkeypatch.setattr(function_service, "create_version", create)

        class FakeDb:
            async def execute(self, _stmt):
                return SimpleNamespace(
                    scalar_one_or_none=lambda: SimpleNamespace(id="fn-3", api_name="f", source="logic")
                )

        rows = await function_service.bulk_replace_model(
            FakeDb(), ["fn-3"], from_model_id="old", to_model_id="new", created_by=None, created_by_name=None
        )

        assert rows[0]["status"] == "unchanged"
        assert rows[0]["version"] == 1

    @pytest.mark.asyncio
    async def test_a_missing_function_is_reported(self, monkeypatch):
        class FakeDb:
            async def execute(self, _stmt):
                return SimpleNamespace(scalar_one_or_none=lambda: None)

        rows = await function_service.bulk_replace_model(
            FakeDb(), ["nope"], from_model_id=None, to_model_id="new", created_by=None, created_by_name=None
        )

        assert rows == [{"function_id": "nope", "status": "missing", "changed": 0}]
