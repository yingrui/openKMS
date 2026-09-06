"""LangGraph skill: related-party penetration (关联方穿透).

Traces equity / officer / kinship paths around a company to surface hidden related
parties — e.g. a "third-party" guarantor that penetrates to the actual controller's
relatives."""
import json

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..ontology_client import run_cypher
from ..request_context import get_tool_access_token

_REL_ZH = {
    "HOLDS_EQUITY": "持股",
    "PERSON_HOLDS": "持股",
    "OFFICER_OF": "任职",
    "RELATIVE_OF": "亲属",
}


def _esc(value: str) -> str:
    return (value or "").replace("\\", "\\\\").replace("'", "\\'")


def _format_paths(rows: list) -> list[str]:
    chains: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        names, rels = row[0], row[1]
        if not isinstance(names, list) or not isinstance(rels, list):
            continue
        parts = [str(names[0])]
        for i, rel in enumerate(rels):
            label = _REL_ZH.get(str(rel), str(rel))
            nxt = str(names[i + 1]) if i + 1 < len(names) else "?"
            parts.append(f"-[{label}]-")
            parts.append(nxt)
        chain = "".join(parts)
        if chain not in seen:
            seen.add(chain)
            chains.append(chain)
    return chains


@tool
def trace_related_parties_tool(
    company_a: str, company_b: str = "", max_hops: int = 5, _config: RunnableConfig = None
) -> str:
    """Penetrate related-party relationships (关联方穿透). With only company_a: list all
    companies/persons connected to it via equity/officer/kinship paths. With company_b too:
    show the connection paths between the two companies — use this to test whether a
    "独立第三方" (e.g. a guarantor) is actually a hidden related party. Names must be exact."""
    if not company_a or not company_a.strip():
        return "Error: company_a is required."
    hops = max(1, min(int(max_hops or 5), 6))
    a = _esc(company_a.strip())
    try:
        token = get_tool_access_token(_config)
        if company_b and company_b.strip():
            b = _esc(company_b.strip())
            cypher = (
                f"MATCH path=(a:Company {{name: '{a}'}})"
                f"-[:HOLDS_EQUITY|PERSON_HOLDS|OFFICER_OF|RELATIVE_OF*1..{hops}]-"
                f"(b:Company {{name: '{b}'}}) "
                "RETURN [n IN nodes(path) | n.name] AS path_names, "
                "[r IN relationships(path) | type(r)] AS rel_types, length(path) AS hops "
                "ORDER BY hops LIMIT 20"
            )
            result = run_cypher(token, cypher)
            chains = _format_paths(result.get("rows") or [])
            return json.dumps(
                {
                    "question": f"{company_a.strip()} 与 {company_b.strip()} 是否关联",
                    "related": bool(chains),
                    "penetration_paths": chains,
                    "note": "存在路径即构成关联关系；最短路径最能说明实质控制/影响链条。",
                },
                ensure_ascii=False,
                indent=2,
            )
        cypher = (
            f"MATCH path=(a:Company {{name: '{a}'}})"
            f"-[:HOLDS_EQUITY|PERSON_HOLDS|OFFICER_OF|RELATIVE_OF*1..{hops}]-(x) "
            "WHERE x:Company OR x:Person "
            "RETURN [n IN nodes(path) | n.name] AS path_names, "
            "[r IN relationships(path) | type(r)] AS rel_types, length(path) AS hops "
            "ORDER BY hops LIMIT 100"
        )
        result = run_cypher(token, cypher)
        chains = _format_paths(result.get("rows") or [])
        endpoints = sorted({c.split("-[")[-1].split("]-")[-1] for c in chains} - {company_a.strip()})
        return json.dumps(
            {
                "company": company_a.strip(),
                "related_party_count": len(endpoints),
                "related_parties": endpoints,
                "penetration_paths": chains[:40],
            },
            ensure_ascii=False,
            indent=2,
        )
    except Exception as e:
        return f"Error tracing related parties: {e}"


related_party_tools = [trace_related_parties_tool]

RELATED_PARTY_PROMPT = (
    "**Related-party skill (关联方穿透)** – For questions about 关联方/实际控制人/隐性关联/穿透 "
    "(e.g. \"晖嘉投资和申澜精密有没有关联\"、\"陆振邦能实际影响哪些企业\"):\n"
    "- Two companies: call **trace_related_parties_tool(company_a, company_b)** — returns the "
    "penetration paths (持股/任职/亲属 chains) proving or refuting the relationship.\n"
    "- One company: call it with company_a only to enumerate its related parties.\n"
    "When a guarantor claims to be an independent third party, always verify with this tool and "
    "quote the full penetration path in the answer."
)
