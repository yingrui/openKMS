"""LangGraph skill: 保险收益计算器 (Insurance Returns Calculator).

Returns the most relevant raw KB chunks (费率表 / 现金价值表 / 利益演示 / IRR
sections) as `evidence`, and lets the **LLM** do the final number extraction
and arithmetic in its next reasoning step. The tool itself does NOT pre-extract
factors via regex — PDF tables routinely split values and labels across HTML
`<td>` chunks, so strict regex misses real numbers and the tool would return
"未找到精确值" even when chunks DO contain the answer.

Honest-numbers guarantee: if KB has zero relevant chunks for the product, the
tool returns `similar_products` and a `note` — it never fabricates numbers.
"""
from __future__ import annotations

import json
from typing import Any

import httpx
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..config import settings

DEFAULT_KB_ID = "b1af9d71-092d-40fb-89b1-9fa5388f71fa"

SNIPPET_CHARS = 600
TOP_EVIDENCE = 10


def _get_access_token(config: RunnableConfig) -> str:
    return config.get("configurable", {}).get("access_token", "")


def _kb_search(query: str, access_token: str, top_k: int = 5, kb_id: str = DEFAULT_KB_ID) -> list[dict[str, Any]]:
    """Call the backend KB search endpoint and return raw result dicts."""
    base = settings.openkms_backend_url.rstrip("/")
    url = f"{base}/api/knowledge-bases/{kb_id}/search"
    headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            url,
            json={"query": query, "top_k": top_k, "search_type": "all"},
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json().get("results", []) or []


def _to_evidence(r: dict[str, Any], snippet_chars: int = SNIPPET_CHARS) -> dict[str, Any]:
    content = (r.get("content") or "").strip()
    snippet = content[:snippet_chars] + ("…" if len(content) > snippet_chars else "")
    return {
        "source_name": r.get("source_name"),
        "score": round(float(r.get("score") or 0.0), 4),
        "snippet": snippet,
    }


