#!/usr/bin/env python3
"""Seed the demo/shyh Shenlan-group (申澜系) credit-risk ontology.

Single source of truth: /Users/mengbai/Documents/openkms-shyh-demo/shenlan_master_data.xlsx
(override with --xlsx). Creates/updates (idempotent — looked up by name/key before insert):

  - 6 object types  (Company / Person / CreditFacility / Collateral / ListedStock / Lawsuit)
  - 9 link types    (HOLDS_EQUITY / PERSON_HOLDS / OFFICER_OF / RELATIVE_OF / GUARANTEES
                     / BORROWS / PLEDGED_FOR / SELLS_TO / HOLDS_STOCK)
  - object & link instances from the workbook (G-06 guarantee is intentionally skipped:
    it is extracted live by the Agent during the demo)
  - a Neo4j data source row (kind=neo4j, credentials Fernet-encrypted per backend convention)
  - MERGEs everything into Neo4j, reusing the exact label/MERGE-key behavior of the UI
    "Index to Neo4j" button (app.api.object_types / app.api.link_types helpers), plus
    relationship properties (amount_wan, contract_no, ...) which only live in Neo4j because
    link_instances has no data column.

Run from backend/:  .venv/bin/python scripts/demo_shyh_seed.py [--wipe-neo4j]

  --wipe-neo4j   MATCH (n) DETACH DELETE n first, then full rebuild.
  (default)      incremental idempotent MERGE — re-running changes nothing.

Prints a validation summary comparing Postgres counts vs Neo4j node/relationship counts;
exits non-zero on any mismatch.
"""
import argparse
import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from openpyxl import load_workbook
from sqlalchemy import func, select

from app.api.link_types import _neo4j_safe_rel_type
from app.api.object_types import (
    _index_object_type_instances_to_neo4j_session,
    _neo4j_safe_label,
    _resolve_neo4j_id_column_for_row,
)
from app.database import async_session_maker
from app.models.data_source import DataSource
from app.models.link_instance import LinkInstance
from app.models.link_type import LinkType
from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType
from app.services.credentials.credential_encryption import encrypt
from app.services.ontology.neo4j_async import open_neo4j_driver

DEFAULT_XLSX = "/Users/mengbai/Documents/openkms-shyh-demo/shenlan_master_data.xlsx"

NEO4J_DS_NAME = "Neo4j (shyh demo)"
NEO4J_HOST = "localhost"
NEO4J_PORT = 7687
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "openkms-dev-pass"

# Company full name -> short name (for CreditFacility summary)
SHORT_NAMES = {
    "申澜控股集团有限公司": "申澜控股",
    "上海申澜精密制造有限公司": "申澜精密",
    "上海澜庭置业有限公司": "澜庭置业",
    "上海嘉澜供应链管理有限公司": "嘉澜供应链",
    "上海澜芯电子科技有限公司": "澜芯电子",
    "上海晖嘉股权投资合伙企业(有限合伙)": "晖嘉合伙",
    "上海澜庭物业服务有限公司": "澜庭物业",
}


def _p(name: str, type_: str = "string") -> dict:
    return {"name": name, "type": type_, "required": False}


