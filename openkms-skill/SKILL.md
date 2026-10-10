---
name: openkms
description: >-
  Operates an openKMS deployment via personal API key using bundled scripts/cli.py only
  (no ad-hoc curl/HTTP). Covers search, documents/articles/wiki/KB, glossaries, knowledge-map,
  evaluations, data-sources/datasets/connectors/jobs, ontology (objects/links/functions/actions),
  module Apps, and Kubernetes (apply, register-app, dev-sync, logs) on registered clusters.
  When writing Function --source-code-file: open references/functions-authoring.md.
  When creating/updating/deleting/executing ontology action-types: open references/actions-authoring.md.
  When registering or patching module Apps: open references/app-builder.md.
  When kubernetes apply/delete/dev-sync: open references/kubernetes.md.
  Use when agents must read or push openKMS content without the web UI. Only config.yml
  may be edited for credentials when the user asks.
---

# openKMS skill

Thin CLI over the openKMS HTTP API. Every command JSON-prints the raw response; you parse it and chain the next call. Progressive disclosure: **open a `references/*.md` only when that scenario applies** — nothing here is “always read before any work.”

## Iron rules

1. **Only `scripts/cli.py`.** Do not use hand-written `curl` / `httpx` / `requests` / `fetch`. Missing workflow → extend the skill **in the openKMS repo**, do not bypass. [references/REFERENCE.md](references/REFERENCE.md) is a large CLI↔HTTP index — **do not read it whole and do not reimplement its paths**. To confirm a mapping, **grep the full CLI phrase in backticks** (as after `cli.py`) and read only matching rows — e.g. ``grep '`kb ask`' references/REFERENCE.md`` or ``grep '`jobs get`' …``. Each command has its own table row. Do **not** grep bare verbs like `list` / `get` (too many hits). Prefer `--help` for flags.
2. **Do not invent flags.** Prefer `python scripts/cli.py <group> --help` (then nested `--help`). On failure, read stderr; do not blind-retry.
3. **Writes need confirmation.** `--dry-run` prints the plan; `-y`/`--yes` confirms; **non-TTY without `--yes` exits 2**.
4. **Do not modify shipped skill files** except **`config.yml`** (and only when the user asks to store `api_base_url` / `api_key`). Changes belong in the repository, not the installed copy.

## Open by scenario

Match the task, then open **one** guide. Skip rows that do not apply.

| Scenario | Open |
|----------|------|
| Install, config, project vs standalone paths | [references/setup.md](references/setup.md) |
| Docs / articles / wiki / KB / glossaries / map / eval commands | [references/commands-content.md](references/commands-content.md) |
| Ontology objects / links / Cypher / list-execute Functions | [references/commands-ontology.md](references/commands-ontology.md) |
| **Author** Function source (`--source-code-file` / validate / publish) | [references/functions-authoring.md](references/functions-authoring.md) |
| **Author** Action types (create / update / delete / execute) | [references/actions-authoring.md](references/actions-authoring.md) |
| Data sources / connectors / jobs / Apps list / Kubernetes browse | [references/commands-ops.md](references/commands-ops.md) |
| Register or patch a **module App** (`apps …` / `kubernetes register-app`) | [references/app-builder.md](references/app-builder.md) (`bindings.k8s` only) |
| Kubernetes **apply / delete / dev-sync** | [references/kubernetes.md](references/kubernetes.md) |
| Domain gotchas (pipelines, KB ask vs search, eval update vs recreate, …) | [references/pitfalls.md](references/pitfalls.md) |
| Multi-step recipes (A–H, Tushare DIY, register-app) | [references/workflows.md](references/workflows.md) |
| Confirm CLI → HTTP (grep full CLI in backticks; never reimplement) | [references/REFERENCE.md](references/REFERENCE.md) |

Authoring / Apps / k8s mutate guides matter only for those write paths — inventing Function shape, A2UI Source, or omitting `bindings.k8s` is what goes wrong if you skip **that** row.

## Quick start

**Project agent** (cwd = project root; env injected — details in [setup.md](references/setup.md)):

```bash
python .openkms/skills/openkms/scripts/cli.py ping
```

**Standalone** (skill directory as cwd; `pip install -r requirements.txt` **once** after copy):

```bash
python scripts/cli.py ping
```

Then discover with `--help`, open the matching scenario row above, and chain JSON responses. After long jobs (`connectors sync`, `kb index`, …), poll `jobs get --id JOB_ID`.
