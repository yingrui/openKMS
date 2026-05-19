---
name: openkms
description: >-
  Operates and queries an openKMS deployment over its HTTP API using a personal API key.
  Read paths: global search across documents/articles/wiki/KBs; list & fetch markdown for
  documents and articles; list & get wiki pages by path; **wiki page substring/semantic search**; list wiki space stored files (vault .md, assets, uploads) and linked
  channel documents; KB semantic search and grounded
  Q&A; list glossaries and terms, export/import term payloads; knowledge map taxonomy tree and resource links; document lineage (relationships)
  and policy lifecycle fields; article↔article relationship list/create/delete; list evaluations, items, and runs (including wiki content coverage when a wiki space is linked); run Cypher (or natural-language questions) against the ontology graph.
  Write paths: create channels, upload documents,
  create articles (incl. from URL), upsert wiki pages, delete wiki stored files (incl. vault .md), link/unlink
  wiki↔documents, create KB FAQs and evaluations (update evaluation metadata and items in place), trigger evaluation runs; glossary and term CRUD, bulk import, AI term suggest; knowledge map nodes and channel/wiki mappings; document
  lifecycle PATCH and relationship create/delete; article relationship create/delete; ontology object/link CRUD and Neo4j index (bulk or per-type).
  Use when the user wants an agent — or any external
  tool — to read content from or push content to openKMS without the web UI. Agents must use
  the bundled `scripts/cli.py` only (no ad-hoc curl or custom HTTP). Do not modify skill
  source files; only `config.yml` may be created/updated for credentials when the user asks.
---

# openKMS skill

## Mandatory for agents: use `scripts/cli.py` only

Do **not** implement openKMS access with hand-written **`curl`**, ad-hoc **`httpx`/`requests`/`fetch`**, or throwaway scripts that call `/api/…` directly. Do **not** treat [reference.md](reference.md) as something to copy into new code—it documents how each **existing** CLI subcommand maps to HTTP for **operators and code review**, not as a second implementation path.

**Every** read and write against this deployment must go through **`python scripts/cli.py …`** from this skill’s **`scripts/`** tree (after `pip install -r requirements.txt`). That preserves Bearer auth, mutation gates (`--yes` / `--dry-run`), multipart uploads, path encoding, and error handling in one place. If a workflow is missing from the CLI, **extend `openkms-skill` in the repository** (or ask the user to)—do not bypass the bundled scripts.

**Evaluations.** To change an evaluation’s name, description, or wiki link, use **`evaluations update`**. To add, edit, or remove question rows, use **`evaluations items add`**, **`evaluations items update`**, and **`evaluations items delete`**. Do **not** delete an evaluation and **`evaluations create`** a replacement just to “refresh” data—that drops **saved runs** and changes the evaluation id (bad for bookmarks, scripts, and comparisons). Reserve **`evaluations create`** for when the user explicitly wants a **new** evaluation.

**Do not modify this skill’s shipped files.** Never edit, delete, or add files under this skill directory except **`config.yml`** — and **only** to set `api_base_url` and `api_key` when the user explicitly asks you to store them (see **Before you act** §2). Do not touch `SKILL.md`, `README.md`, `reference.md`, `scripts/`, `install.sh`, `requirements.txt`, tests, or any other path here; do not patch or extend the CLI inside the install tree. Changes belong in the **openKMS repository** with a normal human review, not in the agent’s copy of the skill.

## Before you act

1. **Config** — The runtime reads `config.yml` in **this directory** (next to `SKILL.md`). It must include:
   - `api_base_url` — backend origin only, e.g. `http://127.0.0.1:8102` (no trailing slash).
   - `api_key` — personal key from **Settings → API keys** in openKMS (user menu **Settings**; `okms.{uuid}.{secret}`).
   - Optional: `default_document_channel_id` / `default_article_channel_id` — UUID strings; when set, `documents list|upload` and `articles list|create|from-url` may omit `--channel-id` and use these defaults (see `config.yml.example`).

2. **If either value is missing** — Ask the user for the backend URL and a new key from **Settings** (they see the full token once when creating it). Then **write or update** `config.yml` in this skill directory. Never echo the key back in full unless the user explicitly asks.

