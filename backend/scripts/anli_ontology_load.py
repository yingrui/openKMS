"""Turn raw extractions into openKMS instances and links, then index to Neo4j.

Split out of anli_ontology_seed.py so the (slow, paid) extraction step and the (fast,
free) loading step can be re-run independently — loading is where the shaping bugs live,
and re-running it must not mean re-paying for extraction.

Quality gates enforced here come straight from the design guide:
  - 同义词归一 before dedupe, so "肉丛容" and "肉苁蓉" are one node, not two
  - 无孤岛: every ContentAsset must end up with at least one ``explains`` edge
  - 无同向环图: caused_by / intervened_by must stay acyclic
  - AI 出草稿: anything under the confidence threshold goes to a review list, not the graph
"""

from __future__ import annotations

import hashlib
import json
import sys
import urllib.error
import urllib.request
from typing import Any, Callable

API = "http://127.0.0.1:8102"
OUT_DIR = "/Users/mengbai/Documents/anli-corpus/ontology"

# 0.85 rather than 0.6: the model gave 0.9-1.0 to almost everything, so a low bar produced
# an empty review queue and no human-governance step to speak of. At 0.85 the genuinely
# shakier extractions (阳虚 as a mechanism, 蛋白质 as a nutrient) surface for a person to judge.
REVIEW_THRESHOLD = 0.85

# 人工治理：健康关切的 MECE 复核。
#
# 判据：健康关切是客户身上的**问题或现象**，不是解决它的**手段**，也不是期望达到的**目标态**。
# 「情绪管理」「情绪调节」是手段，「情绪压力」才是问题；「体重管理」是手段，「体重超标」才是问题。
# 抽取模型系统性地把手段和目标态当成了关切，这一层必须由人判定，不能靠调 prompt 兜住。
#
# 上位/下位概念（过敏 ⊃ 过敏性鼻炎）同样在这里收敛：openKMS 的对象类型不支持继承，
# 保留两级只会在图里产生语义重叠的兄弟节点。
#
# 原名 -> (规范名, 领域, 理由)
CONCERN_GOVERNANCE: dict[str, tuple[str, str, str]] = {
    "情绪管理": ("情绪压力", "心理健康", "手段而非问题——合并到现象侧的「情绪压力」"),
    "情绪调节": ("情绪压力", "心理健康", "手段而非问题——合并到现象侧的「情绪压力」"),
    "体重管理": ("体重超标", "体重管理", "手段而非问题——改名到现象侧"),
    "减肥": ("体重超标", "体重管理", "手段而非问题——合并到「体重超标」"),
    "代谢健康": ("代谢紊乱", "代谢", "目标态而非问题——语料原文即「代谢紊乱多发」"),
    "骨骼健康": ("骨密度下降", "骨骼健康", "目标态而非问题——改名到现象侧"),
    "饮用水安全": ("饮用水污染", "环境暴露", "目标态而非问题；领域由「基础营养」修正为「环境暴露」"),
    "抗衰老": ("机体衰老", "抗衰", "手段而非问题；「抗衰」是知识域（频道/domain 维度），不应同时是关切实例"),
    "过敏性鼻炎": ("过敏", "免疫健康", "「过敏」的下位表现，本体无继承，收敛到上位概念"),
}

# extraction key -> (object type name, code field, name field)
ENTITY_MAP = {
    "health_concerns": ("HealthConcern", "concern_code", "concern_name"),
    "mechanisms": ("Mechanism", "mechanism_code", "mechanism_name"),
    "nutrients": ("Nutrient", "nutrient_code", "nutrient_name"),
    "products": ("Product", "product_code", "product_name"),
    "evidence": ("EvidenceSource", "evidence_code", "evidence_name"),
    "audience": ("AudienceSegment", "segment_code", "segment_name"),
}

# 证据类型 -> 证据强度. Drives rules R2/R3: only 强 may back an efficacy claim.
STRENGTH = {
    "国家指南": "强",
    "国际认证": "强",
    "学术专著": "强",
    "学术会议": "中",
    "企业研发": "中",
    "专家口播": "弱",
    "个人故事": "弱",
}


def call(token: str, path: str, body: dict | None = None, method: str = "GET") -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        return json.loads(urllib.request.urlopen(req).read() or b"{}")
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} {method} {path}: {e.read()[:300].decode()}", file=sys.stderr)
        raise


