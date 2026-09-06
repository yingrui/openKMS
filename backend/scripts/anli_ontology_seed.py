"""Extract ABO 展业内容助手 instances from the Amway corpus and load them into openKMS.

Run scripts/anli_ontology_schema.py first — this script only fills the schema.

Pipeline: read corpus -> one LLM call per content item -> normalise names through the
"安利业务术语表" glossary -> dedupe into instances -> POST objects and links -> index to Neo4j.

Two things are deliberately NOT left to the model:

*Provenance* is resolved by matching the extracted term back against the transcript
segments, so ``_source_segment_ms`` points at a timestamp we can verify rather than one
the model asserted. Asking an LLM for timestamps invites confident fiction.

*Publication* is not automatic. The guide is explicit that AI output "仅为草稿，不得直接
发布", so every instance carries ``_confidence`` and anything below REVIEW_THRESHOLD is
written to a review list instead of being treated as finished.

Usage (from backend/):
    .venv/bin/python scripts/anli_ontology_seed.py [--dry-run] [--limit N]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

API = "http://127.0.0.1:8102"
SCRATCH = (
    "/private/tmp/claude-501/-Users-mengbai-Documents-openKMS/"
    "8a2c1843-51fd-4598-991a-dffdcdf06577/scratchpad"
)
ARTICLES_DIR = "/Users/mengbai/Documents/anli-corpus/articles"
OUT_DIR = "/Users/mengbai/Documents/anli-corpus/ontology"

# Below this the extraction goes on the human review list rather than into the graph.
REVIEW_THRESHOLD = 0.6

EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "health_concerns": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "健康关切的规范名称，如「老花眼」「饮水安全」"},
                    "domain": {"type": "string", "description": "所属健康领域，如「眼健康」「抗衰」「免疫」"},
                    "aliases": {"type": "string", "description": "内容中出现的其他说法，顿号分隔；没有则空字符串"},
                    "confidence": {"type": "number"},
                },
                "required": ["name", "domain", "confidence"],
            },
        },
        "mechanisms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "生理机制名称，如「蓝光氧化损伤视网膜」"},
                    "for_concern": {"type": "string", "description": "该机制解释的是哪个健康关切（用上面的名称）"},
                    "plain": {"type": "string", "description": "一句话通俗解释"},
                    "scientific": {"type": "string", "description": "内容中的科学表述，尽量引用原文"},
                    "confidence": {"type": "number"},
                },
                "required": ["name", "for_concern", "plain", "confidence"],
            },
        },
        "nutrients": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "营养成分名称，如「叶黄素」「益生菌」"},
                    "category": {"type": "string", "description": "如「植物营养素」「维生素」「草本原料」"},
                    "natural_source": {"type": "string"},
                    "intervenes_mechanism": {"type": "string", "description": "该成分干预上面哪个机制；无则空"},
                    "confidence": {"type": "number"},
                },
                "required": ["name", "category", "confidence"],
            },
        },
        "products": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "安利产品名称，必须是内容中真实出现的"},
                    "brand_line": {"type": "string", "description": "如「纽崔莱」「益之源」「汉本萃」"},
                    "contains_nutrient": {"type": "string", "description": "该产品含上面哪个营养成分；无则空"},
                    "confidence": {"type": "number"},
                },
                "required": ["name", "confidence"],
            },
        },
        "evidence": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "证据名称，如「《中国居民膳食指南（2022）》」「WRCA世界纪录认证」"},
                    "evidence_type": {
                        "type": "string",
                        "enum": ["国家指南", "国际认证", "学术专著", "学术会议", "专家口播", "个人故事", "企业研发"],
                    },
                    "issuer": {"type": "string"},
                    "year": {"type": "string"},
                    "confidence": {"type": "number"},
                },
                "required": ["name", "evidence_type", "confidence"],
            },
        },
        "audience": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "人群特征，如「35岁以上人群」「备孕与育儿家庭」。禁止出现具体人名"},
                    "dimension": {"type": "string", "description": "如「年龄段」「生活方式」「生命阶段」"},
                    "for_concern": {"type": "string", "description": "面向上面哪个健康关切"},
                    "confidence": {"type": "number"},
                },
                "required": ["name", "dimension", "confidence"],
            },
        },
    },
    "required": ["health_concerns", "mechanisms", "nutrients", "products", "evidence", "audience"],
}

SYSTEM_PROMPT = """你是安利企业知识库的本体抽取工程师。给定一条内容（文章正文或音视频转写稿），
抽取其中真实出现的知识对象，用于构建「ABO 展业内容助手」知识图谱。