3. **Run the bundled CLI** — From this skill directory (agents: use an absolute path to the skill root):

```bash
cd "$(dirname "$0")"   # skill root when invoked from repo; agents use absolute path to skill dir
pip install -q -r requirements.txt
python scripts/cli.py ping
```

4. **Auth header** — The CLI sends `Authorization: Bearer <api_key>`. Same permissions as the user who created the key.

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
- **Ontology read vs write.** `ontology cypher/text-to-cypher/answer/ask` go through `/api/ontology/*` and are **read-only** (server regex-blocks `CREATE/MERGE/DELETE/SET/REMOVE/DETACH/DROP/CALL/apoc/dbms`). To enrich the graph, use `ontology objects ...` and `ontology links ...` (Postgres ontology layer) and then **`ontology objects sync-neo4j`** / **`ontology links sync-neo4j`** (all indexable types) or **`sync-neo4j-type`** on one type id to MERGE into Neo4j.
- **`wiki files` is the whole space file store, not “attachments only”.** `wiki files list` / `wiki files delete` operate on `/api/wiki-spaces/…/files`: vault imports (including mirrored **`.md`** and images/PDFs), uploads, etc. Deleting a row removes that stored object (DB + storage). To change **wiki page body** (the page entity), use **`wiki put-page`** (or the app editor) — do not treat “files” as only sidecar attachments.
- **Knowledge map (`knowledge-map`).** Mirrors Console **Knowledge Map** under `/api/taxonomy/*`: taxonomy tree, node CRUD, and mapping document/article channels or wiki spaces to nodes. Requires **`taxonomy:read`** / **`taxonomy:write`** when the server enforces those permissions (same as the SPA).
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
| List document lineage (outgoing + incoming edges) | `python scripts/cli.py documents relationships list --id DOC_ID` |
| Save just the document markdown to a file | `python scripts/cli.py documents markdown --id DOC_ID --out ./case.md` |
| List articles (filter by channel/keyword) | `python scripts/cli.py articles list --channel-id ID --search "豁免"` |
| List article lineage (outgoing + incoming edges) | `python scripts/cli.py articles relationships list --id ART_ID` |
| Get article markdown | `python scripts/cli.py articles markdown --id ART_ID` |
| List wiki pages in a space | `python scripts/cli.py wiki list-pages --space-id SP_ID` |
| Search wiki pages (substring or semantic when indexed) | `python scripts/cli.py wiki pages semantic-matches --space-id SP_ID --q "onboarding" --top-k 10` |
| List wiki space stored files (vault .md, assets, uploads; not attachments-only) | `python scripts/cli.py wiki files list --space-id SP_ID` |
| List channel documents linked to a wiki space (UI “linked documents”) | `python scripts/cli.py wiki-spaces documents list --space-id SP_ID` |
| Get one wiki page by Obsidian path | `python scripts/cli.py wiki get-page --space-id SP_ID --path notes/onboarding` |
| List knowledge bases | `python scripts/cli.py kb list` |
| Semantic search over KB chunks + FAQs | `python scripts/cli.py kb search --id KB_ID --q "既往症定义" --limit 10` |
| Ask the KB a question (grounded answer) | `python scripts/cli.py kb ask --id KB_ID --question "..."` |
| List FAQs on a KB | `python scripts/cli.py kb-faq list --kb-id KB_ID` |
| List glossaries | `python scripts/cli.py glossaries list` |
| Get one glossary | `python scripts/cli.py glossaries get --id GL_ID` |
| List terms in a glossary (optional search) | `python scripts/cli.py glossaries terms list --glossary-id GL_ID --search "心梗"` |
| Get one glossary term | `python scripts/cli.py glossaries terms get --glossary-id GL_ID --term-id TERM_ID` |
| Export glossary terms (JSON) | `python scripts/cli.py glossaries export --glossary-id GL_ID` |
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
| Get one evaluation's metadata | `python scripts/cli.py evaluations get --id DS_ID` |
| List items in an evaluation | `python scripts/cli.py evaluations items list --id DS_ID --limit 50` |
| List runs for an evaluation | `python scripts/cli.py evaluation-runs list --evaluation-id DS_ID` |
| Get one run with per-item results | `python scripts/cli.py evaluation-runs get --evaluation-id DS_ID --run-id RUN_ID` |
| Compare two runs | `python scripts/cli.py evaluation-runs compare --evaluation-id DS_ID --run-a A --run-b B` |
| Get knowledge map taxonomy tree | `python scripts/cli.py knowledge-map nodes tree` |
| List all knowledge map resource links | `python scripts/cli.py knowledge-map resource-links list` |

