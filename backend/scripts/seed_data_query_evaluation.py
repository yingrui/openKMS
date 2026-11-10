#!/usr/bin/env python3
"""Seed a data-query evaluation on the quant KB and run it, end to end.

The test dataset is four items — two that should pass, two that should fail — chosen so the verdicts are about the
*query*, not the numbers:

- **pass, single query**: "各行业分别有多少只股票" → the agent must cite the Stock model and `stock_basic` grouped by
  `industry`.
- **pass, several queries**: one question expecting two citations (`stock_basic` + `trade_calendar`).
- **fail, wrong model**: the ground truth demands a model id that does not exist.
- **fail, wrong table**: the ground truth demands `daily_basic.industry`, but `industry` lives on `stock_basic`.

Run it with the backend and the QA agent up:

    python3 backend/scripts/seed_data_query_evaluation.py

It reads the API key from the installed skill's `config.yml` (the same place the skill does).
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

import yaml

BASE = "http://127.0.0.1:8102"
KB_ID = "0948e298-eed0-4168-86ee-e401ef65663c"      # 量化交易知识库
MODEL_ID = "745a2fbc-e7de-42cb-a002-31138a9d353e"    # Stock


def load_key() -> str:
    candidates = [
        Path.home() / ".pi" / "agent" / "skills" / "openkms" / "config.yml",
        Path("openkms-skill") / "config.yml",
    ]
    for path in candidates:
        if path.exists():
            return str(yaml.safe_load(path.read_text())["api_key"])
    print("No API key found — set OPENKMS_API_KEY or copy the skill config.yml", file=sys.stderr)
    sys.exit(1)


KEY = load_key()

ITEMS: list[tuple[str, list[dict]]] = [
    (
        "各行业分别有多少只股票？",
        [{"model_id": MODEL_ID, "sql": {"tables": ["tushare.stock_basic"], "group_by": ["industry"]}}],
    ),
    (
        "市场上有多少只股票，交易日历里有多少天？",
        [
            {"model_id": MODEL_ID, "sql": {"tables": ["tushare.stock_basic"]}},
            {"model_id": MODEL_ID, "sql": {"tables": ["tushare.trade_calendar"]}},
        ],
    ),
    (
        "各行业分别有多少只股票？",
        [{"model_id": "00000000-0000-0000-0000-000000000000", "sql": {"tables": ["tushare.stock_basic"]}}],
    ),
    (
        "各行业分别有多少只股票？",
        [{"model_id": MODEL_ID, "sql": {"tables": ["tushare.daily_basic"], "group_by": ["industry"]}}],
    ),
    # 正向：期望写成了原始 SQL（写法不同、语义等价），由 LLM 判等价 — 验证阶段 3
    (
        "市场上一共有多少只股票？",
        [{"model_id": MODEL_ID, "sql": "SELECT count(DISTINCT ts_code) FROM tushare.stock_basic"}],
    ),
]


def call(method: str, path: str, body=None):
    req = urllib.request.Request(
        BASE + path,
        method=method,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    )
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as exc:
        return exc.code, json.load(exc)


def main() -> int:
    status, ev = call("POST", "/api/evaluations", {
        "name": "问数评估（测试数据集）",
        "knowledge_base_id": KB_ID,
        "semantic_model_id": MODEL_ID,
    })
    if status not in (200, 201):
        print(f"  create evaluation failed: {status} {ev}", file=sys.stderr)
        return 1
    ev_id = ev["id"]
    print(f"  evaluation {ev_id}")

    for question, expected_query in ITEMS:
        status, item = call("POST", f"/api/evaluations/{ev_id}/items", {
            "query": question,
            "expected_answer": "—",
            "expected_query": expected_query,
        })
        assert status in (200, 201), (status, item)

    print("  running data_query evaluation (the QA agent calls an LLM; this takes minutes)…")
    status, run = call("POST", f"/api/evaluations/{ev_id}/run", {"evaluation_type": "data_query"})
    if status != 200:
        print(f"  run failed: {status} {run}", file=sys.stderr)
        return 1

    print(f"\n  pass {run.get('pass_count')}/{run.get('item_count')} · avg {run.get('avg_score')}\n")
    expected = [True, True, False, False, True]
    ok = True
    for i, (result, want) in enumerate(zip(run.get("results", []), expected)):
        mark = "✓" if result["pass"] == want else "✗ EXPECTED THE OPPOSITE"
        ok = ok and result["pass"] == want
        print(f"  {mark}  {result['query'][:26]:28} pass={result['pass']}  {result['reasoning'][:70]}")
    print()
    print("  END-TO-END OK" if ok else "  END-TO-END FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