OBJECT_TYPE_SPECS = [
    {
        "name": "Company",
        "description": "企业（虚构申澜系）",
        "key_property": "credit_code",
        "display_property": "name",
        "is_master_data": True,
        "properties": [
            _p("name"), _p("credit_code"), _p("reg_address"), _p("reg_capital_wan", "number"),
            _p("founded"), _p("industry"), _p("legal_rep"), _p("status"), _p("note"),
        ],
    },
    {
        "name": "Person",
        "description": "自然人",
        "key_property": "id_no",
        "display_property": "name",
        "is_master_data": True,
        "properties": [_p("name"), _p("id_no"), _p("gender"), _p("birth_year", "number"), _p("note")],
    },
    {
        "name": "CreditFacility",
        "description": "授信业务",
        "key_property": "facility_no",
        "display_property": "summary",
        "is_master_data": False,
        "properties": [
            _p("facility_no"), _p("summary"), _p("borrower"), _p("kind"),
            _p("amount_wan", "number"), _p("balance_wan", "number"), _p("lender"),
            _p("is_our_bank"), _p("status"), _p("start_date"), _p("end_date"),
            _p("classification"), _p("note"),
        ],
    },
    {
        "name": "Collateral",
        "description": "抵押/质押物",
        "key_property": "cert_no",
        "display_property": "name",
        "is_master_data": False,
        "properties": [
            _p("cert_no"), _p("name"), _p("kind"), _p("owner"), _p("detail"),
            _p("value_or_shares"), _p("rate_or_lines"), _p("note"),
        ],
    },
    {
        "name": "ListedStock",
        "description": "上市公司（真实标的，仅记录持有/依赖关系）",
        "key_property": "ts_code",
        "display_property": "name",
        "is_master_data": False,
        "properties": [_p("ts_code"), _p("name"), _p("industry"), _p("note")],
    },
    {
        "name": "Lawsuit",
        "description": "诉讼案件",
        "key_property": "case_no",
        "display_property": "cause",
        "is_master_data": False,
        "properties": [
            _p("case_no"), _p("cause"), _p("defendant"), _p("plaintiff"), _p("court"),
            _p("amount_wan", "number"), _p("status"), _p("judge_date"),
        ],
    },
    {
        "name": "ApprovalCase",
        "description": "授信审批案件（信审工作流的状态载体：本体不仅支撑问答，也支撑工作流——每笔申请是图上一个可全程追溯的节点）",
        "key_property": "case_no",
        "display_property": "title",
        "is_master_data": False,
        "properties": [
            _p("case_no"), _p("title"), _p("applicant"), _p("facility_no"),
            _p("amount_wan", "number"),
            _p("stage"),          # 受理与尽职调查 / 合规审查 / 授信审议 / 审批决议 / 贷后管理
            _p("stage_status"),   # 进行中 / 已完成 / 已退回
            _p("decision"),       # 通过 / 有条件通过 / 暂缓 / 否决 / 待定
            _p("risk_flags"),     # 命中的风险点摘要（担保圈/超限/穿透/租赁瑕疵/质押破线...）
            _p("owner"),          # 当前环节责任人
            _p("updated_at_note"),
        ],
    },
]

# name (= Neo4j rel type), source type, target type, cardinality, description
LINK_TYPE_SPECS = [
    ("HOLDS_EQUITY", "Company", "Company", "many-to-many", "持股(法人)"),
    ("PERSON_HOLDS", "Person", "Company", "many-to-many", "持股(自然人)"),
    ("OFFICER_OF", "Person", "Company", "many-to-many", "任职"),
    ("RELATIVE_OF", "Person", "Person", "many-to-many", "亲属"),
    ("GUARANTEES", "Company", "Company", "many-to-many", "担保"),
    ("BORROWS", "Company", "CreditFacility", "one-to-many", "借款"),
    ("PLEDGED_FOR", "Collateral", "CreditFacility", "many-to-many", "抵押/质押"),
    ("SELLS_TO", "Company", "ListedStock", "many-to-many", "销售依赖"),
    ("HOLDS_STOCK", "Company", "ListedStock", "many-to-many", "持仓"),
    ("CASE_FOR", "ApprovalCase", "CreditFacility", "one-to-many", "审批案件对应授信业务"),
    ("CASE_APPLICANT", "ApprovalCase", "Company", "many-to-one", "审批案件申请人"),
]

# ApprovalCase instances — the credit-approval workflow lives ON the graph.
# The demo application (CR-2026-0001) starts at stage 1; the Agent workflow advances it.
APPROVAL_CASES = [
    {
        "case_no": "AC-2026-0001",
        "title": "申澜精密 8000万流动资金贷款授信审批",
        "applicant": "上海申澜精密制造有限公司",
        "facility_no": "CR-2026-0001",
        "amount_wan": 8000,
        "stage": "受理与尽职调查",
        "stage_status": "已完成",
        "decision": "待定",
        "risk_flags": "",
        "owner": "客户经理 张伟",
        "updated_at_note": "2026-07-10 受理，材料齐全，进入合规审查",
    },
]

# ListedStock rows are hand-written (real listed companies, not in the workbook)
LISTED_STOCKS = [
    {"ts_code": "600104.SH", "name": "上汽集团", "industry": "汽车整车",
     "note": "申澜控股持1200万股；申澜精密销售依赖68%"},
    {"ts_code": "600019.SH", "name": "宝钢股份", "industry": "钢铁",
     "note": "原材料行情参照"},
]


# --- workbook loading ---