## Write tasks

Mutating commands below use `-y`/`--yes` and `--dry-run` like ontology writes (non-TTY without `--yes` exits 2).

| Goal | Command |
|------|---------|
| List document channels (tree) | `python scripts/cli.py document-channels list` |
| Create document channel | `python scripts/cli.py document-channels create --name "Inbox" --yes` |
| Update document channel | `python scripts/cli.py document-channels update --id DC_ID --name "Renamed" --yes` |
| Upload a file to a channel | `python scripts/cli.py documents upload --channel-id ID --file /path/to/doc.pdf --yes` (or omit `--channel-id` if `default_document_channel_id` is set in `config.yml`) |
| Patch document lifecycle (series, dates, status) | `python scripts/cli.py documents lifecycle patch --id DOC_ID --lifecycle-status in_force --series-id SER_UUID --yes` |
| Add lineage edge (this doc → other) | `python scripts/cli.py documents relationships create --id DOC_ID --target-id OTHER_ID --relation-type supersedes --yes` |
| Remove an outgoing lineage edge | `python scripts/cli.py documents relationships delete --id DOC_ID --relationship-id REL_ID --yes` |
| List article channels (tree) | `python scripts/cli.py article-channels list` |
| Create article channel | `python scripts/cli.py article-channels create --name "Internal Wiki" --yes` |
| Update article channel | `python scripts/cli.py article-channels update --id AC_ID --parent-id PARENT_UUID --yes` |
| Create article from a markdown file | `python scripts/cli.py articles create --channel-id ID --name "Title" --markdown-file ./x.md --yes` |
| Import article from a URL (HTML → text heuristic) | `python scripts/cli.py articles from-url --channel-id ID --url https://example.com/a --yes` |
| Add article lineage edge (this article → other) | `python scripts/cli.py articles relationships create --id ART_ID --target-id OTHER_ID --relation-type supersedes --yes` |
| Remove an outgoing article lineage edge | `python scripts/cli.py articles relationships delete --id ART_ID --relationship-id REL_ID --yes` |
| List wiki spaces | `python scripts/cli.py wiki-spaces list` |
| Create wiki space | `python scripts/cli.py wiki-spaces create --name "Field Notes" --yes` |
| Link a channel document to a wiki space | `python scripts/cli.py wiki-spaces documents link --space-id SP_ID --document-id DOC_ID --yes` |
| Unlink a document from a wiki space (does not delete the document) | `python scripts/cli.py wiki-spaces documents unlink --space-id SP_ID --document-id DOC_ID --yes` |
| Upsert wiki page from file | `python scripts/cli.py wiki put-page --space-id ID --path my/page --title "T" --file ./note.md --yes` |
| Delete one wiki stored file by id (vault .md or any stored path; DB + storage) | `python scripts/cli.py wiki files delete --space-id SP_ID --file-id FILE_ID --yes` |
| Create FAQ on a KB | `python scripts/cli.py kb-faq create --kb-id ID --question "Q" --answer "A" --yes` |
| List evaluations | `python scripts/cli.py evaluations list` |
| Create evaluation | `python scripts/cli.py evaluations create --name "…" --kb-id KB_ID --wiki-space-id SP_ID --yes` |
| Update evaluation (name / description / KB or wiki link; same id, keeps runs) | `python scripts/cli.py evaluations update --id EV_ID --name "…" --yes` (optional `--description`, `--knowledge-base-id ID`, `--wiki-space-id ID`, or `--clear-wiki-space`) |
| Add one evaluation item | `python scripts/cli.py evaluations items add --id EV_ID --query "…" --expected-answer "…" --yes` (optional `--topic`, `--sort-order`) |
| Update one evaluation item | `python scripts/cli.py evaluations items update --id EV_ID --item-id ITEM_ID --query "…" --yes` (any of `--query`, `--expected-answer`, `--topic`, `--sort-order`) |
| Delete one evaluation item | `python scripts/cli.py evaluations items delete --id EV_ID --item-id ITEM_ID --yes` |
| Trigger an evaluation run | `python scripts/cli.py evaluations run --id EV_ID --type qa_answer --yes` (use `--type wiki_content_coverage` when the evaluation has a linked wiki space; `expected_answer` is the checklist text for the judge) |
| Create glossary | `python scripts/cli.py glossaries create --name "Product terms" --yes` |
| Update / delete glossary | `python scripts/cli.py glossaries update --id GL_ID --description "…" --yes` / `glossaries delete --id GL_ID --yes` |
| Create / update / delete term | `python scripts/cli.py glossaries terms create --glossary-id GL_ID --primary-en "MI" --primary-cn "心梗" --yes` (and `terms update` / `terms delete`) |
| Bulk-import terms from JSON file | `python scripts/cli.py glossaries import --glossary-id GL_ID --terms-file ./terms.json --mode replace --yes` |
| AI suggest for a term (uses default LLM) | `python scripts/cli.py glossaries terms suggest --glossary-id GL_ID --primary-en "STEMI" --yes` |
| Create knowledge map node | `python scripts/cli.py knowledge-map nodes create --name "Claims" --yes` |
| Patch / delete knowledge map node | `python scripts/cli.py knowledge-map nodes patch --id NODE_ID --name "Renamed" --yes` / `knowledge-map nodes delete --id NODE_ID --yes` |
| Map a channel or wiki space to a taxonomy node | `python scripts/cli.py knowledge-map resource-links put --taxonomy-node-id NODE --resource-type document_channel --resource-id CHAN_ID --yes` |
| Unmap a resource from the knowledge map | `python scripts/cli.py knowledge-map resource-links delete --resource-type wiki_space --resource-id WS_ID --yes` |

