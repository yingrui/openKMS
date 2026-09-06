"""LangGraph skill: guarantee ring (担保圈) detection via fixed Cypher templates.

Credit-risk ontology labels (must match the seeded schema): Company nodes joined by
GUARANTEES relationships. Templates avoid ad-hoc text-to-Cypher for cycle queries,
which LLMs frequently get wrong."""
import json

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..ontology_client import run_cypher
from ..request_context import get_tool_access_token


def _esc(value: str) -> str:
    return (value or "").replace("\\", "\\\\").replace("'", "\\'")


def _dedupe_rings(rows: list) -> list[dict]:
    """Collapse rotations/reversals of the same cycle into one ring."""
    seen: set[frozenset] = set()
    rings = []
    for row in rows:
        companies = row[0] if isinstance(row, (list, tuple)) else row
        if not isinstance(companies, list):
            continue
        members = [c for c in companies if c]
        key = frozenset(members)
        if key in seen:
            continue
        seen.add(key)
        rings.append({"members": sorted(set(members)), "path": members})
    return rings


@tool
def find_guarantee_rings_tool(max_depth: int = 5, _config: RunnableConfig = None) -> str:
    """Detect guarantee rings (担保圈/互保环): cycles of companies connected by GUARANTEES
    relationships in the credit knowledge graph. Use for questions like "有没有担保圈"、
    "互保/连环保风险". max_depth caps the ring size (default 5 companies)."""
    depth = max(2, min(int(max_depth or 5), 6))
    cypher = (
        f"MATCH path=(c:Company)-[:GUARANTEES*2..{depth}]->(c) "
        "WITH [n IN nodes(path) | n.name] AS companies, length(path) AS ring_size "
        "RETURN companies, ring_size ORDER BY ring_size LIMIT 50"
    )
    try:
        token = get_tool_access_token(_config)
        result = run_cypher(token, cypher)
        rings = _dedupe_rings(result.get("rows") or [])
        return json.dumps(
            {
                "cypher": cypher,
                "ring_count": len(rings),
                "rings": rings,
                "note": "每个 ring 的 path 首尾为同一家企业（环闭合）；members 为环内去重成员。",
            },
            ensure_ascii=False,
            indent=2,
        )
    except Exception as e:
        return f"Error detecting guarantee rings: {e}"


@tool
def get_guarantee_network_tool(company_name: str, _config: RunnableConfig = None) -> str:
    """Get the guarantee network around one company: outbound guarantees (对外担保),
    inbound guarantees (为其担保方), and whether the company sits inside a guarantee ring.
    Use for "XX公司的担保关系/担保圈情况". company_name must be the exact company name."""
    if not company_name or not company_name.strip():
        return "Error: company_name is required."
    name = _esc(company_name.strip())
    outbound = (
        f"MATCH (c:Company {{name: '{name}'}})-[g:GUARANTEES]->(b:Company) "
        "RETURN b.name AS guaranteed_company, g.amount_wan AS amount_wan, g.method AS method, "
        "g.contract_no AS contract_no, g.facility_no AS facility_no, g.status AS status LIMIT 50"
    )
    inbound = (
        f"MATCH (a:Company)-[g:GUARANTEES]->(c:Company {{name: '{name}'}}) "
        "RETURN a.name AS guarantor, g.amount_wan AS amount_wan, g.method AS method, "
        "g.contract_no AS contract_no, g.facility_no AS facility_no, g.status AS status LIMIT 50"
    )
    ring = (
        f"MATCH path=(c:Company {{name: '{name}'}})-[:GUARANTEES*2..6]->(c) "
        "RETURN [n IN nodes(path) | n.name] AS ring_members LIMIT 10"
    )
    try:
        token = get_tool_access_token(_config)
        out_rows = run_cypher(token, outbound)
        in_rows = run_cypher(token, inbound)
        ring_rows = run_cypher(token, ring)
        rings = _dedupe_rings(ring_rows.get("rows") or [])
        return json.dumps(
            {
                "company": company_name.strip(),
                "outbound_guarantees": {"columns": out_rows.get("columns"), "rows": out_rows.get("rows")},
                "inbound_guarantees": {"columns": in_rows.get("columns"), "rows": in_rows.get("rows")},
                "in_ring": bool(rings),
                "rings": rings,
            },
            ensure_ascii=False,
            indent=2,
        )
    except Exception as e:
        return f"Error fetching guarantee network: {e}"


guarantee_ring_tools = [find_guarantee_rings_tool, get_guarantee_network_tool]

GUARANTEE_RING_PROMPT = (
    "**Guarantee ring skill (担保圈)** – For questions about 担保圈/互保/连环保/担保关系 "
    "(e.g. \"申澜精密在担保圈里吗\"、\"有哪些互保环\"):\n"
    "- Use **find_guarantee_rings_tool** to list all guarantee rings in the graph.\n"
    "- Use **get_guarantee_network_tool** with the exact company name for one company's inbound/outbound "
    "guarantees and ring membership.\n"
    "Prefer these fixed templates over hand-written cycle Cypher. Cite contract_no / facility_no from the "
    "results as evidence, and cross-check policy limits via KB retrieval when the question involves 制度合规."
)
