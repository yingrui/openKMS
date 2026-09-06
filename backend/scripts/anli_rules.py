"""Promote the compliance rules from script constants to governed graph objects.

Before this, R1/R2/R3 lived only inside the compliance-check skill — you could run them
but not see them, version them, or ask the graph what a rule had flagged. That is the gap
OSL's 规则工作台 fills: a rule is a first-class object with a detail view, an output, and
a governance state.

This mirrors that within openKMS's model (which has no rule engine of its own):

  - BizRule object type — each rule's three elements (触发机制 / 判定条件 / 结论方向, per the
    design guide) plus governance fields (status, version, approver, basis quote).
  - `flags` link BizRule → ContentAsset — the rule's OUTPUT, materialised as edges. "Which
    content did R1 flag?" becomes a graph traversal instead of re-running a script.

The verdict is still computed by the same logic as the skill — openKMS has no inference
engine and this does not pretend to be one. What changes is that the rule and its output
are now visible and governable in the graph, which is what "可维护、可审核" asks for.

Usage (from backend/):  .venv/bin/python scripts/anli_rules.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

API = "http://127.0.0.1:8102"
SCRATCH = (
    "/private/tmp/claude-501/-Users-mengbai-Documents-openKMS/"
    "8a2c1843-51fd-4598-991a-dffdcdf06577/scratchpad"
)

BIZRULE_TYPE = {
    "name": "BizRule",
    "description": "业务规则：内容合规判定规则，作为可治理的本体对象。"
    "｜ 适用边界：只表达「触发→条件→结论」的判定逻辑，评估由平台执行；本对象承载规则的定义、"
    "版本与审批状态，对应本体设计指南第四步「规则与动作」。",
    "key_property": "rule_code",
    "display_property": "rule_name",
    "is_master_data": False,
    "properties": [
        {"name": "rule_code", "type": "string", "required": True},
        {"name": "rule_name", "type": "string", "required": True},
        # 规则三要素（指南：缺了触发机制的规则不是完整的规则）
        {"name": "trigger", "type": "string", "required": True},
        {"name": "condition", "type": "string", "required": True},
        {"name": "conclusion", "type": "string", "required": True},
        # 治理字段（参考 OSL 规则工作台：状态 / 版本 / 审批）
        {"name": "status", "type": "string", "required": True},
        {"name": "version", "type": "string", "required": True},
        {"name": "approved_by", "type": "string", "required": False},
        {"name": "basis", "type": "string", "required": False},
    ],
}

# rule_code, name, trigger, condition, conclusion, status, version, basis
RULES = [
    ("R1", "无据声称合规校验",
     "事件驱动：内容资产实例装载或变更时",
     "内容 explains 某健康关切，且 cites 证据来源数 = 0",
     "标记「待合规复核」，不得进入 ABO 可推荐池",
     "published", "1.0",
     "本体设计指南第四步·规则三要素；内容合规红线"),
    ("R2", "强证据分级",
     "事件驱动：内容与证据来源建立 cites 关系时",
     "证据类型 ∈ {国家指南, 国际认证, 学术专著}",
     "标记「强证据」，可作为功效依据",
     "published", "1.0",
     "证据强度分级；直销行业功效声称合规要求"),
    ("R3", "弱证据限用",
     "事件驱动：内容与证据来源建立 cites 关系时",
     "内容引用的证据全部 ∈ {专家口播, 个人故事}",
     "标记「仅供参考」，不得作为功效依据对外表述",
     "published", "1.0",
     "证据强度分级；直销行业功效声称合规要求"),
]

FLAGS_LINK = {
    "name": "flags",
    "description": "命中：业务规则判定命中的内容资产（规则的输出，物化为图谱边）",
    "source": "BizRule",
    "target": "ContentAsset",
    "cardinality": "many-to-many",
}


def call(token: str, path: str, body: dict | None = None, method: str = "GET"):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API}{path}", data=data, method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        raw = urllib.request.urlopen(req).read()
        return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} {method} {path}: {e.read()[:300].decode()}", file=sys.stderr)
        raise


def cypher(token: str, query: str) -> list[dict]:
    return call(token, "/api/ontology/explore", {"cypher": query}, "POST").get("rows", [])


def assess(evidence: list[str], strengths: list[str]) -> str | None:
    """Same verdict logic as the compliance skill. Returns the rule_code that flags this
    content for review, or None when it is clear."""
    evidence = [e for e in evidence if e]
    strengths = [s for s in strengths if s]
    if not evidence:
        return "R1"
    if "强" in strengths:
        return None  # R2: cleared
    return "R3"  # only 中/弱 evidence


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    token = open(f"{SCRATCH}/anli.jwt").read().strip()
    type_ids = json.load(open(f"{SCRATCH}/anli_type_ids.json"))

    # ---- object type + link type ----
    existing = {o["name"]: o["id"] for o in call(token, "/api/object-types").get("items", [])}
    if "BizRule" in existing:
        rule_type_id = existing["BizRule"]
        print(f"复用已有 BizRule 对象类型 {rule_type_id}")
    elif args.dry_run:
        rule_type_id = "dry-bizrule"
    else:
        rule_type_id = call(token, "/api/object-types", BIZRULE_TYPE, "POST")["id"]
        print(f"新建 BizRule 对象类型 {rule_type_id}")
    type_ids["BizRule"] = rule_type_id

    link_names = {lt["name"] for lt in call(token, "/api/link-types").get("items", [])}
    if "flags" not in link_names and not args.dry_run:
        call(token, "/api/link-types", {
            "name": FLAGS_LINK["name"], "description": FLAGS_LINK["description"],
            "source_object_type_id": type_ids["BizRule"],
            "target_object_type_id": type_ids["ContentAsset"],
            "cardinality": FLAGS_LINK["cardinality"],
        }, "POST")
        print("新建 flags 关系类型")

    # ---- rule instances ----
    print("\n=== 规则对象 ===")
    rule_inst: dict[str, str] = {}
    existing_rules = {}
    if not args.dry_run:
        for r in call(token, f"/api/object-types/{rule_type_id}/objects?limit=100").get("items", []):
            # data["id"] is the Postgres UUID; the top-level id is the Neo4j MERGE key.
            existing_rules[r["data"].get("rule_code")] = r["data"].get("id") or r["id"]
    for code, name, trig, cond, concl, status, ver, basis in RULES:
        data = {"rule_code": code, "rule_name": name, "trigger": trig, "condition": cond,
                "conclusion": concl, "status": status, "version": ver,
                "approved_by": "内容合规岗", "basis": basis}
        print(f"  {code}  {name}  [{status} v{ver}]")
        if args.dry_run:
            continue
        if code in existing_rules:
            rid = existing_rules[code]
            call(token, f"/api/object-types/{rule_type_id}/objects/{rid}", {"data": data}, "PUT")
            rule_inst[code] = rid
        else:
            rule_inst[code] = call(token, f"/api/object-types/{rule_type_id}/objects", {"data": data}, "POST")["id"]

    # ---- evaluate + materialise flags ----
    print("\n=== 规则评估（物化为 flags 边）===")
    audit = cypher(token, """
        MATCH (c:ContentAsset)-[:explains]->(h:HealthConcern)
        OPTIONAL MATCH (c)-[:cites]->(e:EvidenceSource)
        RETURN c.cms_id AS cms_id, c.title AS title, elementId(c) AS eid,
               collect(DISTINCT e.evidence_name) AS evidence,
               collect(DISTINCT e.evidence_strength) AS strengths
    """)
    verdicts: dict[str, list[str]] = {"R1": [], "R2": [], "R3": []}
    content_id_by_cms: dict[str, str] = {}
    for row in audit:
        code = assess(row["evidence"], row["strengths"])
        verdicts.setdefault(code or "R2", []).append(row["title"])
    for code in ("R1", "R2", "R3"):
        flagged = verdicts.get(code, [])
        tag = {"R1": "🔴 高风险", "R2": "🟢 通过", "R3": "🟡 弱证据"}[code]
        print(f"  {code} {tag}: {len(flagged)} 条")
        for t in flagged:
            print(f"       - {t[:34]}")

    if args.dry_run:
        print("\n--dry-run：未写入实例与边")
        return 0

    # Build flags edges for the rules that flag content for review (R1, R3).
    # Look up ContentAsset instance ids by cms_id.
    ca_rows = cypher(token, "MATCH (c:ContentAsset) RETURN c.cms_id AS cms_id, c.title AS title")
    title_to_cms = {r["title"]: r["cms_id"] for r in ca_rows}
    # Link creation resolves instances in Postgres, so the edge needs the Postgres UUID.
    # On the Neo4j read path the top-level ``id`` is the MERGE key (cms_id); the real UUID
    # is in ``data["id"]``. Using the top-level id would fail the Postgres lookup.
    ca_inst = {r["data"].get("cms_id"): r["data"].get("id")
               for r in call(token, f"/api/object-types/{type_ids['ContentAsset']}/objects?limit=100").get("items", [])}
    link_types = {lt["name"]: lt["id"] for lt in call(token, "/api/link-types").get("items", [])}

    made = 0
    for code in ("R1", "R3"):
        for title in verdicts.get(code, []):
            cms = title_to_cms.get(title)
            ca_id = ca_inst.get(cms)
            if not ca_id or code not in rule_inst:
                continue
            try:
                call(token, f"/api/link-types/{link_types['flags']}/links",
                     {"source_object_id": rule_inst[code], "target_object_id": ca_id}, "POST")
                made += 1
            except urllib.error.HTTPError:
                pass  # link may already exist from a prior run
    print(f"\n物化 flags 边 {made} 条")

    # ---- index to Neo4j (object types first, then links) ----
    ds = next((d for d in call(token, "/api/data-sources").get("items", []) if d["kind"] == "neo4j"), None)
    if ds:
        call(token, "/api/object-types/index-to-neo4j", {"neo4j_data_source_id": ds["id"]}, "POST")
        call(token, "/api/link-types/index-to-neo4j", {"neo4j_data_source_id": ds["id"]}, "POST")
        print("已重新索引到 Neo4j")

    json.dump(type_ids, open(f"{SCRATCH}/anli_type_ids.json", "w"), ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
