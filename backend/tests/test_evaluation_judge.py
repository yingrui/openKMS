"""The judge: structured verdicts, and a call that fails is not an answer that is wrong.

Everything here runs against a fake chat-completions client: what is under test is the contract (which inputs the judge
receives, what its reply turns into, and what happens when the reply is unusable), not the model's opinion.
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.workspace.evaluations import judge as judge_mod


def _reply(content: str) -> SimpleNamespace:
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


def _checks(**verdicts: str) -> str:
    return json.dumps(
        {
            "verdict": "pass",
            "checks": [
                {"id": cid, "verdict": v, "expected": "e", "actual": "a", "reason": None}
                for cid, v in verdicts.items()
            ],
        }
    )


@pytest.fixture(autouse=True)
def clear_cache():
    judge_mod._cache.clear()
    yield
    judge_mod._cache.clear()


CONFIG = {"base_url": "http://judge/v1", "api_key": "k", "model_name": "judge-model"}


async def _judge(content: str, **kwargs):
    with patch("openai.AsyncOpenAI") as client:
        client.return_value.chat.completions.create = AsyncMock(return_value=_reply(content))
        return await judge_mod.judge_query(
            question="各行业的平均市盈率？",
            expected={"expected": {"metric": {"name": "平均市盈率"}, "dimensions": ["industry"]}},
            actual=[{"mode": "metric", "metric": "平均市盈率", "group_by": [{"field": "industry"}]}],
            schema=[{"name": "industry", "datatype": "String"}],
            forbidden=None,
            model_config=CONFIG,
            **kwargs,
        )


class TestVerdicts:
    def test_all_checks_pass_is_a_pass(self):
        import asyncio

        verdict = asyncio.run(_judge(_checks(model="pass", scope="pass", measure="pass", grain="pass", joins="pass", forbidden="pass")))
        assert verdict.verdict == "pass"
        assert {c["id"] for c in verdict.checks} == {"model", "scope", "measure", "grain", "joins", "forbidden"}
        assert verdict.prompt_version == judge_mod.JUDGE_PROMPT_VERSION

    def test_one_failure_names_the_item(self):
        import asyncio

        content = json.dumps({
            "verdict": "fail",
            "checks": [
                {"id": "grain", "verdict": "fail", "expected": "GROUP BY industry", "actual": "GROUP BY trade_date",
                 "reason": "grouped by date instead of industry"},
                {"id": "measure", "verdict": "pass"},
            ],
        })
        verdict = asyncio.run(_judge(content))
        assert verdict.verdict == "fail"
        assert verdict.reasoning.startswith("grain:")

    def test_unknown_is_undecided_not_a_failure(self):
        import asyncio

        verdict = asyncio.run(_judge(_checks(model="pass", measure="unknown")))
        assert verdict.verdict == "undecided"

    def test_unusable_replies_are_undecided(self):
        import asyncio

        for broken in ("not json", "```\n[]\n```", json.dumps({"verdict": "pass"})):
            verdict = asyncio.run(_judge(broken))
            assert verdict.verdict == "undecided", broken

    def test_a_failed_call_is_undecided_and_says_why(self):
        import asyncio

        with patch("openai.AsyncOpenAI") as client:
            client.return_value.chat.completions.create = AsyncMock(side_effect=TimeoutError("judge down"))
            verdict = asyncio.run(
                judge_mod.judge_query(
                    question="q", expected={}, actual=[], schema=[], forbidden=None, model_config=CONFIG
                )
            )
        assert verdict.verdict == "undecided"
        assert "judge down" in (verdict.error or "")


class TestOneTurnIsOneAnswer:
    def test_every_query_of_the_turn_is_judged_together(self):
        """An answer that looks up which markets exist, then counts, is one answer — not two candidates."""
        import asyncio

        with patch("openai.AsyncOpenAI") as client:
            create = AsyncMock(return_value=_reply(_checks(model="pass", scope="pass", grain="pass")))
            client.return_value.chat.completions.create = create
            asyncio.run(
                judge_mod.judge_query(
                    question="两市一共有多少只正在上市的股票？",
                    expected={"expected": {"sql": "SELECT count(*) FROM tushare.stock_basic WHERE list_status = 'L'"}},
                    actual=[
                        {"mode": "sql", "sql": "SELECT exchange, count(*) FROM tushare.stock_basic WHERE list_status = 'L' GROUP BY exchange"},
                        {"mode": "sql", "sql": "SELECT list_status, count(*) FROM tushare.stock_basic GROUP BY list_status"},
                    ],
                    schema=[],
                    forbidden=None,
                    model_config=CONFIG,
                )
            )
        prompt = create.call_args.kwargs["messages"][1]["content"]
        assert "GROUP BY exchange" in prompt and "GROUP BY list_status" in prompt
        assert "one answer, not separate candidates" in prompt


class TestInputsAndCache:
    def test_the_judge_sees_the_question_the_expectation_the_actual_and_the_schema(self):
        import asyncio

        with patch("openai.AsyncOpenAI") as client:
            create = AsyncMock(return_value=_reply(_checks(model="pass")))
            client.return_value.chat.completions.create = create
            asyncio.run(
                judge_mod.judge_query(
                    question="各行业的平均市盈率？",
                    expected={"expected": {"metric": {"name": "平均市盈率"}}},
                    actual=[{"mode": "metric", "sql": "SELECT 1"}],
                    schema=[{"name": "industry", "description": "行业"}],
                    forbidden=["daily_basic.amount"],
                    model_config=CONFIG,
                )
            )
        prompt = create.call_args.kwargs["messages"][1]["content"]
        assert "各行业的平均市盈率" in prompt          # the question, which the old judge never received
        assert "平均市盈率" in prompt                  # the expectation
        assert '"mode": "metric"' in prompt           # what actually ran
        assert "daily_basic.amount" in prompt         # the forbidden list
        assert create.call_args.kwargs["temperature"] == 0.0

    def test_a_repeat_question_is_answered_from_cache(self):
        import asyncio

        first = asyncio.run(_judge(_checks(model="pass", scope="pass")))
        with patch("openai.AsyncOpenAI") as client:
            create = AsyncMock(return_value=_reply(_checks(model="pass", scope="pass")))
            client.return_value.chat.completions.create = create
            second = asyncio.run(_judge(_checks(model="pass", scope="pass")))
        assert first.cache_hit is False
        assert second.cache_hit is True
        create.assert_not_called()
