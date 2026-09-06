"""Rebuild the Amway content channels as a business-domain tree and file content into it.

The first import dropped all 8 articles into one "原始导入" channel and all 4 media assets
into another. That is a pile, not knowledge management — and the brief is explicit that
content today is managed by 体裁/栏目/专题, so a flat dump cannot show the upgrade.

The tree below mirrors Amway's published business structure rather than anything invented:
「全面健康推动者」定位下的健康解决方案分为活力焕龄（提升健康预期寿命）、代谢健康（三高）、
营养早餐、体重管理、心血管健康，另有抗衰/肠道/骨骼等专项；营销人员运营数十万个大健康社群
（体重管理、健康丽龄、四季养生、亲子健康等主题）；ABO 中 6 万余人持中国营养学会营养健康顾问证书。

Those four groupings line up with the four knowledge domains the brief asks us to extend
into — 社群、抗衰、解决方案、展业 — which is why the tree is shaped this way.

Channels carry the 栏目/专题 axis; ContentAsset.genre keeps the 体裁 axis. The two stay
orthogonal so the old three-way management model is absorbed rather than discarded.

Usage (from backend/):  .venv/bin/python scripts/anli_channels.py [--dry-run]
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

# (path, description). Parent is implied by the path prefix.
ARTICLE_TREE = [
    ("安利内容中心", "安利大健康内容资产总入口，按业务域组织"),
    ("安利内容中心/健康解决方案", "面向具体健康诉求的解决方案内容（对应「解决方案」知识域）"),
    ("安利内容中心/健康解决方案/活力焕龄·抗衰", "提升健康预期寿命相关内容（对应「抗衰」知识域）"),
    ("安利内容中心/健康解决方案/代谢健康", "三高与代谢相关内容"),
    ("安利内容中心/健康解决方案/体重管理", "体重与体脂管理相关内容"),
    ("安利内容中心/健康解决方案/免疫健康", "免疫、过敏相关内容"),
    ("安利内容中心/健康解决方案/专项健康", "眼健康、骨骼、肠道等专项内容"),
    ("安利内容中心/营养与科研", "营养学基础与科研背书内容"),
    ("安利内容中心/营养与科研/植物营养素", "植物营养素科研与应用"),
    ("安利内容中心/营养与科研/营养早餐", "膳食均衡与营养早餐"),
    ("安利内容中心/产品资讯", "产品发布、认证与技术解读"),
    ("安利内容中心/社群运营", "大健康社群日常运营素材（对应「社群」知识域）"),
    ("安利内容中心/社群运营/每日资讯", "社群每日播报"),
    ("安利内容中心/社群运营/每日发圈", "朋友圈发布素材"),
    ("安利内容中心/社群运营/日签", "每日一签金句卡"),
    ("安利内容中心/ABO展业", "ABO 与营养健康顾问展业素材（对应「展业」知识域）"),
    ("安利内容中心/ABO展业/客户故事", "真实客户健康改善故事"),
    ("安利内容中心/ABO展业/展业话术", "沟通话术与心态建设"),
]

MEDIA_TREE = [
    ("安利媒体中心", "音视频知识资产总入口"),
    ("安利媒体中心/健康科普视频", "面向大众的健康科普短视频"),
    ("安利媒体中心/专家课程", "专家系统讲授的长视频课程"),
    ("安利媒体中心/社群音频", "社群播报与音频内容"),
]

# article title fragment -> target channel path
ARTICLE_PLACEMENT = {
    "大脑抗衰": "安利内容中心/健康解决方案/活力焕龄·抗衰",
    "过敏的人群": "安利内容中心/健康解决方案/免疫健康",
    "老花眼": "安利内容中心/健康解决方案/专项健康",
    "植物营养素": "安利内容中心/营养与科研/植物营养素",
    "益之源净水器": "安利内容中心/产品资讯",
    "人生的使命": "安利内容中心/社群运营/每日资讯",
    "张锦丽": "安利内容中心/ABO展业/客户故事",
    "装": "安利内容中心/ABO展业/展业话术",
}

MEDIA_PLACEMENT = {
    "大脑抗衰": "安利媒体中心/健康科普视频",
    "过敏的人群": "安利媒体中心/专家课程",
    "装": "安利媒体中心/健康科普视频",
    "人生的使命": "安利媒体中心/社群音频",
}


def call(token: str, path: str, body: dict | None = None, method: str = "GET"):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        raw = urllib.request.urlopen(req).read()
        return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} {method} {path}: {e.read()[:300].decode()}", file=sys.stderr)
        raise


def build_tree(token: str, endpoint: str, tree: list[tuple[str, str]], dry: bool) -> dict[str, str]:
    """Create channels parent-first. Returns path -> channel id."""
    ids: dict[str, str] = {}
    for path, desc in tree:
        name = path.rsplit("/", 1)[-1]
        parent_path = path.rsplit("/", 1)[0] if "/" in path else None
        parent_id = ids.get(parent_path) if parent_path else None
        if dry:
            print(f"  [dry] {path}")
            ids[path] = f"dry-{len(ids)}"
            continue
        row = call(
            token,
            endpoint,
            {"name": name, "description": desc, "parent_id": parent_id},
            "POST",
        )
        ids[path] = row["id"]
        print(f"  {'  ' * path.count('/')}{name}")
    return ids


def place(token: str, items: list[dict], placement: dict[str, str], ids: dict[str, str],
          patch_path: str, dry: bool) -> int:
    moved = 0
    for item in items:
        title = item.get("name") or item.get("title") or ""
        target = next((p for frag, p in placement.items() if frag in title), None)
        if not target:
            print(f"    ⚠ 未匹配到频道：{title[:30]}", file=sys.stderr)
            continue
        print(f"    {title[:30]:<32} → {target}")
        if not dry:
            call(token, patch_path.format(id=item["id"]), {"channel_id": ids[target]}, "PATCH")
        moved += 1
    return moved


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    token = open(f"{SCRATCH}/anli.jwt").read().strip()

    print("=== 文章频道树 ===")
    art_ids = build_tree(token, "/api/article-channels", ARTICLE_TREE, args.dry_run)
    print("\n=== 媒体频道树 ===")
    med_ids = build_tree(token, "/api/media-channels", MEDIA_TREE, args.dry_run)

    print("\n=== 文章归位 ===")
    articles = call(token, "/api/articles?channel_id=ac_196a33c5&limit=100").get("items", [])
    n_a = place(token, articles, ARTICLE_PLACEMENT, art_ids, "/api/articles/{id}", args.dry_run)

    print("\n=== 媒体归位 ===")
    media = call(token, "/api/media?channel_id=mc_a2b4a513&limit=50").get("items", [])
    n_m = place(token, media, MEDIA_PLACEMENT, med_ids, "/api/media/{id}", args.dry_run)

    with open(f"{SCRATCH}/anli_channel_ids.json", "w") as f:
        json.dump({"articles": art_ids, "media": med_ids}, f, ensure_ascii=False, indent=2)
    print(f"\n文章归位 {n_a}/{len(articles)}，媒体归位 {n_m}/{len(media)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
