"""Publish the Amway corpus as wiki pages so it can back a knowledge base.

Why wiki and not the article/media channels the content already lives in: openKMS
restricts KB chunks to documents or wiki pages at the database level
(``chunk.py`` CHECK constraint), and there is no code path that turns an article body or
a media transcript into a chunk. Until that is productised — it is item 1 and 2 on the
"待开发" list — a wiki space is the supported way to make this text retrievable.

The pages are therefore a *projection*, not a second copy of record: the article channel
and media asset stay authoritative, and every page carries `cms_id` / source ids in its
metadata so an answer can be traced back to the original.

Media pages keep the timestamped cues rather than flattening to prose, so a retrieved
passage still says which second of the video it came from.

Usage (from backend/):  .venv/bin/python scripts/anli_wiki_kb.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "http://127.0.0.1:8102"
SCRATCH = (
    "/private/tmp/claude-501/-Users-mengbai-Documents-openKMS/"
    "8a2c1843-51fd-4598-991a-dffdcdf06577/scratchpad"
)
SPACE_NAME = "安利知识资产"
KB_NAME = "安利大健康知识库"


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


def slugify(text: str) -> str:
    return re.sub(r"[^\w一-鿿-]+", "-", text).strip("-")[:60]


def article_page(article: dict, axes: tuple[str, str]) -> tuple[str, str, dict]:
    column, topic = axes
    cms = (article.get("metadata") or {}).get("cms_id", "")
    body = article.get("markdown") or ""
    header = (
        f"> 来源：安利内容中心 · {column} · {topic}\n"
        f"> 体裁：文章　CMS ID：{cms or '—'}\n\n"
    )
    # Suffix the path: one CMS item can exist as both an article and a video, and both
    # project into this space. Without the suffix the second write silently overwrites
    # the first and the transcript (or the article body) disappears from the KB.
    return (
        f"{slugify(column)}/{slugify(article['name'])}-文章",
        article["name"],
        {"body": header + body,
         "metadata": {"cms_id": cms, "source_type": "article", "source_id": article["id"],
                      "column": column, "topic": topic, "genre": "文章"}},
    )


def media_page(asset: dict, axes: tuple[str, str]) -> tuple[str, str, dict]:
    column, topic = axes
    tr = asset.get("transcript") or {}
    segments = tr.get("segments") or []
    cms = ""
    if asset.get("description"):
        found = re.search(r"CMS ID\s*([0-9]+)", asset["description"])
        cms = found.group(1) if found else ""

    lines = [
        f"> 来源：安利媒体中心 · {column} · {topic}",
        f"> 体裁：{'视频' if asset['media_kind'] == 'video' else '音频'}　CMS ID：{cms or '—'}",
        f"> 转写引擎：{tr.get('engine', '—')}　字幕 {len(segments)} 段",
        "",
    ]
    if asset.get("summary"):
        lines += ["## 内容摘要", "", asset["summary"], ""]
    lines += ["## 语音转写（带时间戳）", ""]
    for seg in segments:
        ms = seg.get("start_ms", 0)
        lines.append(f"[{ms // 60000}:{ms // 1000 % 60:02d}] {seg.get('text', '')}")

    kind = "视频" if asset["media_kind"] == "video" else "音频"
    return (
        f"{slugify(column)}/{slugify(asset['title'])}-{kind}",
        f"{asset['title']}（{kind}转写）",
        {"body": "\n".join(lines),
         "metadata": {"cms_id": cms, "source_type": "media", "source_id": asset["id"],
                      "column": column, "topic": topic,
                      "genre": "视频" if asset["media_kind"] == "video" else "音频"}},
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    token = open(f"{SCRATCH}/anli.jwt").read().strip()

    sys.path.insert(0, "scripts")
    from anli_ontology_load import channel_axes

    axes = channel_axes(token)

    existing = [s for s in call(token, "/api/wiki-spaces").get("items", []) if s["name"] == SPACE_NAME]
    if existing:
        space_id = existing[0]["id"]
        print(f"复用已有 wiki 空间 {space_id}")
    elif args.dry_run:
        space_id = "dry-space"
    else:
        space_id = call(
            token, "/api/wiki-spaces",
            {"name": SPACE_NAME,
             "description": "8 篇文章正文 + 4 份音视频转写的知识投影，供知识库检索与问答；"
                            "权威副本仍在内容频道与媒体资产，本空间每页带 cms_id 可回溯"},
            "POST",
        )["id"]
        print(f"新建 wiki 空间 {space_id}")

    print("\n=== 写入 wiki 页面 ===")
    pages: list[tuple[str, str, dict]] = []
    for art in call(token, "/api/articles?limit=200").get("items", []):
        pages.append(article_page(art, axes.get(art["name"], ("未分类", "未分类"))))
    for asset in call(token, "/api/media?limit=200").get("items", []):
        if (asset.get("transcript") or {}).get("segments"):
            pages.append(media_page(asset, axes.get(asset["title"], ("未分类", "未分类"))))

    for path, title, payload in pages:
        size = len(payload["body"])
        print(f"  {path:<44} {size:>6} 字")
        if not args.dry_run:
            # Chinese page paths must be percent-encoded: http.client encodes the request
            # line as ASCII and raises on raw CJK.
            quoted = urllib.parse.quote(path, safe="/")
            call(token, f"/api/wiki-spaces/{space_id}/pages/by-path/{quoted}",
                 {"title": title, **payload}, "PUT")

    if args.dry_run:
        print(f"\n--dry-run：共 {len(pages)} 页，未写入")
        return 0

    kb_existing = [k for k in call(token, "/api/knowledge-bases").get("items", []) if k["name"] == KB_NAME]
    if kb_existing:
        kb_id = kb_existing[0]["id"]
        print(f"\n复用已有知识库 {kb_id}")
    else:
        kb_id = call(
            token, "/api/knowledge-bases",
            {"name": KB_NAME,
             "description": "安利大健康内容的语义检索与问答底座，内容源为「安利知识资产」wiki 空间"},
            "POST",
        )["id"]
        print(f"\n新建知识库 {kb_id}")

    call(token, f"/api/knowledge-bases/{kb_id}/wiki-spaces", {"wiki_space_id": space_id}, "POST")
    print(f"已挂载 wiki 空间到知识库")

    with open(f"{SCRATCH}/anli_kb.json", "w") as f:
        json.dump({"space_id": space_id, "kb_id": kb_id, "pages": len(pages)}, f)
    print(f"\nwiki 页面 {len(pages)} 页，空间 {space_id}，知识库 {kb_id}")
    print("下一步：触发索引，并部署 qa-agent 后把 agent_url 填进知识库")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
