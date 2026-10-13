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
| **Semantic Model** | the container of datasets + relationships + metrics (+ queries) | **Model** tab (`/data-model`) — Overview + **Export/Import** | cross-dataset |
| **Datasets** | a logical entity: a physical table (`source`) + keys + fields + `ai_context` | **Dataset detail** — Overview / Settings | per-dataset |
| **Fields** | row-level attributes: a column ref **or a computed expression**, + `datatype`, `dimension.is_time`, `ai_context` | **Dataset detail → Fields** | per-dataset |
| **Dimensions** | a **field role** (`dimension.is_time`) — a field you can group/filter by | **Dataset detail → Fields** (a field flag) | per-dataset (field) |
| **Relationships** | FK edges: `from` (many) → `to` (one), `from_columns`/`to_columns`, `join_type` | **Model → Relationships** (global) + dataset detail → Relationships (scoped view of the same rows) | cross-dataset |
| **Metrics** | model-level aggregate **expressions** over fields | **Model → Metrics** | cross-dataset |
| **Queries** | metrics + `group_by` dimensions + `where`, saved | **Model → Queries** (v1: Data Explorer reports) | cross-dataset |
| **Rows** (physical) | preview, edit, ingest, profile | **Dataset detail → Data** | per-dataset |

**Rule of thumb**

- **Per-dataset** concepts (Datasets, Fields, Dimensions, Rows, Quality, Lineage) → the **dataset detail**.
- **Cross-dataset** concepts (Relationships overview + ER, Metrics, Queries, Model export) → the **Model** tab.
- **A dimension is not an object** — it is a flag on a **field**. **A metric has no dimensions** — grouping is a **query**. **Fields ≠ columns** — a field can be computed and carries roles/`ai_context`.

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

**Shipped:** Datasets app at `/datasets` (Catalog list + register/upload + detail tabs: Overview · Data · Fields · Usage · Relationships · Lineage · Quality · Metrics · Settings · Sharing) and the Model view at `/data-model` (ER graph + health + quality alerts + relationships table); Data Explorer at `/data-explorer` (saved analyses). Backend: `datasets` (catalog fields, `primary_key_columns`, `unique_keys`, `ai_context`, `is_editable`), `dataset_joins` (Ossie FK — `from`/`to`/`from_columns`/`to_columns`/`join_type`), file ingest, profile/schema snapshots, quality rules/runs, `metric_definitions` (model-level Ossie SQL expressions), `metric_runs` (execution audit), `saved_queries` (model-level queries), `explorer_reports`, `dataset_edits` (audit), `dataset_fields` (semantic fields); **Ossie export/import**; `data:read` / `data:write` / `data:edit`; keyset paging + row editing (TanStack Table). First scenario: **Tushare stock datasets**.

