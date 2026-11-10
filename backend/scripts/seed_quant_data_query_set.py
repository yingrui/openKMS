#!/usr/bin/env python3
"""The quant-KB data-query test set: 15 questions a trading analyst actually asks.

Each item pairs a question with the **query the answer must cite** — the model, and the SQL's shape (tables, columns,
group-by, or a raw SQL for semantic equivalence). The returned numbers are deliberately not part of the ground truth: they
change with the data, the query does not.

Three families, chosen to catch the ways an answer goes wrong:

- **correct** (10): single-query, multi-query, time-grain, and join questions the Stock model can answer.
- **trap** (3): questions where a plausible-looking query is wrong — counting rows instead of distinct stocks, filtering
  `daily_basic` on `industry` (which lives on `stock_basic`), and treating a trade-calendar question as a price question.
- **refuse** (2): a question the model cannot answer at all (fundamentals, news sentiment) — expected citations are empty,
  and any citation is wrong.

    python3 backend/scripts/seed_quant_data_query_set.py            # create + run
    python3 backend/scripts/seed_quant_data_query_set.py --no-run   # create only
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

DB = "tushare.daily_basic"
SB = "tushare.stock_basic"
CAL = "tushare.trade_calendar"


def q(*, tables=(), columns=(), group_by=(), filters=(), forbid=()):
    """A structural expectation: what the query must touch and must not touch."""
    sql = {}
    if tables:
        sql["tables"] = list(tables)
    if columns:
        sql["columns"] = list(columns)
    if group_by:
        sql["group_by"] = list(group_by)
    if filters:
        sql["filters"] = list(filters)
    if forbid:
        sql["forbid"] = list(forbid)
    return {"model_id": MODEL_ID, "sql": sql}


def raw(sql: str):
    """An expectation given as SQL — judged for semantic equivalence."""
    return {"model_id": MODEL_ID, "sql": sql}


#: (question, expected queries, family)
ITEMS: list[tuple[str, list[dict], str]] = [
    # ── correct: single query ───────────────────────────────────────────────────────────────
    ("两市一共有多少只正在上市的股票？",
     [q(tables=[SB], filters=[{"column": "list_status"}])], "correct"),
    ("各行业分别有多少只股票？", [q(tables=[SB], group_by=["industry"])], "correct"),
    ("一共有多少个不同的行业？", [q(tables=[SB], columns=["industry"])], "correct"),
    ("按交易所统计，各有多少只股票？", [q(tables=[SB], group_by=["exchange"])], "correct"),
    ("上市状态（list_status）分别有多少只股票？", [q(tables=[SB], group_by=["list_status"])], "correct"),

    # ── correct: price / valuation ──────────────────────────────────────────────────────────
    ("最新交易日全市场平均 TTM 市盈率是多少？", [q(tables=[DB], columns=["pe_ttm"])], "correct"),
    ("当前总市值最高的 10 只股票是谁？", [q(tables=[DB], columns=["total_mv", "ts_code"])], "correct"),
    ("各行业的平均市盈率（TTM）是多少？", [q(tables=[DB], group_by=["industry"])], "correct"),

    # ── correct: multi-query, time grain, calendar ──────────────────────────────────────────
    ("市场上有多少只股票，交易日历里一共有多少天？", [q(tables=[SB]), q(tables=[CAL])], "correct"),
    ("最近一个月每个交易日的成交金额合计是多少？", [q(tables=[DB], columns=["trade_date"], group_by=["trade_date"])], "correct"),
    ("交易日历里最近的开市日期是哪一天？", [q(tables=[CAL], columns=["is_open", "cal_date"])], "correct"),

    # ── correct: raw SQL (semantic equivalence, the LLM path) ───────────────────────────────
    ("一共有多少只股票？", [raw("SELECT count(DISTINCT ts_code) FROM tushare.stock_basic")], "correct"),

    # ── trap: a plausible query with a real mistake ─────────────────────────────────────────
    # Counting rows instead of distinct stocks: the right answer needs DISTINCT, so the expectation is raw SQL.
    ("市场上一共有多少只股票？", [raw("SELECT count(DISTINCT ts_code) FROM tushare.stock_basic")], "trap"),
    # `industry` is on stock_basic, not daily_basic: filtering the price table on it is wrong.
    ("半导体行业最新交易日的平均市盈率是多少？",
     [q(tables=[DB], filters=[{"column": "industry"}])], "trap"),
    # A trade-calendar question answered from prices ("count rows per date") is a different question.
    ("今年上半年有多少个交易日？", [q(tables=[CAL], columns=["is_open", "cal_date"])], "trap"),

    # ── refuse: the model cannot answer, so any citation is a failure ──────────────────────
    ("贵州茅台 2026 年上半年的营业收入是多少？", [], "refuse"),
    ("市场情绪如何，利好消息多吗？", [], "refuse"),
]


def load_key() -> str:
    candidates = [
        Path.home() / ".pi" / "agent" / "skills" / "openkms" / "config.yml",
        Path("openkms-skill") / "config.yml",
    ]
    for path in candidates:
        if path.exists():
            return str(yaml.safe_load(path.read_text())["api_key"])
    print("No API key found", file=sys.stderr)
    sys.exit(1)


KEY = load_key()


def call(method: str, path: str, body=None):
    req = urllib.request.Request(
        BASE + path, method=method,
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
        "name": "量化交易 · 问数测试集",
        "knowledge_base_id": KB_ID,
        "semantic_model_id": MODEL_ID,
        "description": "15 个问数问题：正确 12、陷阱 3、该拒答 2。判查询，不判数字。",
    })
    if status not in (200, 201):
        print(f"  create failed: {status} {ev}", file=sys.stderr)
        return 1
    ev_id = ev["id"]
    print(f"  evaluation {ev_id}")

    for i, (question, expected, family) in enumerate(ITEMS):
        status, item = call("POST", f"/api/evaluations/{ev_id}/items", {
            "query": question,
            "expected_answer": f"[{family}]",
            "expected_query": expected,
            "topic": family,
            "sort_order": i,
        })
        if status not in (200, 201):
            print(f"  item {i} failed: {status} {item}", file=sys.stderr)
            return 1

    print(f"  {len(ITEMS)} items created ({sum(1 for _, _, f in ITEMS if f == 'correct')} correct, "
          f"{sum(1 for _, _, f in ITEMS if f == 'trap')} trap, {sum(1 for _, _, f in ITEMS if f == 'refuse')} refuse)")

    if "--no-run" in sys.argv:
        return 0

    print("  running (the agent calls an LLM per item; this takes several minutes)…")
    status, run = call("POST", f"/api/evaluations/{ev_id}/run", {"evaluation_type": "data_query"})
    if status != 200:
        print(f"  run failed: {status} {run}", file=sys.stderr)
        return 1
    print(f"\n  pass {run.get('pass_count')}/{run.get('item_count')}\n")
    for r in run.get("results", []):
        print(f"  {'✓' if r['pass'] else '✗'}  {r['query'][:30]:32} {r['reasoning'][:64]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
