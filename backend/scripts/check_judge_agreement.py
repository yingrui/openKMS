#!/usr/bin/env python3
"""Does the judge agree with a person? Run this before trusting a pass rate, and after changing the prompt.

Twelve pairs, each labelled by hand with the verdict a correct judge must reach. They are the mistakes that matter in a
data-query set — counting rows instead of stocks, a static P/E judged as a trailing one, "上半年" read as the whole year,
an average computed over the wrong rows — plus the differences that must NOT be treated as failures (aliases, `BETWEEN`,
`SELECT *`).

    python3 backend/scripts/check_judge_agreement.py

Uses the knowledge base's judge model, at temperature 0, through the same code path the evaluation uses.
"""
from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND / ".env")
sys.path.insert(0, str(BACKEND))

from app.database import async_session_maker  # noqa: E402
from app.models.knowledge_base import KnowledgeBase  # noqa: E402
from app.services.workspace.evaluations.execute import resolve_judge_config  # noqa: E402
from app.services.workspace.evaluations.judge import judge_query  # noqa: E402

KB_ID = os.environ.get("OPENKMS_QUANT_KB_ID", "0948e298-eed0-4168-86ee-e401ef65663c")

#: The model as the judge receives it: fields with their meaning, and each dataset's row identity. The keys are what
#: makes `count(*)` and `count(distinct ts_code)` the same number on `stock_basic`.
SCHEMA = {
    "fields": [
    {"name": "ts_code", "datatype": "String", "description": "股票代码"},
    {"name": "industry", "datatype": "String", "description": "所属行业，位于 stock_basic"},
    {"name": "trade_date", "datatype": "Date", "description": "交易日期，位于 daily_basic"},
    {"name": "pe", "datatype": "Decimal", "description": "静态市盈率"},
    {"name": "pe_ttm", "datatype": "Decimal", "description": "滚动市盈率（TTM）"},
    {"name": "total_mv", "datatype": "Decimal", "description": "总市值"},
    {"name": "list_status", "datatype": "String", "description": "上市状态：L 上市 / D 退市 / P 暂停"},
    ],
    "datasets": [
        {"id": "stock_basic", "name": "tushare.stock_basic", "primary_key": ["ts_code"], "unique_keys": [["ts_code"]]},
        {
            "id": "daily_basic",
            "name": "tushare.daily_basic",
            "primary_key": ["ts_code", "trade_date"],
            "unique_keys": [["ts_code", "trade_date"]],
        },
        {
            "id": "trade_calendar",
            "name": "tushare.trade_calendar",
            "primary_key": ["exchange", "cal_date"],
            "unique_keys": [["exchange", "cal_date"]],
        },
    ],
}


@dataclass(frozen=True)
class Case:
    label: str
    question: str
    expected: dict
    actual: dict
    want: str  # pass | fail


def sql(statement: str) -> dict:
    return {"expected": {"sql": statement}}


def ran(statement: str, mode: str = "sql") -> dict:
    return {"mode": mode, "sql": statement}