def _sheet_rows(wb, title: str) -> list[dict]:
    """Header row -> list of dicts; skips fully-empty rows; strips strings."""
    ws = wb[title]
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)]
    out = []
    for raw in rows:
        if all(v is None or (isinstance(v, str) and not v.strip()) for v in raw):
            continue
        row = {}
        for k, v in zip(header, raw):
            if isinstance(v, str):
                v = v.strip()
            row[k] = v
        out.append(row)
    return out


def load_workbook_data(xlsx_path: str) -> dict:
    """Read the master workbook into per-type instance rows and link rows."""
    wb = load_workbook(xlsx_path, data_only=True)

    companies = [
        {
            "name": r["企业名称"], "credit_code": r["统一社会信用代码"],
            "reg_address": r["注册地址"], "reg_capital_wan": r["注册资本(万元)"],
            "founded": r["成立日期"], "industry": r["行业"], "legal_rep": r["法定代表人"],
            "status": r["经营状态"], "note": r["备注"],
        }
        for r in _sheet_rows(wb, "企业")
    ]
    persons = [
        {
            "name": r["姓名"], "id_no": r["证件号(脱敏)"], "gender": r["性别"],
            "birth_year": r["出生年份"], "note": r["角色备注"],
        }
        for r in _sheet_rows(wb, "自然人")
    ]
    facilities = [
        {
            "facility_no": r["业务编号"],
            "summary": f"{SHORT_NAMES.get(r['借款人'], r['借款人'])} {r['业务品种']} {r['金额(万元)']}万",
            "borrower": r["借款人"], "kind": r["业务品种"],
            "amount_wan": r["金额(万元)"], "balance_wan": r["余额(万元)"],
            "lender": r["放款机构"], "is_our_bank": r["是否我行"], "status": r["状态"],
            "start_date": r["起始日"], "end_date": r["到期日"],
            "classification": r["五级分类"], "note": r["备注"],
        }
        for r in _sheet_rows(wb, "授信业务")
    ]
    collaterals = [
        {
            "cert_no": r["编号"], "name": r["名称"], "kind": r["类型"], "owner": r["所有人"],
            "detail": r["权证/标的"], "value_or_shares": r["评估价值(万元)/质押股数"],
            "rate_or_lines": r["抵押率/维保线"], "note": r["备注"],
        }
        for r in _sheet_rows(wb, "抵押质押")
    ]
    lawsuits = [
        {
            "case_no": r["案号"], "cause": r["案由"], "defendant": r["被告"],
            "plaintiff": r["原告(文档专用,不入图)"], "court": r["法院"],
            "amount_wan": r["标的(万元)"], "status": r["状态"], "judge_date": r["裁判日期"],
        }
        for r in _sheet_rows(wb, "诉讼案件")
    ]

    company_key = {c["name"]: c["credit_code"] for c in companies}
    person_key = {p["name"]: p["id_no"] for p in persons}

    # (link_type_name, src_key_value, tgt_key_value, rel_props)
    links: list[tuple[str, str, str, dict]] = []

    for r in _sheet_rows(wb, "持股关系"):
        props = {"ratio": r["持股比例"], "pledged": r["是否质押"], "pledge_note": r["质押详情"]}
        if r["股东类型"] == "企业":
            links.append(("HOLDS_EQUITY", company_key[r["股东"]], company_key[r["被持股企业"]], props))
        else:
            links.append(("PERSON_HOLDS", person_key[r["股东"]], company_key[r["被持股企业"]], props))

    for r in _sheet_rows(wb, "任职关系"):
        links.append(("OFFICER_OF", person_key[r["姓名"]], company_key[r["企业"]], {"title": r["职务"]}))

    for r in _sheet_rows(wb, "亲属关系"):
        links.append(("RELATIVE_OF", person_key[r["人A"]], person_key[r["人B"]], {"relation": r["关系(A之于B)"]}))

    for r in _sheet_rows(wb, "担保关系"):
        if r["是否现场抽取"] == "是":
            continue  # G-06: extracted live by the Agent during the demo — never seeded
        links.append((
            "GUARANTEES", company_key[r["担保人"]], company_key[r["被担保人(债务人)"]],
            {
                "guarantee_id": r["担保编号"], "amount_wan": r["担保金额(万元)"],
                "method": r["担保方式"], "contract_no": r["合同编号"],
                "facility_no": r["对应业务编号"], "sign_date": r["签订日期"],
                "status": r["状态"], "note": r["备注"],
            },
        ))

    for f in facilities:
        links.append(("BORROWS", company_key[f["borrower"]], f["facility_no"], {}))

    for r in _sheet_rows(wb, "抵押质押"):
        links.append(("PLEDGED_FOR", r["编号"], r["对应业务编号"], {}))

    for r in _sheet_rows(wb, "销售依赖"):
        links.append((
            "SELLS_TO", company_key[r["企业"]], r["客户ts_code"],
            {"revenue_ratio": r["收入占比"], "settlement": r["结算方式"], "note": r["备注"]},
        ))

    for r in _sheet_rows(wb, "股票持仓"):
        links.append((
            "HOLDS_STOCK", company_key[r["持有人"]], r["ts_code"],
            {
                "shares_wan": r["持股数(万股)"], "pledged_shares_wan": r["质押股数(万股)"],
                "pledgee": r["质权人"], "facility_no": r["对应业务编号"],
                "warning_line": r["警戒线"], "close_line": r["平仓线"],
            },
        ))

    for case in APPROVAL_CASES:
        links.append(("CASE_FOR", case["case_no"], case["facility_no"], {}))
        links.append(("CASE_APPLICANT", case["case_no"], company_key[case["applicant"]], {}))

    return {
        "instances": {
            "Company": companies,
            "Person": persons,
            "CreditFacility": facilities,
            "Collateral": collaterals,
            "ListedStock": LISTED_STOCKS,
            "Lawsuit": lawsuits,
            "ApprovalCase": APPROVAL_CASES,
        },
        "links": links,
    }