def make_code(prefix: str, name: str) -> str:
    """Stable short code from the canonical name, so re-runs reproduce the same ids."""
    return f"{prefix}-{hashlib.sha1(name.encode()).hexdigest()[:8].upper()}"


def resolve_ref(ref: str, candidates: dict[str, dict]) -> str:
    """Match a cross-reference the model wrote onto a name it actually extracted.

    The prompt demands verbatim references, but models paraphrase — "饮用水安全" for
    "饮用水水质不良". Rather than silently dropping the edge, fall back to containment
    and then to the longest shared substring. Anything vaguer than that is dropped: a
    wrong edge is worse than a missing one in a graph people will reason over.
    """
    if not ref:
        return ""
    if ref in candidates:
        return ref
    contained = [c for c in candidates if ref in c or c in ref]
    if len(contained) == 1:
        return contained[0]
    if contained:
        return max(contained, key=len)
    return ""


def channel_axes(token: str) -> dict[str, tuple[str, str]]:
    """Map each piece of content to its (栏目, 专题) from where it sits in the channel tree.

    The brief says content is managed today by 体裁/栏目/专题. Channels carry the latter
    two: the top-level business grouping is the 栏目, the leaf channel is the 专题. Keeping
    both on the instance is what lets the demo show the old model being absorbed rather
    than thrown away — ``genre`` already carries 体裁.
    """
    def collect(channels_path: str, items_path: str, title_key: str) -> dict[str, tuple[str, str]]:
        found: dict[str, tuple[str, str]] = {}

        def walk(nodes: list[dict], column: str) -> None:
            for node in nodes:
                # Children of the root are the 栏目; anything deeper is a 专题 under it.
                col = column or node["name"]
                leaf = node["name"] if column else col
                rows = call(token, f"{items_path}?channel_id={node['id']}&limit=200").get("items", [])
                for row in rows:
                    if row.get("channel_id") == node["id"]:
                        found[row[title_key]] = (col, leaf)
                walk(node.get("children") or [], col)

        for root in call(token, channels_path).get("items", []):
            walk(root.get("children") or [], "")
        return found

    # One CMS item can exist as both an article and a video. The article tree is the
    # business taxonomy (健康解决方案 / ABO展业 / …) while the media tree only cuts by
    # production format, so articles win and media fills the gaps.
    axes = collect("/api/article-channels", "/api/articles", "name")
    for title, pair in collect("/api/media-channels", "/api/media", "title").items():
        axes.setdefault(title, pair)
    return axes


