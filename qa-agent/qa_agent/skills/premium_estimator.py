"""LangGraph skill: 保费快速估算 (Quick Annual Premium Estimator).

Returns the most relevant raw KB chunks (rate-table / 现金价值表 / 计算公式)
as `evidence`, and lets the **LLM** do the final number extraction in its
next reasoning step. The tool itself does NOT pre-extract numbers via regex —
PDF rate tables often split numbers and labels across HTML `<td>` chunks, so
strict regex routinely misses real values. Instead we surface the top-scoring
chunks (with enough context) and tell the LLM how to interpret them.

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

# Snippet length tuned to capture full surrounding rate-table context.
SNIPPET_CHARS = 600
TOP_EVIDENCE = 8


def _get_access_token(config: RunnableConfig) -> str:
    return config.get("configurable", {}).get("access_token", "")


def _kb_search(query: str, access_token: str, top_k: int = 5, kb_id: str = DEFAULT_KB_ID) -> list[dict[str, Any]]:
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
def estimate_annual_premium_tool(
    product_name: str,
    age: int,
    gender: str,
    sum_insured_rmb: int,
    _config: RunnableConfig,
) -> str:
    """Look up the rate-table / 保险费 / 现金价值 chunks for a (product, age, gender, 保额) tuple.

    Use when the user asks "这款产品 X 岁 男/女 保额 N 元 一年要交多少钱？" or 类似的快速保费估算问题。
    Inputs:
      - product_name: 产品中文名
      - age: 投保年龄 (int)
      - gender: "男" / "女"
      - sum_insured_rmb: 保额 (元, int)

    Returns JSON: {product, age, gender, sum_insured, evidence: [{source_name, score, snippet}],
    instruction_to_llm, [note], [similar_products]}.

    The tool returns RAW PDF chunks as `evidence` — the LLM must read the
    snippets, locate the cell matching (age, gender), and apply the convention
    `年缴 ≈ rate × 保额 / 1000` (rate 通常为千分率)。If KB has no relevant chunks
    for this product, the tool returns `similar_products` + a `note` instead of
    fabricating a number."""
    try:
        token = _get_access_token(_config)
        # Multiple targeted queries to cover the various phrasings PDF tables use.
        queries = [
            f"{product_name} 费率表 {age}岁 {gender}",
            f"{product_name} 投保年龄 性别 保险费",
            f"{product_name} 千分率 保险费率",
            f"{product_name} {age}周岁 {gender} 年缴保费",
            f"{product_name} 现金价值表 保险金额计算",
        ]

        evidence: list[dict[str, Any]] = []
        seen: set[str] = set()
        for q in queries:
            try:
                chunks = _kb_search(q, token, top_k=5)
            except Exception:  # noqa: BLE001
                continue
            for c in chunks:
                key = f"{c.get('source_name')}::{c.get('chunk_id') or (c.get('content') or '')[:80]}"
                if key in seen:
                    continue
                seen.add(key)
                evidence.append(_to_evidence(c))

        # Sort by score desc and take top N
        evidence.sort(key=lambda e: e.get("score") or 0.0, reverse=True)
        evidence = evidence[:TOP_EVIDENCE]

        if not evidence:
            # Fallback probe: surface similar product names so user can retry.
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
                    "evidence": [],
                    "similar_products": similar[:10],
                    "note": (
                        "KB 中未检索到与该产品费率/保险费/现金价值相关的 chunks；"
                        "以上 similar_products 列出可在 KB 中检索到的相关产品文档。"
                        "请确认产品名再重试。所有数字必须来自 KB chunks，工具不会编造。"
                    ),
                },
                ensure_ascii=False,
                indent=2,
            )

        instruction = (
            f"evidence 中可能含有费率表 / 现金价值表 / 保险金额计算公式。"
            f"请在 snippets 里定位 (年龄={age}, 性别={gender}, 保额={sum_insured_rmb}) 对应的"
            f" 单元格数值（费率通常为千分率），并按公式 `年缴 ≈ rate × 保额 / 1000` 估算年缴；"
            f"月缴 ≈ 年缴 / 12。若 PDF 给出的是直接保费金额而非费率，请直接报该金额。"
            f"若 {age} 岁未在表中精确出现，请引用最接近的两档（例如 {age-5}/{age+5} 岁），"
            f"并以 '约' 或 '~' 形式给出区间，禁止凭空捏造。每个使用的数字都必须 cite "
            f"对应 evidence 项的 source_name。"
        )

        return json.dumps(
            {
                "product": product_name,
                "age": age,
                "gender": gender,
                "sum_insured": sum_insured_rmb,
                "evidence": evidence,
                "payment_modes": ["年缴", "半年缴", "季缴", "月缴"],
                "instruction_to_llm": instruction,
            },
            ensure_ascii=False,
            indent=2,
        )
    except Exception as e:  # noqa: BLE001
        return f"Error estimating annual premium: {e}"


premium_tools = [estimate_annual_premium_tool]

PREMIUM_PROMPT = (
    "**保费快速估算 skill** – 当用户问 \"X 岁 男/女 保额 N 元 一年要交多少钱？\" 之类的快速保费问题时，"
    "调用 estimate_annual_premium_tool. Inputs to extract: product_name, age, gender, sum_insured_rmb. "
    "工具不会预先抽取费率，而是返回 evidence 数组（KB PDF 原始 chunks）。"
    "你（LLM）的职责：阅读每条 snippet，定位与 (age, gender, 保额) 匹配的费率/现金价值/保费单元格；"
    "若 snippet 含 '65岁 80%' / '45岁 男 12.8' 之类组合，那就是费率或现金价值因子，请使用之；"
    "按 `年缴 ≈ rate × 保额 / 1000`（千分率约定）计算，月缴 = 年缴 / 12。"
    "每个使用的数字都要 cite 对应 evidence 的 source_name。"
    "若 evidence 为空且工具返回 similar_products + note，则告诉用户产品未找到，请确认产品名；不要编造数字。"
    "若 evidence 非空但你无法精确定位单元格，请引用最接近的两档年龄并以 '约' / '~' 形式给区间，"
    "或诚实回答 '未在 PDF 找到精确值'，不要瞎猜。"
)