CASES: list[Case] = [
    Case(
        "同一区间的两种写法",
        "今年上半年有多少个交易日？",
        sql("SELECT count(*) FROM tushare.trade_calendar WHERE cal_date BETWEEN '2026-01-01' AND '2026-06-30' AND is_open = 1"),
        ran("SELECT count(*) FROM tushare.trade_calendar WHERE cal_date >= '2026-01-01' AND cal_date <= '2026-06-30' AND is_open = 1"),
        "pass",
    ),
    Case(
        # 行情表一天一行：`count(*)` 数的是"股票×交易日"，与"多少只股票"不同。
        # 在 stock_basic 上两者相等（那张表 ts_code 唯一），所以这条必须放在 daily_basic 上才有意义。
        "数行 ≠ 数股票",
        "市场上一共有多少只股票有行情数据？",
        sql("SELECT count(DISTINCT ts_code) FROM tushare.daily_basic"),
        ran("SELECT count(*) FROM tushare.daily_basic"),
        "fail",
    ),
    Case(
        "TTM ≠ 静态",
        "全市场平均 TTM 市盈率是多少？",
        sql("SELECT AVG(pe_ttm) FROM tushare.daily_basic"),
        ran("SELECT AVG(pe) FROM tushare.daily_basic"),
        "fail",
    ),
    Case(
        "上半年 ≠ 全年",
        "今年上半年有多少个交易日？",
        sql("SELECT count(*) FROM tushare.trade_calendar WHERE cal_date < '2026-07-01' AND cal_date >= '2026-01-01' AND is_open = 1"),
        ran("SELECT count(*) FROM tushare.trade_calendar WHERE EXTRACT(YEAR FROM cal_date) = 2026 AND is_open = 1"),
        "fail",
    ),
    Case(
        "SUM/COUNT(*) ≠ AVG（有 NULL 时）",
        "各行业平均市盈率是多少？",
        sql("SELECT industry, AVG(pe_ttm) FROM tushare.daily_basic GROUP BY industry"),
        # Normalising by COUNT(*) counts rows with a NULL pe_ttm as well; AVG ignores them.
        ran("SELECT industry, SUM(pe_ttm) / COUNT(*) FROM tushare.daily_basic GROUP BY industry"),
        "fail",
    ),
    Case(
        "industry 的来历不同",
        "半导体行业最新交易日的平均市盈率是多少？",
        sql(
            "SELECT AVG(d.pe_ttm) FROM tushare.daily_basic d JOIN tushare.stock_basic b ON d.ts_code = b.ts_code "
            "WHERE b.industry = '半导体'"
        ),
        ran("SELECT AVG(pe_ttm) FROM tushare.daily_basic WHERE industry = '半导体'"),
        "fail",
    ),
    Case(
        "SELECT * 覆盖了期望的列",
        "总市值最高的 10 只股票，给我代码和总市值",
        sql("SELECT ts_code, total_mv FROM tushare.daily_basic ORDER BY total_mv DESC LIMIT 10"),
        ran("SELECT * FROM (SELECT * FROM tushare.daily_basic ORDER BY total_mv DESC LIMIT 10) t"),
        "pass",
    ),
    Case(
        "粒度不同",
        "各行业平均市盈率是多少？",
        sql("SELECT industry, AVG(pe_ttm) FROM tushare.daily_basic GROUP BY industry"),
        ran("SELECT trade_date, AVG(pe_ttm) FROM tushare.daily_basic GROUP BY trade_date"),
        "fail",
    ),
    Case(
        "最新值 ≠ 平均值",
        "最新交易日的 TTM 市盈率是多少？",
        {
            "expected": {
                "metric": {
                    "name": "TTM市盈率",
                    "definition": {"expression": "(array_agg(\"pe_ttm\" ORDER BY \"trade_date\" DESC))[1]"},
                }
            }
        },
        {"mode": "metric", "metric": "平均市盈率", "sql": "SELECT AVG(pe_ttm) FROM tushare.daily_basic"},
        "fail",
    ),
    Case(
        "多返回不算错",
        "总市值最高的 10 只股票是谁？",
        sql("SELECT ts_code, total_mv FROM tushare.daily_basic ORDER BY total_mv DESC LIMIT 10"),
        ran("SELECT ts_code, total_mv, pe_ttm FROM tushare.daily_basic ORDER BY total_mv DESC LIMIT 10"),
        "pass",
    ),
    Case(
        "CTE 与子查询等价",
        "各行业的平均市盈率是多少？",
        sql("SELECT industry, AVG(pe_ttm) FROM tushare.daily_basic GROUP BY industry"),
        ran("WITH x AS (SELECT industry, pe_ttm FROM tushare.daily_basic) SELECT industry, AVG(pe_ttm) FROM x GROUP BY industry"),
        "pass",
    ),
    Case(
        "引用了另一个模型",
        "各行业的平均市盈率是多少？",
        {"model_id": "745a2fbc-e7de-42cb-a002-31138a9d353e", "expected": {"sql": "SELECT industry, AVG(pe_ttm) FROM tushare.daily_basic GROUP BY industry"}},
        {"mode": "sql", "model_id": "another-model", "sql": "SELECT industry, AVG(pe_ttm) FROM other.daily GROUP BY industry"},
        "fail",
    ),
]


async def main() -> int:
    async with async_session_maker() as db:
        kb = await db.get(KnowledgeBase, KB_ID)
        if kb is None:
            print(f"knowledge base {KB_ID} not found", file=sys.stderr)
            return 1
        judge_model_id, judge_config = await resolve_judge_config(db, kb)

    print(f"judge: {judge_config.get('model_name')} ({judge_model_id})\n")
    agree = 0
    for case in CASES:
        verdict = await judge_query(
            question=case.question,
            expected=case.expected,
            actual=[case.actual],
            schema=SCHEMA,
            forbidden=None,
            model_config=judge_config,
        )
        ok = verdict.verdict == case.want
        agree += 1 if ok else 0
        mark = "✓" if ok else "✗"
        failing = [c["id"] for c in verdict.checks if c["verdict"] in ("fail", "unknown")]
        print(f"  {mark} {case.label:24} want={case.want:4} got={verdict.verdict:9} {failing} {verdict.reasoning[:60]}")
        if verdict.error:
            print(f"      error: {verdict.error}")

    print(f"\n{agree}/{len(CASES)} agree")
    return 0 if agree == len(CASES) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