# --- Postgres upserts (idempotent: lookup by name / key first) ---

async def upsert_object_type(db, spec: dict) -> ObjectType:
    result = await db.execute(select(ObjectType).where(ObjectType.name == spec["name"]))
    obj_type = result.scalar_one_or_none()
    if obj_type is None:
        obj_type = ObjectType(id=str(uuid.uuid4()), name=spec["name"])
        db.add(obj_type)
    obj_type.description = spec["description"]
    obj_type.key_property = spec["key_property"]
    obj_type.display_property = spec["display_property"]
    obj_type.is_master_data = spec["is_master_data"]
    obj_type.properties = spec["properties"]
    await db.flush()
    return obj_type


async def upsert_link_type(db, spec: tuple, type_ids: dict[str, str]) -> LinkType:
    name, src, tgt, cardinality, description = spec
    result = await db.execute(select(LinkType).where(LinkType.name == name))
    link_type = result.scalar_one_or_none()
    if link_type is None:
        link_type = LinkType(id=str(uuid.uuid4()), name=name)
        db.add(link_type)
    link_type.description = description
    link_type.source_object_type_id = type_ids[src]
    link_type.target_object_type_id = type_ids[tgt]
    link_type.cardinality = cardinality
    await db.flush()
    return link_type


async def upsert_object_instances(db, obj_type: ObjectType, rows: list[dict]) -> dict[str, str]:
    """MERGE instances by key_property value. Returns {key_value: instance_id}."""
    key = obj_type.key_property
    by_key: dict[str, str] = {}
    for row in rows:
        data = {k: v for k, v in row.items() if v is not None}
        key_val = data[key]
        result = await db.execute(
            select(ObjectInstance).where(
                ObjectInstance.object_type_id == obj_type.id,
                ObjectInstance.data[key].astext == str(key_val),
            )
        )
        inst = result.scalars().first()
        if inst is None:
            inst = ObjectInstance(id=str(uuid.uuid4()), object_type_id=obj_type.id, data=data)
            db.add(inst)
            await db.flush()
        elif (inst.data or {}) != data:
            inst.data = data
        by_key[str(key_val)] = inst.id
    return by_key


async def upsert_link_instance(db, link_type_id: str, src_id: str, tgt_id: str) -> LinkInstance:
    result = await db.execute(
        select(LinkInstance).where(
            LinkInstance.link_type_id == link_type_id,
            LinkInstance.source_object_id == src_id,
            LinkInstance.target_object_id == tgt_id,
        )
    )
    li = result.scalars().first()
    if li is None:
        li = LinkInstance(
            id=str(uuid.uuid4()), link_type_id=link_type_id,
            source_object_id=src_id, target_object_id=tgt_id,
        )
        db.add(li)
        await db.flush()
    return li


