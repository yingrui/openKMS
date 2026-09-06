"""Create the ABO 展业内容助手 scenario ontology in openKMS.

Schema only — no instances. Instance loading lives in anli_ontology_seed.py so a
schema change can be replayed without re-running LLM extraction.

Design rationale and the guide quotes behind each decision are in
/Users/mengbai/Documents/anli-corpus/ontology/design.md.

Two platform constraints shape the shapes below:
  - object_types has no "适用边界" field, so it rides in ``description`` after a
    "｜ 适用边界：" separator (the design doc keeps the full 9-column table).
  - link_instances carry no properties, so 证据强度 is an attribute of
    证据来源 rather than of the ``cites`` edge.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

API = "http://127.0.0.1:8102"
SCRATCH = (
    "/private/tmp/claude-501/-Users-mengbai-Documents-openKMS/"
    "8a2c1843-51fd-4598-991a-dffdcdf06577/scratchpad"
)

# name → (description, key_property, display_property, is_master_data, properties)
# key_property MUST equal one of properties[].name or openKMS silently falls back
# to "id" (backend/app/api/object_types.py:97-106).
OBJECT_TYPES = [
    (
        "ContentAsset",
        "内容资产：CMS 中一条可独立管理的内容，文章/视频/音频/日签等体裁的统称。"
        "｜ 适用边界：仅收内容平台已发布的条目，以 cms_id 为准；不含内部草稿与素材片段。",
        "cms_id",
        "title",
        False,
        [
            {"name": "cms_id", "type": "string", "required": True},
            {"name": "title", "type": "string", "required": True},
            # 体裁 / 栏目 / 专题 are the three axes the CMS manages content by today.
            # Carrying all three onto the knowledge object is what lets the demo show the
            # old model being absorbed rather than discarded.
            {"name": "genre", "type": "string", "required": False},
            {"name": "column", "type": "string", "required": False},
            {"name": "topic", "type": "string", "required": False},
            {"name": "carrier", "type": "string", "required": False},
            {"name": "published_at", "type": "string", "required": False},
            {"name": "compliance_status", "type": "string", "required": False},
            # Demo data for content forms the corpus does not supply is flagged, never mixed.
            {"name": "is_mock", "type": "boolean", "required": False},
        ],
    ),
    (
        "HealthConcern",
        "健康关切：客户主动表达或 ABO 需主动切入的健康诉求切入点，如老花眼、过敏、饮水安全。"
        "｜ 适用边界：面向大健康消费场景的关切；不含疾病诊断与治疗方案。",
        "concern_code",
        "concern_name",
        False,
        [
            {"name": "concern_code", "type": "string", "required": True},
            {"name": "concern_name", "type": "string", "required": True},
            {"name": "domain", "type": "string", "required": False},
            {"name": "aliases", "type": "string", "required": False},
        ],
    ),
    (
        "Mechanism",
        "生理机制：解释健康关切「为什么会发生」的科学链条，是内容可解释性的支点。"
        "｜ 适用边界：只收有科学表述可依据的机制；不收民间说法与未经证实的因果。",
        "mechanism_code",
        "mechanism_name",
        False,
        [
            {"name": "mechanism_code", "type": "string", "required": True},
            {"name": "mechanism_name", "type": "string", "required": True},
            {"name": "plain_explanation", "type": "string", "required": False},
            {"name": "scientific_explanation", "type": "string", "required": False},
        ],
    ),
    (
        "Nutrient",
        "营养成分：植物营养素、维生素、矿物质、草本原料等可干预生理机制的成分。"
        "｜ 适用边界：企业级复用，以神农系统/纽崔莱研发口径为权威；场景侧只挂接不改定义。",
        "nutrient_code",
        "nutrient_name",
        True,
        [
            {"name": "nutrient_code", "type": "string", "required": True},
            {"name": "nutrient_name", "type": "string", "required": True},
            {"name": "category", "type": "string", "required": False},
            {"name": "natural_source", "type": "string", "required": False},
        ],
    ),
    (
        "Product",
        "产品：安利在售商品的标准描述，跨研发、营销、服务、体验馆共享。"
        "｜ 适用边界：企业级主数据，以产品编码为唯一标识；场景侧只关联，不复制、不改名。",
        "product_code",
        "product_name",
        True,
        [
            {"name": "product_code", "type": "string", "required": True},
            {"name": "product_name", "type": "string", "required": True},
            {"name": "brand_line", "type": "string", "required": False},
        ],
    ),
    (
        "EvidenceSource",
        "证据来源：内容中援引的权威依据，如国家膳食指南、国际认证、学术专著、专家口播。"
        "｜ 适用边界：只收内容中真实出现的引用；evidence_strength 决定该依据能否用于功效表述。",
        "evidence_code",
        "evidence_name",
        False,
        [
            {"name": "evidence_code", "type": "string", "required": True},
            {"name": "evidence_name", "type": "string", "required": True},
            {"name": "evidence_type", "type": "string", "required": True},
            {"name": "evidence_strength", "type": "string", "required": True},
            {"name": "issuer", "type": "string", "required": False},
            {"name": "year", "type": "string", "required": False},
        ],
    ),
    (
        "AudienceSegment",
        "人群特征：健康关切所面向的人群抽象，按年龄段、生活方式、生命阶段等维度描述。"
        "｜ 适用边界：只做群体抽象，不建个人、不存姓名与任何个人标识（合规红线）。",
        "segment_code",
        "segment_name",
        False,
        [
            {"name": "segment_code", "type": "string", "required": True},
            {"name": "segment_name", "type": "string", "required": True},
            {"name": "dimension", "type": "string", "required": False},
        ],
    ),
]

# name, description, source, target, cardinality
LINK_TYPES = [
    ("explains", "讲述：一条内容讲了哪些健康关切", "ContentAsset", "HealthConcern", "many-to-many"),
    ("caused_by", "源于：健康关切背后的生理机制", "HealthConcern", "Mechanism", "one-to-many"),
    ("intervened_by", "可干预：机制可被哪些营养成分干预", "Mechanism", "Nutrient", "many-to-many"),
    ("contained_in", "存在于：营养成分存在于哪些产品中", "Nutrient", "Product", "many-to-many"),
    ("cites", "引用：内容援引了哪些权威证据", "ContentAsset", "EvidenceSource", "many-to-many"),
    ("targets", "面向：健康关切面向哪些人群特征", "HealthConcern", "AudienceSegment", "many-to-many"),
]


def call(token: str, path: str, body: dict | None = None, method: str = "GET"):
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
        print(f"  HTTP {e.code} on {method} {path}: {e.read()[:300].decode()}", file=sys.stderr)
        raise


def main() -> None:
    token = open(f"{SCRATCH}/anli.jwt").read().strip()

    print("=== 对象类型 ===")
    ids: dict[str, str] = {}
    for name, desc, key_prop, display_prop, is_master, props in OBJECT_TYPES:
        row = call(
            token,
            "/api/object-types",
            {
                "name": name,
                "description": desc,
                "key_property": key_prop,
                "display_property": display_prop,
                "is_master_data": is_master,
                "properties": props,
            },
            "POST",
        )
        ids[name] = row["id"]
        flag = " [主数据]" if is_master else ""
        print(f"  {name:<16} key={key_prop:<15} {len(props)} 属性{flag}")

    print("\n=== 关系类型 ===")
    for name, desc, src, dst, card in LINK_TYPES:
        call(
            token,
            "/api/link-types",
            {
                "name": name,
                "description": desc,
                "source_object_type_id": ids[src],
                "target_object_type_id": ids[dst],
                "cardinality": card,
            },
            "POST",
        )
        print(f"  {name:<16} {src} → {dst}  ({card})")

    with open(f"{SCRATCH}/anli_type_ids.json", "w") as f:
        json.dump(ids, f, ensure_ascii=False, indent=2)
    print(f"\n对象类型 {len(ids)} 个、关系类型 {len(LINK_TYPES)} 条已创建")


if __name__ == "__main__":
    main()
