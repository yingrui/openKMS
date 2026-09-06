"""LangGraph skill: group credit exposure summary (集团客户统一授信敞口).

Walks the ownership/control cluster around a company (HOLDS_EQUITY / PERSON_HOLDS /
OFFICER_OF / RELATIVE_OF), then aggregates BORROWS -> CreditFacility amounts and
compares against the group unified credit limit."""
import json
import os

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..ontology_client import run_cypher
from ..request_context import get_tool_access_token

DEFAULT_GROUP_LIMIT_WAN = float(os.getenv("OPENKMS_GROUP_CREDIT_LIMIT_WAN", "45000"))


def _esc(value: str) -> str:
    return (value or "").replace("\\", "\\\\").replace("'", "\\'")


@tool
def summarize_group_exposure_tool(company_name: str, _config: RunnableConfig = None) -> str:
    """Aggregate group-wide credit exposure (集团合并授信敞口) for the group that contains the
    given company: finds group member companies via equity/control/kinship links, sums their
    credit facilities (存量+申请, 我行+他行), and compares to the group unified credit limit.
    Use for "集团敞口多少"、"是否超过统一授信限额"、"再放这笔会不会超限"."""
    if not company_name or not company_name.strip():
        return "Error: company_name is required."
    name = _esc(company_name.strip())
    members_cypher = (
        f"MATCH (c:Company {{name: '{name}'}}) "
        "OPTIONAL MATCH (c)-[:HOLDS_EQUITY|PERSON_HOLDS|OFFICER_OF|RELATIVE_OF*1..5]-(m:Company) "
        "WITH c, collect(DISTINCT m.name) AS ms "
        "WITH ms + [c.name] AS names "
        "UNWIND names AS member RETURN DISTINCT member LIMIT 100"
    )
    try:
        token = get_tool_access_token(_config)
        member_rows = run_cypher(token, members_cypher).get("rows") or []
        members = sorted({r[0] for r in member_rows if r and r[0]})
        if not members:
            return json.dumps({"error": f"未找到企业 {company_name} 或其集团成员"}, ensure_ascii=False)
        quoted = ", ".join(f"'{_esc(m)}'" for m in members)
        facilities_cypher = (
            f"MATCH (m:Company)-[:BORROWS]->(f:CreditFacility) WHERE m.name IN [{quoted}] "
            "RETURN m.name AS borrower, f.facility_no AS facility_no, f.kind AS kind, "
            "f.amount_wan AS amount_wan, f.lender AS lender, f.is_our_bank AS is_our_bank, "
            "f.status AS status, f.classification AS classification ORDER BY f.amount_wan DESC LIMIT 100"
        )
        fac = run_cypher(token, facilities_cypher)
        cols = fac.get("columns") or []
        rows = fac.get("rows") or []
        idx = {c: i for i, c in enumerate(cols)}

        def _num(v):
            try:
                return float(v)
            except (TypeError, ValueError):
                return 0.0

        def _sum(pred):
            return sum(_num(r[idx["amount_wan"]]) for r in rows if pred(r))

        def _truthy(v):
            return str(v).strip().lower() in {"true", "1", "yes", "是"}

        our_existing = _sum(lambda r: _truthy(r[idx["is_our_bank"]]) and r[idx["status"]] == "存量")
        other_existing = _sum(lambda r: not _truthy(r[idx["is_our_bank"]]) and r[idx["status"]] == "存量")
        pending = _sum(lambda r: r[idx["status"]] == "申请")
        total = our_existing + other_existing + pending
        limit = DEFAULT_GROUP_LIMIT_WAN
        return json.dumps(
            {
                "group_members": members,
                "facilities": {"columns": cols, "rows": rows},
                "summary_wan": {
                    "our_bank_existing": our_existing,
                    "other_banks_existing": other_existing,
                    "pending_application": pending,
                    "group_total": total,
                    "group_unified_credit_limit": limit,
                    "over_limit": max(0.0, total - limit),
                    "exceeds_limit": total > limit,
                },
                "note": "限额来自《集团客户统一授信管理办法》(可通过 KB 检索原文条款印证)；金额单位万元。",
            },
            ensure_ascii=False,
            indent=2,
        )
    except Exception as e:
        return f"Error summarizing group exposure: {e}"


risk_exposure_tools = [summarize_group_exposure_tool]

RISK_EXPOSURE_PROMPT = (
    "**Group exposure skill (集团敞口)** – For questions about 集团授信敞口/统一授信限额/超限 "
    "(e.g. \"申澜集团总敞口多少\"、\"本笔8000万批了会不会超统一授信限额\"):\n"
    "- Call **summarize_group_exposure_tool** with any group member company's exact name.\n"
    "- The tool returns member list, every facility with lender/status, and a summary with "
    "exceeds_limit. When answering compliance questions, ALSO retrieve the policy clause "
    "(《集团客户统一授信管理办法》) from the KB and cite both the numbers and the clause."
)
