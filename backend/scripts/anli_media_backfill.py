"""Backfill media assets with their original source URL and CMS id.

An article's markdown links the raw CDN URL of its video/audio; the media asset only
carries the CMS id (in its description). To rewrite those links to our media detail page
we need an exact URL->asset lookup, so this writes ``source_url`` and ``cms_id`` into each
asset's ``metadata`` from the corpus manifest, keyed by the CMS id both sides share.

Idempotent — re-running overwrites the same two keys. Usage (from backend/):
    .venv/bin/python scripts/anli_media_backfill.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request

API = "http://127.0.0.1:8102"
SCRATCH = (
    "/private/tmp/claude-501/-Users-mengbai-Documents-openKMS/"
    "8a2c1843-51fd-4598-991a-dffdcdf06577/scratchpad"
)
MANIFEST = "/Users/mengbai/Documents/anli-corpus/articles/_manifest.json"


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
        print(f"  HTTP {e.code} {method} {path}: {e.read()[:200].decode()}", file=sys.stderr)
        raise


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    token = open(f"{SCRATCH}/anli.jwt").read().strip()

    # cms_id -> first media URL, from the corpus manifest
    manifest = json.load(open(MANIFEST))
    url_by_cms = {str(x["cms_id"]): x["media"][0] for x in manifest if x.get("media")}

    assets = call(token, "/api/media?limit=200").get("items", [])
    updated = 0
    for a in assets:
        # CMS id lives in the free-text description ("CMS ID 1960...").
        m = re.search(r"CMS ID\s*([0-9]+)", a.get("description") or "")
        cms = m.group(1) if m else ""
        url = url_by_cms.get(cms)
        if not url:
            print(f"  跳过 {a['id']}（无 manifest URL）: {a['title'][:24]}", file=sys.stderr)
            continue
        meta = dict(a.get("metadata") or {})
        meta.update(cms_id=cms, source_url=url)
        print(f"  {a['id']}  cms={cms}  ← {url[:52]}")
        if not args.dry_run:
            call(token, f"/api/media/{a['id']}", {"metadata": meta}, "PATCH")
        updated += 1

    print(f"\n{'（dry-run）' if args.dry_run else ''}回填 {updated}/{len(assets)} 个媒体资产")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