铁律：
0. **健康关切的粒度 = 客户会怎么开口问**。它是一个人的健康诉求，不是症状清单，也不是技术细节。
   ✅ 对：饮水安全、老花眼、过敏、认知衰退、更年期不适
   ❌ 错：重金属污染 / 微塑料污染 / PFAS污染（这些是污染物，属于机制层）
   ❌ 错：记忆力下降 / 反应变慢（这些是症状表现，应归入同一个关切「认知衰退」）
   一条内容通常只有 1-2 个健康关切。抽出超过 3 个，说明你把机制或症状误当成关切了。
1. 只抽内容里**真实出现**的东西。内容没讲的，一律不要补充你的背景知识。宁可少抽，不可编造。
1b. **交叉引用必须逐字复制**：mechanisms.for_concern、audience.for_concern 必须与你在
   health_concerns 里写的某个 name 完全一致；nutrients.intervenes_mechanism 必须与
   mechanisms 里某个 name 完全一致；products.contains_nutrient 必须与 nutrients 里某个
   name 完全一致。写不出对应的就留空字符串，不要另造名字。
2. **禁止输出任何真实人名、联系方式等个人标识**。人物故事类内容只抽人群特征（如「40-50岁女性」），不抽人名。
3. 营养成分与产品必须是安利体系内真实存在且内容中提到的；内容只讲机制没提产品时，products 返回空数组。
4. evidence_type 严格从枚举里选。专家在视频里的个人讲述属于「专家口播」，
   带认证编号/发布机构的属于「国际认证」或「国家指南」，个人经历属于「个人故事」。
