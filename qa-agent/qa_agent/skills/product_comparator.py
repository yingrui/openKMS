"""LangGraph skill: 产品横向对比 (Multi-product comparison matrix).

For each (product, dimension) cell the tool returns the most relevant raw KB
chunks as `evidence`. The **LLM** then reads the snippets and builds the final
markdown comparison table itself. The tool no longer pre-extracts a single
"value" — PDF clauses routinely span chunk boundaries, and a single chunk's
top-1 result is often not the most informative span. Surfacing multiple
chunks per cell lets the LLM pick the right phrasing.

Honest-numbers / honest-clauses guarantee: if a product has zero KB chunks for
a dimension, that cell's `evidence` is empty and the tool surfaces the
missing-product list via `note`.
"""
from __future__ import annotations

import json
from typing import Any

import httpx
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..config import settings

DEFAULT_KB_ID = "b1af9d71-092d-40fb-89b1-9fa5388f71fa"

# (dimension display name, KB query seed)
DIMENSIONS: list[tuple[str, str]] = [
    ("投保年龄/保险期间", "投保年龄 保险期间"),
    ("等待期", "等待期"),
    ("保障责任/保险金给付", "保障责任 保险金给付 保险责任"),
    ("责任免除", "责任免除"),
    ("现金价值/减保规则", "现金价值 减保 退保"),
]

MAX_PRODUCTS = 4
SNIPPET_CHARS = 360
TOP_EVIDENCE_PER_CELL = 2


def _get_access_token(config: RunnableConfig) -> str:
    return config.get("configurable", {}).get("access_token", "")


def _kb_search(query: str, access_token: str, top_k: int = 3, kb_id: str = DEFAULT_KB_ID) -> list[dict[str, Any]]:
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


def _excerpt(text: str | None, max_chars: int = SNIPPET_CHARS) -> str:
    if not text:
        return ""
    t = text.strip().replace("\n", " ")
    return t[:max_chars] + ("…" if len(t) > max_chars else "")


def _to_evidence(r: dict[str, Any], snippet_chars: int = SNIPPET_CHARS) -> dict[str, Any]:
    return {
        "source_name": r.get("source_name"),
        "score": round(float(r.get("score") or 0.0), 4),
        "snippet": _excerpt(r.get("content"), snippet_chars),
    }


@tool
def compare_products_tool(
    product_names: list[str],
    _config: RunnableConfig,
) -> str:
    """Gather per-(product, dimension) KB chunks for side-by-side product comparison.

    Use when the user asks "对比 / 比较 / 横向对比 these products" 或者列出多款产品要看异同 (最多 4 款)。

    Inputs:
      - product_names: list of Chinese product names, max 4 (extras ignored)

    Returns JSON: {products, cells: [{product, dimension, evidence: [{source_name, score, snippet}]}],
    instruction_to_llm, [note]}.

    The tool returns RAW KB chunks per (product, dimension) cell; the LLM must
    read snippets and build the final markdown comparison table itself, citing
    source_name for every value. If a product cannot be located in the KB at
    all, its cells will have `evidence: []` and `note` lists the missing
    products."""
    try:
        if not product_names:
            return "Error: product_names must be a non-empty list."
        names = [n.strip() for n in product_names if isinstance(n, str) and n.strip()]
        if not names:
            return "Error: product_names contained no usable strings."
        if len(names) > MAX_PRODUCTS:
            names = names[:MAX_PRODUCTS]

        token = _get_access_token(_config)

        # Probe each product to see if KB has anything on it.
        product_found: dict[str, bool] = {}
        for name in names:
            try:
                probe = _kb_search(name, token, top_k=2)
            except Exception:  # noqa: BLE001
                probe = []
            product_found[name] = bool(probe)

        # Build (product, dimension) cells with raw chunk evidence.
        cells: list[dict[str, Any]] = []
        for product in names:
            for dim_name, dim_query_seed in DIMENSIONS:
                if not product_found.get(product):
                    cells.append(
                        {
                            "product": product,
                            "dimension": dim_name,
                            "evidence": [],
                            "note": "产品在 KB 中未找到相关内容",
                        }
                    )
                    continue
                q = f"{product} {dim_query_seed}"
                try:
                    chunks = _kb_search(q, token, top_k=TOP_EVIDENCE_PER_CELL)
                except Exception:  # noqa: BLE001
                    chunks = []

                # Dedupe by source_name + chunk_id (or content prefix).
                seen: set[str] = set()
                ev: list[dict[str, Any]] = []
                for c in chunks:
                    key = f"{c.get('source_name')}::{c.get('chunk_id') or (c.get('content') or '')[:80]}"
                    if key in seen:
                        continue
                    seen.add(key)
                    ev.append(_to_evidence(c))
                ev.sort(key=lambda e: e.get("score") or 0.0, reverse=True)
                ev = ev[:TOP_EVIDENCE_PER_CELL]

                cell: dict[str, Any] = {
                    "product": product,
                    "dimension": dim_name,
                    "evidence": ev,
                }
                if not ev:
                    cell["note"] = f"未检索到 {dim_name} 相关 chunk"
                cells.append(cell)

        missing = [p for p, ok in product_found.items() if not ok]

        instruction = (
            "请基于 cells 中的 evidence snippets 自行抽取每个 (product, dimension) 单元格的"
            "条款原文，构建一个 markdown 横向对比表。每个非空单元格的内容都要 cite 对应"
            " evidence 项的 source_name。若 evidence 为空（含 note）则单元格写 '未在 KB 找到'，"
            "不要编造条款。snippet 较长时，请提取与维度最相关的关键短句（如 '等待期为 90 日'、"
            "'投保年龄 0-65 周岁'），不要原样粘贴整段。"
        )

        result: dict[str, Any] = {
            "products": names,
            "dimensions": [d[0] for d in DIMENSIONS],
            "cells": cells,
            "instruction_to_llm": instruction,
        }
        if len(missing) >= 2:
            result["note"] = (
                f"以下 {len(missing)} 款产品未能在 KB 中找到相关内容: {', '.join(missing)}。"
                f" 请确认产品名是否正确，或在 KB 中确认对应 PDF 已上传。"
            )
        elif missing:
            result["note"] = f"产品 '{missing[0]}' 未能在 KB 中找到相关内容；其余产品已对比。"
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:  # noqa: BLE001
        return f"Error comparing products: {e}"


comparator_tools = [compare_products_tool]

COMPARATOR_PROMPT = (
    "**产品横向对比 skill** – 当用户列出多款产品要求对比 / 比较 / 横向对比时 (最多 4 款)，"
    "调用 compare_products_tool(product_names=[...])。工具会就 投保年龄/保险期间、等待期、"
    "保障责任、责任免除、现金价值/减保规则 五个维度，从 KB 抽取每个 (product, dimension) "
    "单元格的原始 chunks 作为 evidence (而非预先抽取 value)。\n"
    "你（LLM）的职责：阅读每个 cell 的 evidence snippets，自行提炼最贴合该维度的关键条款"
    "（如 '等待期 90 日'、'投保年龄 0-65 周岁'、'第 5 年现金价值 12,345 元'），构建 markdown "
    "横向对比表。每个非空单元格都要 cite 对应 evidence 的 source_name。若 evidence 为空则该格"
    "写 '未在 KB 找到'。绝不编造条款内容。"
    "若 2+ 产品在 KB 中找不到，工具会通过 note 告知，请如实转达给用户。"
)