async def upsert_neo4j_data_source(db) -> DataSource:
    result = await db.execute(select(DataSource).where(DataSource.name == NEO4J_DS_NAME))
    ds = result.scalar_one_or_none()
    if ds is None:
        ds = DataSource(id=str(uuid.uuid4()), name=NEO4J_DS_NAME, kind="neo4j",
                        host=NEO4J_HOST, username_encrypted=encrypt(NEO4J_USER))
        db.add(ds)
        ds.password_encrypted = encrypt(NEO4J_PASSWORD)
    ds.kind = "neo4j"
    ds.host = NEO4J_HOST
    ds.port = NEO4J_PORT
    await db.flush()
    return ds


# --- Neo4j sync (same conventions as the UI "Index to Neo4j" button) ---

def _safe_rel_props(props: dict) -> dict:
    """Same value coercion as app.api.object_types._merge_object_row_to_neo4j."""
    out = {}
    for k, v in props.items():
        if v is None:
            continue
        out[k] = v if isinstance(v, (str, int, float, bool)) else str(v)
    return out


def _merge_link_to_neo4j(session, src_type, tgt_type, rel_type_name, src_row, tgt_row, props):
    """MERGE one relationship exactly like _index_link_type_from_saved_instances, plus rel props."""
    src_label = _neo4j_safe_label(src_type.name)
    tgt_label = _neo4j_safe_label(tgt_type.name)
    rel_type = _neo4j_safe_rel_type(rel_type_name)
    src_key = _resolve_neo4j_id_column_for_row(src_type, src_row)
    tgt_key = _resolve_neo4j_id_column_for_row(tgt_type, tgt_row)
    src_val = src_row.get(src_key)
    tgt_val = tgt_row.get(tgt_key)
    if src_val is None or tgt_val is None:
        return 0
    session.run(
        f"MERGE (a:{src_label} {{`{src_key}`: $src_id}}) "
        f"MERGE (b:{tgt_label} {{`{tgt_key}`: $tgt_id}}) "
        f"MERGE (a)-[r:{rel_type}]->(b) SET r += $props",
        src_id=src_val,
        tgt_id=tgt_val,
        props=_safe_rel_props(props),
    )
    return 1


# --- validation ---

async def validate(db, session, object_types, link_types) -> bool:
    print("\n=== 校验汇总 (Postgres vs Neo4j) ===")
    ok = True
    pg_nodes_total = 0
    for obj_type in object_types.values():
        pg_n = (await db.execute(
            select(func.count()).select_from(ObjectInstance)
            .where(ObjectInstance.object_type_id == obj_type.id)
        )).scalar_one()
        label = _neo4j_safe_label(obj_type.name)
        neo_n = session.run(f"MATCH (n:{label}) RETURN count(n) AS c").single()["c"]
        pg_nodes_total += pg_n
        status = "OK" if pg_n == neo_n else "MISMATCH"
        ok = ok and pg_n == neo_n
        print(f"  node {obj_type.name:<16} pg={pg_n:<4} neo4j={neo_n:<4} {status}")

    pg_links_total = 0
    for spec in LINK_TYPE_SPECS:
        name, src, tgt, _, _ = spec
        link_type = link_types[name]
        pg_n = (await db.execute(
            select(func.count()).select_from(LinkInstance)
            .where(LinkInstance.link_type_id == link_type.id)
        )).scalar_one()
        src_label = _neo4j_safe_label(object_types[src].name)
        tgt_label = _neo4j_safe_label(object_types[tgt].name)
        rel_type = _neo4j_safe_rel_type(name)
        neo_n = session.run(
            f"MATCH (:{src_label})-[r:{rel_type}]->(:{tgt_label}) RETURN count(r) AS c"
        ).single()["c"]
        pg_links_total += pg_n
        status = "OK" if pg_n == neo_n else "MISMATCH"
        ok = ok and pg_n == neo_n
        print(f"  link {name:<16} pg={pg_n:<4} neo4j={neo_n:<4} {status}")

    neo_nodes = session.run("MATCH (n) RETURN count(n) AS c").single()["c"]
    neo_rels = session.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]
    print(f"  total nodes: pg={pg_nodes_total} neo4j={neo_nodes} "
          f"{'OK' if pg_nodes_total == neo_nodes else 'MISMATCH (extra nodes in graph)'}")
    print(f"  total rels : pg={pg_links_total} neo4j={neo_rels} "
          f"{'OK' if pg_links_total == neo_rels else 'MISMATCH (extra rels in graph)'}")
    ok = ok and pg_nodes_total == neo_nodes and pg_links_total == neo_rels
    return ok