5. confidence 是你对这一条抽取的把握（0-1）。内容表述含糊、需要推断才能得出的，给低分。
6. 名称用中文规范写法，不要加书名号以外的修饰。"""


def call_api(token: str, path: str, body: dict | None = None, method: str = "GET") -> Any:
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


def load_corpus(token: str) -> list[dict]:
    """Articles from disk plus media transcripts from the API, in one shape.

    ``segments`` is empty for articles and carries timestamped cues for media, which is
    what lets provenance point at a moment in the video rather than the whole file.
    """
    items: list[dict] = []

    manifest = json.load(open(f"{ARTICLES_DIR}/_manifest.json"))
    for m in manifest:
        body = open(f"{ARTICLES_DIR}/{m['file']}").read()
        text = re.sub(r"^#.*$|^>.*$", "", body, flags=re.M).strip()
        if len(text) < 50:  # video-only entries carry no article text
            continue
        items.append(
            {
                "cms_id": m["cms_id"],
                "title": m["title"],
                "genre": "文章",
                "carrier": "text",
                "text": text,
                "segments": [],
                "source_type": "article",
                "source_id": m["cms_id"],
            }
        )

    # No channel filter: media now lives in a business-domain tree, not one flat channel.
    media = call_api(token, "/api/media?limit=200")
    for asset in media.get("items", []):
        tr = asset.get("transcript") or {}
        segments = tr.get("segments") or []
        text = tr.get("text") or ""
        if not text:
            continue
        cms = ""
        if asset.get("description"):
            found = re.search(r"CMS ID\s*([0-9]+)", asset["description"])
            cms = found.group(1) if found else ""
        items.append(
            {
                "cms_id": cms or asset["id"],
                "title": asset["title"],
                "genre": "视频" if asset["media_kind"] == "video" else "音频",
                "carrier": asset["media_kind"],
                "text": text,
                "segments": segments,
                "source_type": "media",
                "source_id": asset["id"],
            }
        )
    return items


def load_glossary(token: str) -> dict[str, str]:
    """synonym -> canonical, so extracted variants collapse onto one instance."""
    glossaries = call_api(token, "/api/glossaries")
    gid = next(
        (g["id"] for g in (glossaries.get("items") or glossaries) if "安利业务术语" in g["name"]),
        None,
    )
    if not gid:
        return {}
    terms = call_api(token, f"/api/glossaries/{gid}/terms?limit=500")
    canonical = {t["primary_cn"] for t in (terms.get("items") or terms) if t.get("primary_cn")}
    mapping: dict[str, str] = {}
    for t in terms.get("items") or terms:
        primary = t.get("primary_cn")
        if not primary:
            continue
        for syn in t.get("synonyms_cn") or []:
            if syn and syn != primary and syn not in canonical:
                mapping[syn] = primary
    return mapping


def normalise(name: str, mapping: dict[str, str]) -> str:
    name = (name or "").strip()
    return mapping.get(name, name)


def find_segment_ms(term: str, segments: list[dict]) -> int | None:
    """Earliest cue whose text contains the term. Deterministic, hence checkable."""
    for seg in segments:
        if term and term in (seg.get("text") or ""):
            return seg.get("start_ms")
    return None


async def extract_one(item: dict, model_cfg: dict) -> dict:
    from openai import AsyncOpenAI
    from pydantic_ai import Agent, PromptedOutput, StructuredDict
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    base_url = model_cfg["base_url"].rstrip("/")
    if not re.search(r"/v\d+$", base_url):
        base_url = f"{base_url}/v1"
    client = AsyncOpenAI(base_url=base_url, api_key=model_cfg["api_key"])
    agent = Agent(
        OpenAIChatModel(model_cfg["model_name"], provider=OpenAIProvider(openai_client=client)),
        output_type=PromptedOutput(
            StructuredDict(EXTRACT_SCHEMA, name="OntologyExtraction", description="本体实例抽取结果")
        ),
        system_prompt=SYSTEM_PROMPT,
    )
    prompt = f"标题：{item['title']}\n体裁：{item['genre']}\n\n内容：\n---\n{item['text'][:12000]}\n---"
    result = await agent.run(prompt)
    return result.output or {}


def get_model_cfg() -> dict:
    """Read the GLM chat model straight from the DB so no key is hard-coded here."""
    import psycopg2

    from app.config import settings

    conn = psycopg2.connect(
        host=settings.database_host,
        port=settings.database_port,
        dbname=settings.database_name,
        user=settings.database_user,
        password=settings.database_password,
    )
    with conn.cursor() as cur:
        cur.execute(
            "select m.model_name, p.base_url, p.api_key from api_models m "
            "join api_providers p on p.id = m.provider_id where m.id = 'model_2c2a9383'"
        )
        row = cur.fetchone()
    conn.close()
    if not row:
        raise SystemExit("GLM chat model model_2c2a9383 not found in this database")
    return {"model_name": row[0], "base_url": row[1], "api_key": row[2]}


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="extract and report, do not POST")
    ap.add_argument("--limit", type=int, default=0, help="only process the first N items")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    token = open(f"{SCRATCH}/anli.jwt").read().strip()
    type_ids = json.load(open(f"{SCRATCH}/anli_type_ids.json"))
    glossary = load_glossary(token)
    corpus = load_corpus(token)
    if args.limit:
        corpus = corpus[: args.limit]
    print(f"语料 {len(corpus)} 条，术语归一映射 {len(glossary)} 条\n")

    model_cfg = get_model_cfg()
    extractions: list[dict] = []
    for i, item in enumerate(corpus, 1):
        print(f"[{i}/{len(corpus)}] 抽取 {item['title'][:30]} …", flush=True)
        try:
            out = await extract_one(item, model_cfg)
        except Exception as e:  # noqa: BLE001 — one bad item must not sink the run
            print(f"    抽取失败：{e}", file=sys.stderr)
            continue
        extractions.append({"item": item, "out": out})
        counts = {k: len(v) for k, v in out.items() if isinstance(v, list)}
        print(f"    {counts}")
        await asyncio.sleep(2)  # stay well under the provider's rate limit

    with open(f"{OUT_DIR}/extractions_raw.json", "w") as f:
        json.dump(
            [{"cms_id": e["item"]["cms_id"], "title": e["item"]["title"], "out": e["out"]} for e in extractions],
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"\n原始抽取结果已写入 {OUT_DIR}/extractions_raw.json")

    if args.dry_run:
        print("--dry-run：不落库")
        return 0

    from anli_ontology_load import load_into_openkms  # local helper, same directory

    return load_into_openkms(token, type_ids, extractions, glossary, normalise, find_segment_ms)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
