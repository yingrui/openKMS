# Data layer — Datasets · Data Model · Data Explorer

Feature reference for the openKMS **data layer**: the **Datasets** app (Catalog + Model) and the **Data Explorer**, plus the datasets, fields, relationships, quality, metrics, and reports beneath them. **Positioning:** *Route B — a knowledge substrate for agents, not a data-engineering platform.*

**Status:** shipped in part, with a pending refactor to the **Apache Ossie** semantic model. See [Refactoring plan](#refactoring-plan) · [Semantic model spec](data-layer-semantic-model.md) · [Interaction design](data-layer-interaction.md).

**Related:** [Development plan](../development_plan.md) · [Data models](data-models.md) · [API reference](api-reference.md) · [Semantic model spec](data-layer-semantic-model.md) · [Interaction design](data-layer-interaction.md) · [Implementation design](data-layer-implementation.md) · [Ossie research](../research/ossie_semantic_layer.md) · [Data grid selection](../research/data_grid_selection.md)

---

## Positioning

The data layer exists so that **people and agents can consume real data as knowledge**. It **references** external tables and **ingests** uploaded files; it does not run a transform engine or version data content.

| Principle | Means |
|-----------|-------|
| Access tables; never transform | **Access** = reference an external table **or** ingest an uploaded file into a table. **Transform** = table-to-table derivation/cleaning — out of scope. The raw uploaded file is kept in object storage. |
| Model = management of existing tables | "Data model" is **annotation and governance of tables/columns** (semantics, relationships, quality, metrics) — not physical modeling of new stores. |
| Three audiences, one pipeline | **Data engineer** configures sources/datasets and the model; **data BA** inspects data and assesses quality; **business** consumes results through agents. |
| AI-native Explorer | Exploration is conversational; **diagnostic and predictive** analysis, not only descriptive charts. Reports are dashboard-like, with AI-authored suggestions attached to each chart. |

**Non-goals:** table-to-table ETL/transform engine, data-content versioning; CDC/streaming; a general-purpose BI/SQL IDE; replacing every business database.

---

## The Ossie class model — definitions and where each is managed

Apache Ossie defines a semantic model as **datasets + relationships + metrics**, with **fields/dimensions** on datasets and **queries** over metrics. The Datasets app manages **exactly these**, split **per-dataset** (dataset detail, “Catalog”) vs **cross-dataset** (the **Model** tab).

Definitions first; each concept is **authored in exactly one place**.

| Concept | Definition | Managed where | Level |
|---------|------------|---------------|-------|
| **Semantic Model** | a **named scope**: a subset of the shared datasets + its fields and metrics (+ `ai_context`) | **Model** tab — list → model detail (document **view** + Import per model) | cross-dataset |
| **Datasets** | a logical entity: a physical table (`source`) + keys + **columns** (physical) | **Catalog** — dataset detail → Overview / Settings | shared (base) |
| **Columns** (physical) | the table's columns + a maintained **description** (engineer / Agent) | **Catalog** — dataset detail → **Columns** | shared (base) |
| **Fields** | model-scoped: a column ref **or a computed expression**, + `datatype`, `dimension` (`{is_time}`), `ai_context` | **Model → a model → Fields** | per-model |
| **Dimensions** | a **field role** (`dimension.is_time`) — a field you can group/filter by | **Model → a model → Fields** (a field property) | per-model |
| **Relationships** | FK edges: `from` (many) → `to` (one), `from_columns`/`to_columns`, `required` | **Catalog** — dataset detail → Relationships (editor) + the Catalog list **Map** view (ER) | shared (base) |
| **Metrics** | model-level aggregate **expressions** over fields | **Model → a model → Metrics** | per-model |
| **Rows** (physical) | preview, edit, ingest, profile | **Catalog** — dataset detail → Data | per-dataset |

**Rule of thumb**

- **The shared base** (Datasets, Columns, Relationships, Rows, Quality) → **Catalog** — one physical substrate used by **many** models.
- **A semantic model** (Model tab) is a **named scope** over that base; it owns **Fields**, **Dimensions** (a field role) and **Metrics** (plus its dataset membership + `ai_context`). The document is **viewed/copied** per model (Import from the model list).
- **A relationship carries only edge facts** — Direction + columns + `required`. **A dimension is not an object** — it is a **field role**. **A metric has no dimensions** — a metric is an **expression**. **Fields ≠ columns** — a column is physical (Catalog), a field is a model-scoped semantic projection.

---

## Layer model (application → ontology → data)

| Layer | Apps | Answers |
|-------|------|---------|
| **Application** | Agents · Documents · Articles · Wikis · KB · Media · Glossaries · Evaluations · Knowledge Map · Apps | *Knowledge work and delivery* |
| **Ontology** | Ontology Manager · Object Explorer · Function Editor | *What the business means and does* |
| **Data** | **Datasets** (Catalog + **Model**), **Data Explorer** | *What is the data, how trustworthy, how to analyze it* |

**Console stays shared** — `Connectors` / `Pipelines` / `data-sources` / `job-runs` are platform capabilities, not part of the Data layer. **Data sources are tagged by layer** in Console → Data Sources (data-layer vs ontology-layer); PostgreSQL sources are data-capable by default, `ontology` is an explicit exclusion.

---

## Current state

**Shipped:** Datasets app at `/datasets` — its own tab bar is **Catalog · Semantic Model · Metrics** (`/datasets` · `/data-model` · `/data-metrics`), the last read-only because a metric is defined next to its model (Catalog list + register/upload + detail tabs: Overview (read-only summary incl. usage) · Data · Columns · Relationships · Quality · Settings (the single edit surface) · Sharing) and the Model view at `/data-model` (ER graph + health + quality alerts + relationships table); Data Explorer at `/data-explorer` — a **dashboard** holds **reports**, and **each report carries its own source** (a dataset or a semantic model) plus the query it came from, so one dashboard can mix them; `POST /api/explorer-dashboards/{id}/run` re-runs every report through its own engine ([design](data-layer-explorer.md)). Backend: `datasets` (catalog fields, `primary_key_columns`, `unique_keys`, `ai_context`, `is_editable`), `dataset_joins` (Ossie FK — `from`/`to`/`from_columns`/`to_columns`/`required`), file ingest, profile/schema snapshots, quality rules/runs, `metric_definitions` (model-level Ossie SQL expressions), `metric_runs` (execution audit), `explorer_dashboards`, `dataset_edits` (audit), `dataset_columns` (column descriptions), **filtered row browsing** (`POST /api/datasets/{id}/rows/query` with AND-ed column filters, a truthful count and a statement timeout; [design](data-layer-grid-filter.md)) and **dataset summaries** (`POST /api/datasets/{id}/aggregate`: group by columns — optionally by a date grain — with `count/sum/avg/min/max`, so a dataset can answer "by month" without a model), `semantic_models` + `semantic_model_datasets` + `semantic_model_fields` (named scopes); **Ossie export/import** (per model); `data:read` / `data:write` / `data:edit` (the Data Explorer has its own `explorer:read` / `explorer:write`); keyset paging + row editing (TanStack Table). First scenario: **Tushare stock datasets**.

**Gaps vs the target:** none — the [refactoring plan](#refactoring-plan) Stages 1–6 are shipped.

---

## Refactoring plan {#refactoring-plan}

Goal: the Datasets app **manages the Ossie semantic model**, with each definition mapped to one surface. Stages are dependency-ordered; each lists steps → verification.

### Stage 1 — Relationships = foreign keys ✅
- **Schema:** `dataset_joins` re-modelled as an Ossie FK (table name kept): `from_dataset_id` (many) / `to_dataset_id` (one), `from_columns`/`to_columns` (order-aligned, composite), `required` (default `false` = LEFT), `ai_context`; **`cardinality` dropped**. Existing rows migrated (`source`→`from`, `target`→`to`).
- **Service/API:** validate columns exist + equal lengths; payload uses `from`/`to`/`from_columns`/`to_columns`.
- **Frontend:** Relationships editor asks *who holds the FK* (`from`/`to`) with column pairs + join type; ER edges many→one.
- **Verify:** ✅ composite FK round-trips; the metric engine joins via `from`/`to` with the chosen join type; ER shows the direction. (PK/unique-key enforcement lands with Stage 2.)

### Stage 2 — Datasets: `unique_keys` + `ai_context` ✅
- **Schema:** `datasets` + `unique_keys` (JSONB array of arrays), `ai_context` (JSONB).
- **Service:** a relationship's `to_columns` must be the target's primary key or a declared unique key (when declared); fixes 1:1 targeting.
- **Frontend:** dataset Settings — keys (primary + unique) + `ai_context` (instructions / synonyms / examples).
- **Verify:** ✅ a 1:1 relationship can target a unique key; `ai_context` round-trips via `PUT /api/datasets/{id}`.

### Stage 3 — Fields (the field layer) ✅ *(revised: fields are model-scoped)*
- **Schema:** `semantic_model_fields` — `semantic_model_id`, `dataset_id`, `name`, `column_name` (null = computed), `expression` (Ossie `{dialects:[{dialect, expression}]}`, scalar), `datatype` (Ossie `DataType` enum), `description`, `dimension` (`{is_time: bool}`), `ai_context`, ordinal; unique `(model, dataset, name)`. Created **explicitly** (not auto-seeded).
- **Catalog:** a dataset exposes its **Columns** (physical) + a maintained **`description`** per column (`dataset_columns`). No semantic field editor here.
- **Frontend:** **Model → a model → Fields** — computed fields, the `dimension` role (`is_time`), and `ai_context` per field; **Playground** groups a metric by fields (time ones via `date_trunc`, granularity chosen at query time) — see Stage 7.
- **Verify:** ✅ a computed field is stored; a `is_time` field carries the role; the **same column can differ per model**.

### Stage 4 — Metrics: model-level, Ossie SQL expressions ✅
- **Expression:** metrics use **Ossie `expression.dialects`** — an aggregate **SQL fragment** (not a full statement), wrapped by the engine into a generated `SELECT <expr> AS value FROM base JOIN … WHERE … LIMIT …`. **No custom DSL** (decision #13). Authored by data engineers; **AI-assist** drafts the expression.
- **Guardrails:** execute in a **read-only transaction** with a **statement timeout** + **row cap**; audit each run (`metric_runs`).
- **Schema:** `metric_definitions` is **model-level** (`base_dataset_id` anchor) with `expression` (dialects), `datatype`, `type`, `ai_context`; `dimensions` **removed**.
- **Frontend:** Metrics live in **Model → a model → Metrics**; the form takes an SQL expression (+ optional joins/AI context), no dimensions.
- **Verify:** ✅ a metric computes read-only with a timeout + row cap (verified live); no dimensions on the metric; runs are audited.

### Stage 5 — ~~Queries (saved queries)~~ **withdrawn**
- A saved query is a **consumption** artifact, not part of the Ossie semantic model (`datasets` / `fields` / `metrics` / `relationships`). `saved_queries` was **removed**; saved analyses live in **Data Explorer** (`explorer_dashboards`: a dashboard of reports).

### Stage 6 — Semantic Model export / import ✅
- **API:** `GET /api/semantic-models/{id}/export` → **flat** Ossie document for one model (core spec `0.2.0.dev0`; `datasets`/`relationships`/`metrics` + entity-level `OPENKMS` `custom_extensions` for the few non-spec facts); `POST /api/semantic-models/import` upserts it — everything matched **by name** (datasets by `source` first), no ids in the document. Validated against the vendored [`ossie-schema.json`](../research/ossie/spec.md).
- **Frontend:** the model's document is **viewed, not downloaded** — the shell header opens **View YAML** (right-docked panel: collapsible tree ⇄ raw YAML + *Copy*; one click from every section). **Import** stays on the model list. The export API remains the agent/skill path (`semantic-models export/import`).
- **Verify:** ✅ a round-trip re-imports with a stable document (verified live).

### Stage 7 — Playground (the human twin of the query API) ✅
- **API:** `POST /api/semantic-models/{id}/query` — one spec object `{metric, group_by[{field, granularity?}], filters[{field, op, value}], order_by[{field, direction}], limit}` shared by the UI (encoded in the URL as `?q=`), `openkms-skill` and any agent; read-only, statement timeout, row cap, audited (`metric_runs`).
- **Frontend:** **Model → a model → Playground** — metric → group-by fields (**type-ahead menu**, time ones with a query-time grain; selections as chips) + filters (the metric's own filters listed read-only) + order + limit; the answer states **row count / cap / duration**, the **null share per column** and *why* it is empty, the generated **SQL**, and the metric **definition** (expression, base dataset, type, the **relationships it uses** by name, description, `ai_context`). A metric row links *into* here (`Test in Playground`), and `Copy query` hands the spec to an agent verbatim.
- **Failures are classified:** the API maps SQLSTATE to a stable code + `kind` — `definition` (the model author fixes it), `data` (the source refused) or `request` — and localizes the explanation, so the pane says who can fix a failed question instead of echoing SQL. See [Playground design](data-layer-playground.md#8-decisions).
- **Not here (decided):** saving, charts, pivots, CSV export (Data Explorer); NL → spec (agent).
- **Verify:** ✅ `pytest tests/test_data_layer_query_errors.py`; a misplaced expression reports `kind=definition`.

### Cross-cutting (all stages)
- **Access:** `data:*` keys; joins/fields/metrics/quality/reports inherit the referenced datasets' ACL (no new `resource_type`).
- **Agent/skill:** `openkms-skill` commands for the new surfaces; audit who read/exported which dataset (see [Later](#later-open-items)).
- **Design/i18n:** existing tokens and locale namespaces.

---

## Data → knowledge main path

A dataset's purpose is to become governed knowledge. Two explicitly surfaced paths:

1. **Dataset → object type (ontology)** — from a dataset, “Create object type” pre-fills key property + property types from fields; the object type references the dataset.
2. **Dataset → knowledge service (agent grounding)** — agents and Explorer analysis cite datasets/metrics as evidence alongside documents/wiki/KB. Ingesting dataset rows into KB/RAG is **not** v1.

So a table is described (catalog), modeled (fields/relationships), trusted (quality), then **promoted into the ontology** and **cited by agents**.

---

## Decisions (locked)

| # | Decision |
|---|----------|
| 1 | **Console stays shared** — `Connectors` / `Pipelines` / `data-sources` / `job-runs` are platform-wide, not part of the Data layer. |
| 2 | **The Model view authors the semantic model** — datasets + **relationships as foreign keys** (Ossie: `from` many → `to` one) + metrics; business object/link types stay in Ontology. |
| 3 | **Metrics query the tables on demand** (results not materialized; no cache in v1). |
| 4 | **Explorer carrier is project agents**, operating through **`openkms-skill`**. |
| 5 | **Reports are dashboard-like**; each chart carries AI-authored suggestions and analysis. |
| 6 | **First scenario = Tushare-synced stock datasets.** |
| 7 | **Relationships are authored manually** — no automatic join discovery. |
| 8 | **Quality alerts live in the Model view.** |
| 9 | **Dashboard reports are persisted in the Data Explorer app.** |
| 10 | **Data files can be uploaded** — parsed into PostgreSQL tables; the raw file is kept in object storage. |
| 11 | **Data sources are tagged by layer** (Console → Data Sources); PostgreSQL is data-capable by default, `ontology` is an explicit exclusion. |
| 12 | **Predictive analysis = LLM reasoning + Python + trend extrapolation** (sandboxed; no ML training/hosting; Functions optional later). |
| 13 | **Quality is declarative** (rule type + parameters). **Metrics use Ossie `expression.dialects`** — aggregate SQL **fragments** pre-configured by data engineers (no custom DSL; AI-assist may draft them), wrapped into a generated query and executed **read-only with timeout + row cap**. |
| 14 | **New data resources inherit dataset ACL** (no new `resource_type`). |
| 15 | **Separate read vs manage vs edit permissions** — `data:read` / `data:write` / `data:edit`; `console:datasets` stays console-scoped. |
| 27 | **Reports are their own grant** — `explorer:read` / `explorer:write`, and a **refresh is a read** (`explorer:read`); the bound source's ACL still applies, because a report's results are stored data. |
| 16 | **Dataset → knowledge has two paths** — promote to an object type and cite as agent evidence; dataset rows are not ingested into KB/RAG in v1. |
| 17 | **Adopt Apache Ossie as the semantic-model interchange** (Apache 2.0, vendor-neutral) — export (later import) the Ossie document. |
| 18 | **Relationships are foreign keys, not cardinality** — `from` (many) → `to` (one), `from_columns`/`to_columns`, composite, `required`; 1:1 via unique keys; M:N via a junction dataset. |
| 19 | **Datasets carry `unique_keys` + `ai_context`** for agent grounding. |
| 20 | **A relationship carries only edge facts** — FK direction (`from`/`to`) + column mapping + `required` (optional vs required match). No `base` (that is a metric/query anchor) and no `left`/`right`/`full` (`right` ≡ a swapped `left`; the query anchor fixes the join side, so an edge-level `right` was a footgun). |
| 21 | **A semantic model is a named scope** over the **shared** base (datasets, columns, relationships — Catalog-owned). It owns **fields** and **metrics** (+ dataset membership, `ai_context`); export/import is per model. There is no default model — if none exists, the list is empty. |
| 22 | **Columns are physical (Catalog); fields are model-scoped.** A column carries a maintained `description`; a field is that column (or a computed expression) **as used in one model** — with its `role` and `ai_context`. So a field's `ai_context` can differ per model. |
| 23 | **No queries in the semantic model.** A saved query is a **consumption** artifact (Data Explorer), not part of the Ossie `semantic_model` (`datasets` / `fields` / `metrics` / `relationships`). `saved_queries` was removed. |
| 26 | **Vendor extensions are entity-level, and carry no ids.** `custom_extensions` sits on the Dataset/Relationship/Metric that needs it (the spec allows this) — never one document-level blob — and we emit no stable ids, because every reference in the document is by name. |
| 25 | **Every expression is labelled `ANSI_SQL`** — including PostgreSQL-specific syntax (the spec's `Dialect` enum has no `POSTGRES`, and our datasets are PostgreSQL-only), so a couple of our expressions are not portable. |
| 24 | **A metric keeps an explicit `base_dataset` anchor** (Ossie has none — its engine derives the `FROM`/joins from the expression). It travels in the metric's own `OPENKMS` `custom_extensions`; deriving it from the expression + relationships is **deferred to the agent auto-query phase**. |

## Still open

- **Ingest semantics** — append / overwrite / rebuild; new table vs append.

## Later / open items {#later-open-items}

| Item | Notes |
|------|-------|
| Sensitivity behavior | whether `confidential`/`restricted` triggers masking, export limits, or alerts — define before GA |
| Freshness ↔ knowledge lifecycle | how stale data affects dependent knowledge conclusions |
| Ingest edge cases | empty/oversized files, type-inference errors, duplicate table names, append mismatch, retry/cleanup |
| Scale | profile full-scan and ER rendering on very large schemas; sampling / degradation |
| Delete semantics | dataset / relationship / report delete: cascade vs soft-delete |
| Discoverability | datasets in Global Search; cross-layer search |
| Data access audit | who read/exported which dataset |
| Row edits from the CLI | `POST /api/datasets/{id}/rows/apply` exists (`data:edit` + opt-in + audit) but the bundled CLI does not wrap it, so agents can read rows and never write them; wrap it (`datasets rows-apply --file edits.json`) or keep the boundary deliberately |
| Metric base-dataset derivation | for **agent auto-questioning**: infer the `FROM` + join path from the metric `expression` + relationships, instead of an explicit `base_dataset` anchor (decision #24, deferred) |

## Delivery obligations

- Update `features/data-models.md`, `features/api-reference.md`, `functionalities.md`, `development_plan.md` with each shipped stage.
- **Feature toggle:** a `data` toggle (off during rollout, on at GA), mirroring `connectors` / `agents`.
- **Acceptance:** backend `pytest` green; frontend `npm run build` + `check:app-modules` + `check:app-layout` + `check:styles` green.

## Explicitly deferred

- Table-to-table transforms, dataset content versioning.
- ML model training / hosting.
- Streaming / CDC ingestion.
- A standalone BI/SQL IDE product.