**Gaps vs the target:** none — the [refactoring plan](#refactoring-plan) Stages 1–6 are shipped.

---

## Refactoring plan {#refactoring-plan}

Goal: the Datasets app **manages the Ossie semantic model**, with each definition mapped to one surface. Stages are dependency-ordered; each lists steps → verification.

### Stage 1 — Relationships = foreign keys ✅
- **Schema:** `dataset_joins` re-modelled as an Ossie FK (table name kept): `from_dataset_id` (many) / `to_dataset_id` (one), `from_columns`/`to_columns` (order-aligned, composite), `join_type` (`left` default), `ai_context`; **`cardinality` dropped**. Existing rows migrated (`source`→`from`, `target`→`to`).
- **Service/API:** validate columns exist + equal lengths + `join_type`; payload uses `from`/`to`/`from_columns`/`to_columns`.
- **Frontend:** Relationships editor asks *who holds the FK* (`from`/`to`) with column pairs + join type; ER edges many→one.
- **Verify:** ✅ composite FK round-trips; the metric engine joins via `from`/`to` with the chosen join type; ER shows the direction. (PK/unique-key enforcement lands with Stage 2.)

### Stage 2 — Datasets: `unique_keys` + `ai_context` ✅
- **Schema:** `datasets` + `unique_keys` (JSONB array of arrays), `ai_context` (JSONB).
- **Service:** a relationship's `to_columns` must be the target's primary key or a declared unique key (when declared); fixes 1:1 targeting.
- **Frontend:** dataset Settings — keys (primary + unique) + `ai_context` (instructions / synonyms / examples).
- **Verify:** ✅ a 1:1 relationship can target a unique key; `ai_context` round-trips via `PUT /api/datasets/{id}`.

### Stage 3 — Fields (the field layer) ✅
- **Schema:** new `dataset_fields` — `dataset_id`, `name`, `column_name` (null = computed), `expression` (dialects), `datatype`, `dimension` (`{is_time}`), `ai_context`, ordinal. Seed from `information_schema` (a plain column = a field with a column-ref expression).
- **Frontend:** the **Columns** tab → **Fields**; add computed fields, the `is_time` dimension role, and `ai_context` per field; physical columns + profile kept below.
- **Verify:** ✅ a computed field (`LOWER(email)`) is stored; an `is_time` field carries the time dimension for metrics/queries. (Export is Stage 6.)

### Stage 4 — Metrics: model-level, Ossie SQL expressions ✅
- **Expression:** metrics use **Ossie `expression.dialects`** — an aggregate **SQL fragment** (not a full statement), wrapped by the engine into a generated `SELECT <expr> AS value FROM base JOIN … WHERE … LIMIT …`. **No custom DSL** (decision #13). Authored by data engineers; **AI-assist** drafts the expression.
- **Guardrails:** execute in a **read-only transaction** with a **statement timeout** + **row cap**; audit each run (`metric_runs`).
- **Schema:** `metric_definitions` is **model-level** (`base_dataset_id` anchor) with `expression` (dialects), `datatype`, `type`, `ai_context`; `dimensions` **removed**.
- **Frontend:** Metrics moved from the dataset detail to **Model → Metrics**; the form takes an SQL expression (+ optional joins/AI context), no dimensions.
- **Verify:** ✅ a metric computes read-only with a timeout + row cap (verified live); no dimensions on the metric; runs are audited.

### Stage 5 — Queries (saved queries) ✅
- **Schema:** `saved_queries` — `base_dataset_id`, `name`, `metrics[]` (`[{name, metric_id}]`), `group_by[]` (**field** names), `joins[]`, `filters[]` (the WHERE), `exports[]`, `ai_context`.
- **Engine:** emits `SELECT <field exprs>, (<metric exprs>) FROM <base> <joins> WHERE … GROUP BY <field exprs> LIMIT <cap>`, executed **read-only** (shared runner).
- **Frontend:** **Model → Queries** — pick base dataset, group-by fields, metrics, joins, filter; run → results table.
- **Verify:** ✅ a saved query pins metrics + dimensions + filter and re-runs (verified live).

### Stage 6 — Semantic Model export / import ✅
- **API:** `GET /api/semantic-model` → Ossie document (`?format=json|yaml`: datasets (+keys/fields), relationships, metrics, queries); `POST /api/semantic-model/import` upserts the semantic layer (datasets matched by id/source/name).
- **Frontend:** Model header — **Export JSON / Export YAML / Import**.
- **Verify:** ✅ a round-trip re-imports with a stable document (verified live).

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
| 16 | **Dataset → knowledge has two paths** — promote to an object type and cite as agent evidence; dataset rows are not ingested into KB/RAG in v1. |
| 17 | **Adopt Apache Ossie as the semantic-model interchange** (Apache 2.0, vendor-neutral) — export (later import) the Ossie document. |
| 18 | **Relationships are foreign keys, not cardinality** — `from` (many) → `to` (one), `from_columns`/`to_columns`, composite, `join_type`; 1:1 via unique keys; M:N via a junction dataset. |
| 19 | **Datasets carry `unique_keys` + `ai_context`** for agent grounding. |

## Still open

- **Ingest semantics** — append / overwrite / rebuild; new table vs append.

## Later / open items {#later-open-items}

| Item | Notes |
|------|-------|
| Sensitivity behavior | whether `confidential`/`restricted` triggers masking, export limits, or alerts — define before GA |
| Freshness ↔ knowledge lifecycle | how stale data affects dependent knowledge conclusions |
| Ingest edge cases | empty/oversized files, type-inference errors, duplicate table names, append mismatch, retry/cleanup |
| Scale | profile full-scan and ER/lineage rendering on very large schemas; sampling / degradation |
| Delete semantics | dataset / relationship / report delete: cascade vs soft-delete |
| Discoverability | datasets in Global Search; cross-layer search |
| Data access audit | who read/exported which dataset |

## Delivery obligations

- Update `features/data-models.md`, `features/api-reference.md`, `functionalities.md`, `development_plan.md` with each shipped stage.
- **Feature toggle:** a `data` toggle (off during rollout, on at GA), mirroring `connectors` / `agents`.
- **Acceptance:** backend `pytest` green; frontend `npm run build` + `check:app-modules` + `check:app-layout` + `check:styles` green.

## Explicitly deferred

- Table-to-table transforms, dataset content versioning.
- ML model training / hosting.
- Streaming / CDC ingestion.
- A standalone BI/SQL IDE product.