def load_into_openkms(
    token: str,
    type_ids: dict[str, str],
    extractions: list[dict],
    glossary: dict[str, str],
    normalise: Callable[[str, dict], str],
    find_segment_ms: Callable[[str, list], int | None],
) -> int:
    # ---------- collect + normalise + dedupe ----------
    entities: dict[str, dict[str, dict]] = {k: {} for k in ENTITY_MAP}
    content_rows: dict[str, dict] = {}
    edges: list[tuple[str, str, str, str, str]] = []  # (link, srcType, srcName, dstType, dstName)
    pending: list[tuple[str, str, str, dict]] = []  # (cms, type, name, raw) for pass two
    review: list[dict] = []
    governance_log: list[dict] = []

    axes = channel_axes(token)

    for ex in extractions:
        item, out = ex["item"], ex["out"]
        cms = item["cms_id"]
        column, topic = axes.get(item["title"], ("", ""))
        content_rows[cms] = {
            "cms_id": cms,
            "title": item["title"],
            "genre": item["genre"],
            "carrier": item["carrier"],
            "column": column,
            "topic": topic,
            "is_mock": False,
            "compliance_status": "待评估",
            "_source_type": item["source_type"],
            "_source_id": item["source_id"],
        }

        for key, (type_name, code_f, name_f) in ENTITY_MAP.items():
            for raw in out.get(key) or []:
                name = normalise(raw.get("name", ""), glossary)
                if not name:
                    continue
                if type_name == "HealthConcern" and name in CONCERN_GOVERNANCE:
                    canonical, domain, reason = CONCERN_GOVERNANCE[name]
                    governance_log.append(
                        {"from": name, "to": canonical, "domain": domain,
                         "reason": reason, "cms_id": cms, "title": item["title"]}
                    )
                    raw = {**raw, "domain": domain}
                    name = canonical
                conf = float(raw.get("confidence") or 0)
                if conf < REVIEW_THRESHOLD:
                    review.append(
                        {"cms_id": cms, "title": item["title"], "type": type_name,
                         "name": name, "confidence": conf, "raw": raw}
                    )
                    continue

                seg_ms = find_segment_ms(name, item["segments"])
                data = {
                    code_f: make_code(type_name[:3].upper(), name),
                    name_f: name,
                    "_source_type": item["source_type"],
                    "_source_id": item["source_id"],
                    "_confidence": conf,
                }
                if seg_ms is not None:
                    data["_source_segment_ms"] = seg_ms

                if type_name == "HealthConcern":
                    data.update(domain=raw.get("domain", ""), aliases=raw.get("aliases", ""))
                elif type_name == "Mechanism":
                    data.update(
                        plain_explanation=raw.get("plain", ""),
                        scientific_explanation=raw.get("scientific", ""),
                    )
                elif type_name == "Nutrient":
                    data.update(
                        category=raw.get("category", ""), natural_source=raw.get("natural_source", "")
                    )
                elif type_name == "Product":
                    data.update(brand_line=raw.get("brand_line", ""))
                elif type_name == "EvidenceSource":
                    etype = raw.get("evidence_type", "专家口播")
                    data.update(
                        evidence_type=etype,
                        evidence_strength=STRENGTH.get(etype, "弱"),
                        issuer=raw.get("issuer", ""),
                        year=str(raw.get("year", "")),
                    )
                elif type_name == "AudienceSegment":
                    data.update(dimension=raw.get("dimension", ""))

                # First sighting wins; later ones only contribute edges. Keeps one node
                # per concept while preserving the provenance of where we first saw it.
                entities[key].setdefault(name, data)
                # Cross-references are resolved in a second pass, once every entity in
                # the corpus is known — a mechanism may point at a concern that only
                # gets extracted from a later article.
                pending.append((cms, type_name, name, raw))

    # ---------- second pass: resolve cross-references into edges ----------
    for cms, type_name, name, raw in pending:
        if type_name == "HealthConcern":
            edges.append(("explains", "ContentAsset", cms, "HealthConcern", name))
        elif type_name == "EvidenceSource":
            edges.append(("cites", "ContentAsset", cms, "EvidenceSource", name))
        elif type_name == "Mechanism":
            ref = normalise(raw.get("for_concern", ""), glossary)
            ref = CONCERN_GOVERNANCE.get(ref, (ref,))[0]
            tgt = resolve_ref(ref, entities["health_concerns"])
            if tgt:
                edges.append(("caused_by", "HealthConcern", tgt, "Mechanism", name))
        elif type_name == "Nutrient":
            mech = resolve_ref(normalise(raw.get("intervenes_mechanism", ""), glossary), entities["mechanisms"])
            if mech:
                edges.append(("intervened_by", "Mechanism", mech, "Nutrient", name))
        elif type_name == "Product":
            nut = resolve_ref(normalise(raw.get("contains_nutrient", ""), glossary), entities["nutrients"])
            if nut:
                edges.append(("contained_in", "Nutrient", nut, "Product", name))
        elif type_name == "AudienceSegment":
            ref = normalise(raw.get("for_concern", ""), glossary)
            ref = CONCERN_GOVERNANCE.get(ref, (ref,))[0]
            conc = resolve_ref(ref, entities["health_concerns"])
            if conc:
                edges.append(("targets", "HealthConcern", conc, "AudienceSegment", name))

    if governance_log:
        print("\n=== 人工治理：健康关切 MECE 复核 ===")
        seen_rules = set()
        for g in governance_log:
            rule = (g["from"], g["to"])
            if rule in seen_rules:
                continue
            seen_rules.add(rule)
            print(f"  {g['from']:<10} → {g['to']:<10} {g['reason']}")

    print("\n=== 归一去重后 ===")
    print(f"  ContentAsset      {len(content_rows)}")
    for key, (type_name, *_rest) in ENTITY_MAP.items():
        print(f"  {type_name:<17} {len(entities[key])}")
    print(f"  候选关系          {len(edges)}")
    print(f"  低置信待复核      {len(review)}")

    # ---------- POST instances ----------
    print("\n=== 写入实例 ===")
    inst: dict[tuple[str, str], str] = {}  # (type name, business name) -> instance uuid

    for cms, data in content_rows.items():
        row = call(token, f"/api/object-types/{type_ids['ContentAsset']}/objects", {"data": data}, "POST")
        inst[("ContentAsset", cms)] = row["id"]
    print(f"  ContentAsset      {len(content_rows)}")

    for key, (type_name, *_rest) in ENTITY_MAP.items():
        for name, data in entities[key].items():
            row = call(token, f"/api/object-types/{type_ids[type_name]}/objects", {"data": data}, "POST")
            inst[(type_name, name)] = row["id"]
        print(f"  {type_name:<17} {len(entities[key])}")

    # ---------- POST links ----------
    link_types = {lt["name"]: lt["id"] for lt in call(token, "/api/link-types").get("items", [])}
    print("\n=== 写入关系 ===")
    made: set[tuple[str, str, str]] = set()
    dropped: list[tuple] = []
    per_link: dict[str, int] = {}
    for link_name, src_t, src_n, dst_t, dst_n in edges:
        src = inst.get((src_t, src_n))
        dst = inst.get((dst_t, dst_n))
        if not src or not dst:
            # The model referenced something it did not also extract as an entity.
            dropped.append((link_name, src_t, src_n, dst_t, dst_n))
            continue
        if (link_name, src, dst) in made:
            continue
        call(
            token,
            f"/api/link-types/{link_types[link_name]}/links",
            {"source_object_id": src, "target_object_id": dst},
            "POST",
        )
        made.add((link_name, src, dst))
        per_link[link_name] = per_link.get(link_name, 0) + 1
    for name, count in per_link.items():
        print(f"  {name:<17} {count}")
    if dropped:
        print(f"  悬空引用已丢弃    {len(dropped)}（端点未被抽为实例）")

    # ---------- quality gates ----------
    print("\n=== 质量校验 ===")
    ok = True

    orphans = [
        cms for cms in content_rows
        if not any(ln == "explains" and s == inst[("ContentAsset", cms)] for ln, s, _ in made)
    ]
    print(f"  无孤岛（内容资产至少 1 条 explains）: {'通过' if not orphans else f'失败 {orphans}'}")
    ok &= not orphans

    codes: dict[str, set] = {}
    dup = []
    for key, (type_name, code_f, _n) in ENTITY_MAP.items():
        seen = set()
        for data in entities[key].values():
            if data[code_f] in seen:
                dup.append(data[code_f])
            seen.add(data[code_f])
        codes[type_name] = seen
    print(f"  唯一标识无重复: {'通过' if not dup else f'失败 {dup}'}")
    ok &= not dup

    adj: dict[str, set[str]] = {}
    for ln, s, d in made:
        if ln in ("caused_by", "intervened_by"):
            adj.setdefault(s, set()).add(d)
    cyclic = _has_cycle(adj)
    print(f"  caused_by/intervened_by 无环: {'通过' if not cyclic else '失败'}")
    ok &= not cyclic

    with open(f"{OUT_DIR}/review_queue.json", "w") as f:
        json.dump(review, f, ensure_ascii=False, indent=2)
    print(f"\n低置信待复核清单（{len(review)} 条）→ {OUT_DIR}/review_queue.json")
    with open(f"{OUT_DIR}/governance_log.json", "w") as f:
        json.dump(governance_log, f, ensure_ascii=False, indent=2)
    print(f"人工治理台账（{len(governance_log)} 条改写）→ {OUT_DIR}/governance_log.json")

    # ---------- index to Neo4j (object types first — links MERGE onto their keys) ----------
    ds = call(token, "/api/data-sources")
    ds_items = ds.get("items", ds) if isinstance(ds, dict) else ds
    neo = next((d for d in ds_items if d.get("kind") == "neo4j"), None)
    if not neo:
        print("\n没有 neo4j 数据源，跳过索引", file=sys.stderr)
        return 0 if ok else 1

    print("\n=== 索引到 Neo4j ===")
    r1 = call(token, "/api/object-types/index-to-neo4j", {"neo4j_data_source_id": neo["id"]}, "POST")
    print(f"  节点 {r1}")
    r2 = call(token, "/api/link-types/index-to-neo4j", {"neo4j_data_source_id": neo["id"]}, "POST")
    print(f"  关系 {r2}")

    return 0 if ok else 1


def _has_cycle(adj: dict[str, set[str]]) -> bool:
    WHITE, GREY, BLACK = 0, 1, 2
    colour: dict[str, int] = {}

    def visit(node: str) -> bool:
        colour[node] = GREY
        for nxt in adj.get(node, ()):
            c = colour.get(nxt, WHITE)
            if c == GREY:
                return True
            if c == WHITE and visit(nxt):
                return True
        colour[node] = BLACK
        return False

    return any(colour.get(n, WHITE) == WHITE and visit(n) for n in list(adj))