@tool
def estimate_insurance_returns_tool(
    product_name: str,
    age: int,
    gender: str,
    sum_insured_rmb: int,
    payment_term_years: int,
    _config: RunnableConfig,
) -> str:
    """Look up rate / cash-value / IRR-related chunks for a product and let the LLM compute returns.

    Use when the user asks about 收益 / 现金价值 / 回报 / IRR for a specific 保险产品 +
    年龄 + 性别 + 保额 + 缴费期。

    Inputs:
      - product_name: Chinese product name, e.g. "汇丰汇佑康宁D款"
      - age: insured age (int)
      - gender: "男" or "女"
      - sum_insured_rmb: 保险金额 in RMB (int)
      - payment_term_years: 缴费年期, e.g. 10 / 20

    Returns JSON: {product, age, gender, sum_insured, payment_term_years,
    evidence: [{source_name, score, snippet}], instruction_to_llm,
    [note], [similar_products]}.

    The tool returns RAW PDF chunks as `evidence` — the LLM must read snippets,
    locate (a) 费率表 cell for (age, gender) → 年缴, (b) 现金价值表 rows for 60/70/80
    岁 → 中性档现金价值, and (c) compute simple IRR ≈ ((cash_value@70 - total_premium)
    / total_premium / years_held). If KB has no relevant chunks, the tool returns
    `similar_products` + `note` instead of fabricating a number."""
    try:
        token = _get_access_token(_config)

        # Multi-query coverage of 费率表 + 现金价值表 + 利益演示 / IRR
        queries = [
            f"{product_name} 费率表 {age}周岁 {gender}",
            f"{product_name} 投保年龄 性别 保险费 千分率",
            f"{product_name} 现金价值表 第10年 第20年 第30年",
            f"{product_name} 现金价值 60岁 70岁 80岁",
            f"{product_name} 利益演示 中档 现金价值",
            f"{product_name} IRR 内部收益率 演示利率",
            f"{product_name} 保险金额 计算公式",
        ]

        evidence: list[dict[str, Any]] = []
        seen: set[str] = set()
        for q in queries:
            try:
                chunks = _kb_search(q, token, top_k=4)
            except Exception:  # noqa: BLE001
                continue
            for c in chunks:
                key = f"{c.get('source_name')}::{c.get('chunk_id') or (c.get('content') or '')[:80]}"
                if key in seen:
                    continue
                seen.add(key)
                evidence.append(_to_evidence(c))

        evidence.sort(key=lambda e: e.get("score") or 0.0, reverse=True)
        evidence = evidence[:TOP_EVIDENCE]

        if not evidence:
            try:
                probe = _kb_search(product_name, token, top_k=8)
            except Exception:  # noqa: BLE001
                probe = []
            similar = sorted({(c.get("source_name") or "").strip() for c in probe if c.get("source_name")})
            return json.dumps(
                {
                    "product": product_name,
                    "age": age,
                    "gender": gender,
                    "sum_insured": sum_insured_rmb,
                    "payment_term_years": payment_term_years,
                    "evidence": [],
                    "similar_products": similar[:10],
                    "note": (
                        "KB 中未检索到与该产品费率/现金价值/利益演示相关的 chunks；"
                        "以上 similar_products 列出可在 KB 中检索到的相关产品文档。"
                        "请确认产品名再重试。所有数字必须来自 KB chunks，工具不会编造。"
                    ),
                },
                ensure_ascii=False,
                indent=2,
            )

        years_held_to_70 = max(1, 70 - age)
        instruction = (
            f"evidence 中含有费率表 / 现金价值表 / 利益演示等 PDF 原文。请按以下步骤计算：\n"
            f"1) 在 snippets 里定位 ({age}岁, {gender}) 对应费率（千分率），按 "
            f"`年缴 ≈ rate × {sum_insured_rmb} / 1000` 估算年缴；"
            f"`总保费 ≈ 年缴 × {payment_term_years}`。\n"
            f"2) 在现金价值表 snippets 里抽取 60/70/80 岁（或第 {60-age}/{70-age}/{80-age} 个保单年度，"
            f"如可达）的现金价值（中性档/中档），不可得的档位标 null。\n"
            f"3) 简化 IRR ≈ ((cash_value@70 - total_premium) / total_premium / {years_held_to_70})；"
            f"若 PDF 直接给了 IRR / 年化收益率，优先使用之。\n"
            f"4) 若某档年龄未在表中精确出现，引用最接近行并标 '~' 或 '约'；不可得就坦白说明。\n"
            f"5) 每个使用的数字都要 cite 对应 evidence 的 source_name。"
        )

        return json.dumps(
            {
                "product": product_name,
                "age": age,
                "gender": gender,
                "sum_insured": sum_insured_rmb,
                "payment_term_years": payment_term_years,
                "evidence": evidence,
                "instruction_to_llm": instruction,
            },
            ensure_ascii=False,
            indent=2,
        )
    except Exception as e:  # noqa: BLE001
        return f"Error estimating insurance returns: {e}"


calculator_tools = [estimate_insurance_returns_tool]

CALCULATOR_PROMPT = (
    "**保险收益计算器 skill** – 当用户询问某保险产品的收益 / 回报 / 现金价值 / IRR (e.g. "
    "\"45 岁男 50 万保额 20 年缴 这款产品收益怎么样？\") 时，调用 estimate_insurance_returns_tool。"
    "Inputs to extract: product_name(产品名), age(年龄), gender(性别), sum_insured_rmb(保额, 元), "
    "payment_term_years(缴费年期). 工具不会预先抽取数字，而是返回 evidence 数组（KB PDF 原始 chunks，"
    "覆盖 费率表 / 现金价值表 / 利益演示 / IRR 段落）。\n"
    "你（LLM）的职责：(1) 在 snippets 中定位 (age, gender) 对应费率，按 `年缴 ≈ rate × 保额 / 1000` "
    "计算年缴与总保费；(2) 抽取 60/70/80 岁 现金价值（中性档），列出 projections；"
    "(3) 简化 IRR ≈ ((cash_value@70 - total_premium) / total_premium / years_held)；"
    "若 PDF 直接给了 IRR/年化收益率，优先采用。"
    "snippet 中如出现 '65岁 80%' / '45岁 男 12.8' 之类组合，即为现金价值因子或费率，请直接采用。"
    "每个使用的数字都要 cite 对应 evidence 的 source_name。"
    "若 evidence 为空 + 工具返回 similar_products，则告诉用户产品未找到，不要编造。"
    "若 evidence 非空但无法精确定位，请用 '约' / '~' 给区间，或诚实说 '未在 PDF 找到精确值'。"
)
