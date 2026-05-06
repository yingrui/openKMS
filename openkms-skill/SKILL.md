---
name: openkms
description: >-
  Operates an openKMS deployment over its HTTP API using a personal API key (channels,
  document uploads, articles, evaluation datasets, knowledge-base FAQs, wiki spaces).
  Use when the user wants agents or local tools to create or manage openKMS content,
  sync a wiki, upload files, or script against openKMS without the web UI.
---

# openKMS (OpenCode skill)

## Before you act

1. **Config** — The runtime reads `config.yml` in **this directory** (next to `SKILL.md`). It must include:
   - `api_base_url` — backend origin only, e.g. `http://127.0.0.1:8102` (no trailing slash).
   - `api_key` — personal key from **Settings → API keys** in openKMS (user menu **Settings**; `okms.{uuid}.{secret}`).

2. **If either value is missing** — Ask the user for the backend URL and a new key from **Settings** (they see the full token once when creating it). Then **write or update** `config.yml` in this skill directory. Never echo the key back in full unless the user explicitly asks.

3. **Prefer the bundled scripts** — Run Python CLI under `scripts/` so behavior stays consistent (see [reference.md](reference.md)).

```bash
cd "$(dirname "$0")"   # skill root when invoked from repo; agents use absolute path to skill dir
pip install -q -r requirements.txt
python scripts/cli.py ping
```

4. **Auth header** — Always `Authorization: Bearer <api_key>`. Same permissions as the user who created the key.

## Install (OpenCode)

From the repo:

```bash
./install.sh
```

Copies this folder to `~/.config/opencode/skills/openkms/`. Re-run after pulling repo changes. An existing **`config.yml`** in that destination is **preserved** (not overwritten by the fresh tree).

## Common tasks

| Goal | Command |
|------|---------|
| Verify connectivity | `python scripts/cli.py ping` |
| List document channels | `python scripts/cli.py document-channels list` |
| Create document channel | `python scripts/cli.py document-channels create --name "Inbox"` |
| Upload a file to a channel | `python scripts/cli.py documents upload --channel-id ID --file /path/to/doc.pdf` |
| List article channels | `python scripts/cli.py article-channels list` |
| Create article (markdown file) | `python scripts/cli.py articles create --channel-id ID --name "Title" --markdown-file ./x.md` |
| Import article from URL (HTML → text heuristic) | `python scripts/cli.py articles from-url --channel-id ID --url https://example.com/a` |
| List evaluation datasets | `python scripts/cli.py evaluation-datasets list` |
| Create FAQ on a KB | `python scripts/cli.py kb-faq create --kb-id ID --question "Q" --answer "A"` |
| List wiki spaces | `python scripts/cli.py wiki-spaces list` |
| Upsert wiki page from file | `python scripts/cli.py wiki put-page --space-id ID --path my/page --file ./note.md` |

Details, JSON shapes, and curl equivalents: [reference.md](reference.md). Canonical route list: project `docs/features/api-reference.md`.
