---
name: openkms
description: >-
  Operates an openKMS deployment via personal API key using bundled scripts/cli.py only
  (no ad-hoc curl/HTTP). Covers search, documents/articles/wiki/KB, glossaries, knowledge-map,
  evaluations, data-sources/datasets/connectors/jobs, ontology (objects/links/functions/actions),
  module Apps, and Kubernetes (apply, register-app, dev-sync, logs).
  Open references/functions-authoring.md for Function --source-code-file;
  references/actions-authoring.md for ontology action-types; references/app-builder.md for module App
  registration/patching; references/kubernetes.md for kubernetes apply/delete/dev-sync;
  references/datasets-authoring.md for dataset setup (register/upload, columns, keys, AI context,
  relationships, quality); references/stories.md for Data Insights stories and their findings;
  references/research-report.md for research reports (see assets/report-examples/).
  Use when agents must read or push openKMS content without the web UI. Only config.yml may be edited
  for credentials when the user asks.
---

# openKMS skill

Thin CLI over the openKMS HTTP API. Every command JSON-prints the raw response; you parse it and chain the next call. Progressive disclosure: **open a `references/*.md` only when that scenario applies** — nothing here is “always read before any work.”

## Iron rules

1. **Only `scripts/cli.py`.** Do not use hand-written `curl` / `httpx` / `requests` / `fetch`. **If the command you need does not exist: stop and report the gap** (name the missing workflow and the HTTP call that would cover it) — do not bypass with ad-hoc HTTP, and do **not** search the machine for a skill source tree. Extending the CLI is a maintainer action: only when the user explicitly asks **and** you are already working inside a writable skill-source checkout. [references/REFERENCE.md](references/REFERENCE.md) is a large CLI↔HTTP index — **do not read it whole and do not reimplement its paths**. To confirm a mapping, **grep the full CLI phrase in backticks** (as after `cli.py`) and read only matching rows — e.g. ``grep '`kb ask`' references/REFERENCE.md`` or ``grep '`jobs get`' …``. Each command has its own table row. Do **not** grep bare verbs like `list` / `get` (too many hits). Prefer `--help` for flags.
2. **Do not invent flags.** Prefer `python scripts/cli.py <group> --help` (then nested `--help`). On failure, read stderr; do not blind-retry.
3. **Writes need confirmation.** `--dry-run` prints the plan; `-y`/`--yes` confirms; **non-TTY without `--yes` exits 2**.
4. **An installed skill tree is read-only.** The only exception is **`config.yml`** (and only when the user asks to store `api_base_url` / `api_key`). Do not edit `SKILL.md`, `references/**`, or `scripts/**` in an installed copy, and do not treat a skill-source checkout elsewhere on the machine as in scope unless the user points you at it. Upstream changes land in the skill repository and reach installed copies via `install.sh` / a new packaged version.

## Open by scenario

Match the task, then open **one** guide. Skip rows that do not apply.

| Scenario | Open |
|----------|------|
| Install, config, project vs standalone paths | [references/setup.md](references/setup.md) |
| Docs / articles / wiki / KB / glossaries / map / eval commands | [references/commands-content.md](references/commands-content.md) |
| Ontology objects / links / Cypher / list-execute Functions | [references/commands-ontology.md](references/commands-ontology.md) |
| **Author** Function source (`--source-code-file` / validate / publish) | [references/functions-authoring.md](references/functions-authoring.md) |
| **Author** Action types (create / update / delete / execute) | [references/actions-authoring.md](references/actions-authoring.md) |
| **Author/set up** datasets (register, upload, keys, `ai_context`, relationships, quality) | [references/datasets-authoring.md](references/datasets-authoring.md) |
| **Author / re-run** a Data Insights story (findings, each over its own dataset or model) | [references/stories.md](references/stories.md) |
| Data sources / connectors / jobs / Apps list / Kubernetes browse | [references/commands-ops.md](references/commands-ops.md) |
| Register or patch a **module App** (`apps …` / `kubernetes register-app`) | [references/app-builder.md](references/app-builder.md) (`bindings.k8s` only) |
| Kubernetes **apply / delete / dev-sync** | [references/kubernetes.md](references/kubernetes.md) |
| Domain gotchas (pipelines, KB ask vs search, eval update vs recreate, …) | [references/pitfalls.md](references/pitfalls.md) |
| Multi-step recipes (A–I, Tushare DIY, register-app, research report) | [references/workflows.md](references/workflows.md) |
| Research / data-analysis report → Reveal + Plotly HTML (examples in assets/) | [references/research-report.md](references/research-report.md) |
| Confirm CLI → HTTP (grep full CLI in backticks; never reimplement) | [references/REFERENCE.md](references/REFERENCE.md) |
| **A route this skill does not wrap** — its parameters, body, or what it returns | `python scripts/cli.py api spec --path /api/<area>` (reads the generated `/openapi.json`; `--full` for the operation objects). Do **not** guess a path from this skill's prose — and **reading a route is not permission to call it**: if you need a route the CLI does not wrap, stop and report the gap (see the rule above) |

Authoring / Apps / k8s mutate guides matter only for those write paths — inventing Function shape, A2UI Source, or omitting `bindings.k8s` is what goes wrong if you skip **that** row.

## Quick start

The CLI resolves `config.yml` and its imports from its own location, so **cwd does not matter** — only the path to `cli.py` must be correct. Run it from the skill's installed path:

```bash
python <skill_dir>/scripts/cli.py ping
```

`<skill_dir>` is the skill's install location (see [setup.md](references/setup.md)). Elsewhere in this skill, examples are written as `python scripts/cli.py …`; run them as `<skill_dir>/scripts/cli.py …` unless your cwd is already the skill dir. Then discover with `--help`, open the matching scenario row above, and chain JSON responses. After long jobs (`connectors sync`, `kb index`, …), poll `jobs get --id JOB_ID`.
