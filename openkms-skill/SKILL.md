---
name: openkms
description: >-
  Operates and queries an openKMS deployment over its HTTP API using a personal API key.
  Read paths: global search across documents/articles/wiki/KBs; list & fetch markdown for
  documents and articles; list & get wiki pages by path; list wiki space files and linked
  channel documents; KB semantic search and grounded
  Q&A; run Cypher (or natural-language questions) against the ontology graph; list
  evaluation datasets, items, and runs. Write paths: create channels, upload documents,
  create articles (incl. from URL), upsert wiki pages, delete wiki files, link/unlink
  wiki↔documents, create KB FAQs and evaluation
  datasets, trigger evaluation runs. Use when the user wants an agent — or any external
  tool — to read content from or push content to openKMS without the web UI.
---

# openKMS skill

## Before you act

1. **Config** — The runtime reads `config.yml` in **this directory** (next to `SKILL.md`). It must include:
   - `api_base_url` — backend origin only, e.g. `http://127.0.0.1:8102` (no trailing slash).
   - `api_key` — personal key from **Settings → API keys** in openKMS (user menu **Settings**; `okms.{uuid}.{secret}`).
   - Optional: `default_document_channel_id` / `default_article_channel_id` — UUID strings; when set, `documents list|upload` and `articles list|create|from-url` may omit `--channel-id` and use these defaults (see `config.yml.example`).

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
- **Write commands and confirm gating.** Every mutating CLI subcommand uses the same pattern as ontology objects/links: `--dry-run` prints the planned `[METHOD] path + body` (upload uses a JSON summary with `channel_id` and `file` path, not file bytes) and exits 0 without HTTP; `-y` / `--yes` skips the prompt; without either on a TTY you get `Proceed? [y/N]`; **on a non-TTY without `--yes` the command exits 2** — agents must pass `--yes` deliberately.
- **Ontology read vs write.** `ontology cypher/text-to-cypher/answer/ask` go through `/api/ontology/*` and are **read-only** (server regex-blocks `CREATE/MERGE/DELETE/SET/REMOVE/DETACH/DROP/CALL/apoc/dbms`). To enrich the graph, use `ontology objects ...` and `ontology links ...` (Postgres ontology layer) and then `ontology objects sync-neo4j` / `ontology links sync-neo4j` to MERGE the changes into Neo4j.
- **Output is verbose.** Each list response can include long arrays. If you're scanning many records, pipe through `jq` to project just the fields you need rather than dumping everything into context.

## Read / query tasks

| Goal | Command |
|------|---------|
| Verify connectivity | `python scripts/cli.py ping` |
| Global search across content | `python scripts/cli.py search --q "乳腺癌" --types documents,articles --limit 20` |
| List document channels as indented tree (human-readable) | `python scripts/cli.py document-channels list --tree` |
| List article channels as indented tree (human-readable) | `python scripts/cli.py article-channels list --tree` |
| List documents (filter by channel/keyword) | `python scripts/cli.py documents list --channel-id ID --search "心梗" --limit 50` |
| Get document metadata + body | `python scripts/cli.py documents get --id DOC_ID` |
| Save just the document markdown to a file | `python scripts/cli.py documents markdown --id DOC_ID --out ./case.md` |
| List articles (filter by channel/keyword) | `python scripts/cli.py articles list --channel-id ID --search "豁免"` |
| Get article markdown | `python scripts/cli.py articles markdown --id ART_ID` |
| List wiki pages in a space | `python scripts/cli.py wiki list-pages --space-id SP_ID` |
| List wiki space files (attachments / vault binaries) | `python scripts/cli.py wiki files list --space-id SP_ID` |
| List channel documents linked to a wiki space (UI “linked documents”) | `python scripts/cli.py wiki-spaces documents list --space-id SP_ID` |
| Get one wiki page by Obsidian path | `python scripts/cli.py wiki get-page --space-id SP_ID --path notes/onboarding` |
| List knowledge bases | `python scripts/cli.py kb list` |
| Semantic search over KB chunks + FAQs | `python scripts/cli.py kb search --id KB_ID --q "既往症定义" --limit 10` |
| Ask the KB a question (grounded answer) | `python scripts/cli.py kb ask --id KB_ID --question "..."` |
| List FAQs on a KB | `python scripts/cli.py kb-faq list --kb-id KB_ID` |
| Run a Cypher query against the ontology graph | `python scripts/cli.py ontology cypher --query "MATCH (n:Customer) RETURN n LIMIT 10"` |
| NL question → Cypher (just the translation) | `python scripts/cli.py ontology text-to-cypher --question "..."` |
| NL question → Cypher → results → NL answer (3-call chain) | `python scripts/cli.py ontology ask --question "..."` |
| List object types | `python scripts/cli.py ontology objects list [--master-data-only] [--count-from-neo4j]` |
| Get one object type | `python scripts/cli.py ontology objects get --id OT_ID` |
| List instances of a type | `python scripts/cli.py ontology objects instances list --type-id OT_ID --limit 50` |
| Get one instance | `python scripts/cli.py ontology objects instances get --type-id OT_ID --id OI_ID` |
| List link types | `python scripts/cli.py ontology links list` |
| Get one link type | `python scripts/cli.py ontology links get --id LT_ID` |
| List instances of a link type | `python scripts/cli.py ontology links instances list --type-id LT_ID --limit 50` |
| Get one evaluation dataset's metadata | `python scripts/cli.py evaluation-datasets get --id DS_ID` |
| List items in a dataset | `python scripts/cli.py evaluation-datasets items --id DS_ID --limit 50` |
| List runs for a dataset | `python scripts/cli.py evaluation-runs list --dataset-id DS_ID` |
| Get one run with per-item results | `python scripts/cli.py evaluation-runs get --dataset-id DS_ID --run-id RUN_ID` |
| Compare two runs | `python scripts/cli.py evaluation-runs compare --dataset-id DS_ID --run-a A --run-b B` |

