"""The run report: what a run says about the agent, and the three things that make it usable.

It must not change a verdict; every finding must name the items behind it and one of the five places a fix can go;
and a failed call must leave the run alone.
"""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services.workspace.evaluations import report as report_mod

CONFIG = {"base_url": "http://judge/v1", "api_key": "k", "model_name": "judge-model"}

ITEMS = [
    {
        "index": 0,
        "question": "两市一共有多少只正在上市的股票？",
        "expected": {"expected": {"sql": "SELECT count(*) FROM tushare.stock_basic WHERE list_status = 'L' AND exchange IN ('SSE','SZSE')"}},
        "ran": [{"mode": "sql", "sql": "SELECT exchange, count(*) FROM tushare.stock_basic GROUP BY exchange"}],
        "passed": False,
        "reasoning": "query 1: scope: missing listing filter",
        "failed_checks": [{"id": "scope", "verdict": "fail", "reason": "missing listing filter"}],
    },
    {
        "index": 1,
        "question": "各行业分别有多少只正在上市的股票？",
        "expected": {"expected": {"sql": "SELECT industry, count(*) ... GROUP BY industry"}},
        "ran": [{"mode": "sql", "sql": "SELECT industry, count(*) ... GROUP BY industry"}],
        "passed": True,
        "reasoning": "",
        "failed_checks": [],
    },
]


def _reply(content: str) -> SimpleNamespace:
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


def _report(findings: list[dict], verdict: str = "Doing fine on industry, not on market scope.") -> str:
    return json.dumps({"verdict": verdict, "findings": findings})


def _run(content: str):
    with patch("openai.AsyncOpenAI") as client:
        client.return_value.chat.completions.create = AsyncMock(return_value=_reply(content))
        return asyncio.run(report_mod.summarize_run(items=ITEMS, schema={"fields": [], "datasets": []}, model_config=CONFIG))


class TestFindings:
    def test_a_finding_needs_an_area_items_and_a_claim(self):
        out = _run(
            _report(
                [
                    {"area": "model_metadata", "claim": "exchange has no description", "items": [0],
                     "suggestion": "Fill exchange: SSE/SZSE/BSE"},
                    {"area": "made_up", "claim": "vibes", "items": [0]},
                    {"area": "agent", "claim": "wrong grouping", "items": []},
                    {"area": "skill", "claim": "", "items": [0]},
                ]
            )
        )
        assert [f["area"] for f in out["findings"]] == ["model_metadata"]
        assert out["findings"][0]["items"] == [0]

    def test_at_most_five_findings(self):
        out = _run(
            _report(
                [{"area": "agent", "claim": f"problem {i}", "items": [i % 2]} for i in range(9)]
            )
        )
        assert len(out["findings"]) == 5

    def test_the_report_carries_its_version_and_model(self):
        out = _run(_report([{"area": "expectation", "claim": "too strict", "items": [0]}]))
        assert out["prompt_version"] == report_mod.REPORT_PROMPT_VERSION
        assert out["model"] == "judge-model"
        assert out["verdict"].startswith("Doing fine")


class TestFailures:
    def test_a_failed_call_is_an_empty_report_not_an_error(self):
        with patch("openai.AsyncOpenAI") as client:
            client.return_value.chat.completions.create = AsyncMock(side_effect=TimeoutError("down"))
            out = asyncio.run(report_mod.summarize_run(items=ITEMS, schema={}, model_config=CONFIG))
        assert out["findings"] == []
        assert "down" in (out["error"] or "")

    def test_a_reply_without_json_is_an_empty_report(self):
        out = _run("no json here")
        assert out["findings"] == []
        assert out["error"]


class TestLanguage:
    def test_the_report_is_written_in_the_requested_language(self):
        seen: dict = {}

        def capture(**kwargs):
            seen.update(kwargs)
            return _reply(_report([{"area": "agent", "claim": "x", "items": [0]}]))

        with patch("openai.AsyncOpenAI") as client:
            client.return_value.chat.completions.create = AsyncMock(side_effect=capture)
            asyncio.run(
                report_mod.summarize_run(items=ITEMS, schema={}, model_config=CONFIG, language="zh")
            )
        assert "Simplified Chinese" in seen["messages"][1]["content"]


class TestPrompt:
    def test_the_prompt_lists_the_five_areas_and_the_items(self):
        seen: dict = {}

        def capture(**kwargs):
            seen.update(kwargs)
            return _reply(_report([]))

        with patch("openai.AsyncOpenAI") as client:
            client.return_value.chat.completions.create = AsyncMock(side_effect=capture)
            asyncio.run(report_mod.summarize_run(items=ITEMS, schema={"fields": []}, model_config=CONFIG))

        prompt = seen["messages"][1]["content"]
        for area in report_mod.AREAS:
            assert area in prompt
        assert "两市一共有多少只正在上市的股票" in prompt      # the questions are carried in
        assert '"counts"' in prompt                            # and the per-check tallies


class TestAbort:
    def test_a_run_stops_between_items_when_asked_to(self):
        """Marking a job failed must stop the run at the next item, not after the last one."""
        import pytest

        from app.services.workspace.evaluations import execute as execute_mod
        from app.services.workspace.evaluations.execute import RunAborted, _run_items

        items = [SimpleNamespace(id="a"), SimpleNamespace(id="b")]
        seen: list[str] = []

        class FakeResult:
            def scalars(self):
                return SimpleNamespace(all=lambda: items)

        class FakeDb:
            async def execute(self, *_a, **_k):
                return FakeResult()

        async def run_one(item):
            seen.append(item.id)
            return {"evaluation_item_id": item.id}

        with pytest.raises(RunAborted):
            asyncio.run(
                _run_items(
                    FakeDb(),
                    "ev",
                    run_one,
                    None,
                    lambda: len(seen) >= 1,
                )
            )
        assert seen == ["a"]
        assert execute_mod.RunAborted is RunAborted
