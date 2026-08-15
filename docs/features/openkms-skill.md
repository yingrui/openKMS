# openkms-skill

Portable **[Agent Skill](https://agentskills.io/specification)** + thin Python CLI that calls the openKMS HTTP API with a **personal API key** (**Settings → API keys**).

Works with **any** Agent Skills–compatible host, including:

| Host | How it is installed |
|------|---------------------|
| **openKMS Agents** (in-product) | Upload zip on **Agents → Skills**, install under a project’s Agent settings |
| **Claude Code** | `./install.sh --target claude-code` → `~/.claude/skills/openkms/` |
| **OpenCode** | `./install.sh --target opencode` → `~/.config/opencode/skills/openkms/` |
| **Other / manual** | Copy the skill tree; set `config.yml` or env vars |

Repo path: [`openkms-skill/`](https://github.com/yingrui/openKMS/blob/main/openkms-skill/). Distinct from **`openkms-cli`** (worker/pipeline tooling).

## Layout ([agentskills.io](https://agentskills.io/specification))

```
openkms-skill/
  SKILL.md                 # agent instructions + YAML frontmatter
  references/              # load on demand
    REFERENCE.md           # CLI ↔ HTTP
    functions-authoring.md # Ontology Function source
  scripts/cli.py           # only supported access path for agents
  assets/                  # reserved
  README.md / requirements.txt / install.sh / package.sh
```

## Install

```bash
cd openkms-skill
./install.sh                      # auto: OpenCode and/or Claude Code if present
./install.sh --target both
./package.sh --version 1.0.0      # zip for Agents → Skills upload
```

`install.sh` preserves an existing **`config.yml`** at the destination.

Standalone / first-time deps: `pip install -r requirements.txt` once in the skill tree (project Agents install runs this when the skill is installed).

## Configure

**External hosts (Claude Code, OpenCode, …):** copy `config.yml.example` → `config.yml`:

- `api_base_url` — backend origin (e.g. `http://127.0.0.1:8102`)
- `api_key` — full `okms.{uuid}.{secret}` from **Settings → API keys**

**In-product Agents:** the runner injects (no key required on disk):

- `OPENKMS_API_KEY`, `OPENKMS_API_BASE_URL`, `OPENKMS_SKILL_ROOT`

`scripts/openkms/config.py` prefers these env vars over `config.yml`.

## Use

```bash
python scripts/cli.py ping
```

**Agents must use only `python scripts/cli.py …`** (see `SKILL.md`). Do not hand-roll `curl` against `/api/…`; extend the skill in-repo if a workflow is missing. Always run `<command> --help` before inventing flags.

Coverage includes data-sources, datasets, connectors (e.g. Tushare sync/probe), jobs, channels, documents/articles/wiki/KB, glossaries, knowledge-map, comments, media, evaluations, and ontology (objects/links, functions, action-types, groups). Function **source** authoring: `references/functions-authoring.md`. CLI↔HTTP: `references/REFERENCE.md`. Control-plane APIs (feature toggles, schedules hub, Console admin) are **not** wrapped.

Domain ontologies (e.g. Tushare → Stock → read-only Functions) are **tenant DIY** via `SKILL.md` Workflow **G** — not platform seeds. Step-by-step: [Tutorial — Tushare market ontology](../tutorials/tushare-market-ontology.md). Action execute does not yet apply durable object writes; see [Manager alignment](../research/ontology_manager_alignment.md).

**Mutations** require `-y`/`--yes` or `--dry-run` (non-TTY without `--yes` exits 2). Optional `default_document_channel_id` / `default_article_channel_id` in `config.yml`.