async def main() -> int:
    parser = argparse.ArgumentParser(description="Seed demo/shyh Shenlan ontology (idempotent)")
    parser.add_argument("--xlsx", default=DEFAULT_XLSX, help="master data workbook path")
    parser.add_argument("--wipe-neo4j", action="store_true",
                        help="DETACH DELETE all Neo4j data first, then full rebuild")
    args = parser.parse_args()

    data = load_workbook_data(args.xlsx)

    async with async_session_maker() as db:
        # 1) ontology schema
        object_types: dict[str, ObjectType] = {}
        for spec in OBJECT_TYPE_SPECS:
            object_types[spec["name"]] = await upsert_object_type(db, spec)
        type_ids = {name: t.id for name, t in object_types.items()}
        link_types: dict[str, LinkType] = {}
        for spec in LINK_TYPE_SPECS:
            link_types[spec[0]] = await upsert_link_type(db, spec, type_ids)

        # 2) object instances
        instance_ids: dict[str, dict[str, str]] = {}   # type name -> {key_value: instance_id}
        instance_rows: dict[str, dict[str, dict]] = {}  # type name -> {key_value: data row}
        for type_name, rows in data["instances"].items():
            obj_type = object_types[type_name]
            instance_ids[type_name] = await upsert_object_instances(db, obj_type, rows)
            key = obj_type.key_property
            instance_rows[type_name] = {str(r[key]): {k: v for k, v in r.items() if v is not None}
                                        for r in rows}
            print(f"object {type_name}: {len(rows)} instances")

        # 3) link instances (no data column on link_instances — rel props go to Neo4j only)
        link_src_tgt = {spec[0]: (spec[1], spec[2]) for spec in LINK_TYPE_SPECS}
        per_type_counts: dict[str, int] = {}
        for name, src_key_val, tgt_key_val, _props in data["links"]:
            src_type_name, tgt_type_name = link_src_tgt[name]
            src_id = instance_ids[src_type_name][str(src_key_val)]
            tgt_id = instance_ids[tgt_type_name][str(tgt_key_val)]
            await upsert_link_instance(db, link_types[name].id, src_id, tgt_id)
            per_type_counts[name] = per_type_counts.get(name, 0) + 1
        for name, n in per_type_counts.items():
            print(f"link {name}: {n} instances")

        # 4) Neo4j data source registration
        ds = await upsert_neo4j_data_source(db)
        print(f"data source '{ds.name}' (kind={ds.kind}, {ds.host}:{ds.port}) id={ds.id}")

        await db.commit()

        # 5) Neo4j sync — reuse the UI "Index to Neo4j" code paths
        driver = open_neo4j_driver(ds)
        try:
            with driver.session() as session:
                if args.wipe_neo4j:
                    session.run("MATCH (n) DETACH DELETE n")
                    print("Neo4j wiped (MATCH (n) DETACH DELETE n)")
                for type_name, obj_type in object_types.items():
                    n = await _index_object_type_instances_to_neo4j_session(db, session, obj_type)
                    print(f"neo4j nodes {type_name}: merged {n}")
                rel_count = 0
                for name, src_key_val, tgt_key_val, props in data["links"]:
                    src_type_name, tgt_type_name = link_src_tgt[name]
                    src_row = {**instance_rows[src_type_name][str(src_key_val)],
                               "id": instance_ids[src_type_name][str(src_key_val)]}
                    tgt_row = {**instance_rows[tgt_type_name][str(tgt_key_val)],
                               "id": instance_ids[tgt_type_name][str(tgt_key_val)]}
                    rel_count += _merge_link_to_neo4j(
                        session, object_types[src_type_name], object_types[tgt_type_name],
                        name, src_row, tgt_row, props,
                    )
                print(f"neo4j relationships: merged {rel_count}")

                ok = await validate(db, session, object_types, link_types)
        finally:
            driver.close()

    if not ok:
        print("\nFAILED: Postgres and Neo4j counts differ")
        return 1
    print("\nAll counts match. Seed complete.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
