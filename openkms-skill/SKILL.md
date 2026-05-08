---
name: openkms
description: >-
  Operates and queries an openKMS deployment over its HTTP API using a personal API key.
  Read paths: global search across documents/articles/wiki/KBs; list & fetch markdown for
  documents and articles; list & get wiki pages by path; KB semantic search and grounded
  Q&A; run Cypher (or natural-language questions) against the ontology graph; list
  evaluation datasets, items, and runs. Write paths: create channels, upload documents,
  create articles (incl. from URL), upsert wiki pages, create KB FAQs and evaluation
  datasets, trigger evaluation runs. Use when the user wants an agent — or any external
  tool — to read content from or push content to openKMS without the web UI.
---

# openKMS skill

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

## Install (OpenCode and Claude Code)

From the repo:

```bash
./install.sh                      # auto: installs to whichever runtimes are present
./install.sh --target opencode    # OpenCode only  → ~/.config/opencode/skills/openkms/
./install.sh --target claude-code # Claude Code only → ~/.claude/skills/openkms/
./install.sh --target both        # both runtimes
./install.sh --dest /custom/path  # explicit destination
```

Auto mode picks targets based on which dirs exist (`~/.config/opencode/`, `~/.claude/`). Re-run after pulling repo changes. An existing **`config.yml`** in any destination is **preserved** (not overwritten by the fresh tree).

## How to use this skill

The skill is a thin Python CLI over openKMS's HTTP API. Every command JSON-prints the raw API response (`json.dumps`, indented). You parse it, then drive the next call. There is no client-side magic — pagination, retries, follow-ups are all yours.

Some practical guidance:

- **Discover before you fetch.** Most agent workflows start with `search` (or `documents list --search …` / `articles list --search …`) to find candidates by name, then a `get` / `markdown` to pull content. Don't fetch a whole channel just to grep — server-side `--search` is keyword-substring against names/titles.
- **`kb ask` vs `kb search`.** `ask` proxies to the QA agent and returns a grounded *answer* (with citations). `search` is now **hybrid** (BM25 + dense + RRF + cross-encoder rerank) and returns *raw chunks + FAQ matches* with confidence scores. Lexical tokens like product codes (e.g. `WWY`, `MIL`) are heavily weighted via BM25, so `kb search --q "WWY 年化收益"` returns WWY-specific chunks even when the embedding alone wouldn't. First call per KB cold-starts the BM25 index (paginates all chunks/FAQs); subsequent calls are fast. Use `ask` when the user wants an answer; use `search` when you need source material to reason over yourself.
- **`ontology ask` is a 3-call chain.** It runs `text-to-cypher` → `explore` → `answer` for you. Use when the question is graph-shaped and you don't want to chain by hand. Use the individual subcommands when you need to inspect or rewrite the Cypher.
- **Permission model is enforced server-side.** API key carries the user's scope. List endpoints filter to readable channels; per-id GET returns 404 (not 403) when out of scope. Don't try to bypass — surface the error.
- **Write commands have no dry-run.** `documents upload`, `articles create`, `wiki put-page`, `kb-faq create`, `evaluation-datasets run` all mutate. Confirm with the user before bulk loops.
- **Output is verbose.** Each list response can include long arrays. If you're scanning many records, pipe through `jq` to project just the fields you need rather than dumping everything into context.

## Read / query tasks