## Write tasks

Mutating commands below use `-y`/`--yes` and `--dry-run` like ontology writes (non-TTY without `--yes` exits 2).

| Goal | Command |
|------|---------|
| List document channels (tree) | `python scripts/cli.py document-channels list` |
| Create document channel | `python scripts/cli.py document-channels create --name "Inbox" --yes` |
| Update document channel | `python scripts/cli.py document-channels update --id DC_ID --name "Renamed" --yes` |
| Upload a file to a channel | `python scripts/cli.py documents upload --channel-id ID --file /path/to/doc.pdf --yes` (or omit `--channel-id` if `default_document_channel_id` is set in `config.yml`) |
| List article channels (tree) | `python scripts/cli.py article-channels list` |
| Create article channel | `python scripts/cli.py article-channels create --name "Internal Wiki" --yes` |
| Update article channel | `python scripts/cli.py article-channels update --id AC_ID --parent-id PARENT_UUID --yes` |
| Create article from a markdown file | `python scripts/cli.py articles create --channel-id ID --name "Title" --markdown-file ./x.md --yes` |
| Import article from a URL (HTML → text heuristic) | `python scripts/cli.py articles from-url --channel-id ID --url https://example.com/a --yes` |
| List wiki spaces | `python scripts/cli.py wiki-spaces list` |
| Create wiki space | `python scripts/cli.py wiki-spaces create --name "Field Notes" --yes` |
| Link a channel document to a wiki space | `python scripts/cli.py wiki-spaces documents link --space-id SP_ID --document-id DOC_ID --yes` |
| Unlink a document from a wiki space (does not delete the document) | `python scripts/cli.py wiki-spaces documents unlink --space-id SP_ID --document-id DOC_ID --yes` |
| Upsert wiki page from file | `python scripts/cli.py wiki put-page --space-id ID --path my/page --title "T" --file ./note.md --yes` |
| Delete a wiki space file (DB + storage) | `python scripts/cli.py wiki files delete --space-id SP_ID --file-id FILE_ID --yes` |
| Create FAQ on a KB | `python scripts/cli.py kb-faq create --kb-id ID --question "Q" --answer "A" --yes` |
| List evaluation datasets | `python scripts/cli.py evaluation-datasets list` |
| Create evaluation dataset | `python scripts/cli.py evaluation-datasets create --name "..." --kb-id KB_ID --yes` |
| Trigger an evaluation run | `python scripts/cli.py evaluation-datasets run --id DS_ID --type qa_answer --yes` |

### Ontology objects + links

Same confirmation rules as other writes. Commands:
|------|---------|
| Create object type | `python scripts/cli.py ontology objects create-type --name "Disease" --properties-json '[{"name":"icd","type":"string","required":true}]' --yes` |
| Update object type | `python scripts/cli.py ontology objects update-type --id OT --display-property name --yes` |
| Delete object type | `python scripts/cli.py ontology objects delete-type --id OT --yes` |
| Create object instance | `python scripts/cli.py ontology objects instances create --type-id OT --data-json '{"icd":"C50"}' --yes` |
| Update object instance | `python scripts/cli.py ontology objects instances update --type-id OT --id OI --data-json '{"icd":"C50.1"}' --yes` |
| Delete object instance | `python scripts/cli.py ontology objects instances delete --type-id OT --id OI --yes` |
| MERGE object instances into Neo4j | `python scripts/cli.py ontology objects sync-neo4j --neo4j-data-source-id DS --yes` |
| Create link type | `python scripts/cli.py ontology links create-type --name covers --source-type-id OT_PROD --target-type-id OT_DIS --cardinality many-to-many --yes` |
| Update link type | `python scripts/cli.py ontology links update-type --id LT --description "..." --yes` |
| Delete link type | `python scripts/cli.py ontology links delete-type --id LT --yes` |
| Create link instance | `python scripts/cli.py ontology links instances create --type-id LT --source-object-id OI_A --target-object-id OI_B --yes` |
| Delete link instance | `python scripts/cli.py ontology links instances delete --type-id LT --id LI --yes` |
| MERGE link instances into Neo4j | `python scripts/cli.py ontology links sync-neo4j --neo4j-data-source-id DS --yes` |

When a link type is `many-to-many` and dataset-backed, the server is the source of truth via the junction table — `ontology links instances create/delete` will return 4xx. Surface that error rather than trying to bypass.

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