### Ontology objects + links

Same confirmation rules as other writes.

| Goal | Command |
|------|---------|
| Create object type | `python scripts/cli.py ontology objects create-type --name "Disease" --properties-json '[{"name":"icd","type":"string","required":true}]' --yes` |
| Update object type | `python scripts/cli.py ontology objects update-type --id OT --display-property name --yes` |
| Delete object type | `python scripts/cli.py ontology objects delete-type --id OT --yes` |
| Create object instance | `python scripts/cli.py ontology objects instances create --type-id OT --data-json '{"icd":"C50"}' --yes` |
| Update object instance | `python scripts/cli.py ontology objects instances update --type-id OT --id OI --data-json '{"icd":"C50.1"}' --yes` |
| Delete object instance | `python scripts/cli.py ontology objects instances delete --type-id OT --id OI --yes` |
| MERGE all indexable object types into Neo4j | `python scripts/cli.py ontology objects sync-neo4j --neo4j-data-source-id DS --yes` |
| MERGE one object type into Neo4j | `python scripts/cli.py ontology objects sync-neo4j-type --type-id OT_ID --neo4j-data-source-id DS --yes` |
| Create link type | `python scripts/cli.py ontology links create-type --name covers --source-type-id OT_PROD --target-type-id OT_DIS --cardinality many-to-many --yes` |
| Update link type | `python scripts/cli.py ontology links update-type --id LT --description "..." --yes` |
| Delete link type | `python scripts/cli.py ontology links delete-type --id LT --yes` |
| Create link instance | `python scripts/cli.py ontology links instances create --type-id LT --source-object-id OI_A --target-object-id OI_B --yes` |
| Delete link instance | `python scripts/cli.py ontology links instances delete --type-id LT --id LI --yes` |
| MERGE all indexable link types into Neo4j | `python scripts/cli.py ontology links sync-neo4j --neo4j-data-source-id DS --yes` |
| MERGE one link type into Neo4j | `python scripts/cli.py ontology links sync-neo4j-type --type-id LT_ID --neo4j-data-source-id DS --yes` |

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
