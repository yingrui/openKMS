"""The pieces of a data-query run that were buried inside one long closure.

`_cited_queries` decides what counts as a cited query; `_judge_expectations` turns the judge's verdicts into coverage,
pass/fail and a sentence. Both used to be inline in a 117-line `run_one`, where only a live agent could exercise them.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.services.workspace.evaluations import execute as execute_mod
from app.services.workspace.evaluations import judge as judge_mod
from app.services.workspace.evaluations.judge import JudgeVerdict


class TestCitedQueries:
    def test_only_sources_with_sql_count(self):
        data = {
            "sources": [
                {"data_query": {"mode": "sql", "sql": "select 1"}},
                {"data_query": {"mode": "metric", "metric": "pe"}},          # no SQL: not a query
                {"data_query": None},
                {"content": "a passage"},
                "not a dict",
            ]
        }
        assert [q["sql"] for q in execute_mod._cited_queries(data)] == ["select 1"]

    def test_no_sources_is_no_queries(self):
        assert execute_mod._cited_queries({}) == []


def _verdict(verdict: str, *, reason: str = "", checks: list | None = None) -> JudgeVerdict:
    return JudgeVerdict(verdict=verdict, reasoning=reason, checks=checks or [], model="judge")


def _judge(returning: list[JudgeVerdict], *, monkeypatch, language: str = "en"):
    calls: list[dict] = []

    async def fake_judge(**kwargs):
        calls.append(kwargs)
        return returning[len(calls) - 1]

    monkeypatch.setattr(judge_mod, "judge_query", fake_judge)
    out = asyncio.run(
        execute_mod._judge_expectations(
            question="q",
            expected=[{"expected": {"sql": "select 1"}}, {"expected": {"sql": "select 2"}}][: len(returning)],
            cited=[{"mode": "sql", "sql": "select 1"}],
            schema={"fields": [], "datasets": []},
            judge_config={"model_name": "judge"},
            language=language,
        )
    )
    return out, calls


class TestJudgeExpectations:
    def test_all_pass_is_full_coverage(self, monkeypatch):
        (verdicts, uncovered, coverage, passed, verdict, reasoning), calls = _judge(
            [_verdict("pass")], monkeypatch=monkeypatch
        )
        assert (len(verdicts), uncovered, coverage, passed, verdict) == (1, [], 1.0, True, "pass")
        assert reasoning  # "every expected query was covered", in the run's language
        assert calls[0]["actual"] == [{"mode": "sql", "sql": "select 1"}]   # the whole turn is handed over
        assert calls[0]["language"] == "en"

    def test_a_failure_names_the_expectation(self, monkeypatch):
        (_v, uncovered, coverage, passed, verdict, reasoning), _ = _judge(
            [_verdict("pass"), _verdict("fail", reason="grain: grouped by date")], monkeypatch=monkeypatch
        )
        assert passed is False and coverage == 0.5 and verdict == "fail"
        assert uncovered[0]["expected_index"] == 1
        assert "grain: grouped by date" in reasoning

    def test_only_undecided_is_undecided_not_failed(self, monkeypatch):
        (_v, uncovered, _c, passed, verdict, _r), _ = _judge([_verdict("undecided")], monkeypatch=monkeypatch)
        assert passed is False            # not counted as a pass
        assert verdict == "undecided"     # but not called a failure either

    def test_the_reason_follows_the_run_language(self, monkeypatch):
        result, _ = _judge([_verdict("pass")], monkeypatch=monkeypatch, language="zh")
        reasoning = result[5]
        assert reasoning == "每条期望查询都被覆盖"
