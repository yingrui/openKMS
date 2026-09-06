"""Index the Amway knowledge base directly, bypassing openkms-cli.

The platform's own index job cannot run against this deployment — three known defects
in openkms-cli, all previously hit and recorded:

  1. ``pipeline_cli.py`` calls ``run_indexer(knowledge_base_id=...)`` but the function
     takes no such argument, so ``POST /{kb}/index-job`` always fails with a TypeError.
  2. The CLI hard-appends ``/v1`` to the embedding base URL; GLM already ends in
     ``/paas/v4``, so requests 404 against ``/paas/v4/v1/embeddings``.
  3. GLM's embedding endpoint rejects empty strings and inputs beyond roughly 3000
     characters, which unchunked wiki pages exceed.

So chunking and embedding happen here instead, writing the same ``chunks`` rows the
indexer would have. Chunk boundaries follow markdown headers and then hard-wrap, which
keeps a transcript's timestamped cues together rather than splitting mid-sentence.

Usage (from backend/):  .venv/bin/python scripts/anli_kb_index.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SCRATCH = (
    "/private/tmp/claude-501/-Users-mengbai-Documents-openKMS/"
    "8a2c1843-51fd-4598-991a-dffdcdf06577/scratchpad"
)

# Comfortably inside GLM's per-input ceiling, with room for the header line each chunk keeps.
MAX_CHARS = 2200
MIN_CHARS = 40


def split_page(body: str) -> list[str]:
    """Header-aware split, then hard-wrap anything still too long.

    Transcript pages are one cue per line, so wrapping on line boundaries keeps every
    ``[m:ss]`` marker attached to its sentence — that is what lets a retrieved passage
    still point at a moment in the video.
    """
    sections: list[str] = []
    current: list[str] = []
    for line in body.splitlines():
        if line.startswith("## ") and current:
            sections.append("\n".join(current))
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append("\n".join(current))

    chunks: list[str] = []
    for section in sections:
        if len(section) <= MAX_CHARS:
            chunks.append(section)
            continue
        buf: list[str] = []
        size = 0
        for line in section.splitlines():
            if size + len(line) + 1 > MAX_CHARS and buf:
                chunks.append("\n".join(buf))
                buf, size = [], 0
            buf.append(line)
            size += len(line) + 1
        if buf:
            chunks.append("\n".join(buf))
    return [c.strip() for c in chunks if len(c.strip()) >= MIN_CHARS]


def embed(texts: list[str], base_url: str, api_key: str, model: str) -> list[list[float]]:
    """Embed in batches. base_url is used as given — no ``/v1`` appended (defect 2)."""
    from openai import OpenAI

    client = OpenAI(base_url=base_url.rstrip("/"), api_key=api_key)
    out: list[list[float]] = []
    for i in range(0, len(texts), 16):
        batch = texts[i : i + 16]
        resp = client.embeddings.create(model=model, input=batch)
        out.extend(d.embedding for d in resp.data)
        print(f"    embedded {min(i + 16, len(texts))}/{len(texts)}", flush=True)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    import psycopg2

    from app.config import settings

    kb_meta = json.load(open(f"{SCRATCH}/anli_kb.json"))
    kb_id, space_id = kb_meta["kb_id"], kb_meta["space_id"]

    conn = psycopg2.connect(
        host=settings.database_host, port=settings.database_port,
        dbname=settings.database_name, user=settings.database_user,
        password=settings.database_password,
    )
    cur = conn.cursor()

    cur.execute(
        "select m.model_name, p.base_url, p.api_key from api_models m "
        "join api_providers p on p.id = m.provider_id where m.api_kind = 'embeddings' limit 1"
    )
    row = cur.fetchone()
    if not row:
        print("没有 embeddings 模型", file=sys.stderr)
        return 1
    model_name, base_url, api_key = row

    cur.execute(
        "select id, path, title, body from wiki_pages where wiki_space_id = %s order by path",
        (space_id,),
    )
    pages = cur.fetchall()
    print(f"wiki 页面 {len(pages)} 页\n")

    plan: list[tuple[str, int, str]] = []  # (page_id, index, text)
    for page_id, path, title, body in pages:
        parts = split_page(body or "")
        print(f"  {path:<46} → {len(parts)} 块")
        for i, text in enumerate(parts):
            plan.append((page_id, i, text))

    print(f"\n共 {len(plan)} 个分块")
    if args.dry_run:
        return 0

    cur.execute("delete from chunks where wiki_page_id in (select id from wiki_pages where wiki_space_id = %s)", (space_id,))
    print(f"清理旧分块 {cur.rowcount} 条")

    vectors = embed([t for _p, _i, t in plan], base_url, api_key, model_name)

    for (page_id, idx, text), vec in zip(plan, vectors):
        cur.execute(
            "insert into chunks (id, wiki_page_id, knowledge_base_id, chunk_index, content, embedding, created_at) "
            "values (%s, %s, %s, %s, %s, %s, now())",
            (str(uuid.uuid4()), page_id, kb_id, idx, text, str(vec)),
        )
    conn.commit()

    cur.execute("select count(*) from chunks where knowledge_base_id = %s", (kb_id,))
    print(f"\n已写入 {cur.fetchone()[0]} 个分块")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
