#!/usr/bin/env python3
"""The quant-KB data-query test set: the questions a trading analyst actually asks.

Each item pairs a question with the **query the answer must cite** — for a metric, the indicator plus its
definition as the model has it today; otherwise the SQL. Returned numbers are not part of the expectation: they change
with the data, the query does not.

Three families, chosen to catch the ways an answer goes wrong:

- **correct** (12): questions the Stock model can answer.
- **trap** (3): questions where a plausible-looking query is wrong — counting rows instead of distinct stocks, filtering
  the price table on `industry` (which lives on `stock_basic`), and treating a trade-calendar question as a price question.
- **refuse** (2): questions the model cannot answer at all (fundamentals, news sentiment). `{"refuse": true}` means any
  citation is a failure.

    python3 backend/scripts/seed_quant_data_query_set.py            # create a new evaluation and run it
    python3 backend/scripts/seed_quant_data_query_set.py --no-run   # create only
    python3 backend/scripts/seed_quant_data_query_set.py --repair   # rewrite the items of the existing evaluation

`--repair` exists because the first version of this script stored the family name as both `topic` and
`expected_answer` (`expected_answer` was NOT NULL, and a data-query item has no prose answer at all). It matches items by
question text, so it fixes the rows in place without creating a second evaluation or paying for another run.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

BASE = "http://127.0.0.1:8102"
KB_ID = "0948e298-eed0-4168-86ee-e401ef65663c"      # 量化交易知识库
MODEL_ID = "745a2fbc-e7de-42cb-a002-31138a9d353e"    # Stock
EVALUATION_NAME = "量化交易 · 问数测试集"

DB = "tushare.daily_basic"
SB = "tushare.stock_basic"
CAL = "tushare.trade_calendar"
LATEST = f"(SELECT max(trade_date) FROM {DB})"


@dataclass(frozen=True)
class Metric:
    """Use a saved metric. Its definition is read from the model at write time, not copied by hand."""

    name: str
    dimensions: list[str] = field(default_factory=list)
    filters: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class Sql:
    text: str


@dataclass(frozen=True)
class Refuse:
    """The question cannot be answered from this model; citing anything is the failure."""


@dataclass(frozen=True)
class Item:
    topic: str
    question: str
    expectations: list[Metric | Sql | Refuse]


ITEMS: list[Item] = [
    # ── 股票数量 ───────────────────────────────────────────────────────────────────────────
    # 两市 = 上交所 + 深交所. `stock_basic` also holds 北交所 (BSE), so `list_status = 'L'` alone counts a third market.
    Item("股票数量", "两市（沪、深）一共有多少只正在上市的股票？", [
        Sql(f"SELECT count(*) FROM {SB} WHERE list_status = 'L' AND exchange IN ('SSE', 'SZSE')"),
    ]),
    Item("行业分布", "一共有多少个不同的行业（全部上市股票）？", [
        Sql(f"SELECT count(DISTINCT industry) FROM {SB} WHERE list_status = 'L'"),
    ]),
    Item("股票数量", "一共有多少个不同的股票代码（含已退市）？", [
        Sql(f"SELECT count(DISTINCT ts_code) FROM {SB}"),
    ]),

    # ── 行业与交易所分布 ───────────────────────────────────────────────────────────────────
    Item("行业分布", "各行业分别有多少只正在上市的股票？", [
        Sql(f"SELECT industry, count(*) FROM {SB} WHERE list_status = 'L' GROUP BY industry"),
    ]),
    Item("交易所分布", "按交易所统计，各有多少只正在上市的股票？", [
        Sql(f"SELECT exchange, count(*) FROM {SB} WHERE list_status = 'L' GROUP BY exchange"),
    ]),
    Item("上市状态", "上市状态（list_status）分别有多少只股票？", [
        Sql(f"SELECT list_status, count(*) FROM {SB} GROUP BY list_status"),
    ]),

    # ── 价格与估值（有现成指标的用指标，定义随期望一起存下） ──────────────────────────────
    Item("价格估值", "各行业的平均市盈率（TTM）是多少？", [
        Metric("平均市盈率", dimensions=["industry"]),
    ]),
    Item("价格估值", "最新交易日全市场平均 TTM 市盈率是多少？", [
        Sql(f"SELECT AVG(pe_ttm) FROM {DB} WHERE trade_date = {LATEST}"),
    ]),
    Item("价格估值", "当前总市值最高的 10 只股票是谁？", [
        Sql(f"SELECT ts_code, total_mv FROM {DB} WHERE trade_date = {LATEST} ORDER BY total_mv DESC LIMIT 10"),
    ]),

    # ── 多查询与时间粒度 ───────────────────────────────────────────────────────────────────
    Item("多查询", "市场上有多少只股票，交易日历里一共有多少天？", [
        Sql(f"SELECT count(*) FROM {SB}"),
        Sql(f"SELECT count(*) FROM {CAL}"),
    ]),
    Item("时间粒度", "每个交易日的总市值合计是多少（按交易日分组）？", [
        Sql(f"SELECT trade_date, sum(total_mv) FROM {DB} GROUP BY trade_date"),
    ]),
    Item("交易日历", "交易日历里最近的开市日期是哪一天？", [
        Sql(f"SELECT max(cal_date) FROM {CAL} WHERE is_open = 1"),
    ]),

    # ── 陷阱：看似合理、实际错了的查询 ─────────────────────────────────────────────────────
    Item("陷阱·数行", "市场上一共有多少只股票（按代码去重，含已退市）？", [
        Sql(f"SELECT count(DISTINCT ts_code) FROM {SB}"),
    ]),
    Item("陷阱·行业归属", "半导体行业最新交易日的平均市盈率是多少？", [
        Sql(
            f"SELECT AVG(d.pe_ttm) FROM {DB} d JOIN {SB} b ON d.ts_code = b.ts_code "
            f"WHERE b.industry = '半导体' AND d.trade_date = {LATEST}"
        ),
    ]),
    Item("陷阱·日历", "今年上半年有多少个交易日？", [
        Sql(f"SELECT count(*) FROM {CAL} WHERE is_open = 1 AND cal_date >= '2026-01-01' AND cal_date < '2026-07-01'"),
    ]),

    # ── 应拒答：模型答不了，引用任何查询都是错 ────────────────────────────────────────────
    Item("拒答·基本面", "贵州茅台 2026 年上半年的营业收入是多少？", [Refuse()]),
    Item("拒答·舆情", "市场情绪如何，利好消息多吗？", [Refuse()]),
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
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as exc:
        return exc.code, json.load(exc)


def metric_definitions() -> dict[str, dict[str, Any]]:
    """The model's metrics as they are now — the expectation stores this snapshot, not a name alone.

    A name alone cannot be judged: `市盈率` is the latest single value and `平均市盈率` is an average, and only the
    definition says which one a question wants.
    """
    status, body = call("GET", f"/api/metrics?semantic_model_id={MODEL_ID}")
    if status != 200:
        print(f"  cannot read metrics: {status} {body}", file=sys.stderr)
        sys.exit(1)
    return {
        m["name"]: {
            "base_dataset_id": m.get("base_dataset_id"),
            "expression": m.get("expression"),
            "datatype": m.get("datatype"),
            "filters": m.get("filters"),
            "joins": m.get("joins"),
            "business_definition": m.get("business_definition"),
        }
        for m in body.get("items", [])
    }


def expected_query(item: Item, definitions: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for exp in item.expectations:
        if isinstance(exp, Metric):
            definition = definitions.get(exp.name)
            if definition is None:
                print(f"  metric not found in the model: {exp.name}", file=sys.stderr)
                sys.exit(1)
            out.append({
                "model_id": MODEL_ID,
                "expected": {
                    "metric": {"name": exp.name, "definition": definition},
                    "dimensions": exp.dimensions,
                    "filters": exp.filters,
                },
            })
        elif isinstance(exp, Sql):
            out.append({"model_id": MODEL_ID, "expected": {"sql": exp.text}})
        else:
            out.append({"model_id": MODEL_ID, "expected": {"refuse": True}})
    return out


def item_body(item: Item, index: int, definitions: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        "query": item.question,
        "topic": item.topic,
        # A query item has no prose answer: the expectation above is the ground truth.
        "expected_answer": None,
        "expected_query": expected_query(item, definitions),
        "sort_order": index,
    }


def family_counts() -> str:
    topics = [i.topic for i in ITEMS]
    traps = sum(1 for t in topics if t.startswith("陷阱"))
    refusals = sum(1 for t in topics if t.startswith("拒答"))
    return f"{len(ITEMS)} items ({len(ITEMS) - traps - refusals} correct, {traps} trap, {refusals} refuse)"


def create() -> str:
    status, ev = call("POST", "/api/evaluations", {
        "name": EVALUATION_NAME,
        "knowledge_base_id": KB_ID,
        "semantic_model_id": MODEL_ID,
        "kind": "query",
        "description": "17 个问数问题：正确 12、陷阱 3、该拒答 2。判查询，不判数字。",
    })
    if status not in (200, 201):
        print(f"  create failed: {status} {ev}", file=sys.stderr)
        sys.exit(1)
    return ev["id"]


def repair() -> int:
    """Rewrite the items of the existing evaluation, matched by question text."""
    status, listing = call(
        "GET",
        f"/api/evaluations?{urllib.parse.urlencode({'knowledge_base_id': KB_ID, 'limit': 200})}",
    )
    if status != 200:
        print(f"  cannot list evaluations: {status} {listing}", file=sys.stderr)
        return 1
    target = next((e for e in listing.get("items", []) if e["name"] == EVALUATION_NAME), None)
    if target is None:
        print(f"  no evaluation named {EVALUATION_NAME!r}; run without --repair to create one", file=sys.stderr)
        return 1

    definitions = metric_definitions()
    status, existing = call("GET", f"/api/evaluations/{target['id']}/items?limit=200")
    if status != 200:
        print(f"  cannot list items: {status} {existing}", file=sys.stderr)
        return 1
    by_question = {i["query"]: i for i in existing.get("items", [])}
    # Match on position first: a question's wording gets fixed without leaving the old row behind as a duplicate.
    by_order = {i["sort_order"]: i for i in existing.get("items", [])}

    fixed = added = 0
    kept: set[str] = set()
    for index, item in enumerate(ITEMS):
        row = by_order.get(index) or by_question.get(item.question)
        body = item_body(item, index, definitions)
        if row is None:
            status, payload = call("POST", f"/api/evaluations/{target['id']}/items", body)
            if status not in (200, 201):
                print(f"  item failed: {status} {payload}", file=sys.stderr)
                return 1
            added += 1
            continue
        status, payload = call("PUT", f"/api/evaluations/{target['id']}/items/{row['id']}", body)
        if status != 200:
            print(f"  item failed: {status} {payload}", file=sys.stderr)
            return 1
        kept.add(row["id"])
        fixed += 1

    # The first version of this set asked one question the model cannot answer ("成交金额" is not a column); it is gone
    # from ITEMS. Remove the rows that are recognisably that version — a placeholder answer and a question we no longer
    # ask — and report anything else, so nothing is deleted on a guess.
    placeholders = {"[correct]", "[trap]", "[refuse]"}
    wanted = {i.question for i in ITEMS}
    removed = 0
    for question, row in by_question.items():
        if row["id"] in kept or question in wanted:
            continue
        # A leftover from this set: no expectation of its own, or the placeholder the first version wrote.
        if row.get("expected_query") and (row.get("expected_answer") or "") not in placeholders:
            print(f"  kept an item this script does not know: {question[:32]}")
            continue
        status, _ = call("DELETE", f"/api/evaluations/{target['id']}/items/{row['id']}")
        if status in (200, 204):
            removed += 1
            print(f"  removed stale item: {question[:32]}")

    print(
        f"  repaired {fixed}, added {added}, removed {removed} — {len(ITEMS)} items in evaluation {target['id']}"
    )
    return 0


def main() -> int:
    if "--repair" in sys.argv:
        return repair()

    definitions = metric_definitions()
    ev_id = create()
    print(f"  evaluation {ev_id}")

    for index, item in enumerate(ITEMS):
        status, body = call("POST", f"/api/evaluations/{ev_id}/items", item_body(item, index, definitions))
        if status not in (200, 201):
            print(f"  item {index} failed: {status} {body}", file=sys.stderr)
            return 1
    print(f"  {family_counts()} created")

    if "--no-run" in sys.argv:
        return 0

    print("  running (the agent calls an LLM per item; this takes several minutes)…")
    status, run = call("POST", f"/api/evaluations/{ev_id}/run", {"evaluation_type": "data_query"})
    if status != 200:
        print(f"  run failed: {status} {run}", file=sys.stderr)
        return 1
    print(f"\n  pass {run.get('pass_count')}/{run.get('item_count')}\n")
    for r in run.get("results", []):
        mark = "✓" if r["pass"] else "✗"
        print(f"  {mark}  {r['query'][:30]:32} {r['reasoning'][:64]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
