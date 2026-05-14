# openkms-skill

Thin CLI + Python package that lets [OpenCode](https://opencode.ai/docs/skills), [Claude Code](https://claude.com/claude-code), or any LLM agent talk to an **openKMS** deployment over its public HTTP API. One personal API key in `config.yml`, every command JSON-prints the raw response so the agent can chain calls.

- **Install:** `./install.sh` (auto-detects OpenCode + Claude Code; pass `--target opencode|claude-code|both` or `--dest <path>` to override). Re-running upgrades the tree but **preserves your `config.yml`**.
- **Configure:** copy `config.yml.example` → `config.yml`, fill in `api_base_url` and `api_key`. Create keys in **openKMS → Settings → API keys** (`okms.{uuid}.{secret}`, shown once).
- **Agent-facing instructions:** [`SKILL.md`](SKILL.md) — **all access must use `python scripts/cli.py …` only** (no ad-hoc `curl` or custom HTTP scripts). [`reference.md`](reference.md) maps each CLI to HTTP for operators and code review, not for agents to bypass the CLI.

## Capabilities at a glance

The skill covers **read + write** for every major resource. Top-level groups:

| Group | Read | Write |
|---|---|---|
| `ping` | identity / API-key smoke test | — |
| `search` | global cross-resource (documents/articles/wiki/KB) | — |
| `documents` | `list`, `get`, `markdown`, **`relationships list`**, **`lifecycle patch`** | `upload`, **`relationships create`**, **`relationships delete`** |
| `articles` | `list`, `get`, `markdown`, **`relationships list`** | `create`, `from-url`, **`relationships create`**, **`relationships delete`** |
| `wiki` | `list-pages`, `get-page`, **`files list`** (vault `.md`/assets/uploads, not attachments-only) | `put-page`, **`files delete`** (same file store; can remove stored `.md`) |
| `wiki-spaces` | `list`, **`documents list`** | `create`, **`documents link`**, **`documents unlink`** |
| `document-channels` / `article-channels` | `list` (`--tree` for human outline) | `create`, `update` |
| `kb` | `list`, `get`, `search`, `ask` | — |
| `kb-faq` | `list` | `create` |
| `glossaries` | `list`, `get`, `export`, `terms list/get` | `create`, `update`, `delete`, `import`, `terms create/update/delete/suggest` |
| `knowledge-map` | **`nodes tree`**, **`resource-links list`** | **`nodes create`**, **`nodes patch`**, **`nodes delete`**, **`resource-links put`**, **`resource-links delete`** |
| `ontology` | `cypher`, `text-to-cypher`, `answer`, `ask` | — *(read-only sandbox)* |
| `ontology objects` | `list`, `get`, `instances list/get` | `create-type`, `update-type`, `delete-type`, `instances create/update/delete`, `sync-neo4j`, `sync-neo4j-type` |
| `ontology links` | `list`, `get`, `instances list` | `create-type`, `update-type`, `delete-type`, `instances create/delete`, `sync-neo4j`, `sync-neo4j-type` |
| `evaluation-datasets` | `list`, `get`, `items` | `create`, `run` |
| `evaluation-runs` | `list`, `get`, `compare` | — |

> **Mutation safety.** Every **write** subcommand (channels, `documents upload`, **`documents lifecycle patch`**, **`documents relationships create|delete`**, `articles create`/`from-url`, **`articles relationships create|delete`**, `wiki put-page`, **`wiki files delete`**, `wiki-spaces documents link|unlink`, KB FAQ, **`glossaries`** and **`glossaries terms`**, **`knowledge-map`** nodes and resource-links, evaluation `create`/`run`, and ontology objects/links) uses the same gate: `--yes`/`-y`, `--dry-run`, interactive `Proceed?`, or **exit 2 on non-TTY without `--yes`** so agents opt in deliberately.

## Quick examples

All commands print raw JSON to stdout. Pipe through `jq` or parse with `json.loads`.

### 1. Smoke test

```bash
python scripts/cli.py ping
# → { "id": "...", "email": "...", "username": "...", "permissions": ["all"] }
```

### 2. Global search → fetch markdown

Discover by title across all resource types, then pull one article's body to a file.

```bash
python scripts/cli.py search --q "重疾" --types articles,documents --limit 10

python scripts/cli.py articles markdown \
  --id 56d19db5-99b1-4a6e-b82d-502fcddfb06b \
  --out /tmp/compare.md
```

### 3. KB semantic search + grounded Q&A

`kb search` returns raw chunks + FAQ matches with confidence scores. `kb ask` proxies to the QA agent and returns a grounded answer with citations.

```bash
python scripts/cli.py kb search \
  --id <kb_id> --q "甲状腺结节核保" --limit 5

python scripts/cli.py kb ask \
  --id <kb_id> --question "重疾险等待期一般是多久？"
```

### 4. Ontology graph (NL → Cypher → answer)

```bash
# convenience: 3-call chain (text-to-cypher → run → summarize)
python scripts/cli.py ontology ask \
  --question "哪些重疾产品覆盖原位癌？"

# or hand-write Cypher
python scripts/cli.py ontology cypher \
  --query "MATCH (p:Product)-[:COVERS]->(d:Disease {name:'原位癌'}) RETURN p.name"
```

### 5. Wiki upsert (read → write loop)

```bash
# read first
python scripts/cli.py wiki list-pages --space-id <space_id> --limit 50
python scripts/cli.py wiki get-page --space-id <space_id> --path notes/onboarding

# then upsert
python scripts/cli.py wiki put-page \
  --space-id <space_id> \
  --path sops/sop-1092 \
  --title "SOP-1092 重疾理赔申请材料清单" \
  --file ./sop-1092.md \
  --yes
```

### 6. Compare two evaluation runs

```bash
python scripts/cli.py evaluation-runs compare \
  --dataset-id <ds> --run-a <runA> --run-b <runB>
```

### 7. Tight-loop discovery + fetch (shell)

```bash
# pull markdown for every article whose title matches a regex
python scripts/cli.py articles list --channel-id <ch> --limit 200 \
  | jq -r '.items[] | select(.name | test("乳腺癌")) | .id' \
  | while read id; do
      python scripts/cli.py articles markdown --id "$id" --out "./$id.md"
    done
```

## What's new (vs prior version)

Previously the skill was mostly write-only (`upload`, `create`, `put-page`). This refactor adds the read paths needed for an agent to **discover → fetch → reason → write**:

| Area | Before | Now |
|---|---|---|
| Global search | (none) | `search` (cross-resource by title) |
| Documents | `upload` only | `+ list / get / markdown` |
| Articles | `create` / `from-url` only | `+ list / get / markdown` |
| Wiki | `put-page` only | `+ list-pages / get-page` |
| KB | (none) | `list / get / search / ask` |
| Ontology | (none) | `cypher / text-to-cypher / answer / ask` |
| Eval runs | datasets only | `+ list / get / compare` |

Structural changes:
- Old 600-line `cli.py` → 42-line dispatcher + `scripts/openkms/` package (`client.py`, `config.py`, `_io.py`, `commands/*.py`). Adding a new command now means adding one file under `commands/`.
- `install.sh` gained `--target opencode|claude-code|both|auto` and `--dest <path>`; auto-mode picks runtimes that exist on the machine. Existing `config.yml` at any destination is preserved on re-install.
- New `tests/` suite under `pytest` against an `httpx` mock transport (`pip install -r dev-requirements.txt`, then `pytest -v`), plus an end-to-end smoke runner (`tests/run_cli.sh`) that hits a real openKMS.

## Development

### Unit tests (offline, no openKMS needed)

`tests/test_*.py` use `httpx.MockTransport`, so they don't talk to any backend.

```bash
pip install -r requirements.txt -r dev-requirements.txt
pytest -v
```

### End-to-end smoke (real openKMS)

`tests/run_cli.sh` shells out to `python scripts/cli.py …` for 21 read-path commands (ping → search → documents/articles/wiki → KB list/search/ask → ontology cypher/text-to-cypher/ask → eval datasets), chaining ids automatically (the first `id` from each `list` feeds the next `get`/`markdown`). It can be run end-to-end or you can copy individual lines to your shell.

Pre-reqs: a working `config.yml` (`api_base_url` + `api_key`) and `jq` on `PATH`.

```bash
bash tests/run_cli.sh
```

Edit the `Q_*` variables at the top of the script to change the search query, the KB question, the Cypher, etc. A failing step doesn't abort the rest (`set +e`), so you get a full pass over every endpoint in one go. The Python equivalent is at `tests/smoke.py` if you'd rather drive it from Python (same coverage, also writes a per-step report to `/tmp/openkms_smoke/`).

### Layout

```
openkms-skill/
  scripts/
    cli.py              # 42-line dispatcher
    openkms/
      client.py         # httpx client + Bearer auth from config.yml
      config.py         # config.yml loader
      _io.py            # JSON pretty-print, file helpers
      commands/         # one module per resource (ping, search, kb, ontology, ...)
  tests/
    test_*.py           # pytest + httpx MockTransport (offline)
    run_cli.sh          # end-to-end smoke against a real openKMS (jq required)
    smoke.py            # same coverage as run_cli.sh, in Python
  SKILL.md              # agent instructions (when/how to use)
  reference.md          # per-command JSON shapes + curl equivalents
  install.sh            # multi-target installer
```

See [`SKILL.md`](SKILL.md) for the full command matrix and workflow recipes.
