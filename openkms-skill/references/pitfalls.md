# Pitfalls & practical guidance

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**. Load when a domain behaves unexpectedly or before multi-step content/ontology work.

## CLI discovery & failure handling

- **Never invent** subcommand names or flags. Before any unfamiliar group, run `python scripts/cli.py <group> --help`, then nested `--help` (e.g. `ontology functions --help`).
- When a command fails, read **stderr** carefully. Fix the cause; **do not** blind-retry the same command.
- After `connectors sync`, `kb index`, `media generate`, etc., poll **`jobs get --id JOB_ID`**. Do **not** call `/api/jobs` with raw HTTP.
- This skill does **not** wrap feature toggles, the schedules hub, or Console **cluster registration**. It **does** wrap **`kubernetes …`** against already-registered clusters. Never print or store kubeconfig.
- **Write gating:** every mutating subcommand — `--dry-run` prints the planned call; `-y`/`--yes` skips prompt; **non-TTY without `--yes` exits 2**.
- **Permissions** are server-side. List endpoints filter to readable channels; out-of-scope GET returns **404** (not 403).
- **Output is verbose.** Pipe through `jq` when scanning many records.

## Content

- **Document channels need a pipeline for PDF parse.** Without a default pipeline, documents stay `uploaded` and Process/`POST /api/jobs` fails. Before creating a channel for parseable files: `pipelines list` (or `--table`), then `document-channels create --pipeline-id …` or set `default_pipeline_id` in `config.yml`. XLSX/XMind previews do not need a pipeline. Fix existing: `document-channels update --id DC_ID --pipeline-id … --yes`.
- **Discover before you fetch.** Prefer `search` or `documents|articles list --search …`, then `get` / `markdown`. Do not list a whole channel just to grep locally.
- **Article content review.** Channel rubric via `article-channels update`. **`articles reviews latest`** returns scores + **`result.suggestions`**. 404 → run **`articles review run --id ART_ID --yes`**. Review does not edit the article.
- **`kb ask` vs `kb search`.** `ask` = grounded answer + citations. `search` = hybrid chunks + FAQs for you to reason over.
- **KB wiki indexing.** `kb wiki-spaces link` → `kb wiki-spaces reindex` or `kb index`; poll **`jobs get`**.
- **`wiki files`** is the whole space file store (vault + assets), not attachments-only.
- **Evaluations.** Change metadata with **`evaluations update`**. Change rows with **`evaluations items add|update|delete`**. Do **not** delete + recreate an evaluation just to “refresh” — that drops **saved runs** and changes the id. Reserve **`evaluations create`** for a truly **new** evaluation.

## Ontology & apps

- **`ontology ask`** is a 3-call chain (NL → Cypher → answer). Use when the question is graph-shaped; use `cypher` / `text-to-cypher` when you need to inspect intermediates.
- **Functions vs Actions vs Connectors.** Functions = read/compute (`ontology functions …`). Action types = intentional ops (`ontology action-types …`). **Default to built-in rules** — `--rule-type object_create|object_modify|object_delete`. Use `--rule-type function` + `--function-id` **only** for custom FoO logic. Before Action writes, read [actions-authoring.md](actions-authoring.md). Connector **sync** loads datasets — not an Action. Prefer not Neo4j-indexing huge daily fact tables; index master data + analysis objects. Domain types/Functions are **tenant DIY** — see [workflows.md](workflows.md) **G**. Hosted UIs: [app-builder.md](app-builder.md) / workflow **H**.
- **Function source.** Before `--source-code-file`, read [functions-authoring.md](functions-authoring.md). No ad-hoc HTTP inside Function code. `Client` is read/compose only.
- **Module Apps.** Read [app-builder.md](app-builder.md) before `apps create|patch|publish`. Prefer `kubernetes register-app`. No A2UI Source / synthesize.
- **Object type properties** in `--properties-json`: `string`, `integer`, `number`, `boolean`, `date`, `datetime`, `uuid`.
- **Ontology read vs write.** `ontology cypher|text-to-cypher|answer|ask` are **read-only**. Enrich via `ontology objects|links` then **`sync-neo4j*`** with `--neo4j-data-source-id` (discover via `data-sources list`, kind `neo4j` — never guess or omit).
- **Dataset-backed many-to-many links:** junction table is SoT; `ontology links instances create/delete` returns 4xx — surface the error, do not bypass.