| Goal | Command |
|------|---------|
| Verify connectivity | `python scripts/cli.py ping` |
| Global search across content | `python scripts/cli.py search --q "乳腺癌" --types documents,articles --limit 20` |
| List documents (filter by channel/keyword) | `python scripts/cli.py documents list --channel-id ID --search "心梗" --limit 50` |
| Get document metadata + body | `python scripts/cli.py documents get --id DOC_ID` |
| Save just the document markdown to a file | `python scripts/cli.py documents markdown --id DOC_ID --out ./case.md` |
| List articles (filter by channel/keyword) | `python scripts/cli.py articles list --channel-id ID --search "豁免"` |
| Get article markdown | `python scripts/cli.py articles markdown --id ART_ID` |
| List wiki pages in a space | `python scripts/cli.py wiki list-pages --space-id SP_ID` |
| Get one wiki page by Obsidian path | `python scripts/cli.py wiki get-page --space-id SP_ID --path notes/onboarding` |
| List knowledge bases | `python scripts/cli.py kb list` |
| Semantic search over KB chunks + FAQs | `python scripts/cli.py kb search --id KB_ID --q "既往症定义" --limit 10` |
| Ask the KB a question (grounded answer) | `python scripts/cli.py kb ask --id KB_ID --question "..."` |
| List FAQs on a KB | `python scripts/cli.py kb-faq list --kb-id KB_ID` |
| Run a Cypher query against the ontology graph | `python scripts/cli.py ontology cypher --query "MATCH (n:Customer) RETURN n LIMIT 10"` |
| NL question → Cypher (just the translation) | `python scripts/cli.py ontology text-to-cypher --question "..."` |
| NL question → Cypher → results → NL answer (3-call chain) | `python scripts/cli.py ontology ask --question "..."` |
| Get one evaluation dataset's metadata | `python scripts/cli.py evaluation-datasets get --id DS_ID` |
| List items in a dataset | `python scripts/cli.py evaluation-datasets items --id DS_ID --limit 50` |
| List runs for a dataset | `python scripts/cli.py evaluation-runs list --dataset-id DS_ID` |
| Get one run with per-item results | `python scripts/cli.py evaluation-runs get --dataset-id DS_ID --run-id RUN_ID` |
| Compare two runs | `python scripts/cli.py evaluation-runs compare --dataset-id DS_ID --run-a A --run-b B` |

## Write tasks

| Goal | Command |
|------|---------|
| List document channels (tree) | `python scripts/cli.py document-channels list` |
| Create document channel | `python scripts/cli.py document-channels create --name "Inbox"` |
| Upload a file to a channel | `python scripts/cli.py documents upload --channel-id ID --file /path/to/doc.pdf` |
| List article channels (tree) | `python scripts/cli.py article-channels list` |
| Create article channel | `python scripts/cli.py article-channels create --name "Internal Wiki"` |
| Create article from a markdown file | `python scripts/cli.py articles create --channel-id ID --name "Title" --markdown-file ./x.md` |
| Import article from a URL (HTML → text heuristic) | `python scripts/cli.py articles from-url --channel-id ID --url https://example.com/a` |
| List wiki spaces | `python scripts/cli.py wiki-spaces list` |
| Create wiki space | `python scripts/cli.py wiki-spaces create --name "Field Notes"` |
| Upsert wiki page from file | `python scripts/cli.py wiki put-page --space-id ID --path my/page --title "T" --file ./note.md` |
| Create FAQ on a KB | `python scripts/cli.py kb-faq create --kb-id ID --question "Q" --answer "A"` |
| List evaluation datasets | `python scripts/cli.py evaluation-datasets list` |
| Create evaluation dataset | `python scripts/cli.py evaluation-datasets create --name "..." --kb-id KB_ID` |
| Trigger an evaluation run | `python scripts/cli.py evaluation-datasets run --id DS_ID --type qa_answer` |

## Workflow recipes

**A. Find a doc by phrase, fetch its markdown.**
```bash
python scripts/cli.py search --q "乳腺癌" --types documents --limit 5
# pick the doc id you want from the response
python scripts/cli.py documents markdown --id <doc_id> --out ./case.md
```

**B. Ask the KB a question (grounded with citations).**
```bash
python scripts/cli.py kb list                      # find the KB id
python scripts/cli.py kb ask --id <kb_id> --question "既往症的判定标准是什么？"
```

**C. NL question against the ontology graph.**
```bash
python scripts/cli.py ontology ask --question "列出与'重疾豁免'触发条件相关的合规通函"
# returns {question, cypher, explanation, columns, rows, answer}
```

**D. Tight-loop content discovery + read.**
```bash
# list all "claims" articles, then pull markdown of every one matching a regex
python scripts/cli.py articles list --channel-id <ch_id> --limit 200 \
  | jq -r '.items[] | select(.name | test("乳腺癌")) | .id' \
  | while read id; do python scripts/cli.py articles markdown --id "$id" --out "./$id.md"; done
```

## Reference

- Per-command JSON shapes & curl equivalents: [reference.md](reference.md)
- Canonical route list: project `docs/features/api-reference.md`
- Tests: `tests/` — `pytest -v` against an httpx mock transport (see `dev-requirements.txt`)
