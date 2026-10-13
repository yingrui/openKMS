# Data layer plan — Datasets · Data Model · Data Explorer

**Status:** draft plan (nothing shipped). **Positioning:** *Route B — the data layer is a knowledge substrate for agents, not a data-engineering platform.*

**Related:** [Goals — unified layer for Data for AI](../goals.md#goals-unified-source) · [Development plan](../development_plan.md) · [Ontology Manager alignment](ontology_manager_alignment.md) · [Data models](../features/data-models.md) · [Connectors](../features/connectors.md) · [Object Explorer](../features/object-explorer.md) · [Implementation design (Phase 0–1)](data_layer_implementation.md) · [Interaction design](data_layer_interaction.md)

---

## Positioning

The data layer exists so that **people and agents can consume real data as knowledge**. It **references** external tables and **ingests** uploaded data files; it does not run a transform engine or version data content.

| Principle | Means |
|-----------|-------|
| Access tables; never transform | **Access** = reference an external table **or** ingest an uploaded file into a table. **Transform** = any table-to-table derivation or cleaning — out of scope. The raw uploaded file is kept in object storage. |
| Model = management of existing tables | "Data model" is **annotation and governance of tables/columns** (semantics, joins, quality, metrics) — not physical modeling of new stores. |
| Three audiences, one pipeline | **Data engineer** configures sources/datasets and join models; **data BA** inspects data and assesses quality; **business** consumes results through agents. |
| AI-native Explorer | Exploration is conversational and exploratory; **diagnostic and predictive** analysis, not only descriptive charts. Reports are dashboard-like, with AI-authored suggestions and analysis attached to the charts. |

### Non-goals

- Table-to-table ETL / transform engine, data-content versioning.
- CDC / streaming ingestion.
- A general-purpose BI / SQL IDE for every user.
- Replacing every business database — cataloging and governing data safe for AI consumption is enough.

---

## Layer model: Application / Ontology / Data

The Suite App rail gains an explicit **layer** grouping. This is an information-architecture change, not just new pages. Rail/Launcher order is **application → ontology → data** (top to bottom).

| Layer | Apps | Answers |
|-------|------|---------|
| **Application** | Agents · Documents · Articles · Wikis · Knowledge bases · Media · Glossaries · Evaluations · Knowledge Map · Apps | *Knowledge work and delivery* |
| **Ontology** | Ontology Manager · Object Explorer · Function Editor | *What the business means and does* (objects, links, functions, actions) |
| **Data** | **Datasets**, **Data Model**, **Data Explorer** | *What is the data, how trustworthy, how to analyze it* |

**Console stays a shared platform layer.** `Connectors`, `Pipelines`, `data-sources`, and `job-runs` are **not** part of the Data layer — they are platform capabilities shared across all of openKMS. Data-layer apps consume their output (e.g. connector-synced tables) but do not own them.

**Data sources are tagged by layer.** Even though Console stays a shared surface, Console → Data Sources marks each source as **data-layer** or **ontology-layer**. Data-layer sources back datasets and file ingest (PostgreSQL); ontology-layer sources back the graph (Neo4j). This routes multiple PostgreSQL sources to the right purpose instead of inferring from `kind` alone.

**Decision:** `Datasets` moves **out of Ontology Manager** into the Data layer as a first-class app.

---

## Current state — assets and gaps {#current-state}

What exists today is a **thin data layer buried under the Ontology layer**. Most of it is reusable.

| Capability | Shipped today | Where |
|------------|---------------|-------|
| Connection configs | `DataSource` (PostgreSQL / Neo4j, encrypted creds) | Console `/console/data-sources` (shared platform) |
| Sync | `Connector` (Tushare / Zhipu) → dataset outputs; `scheduled_triggers` | Console `/connectors` (shared platform) |
| Datasets | `Dataset` = remote PG table ref; **rows** (paged) + **metadata** (columns → ontology types) | Ontology Manager `/ontology-manager/datasets` |
| Semantics | `ObjectType` / `LinkType` bind a dataset, key property, FK/junction; Neo4j index | Ontology Manager |
| Logic | Functions (OFS) + Action types + audit | Function Editor / Ontology Manager |
| Explore | Object Explorer Cypher / text-to-Cypher, list + graph | `/object-explorer` |
| Storage | Object storage (MinIO, `storage_enabled`) — reused for uploaded dataset files | platform |
| Access | dataset ACL + resource ACL | — |

### Gaps vs a Palantir-style data layer

| Area | Missing |
|------|---------|
| **Datasets** | Catalog metadata (owner/domain/tags/business definition), schema snapshot + change detection, **lineage**, refresh status, profile (null rate / uniqueness / distribution), first-class list/detail surfaces |
| **Data Model** | **Join/ER model across tables**, quality rules + runs, **metrics/KPI definitions** + computation, change impact |
| **Data Explorer** | Dataset query/aggregation, charts, dashboards, report export — today only Neo4j Cypher + skill-generated static reports |

**Fundamental gap:** today's `Dataset` is a *table pointer* with no catalog, lineage, join model, or profile. The Data layer's core job is to turn that pointer into a **governed, described, traceable asset**.

---

## Target apps

### Datasets — data asset catalog {#datasets-app}

The data engineer configures; the BA inspects.

- **Catalog:** description, owner, domain, tags, business definition, source, sensitivity.
- **Schema:** column metadata (exists) + type mapping (exists) + **snapshot and change detection**.
- **Profile:** row count (exists) + null rate, distinct count, min/max/quantiles, sample values.
- **Lineage:** `source → dataset → object/link type → function → action` dependency graph (cross-layer, read-only view).
- **Refresh status:** last sync/run, freshness, row count trend (connectors own the run; Datasets shows status).
- **File upload / ingest:** upload CSV / Excel / JSON (later Parquet). The raw file is stored in **object storage**, then parsed (schema inference + preview) and loaded into a **PostgreSQL table** on a **data-layer data source**, registered as a Dataset. The original file and parse config are kept so the table can be rebuilt or audited. Parsing via pandas/openpyxl (CSV/Excel/JSON); Parquet deferred.
- **Usage:** which KBs, object types, functions, and agents consume this dataset.

### Data Model — joins, quality, metrics {#data-model-app}

**Scope:** Data Model manages **only datasets** (the tables the Data layer catalogs). It does **not** define business object/link types — those stay in the Ontology layer. The boundary is:

| Layer | Owns |
|-------|------|
| **Data Model** | Tables, columns, **joins between tables**, ER model, data-quality rules, metrics |
| **Ontology** | Business object/link **types**, properties, functions, actions (may reference a dataset) |

- **Join model → ER:** joins are **registered manually** — authoring them is the core data-modeling process (no automatic join discovery). Register data-engineering equi-joins on key columns (one-to-one / one-to-many), then render an **ER relationship model** from datasets + joins. This is the basis for cross-table metrics and for the Explorer's "which tables relate" reasoning.
- **Data quality:** declarative rule types (not-null, unique, range, referential, freshness), runs, results, and **alerts surfaced in the Data Model app** — rule type + parameters, not arbitrary expressions.
- **Metrics:** definition (name, business definition, formula, dimensions, source dataset/columns, joins), **computed by querying the tables on demand** (no materialization, no cache in v1), reuse, and lineage. Metrics use a **declarative DSL** (columns + aggregation + filters + registered joins) — not arbitrary SQL.
- **Change impact:** a schema or join/definition change surfaces affected metrics, ER edges, object types, and agents.

### Data Explorer — AI-native analysis and dashboards {#data-explorer-app}

Exploration is **conversational, exploratory, and decision-oriented**.

- **Carrier: project agents + `openkms-skill`.** The Explorer is driven by project agents that operate datasets, joins, metrics, and quality through the CLI, and **run Python for analysis in a sandbox** — no dedicated bespoke query UI is required for the analysis itself.
- **Ask in natural language** → the agent resolves to dataset/join/metric queries, computes with Python, and returns analysis with provenance.
- **Data + knowledge fusion:** the agent combines tabular results with openKMS knowledge (documents, wiki, KB, ontology) to produce deeper, contextualized insight. This fusion — not write-back into the knowledge store — is how "data becomes knowledge service."
- **Analysis ladder:** descriptive → **diagnostic** (why did it change) → **predictive** (what next). Predictive = **LLM reasoning + Python + trend extrapolation** — no ML model training or hosting; ontology Functions may be layered in later but are not required.
- **Reports = dashboard-like output:** a familiar dashboard layout (tiles/charts), but each chart carries **AI-authored suggestions and analysis** attached to it (what it shows, what to look at next, anomalies, possible causes). Not a passive chart wall.
- **Pre-defined templates are the minority**; most reports are **AI-designed/configured** and **persisted in the Data Explorer app**. Reuse the existing research-report path (Reveal + Plotly static HTML) as the rendering/export base.
- **Delivery to business:** results reach business users **through agents**.

---

## Data → knowledge main path

The Data layer is not an island — a dataset's purpose is to become governed knowledge. Two explicit paths, surfaced in the UI (not just via API):

1. **Dataset → Object type (ontology).** From a dataset detail page, "Create object type" pre-fills key property + property types from column metadata; the object type references the dataset. This is the bridge from a table to business meaning (then Functions/Actions can operate on it).
2. **Dataset → knowledge service (agent grounding).** Project agents and Explorer analysis cite datasets/metrics as evidence alongside documents/wiki/KB — the "data + knowledge fusion" in Data Explorer is this path's visible surface. Ingesting dataset rows into KB/RAG is **not** v1 (see Later).

This keeps "data becomes knowledge service" concrete: a table is described (catalog), modeled (joins/ER), trusted (quality), then **promoted into the ontology** and **cited by agents**.

---

## Data model changes

Backend work required before the phases (grouped for Alembic migration planning). All new resources are **dataset-scoped** — no new `resource_type` ACL entries.

### Altered

| Table | Change |
|-------|--------|
| `data_sources` | `layer` (`data` \| `ontology`) — routes datasets/file ingest vs the graph (decision #11) |
| `datasets` | catalog fields: `description`, `owner`, `domain`, `tags`, `business_definition`, `sensitivity` |

### New

| Table | Holds |
|-------|-------|
| `dataset_joins` | join edges: source/target dataset + column pairs + cardinality (`one-to-one` / `one-to-many`) — backs the ER model (decisions #2/#7) |
| `dataset_profiles` | computed profile: null rate, distinct count, min/max/quantiles, sample values |
| `schema_snapshots` | column-metadata snapshot for change detection |
| `quality_rules` / `quality_runs` / `quality_results` | declarative quality rules + runs + per-rule results (decision #8) |
| `metric_definitions` | metric definition: name, business definition, DSL (columns/aggregation/filters/joins), dimensions, source columns (decision #3) |
| `explorer_reports` | persisted dashboard reports + object-storage HTML (decision #9) |

### Derived, not stored

- **Lineage** is computed on read from joins + existing relations (`dataset → object/link type → function → action`) — no lineage table in v1.
- **Access:** joins/metrics/quality/reports inherit the ACL of the datasets they reference.

---

## Phases

Each phase lists a verifiable deliverable. Phases are bundled by dependency, not a strict sequence.

### Phase 0 — IA and skeleton (small)

- Introduce the **Application / Ontology / Data** layer grouping in `appModules.ts` (app rail/launcher).
- Move `Datasets` out of Ontology Manager into a first-class Data app (routes redirect; list + detail reuse existing API/UI).
- **Verify:** routes resolve and redirect; permissions intact; `npm run check:app-modules` and `npm run check:app-layout` pass.

### Phase 1 — Datasets + ingest + Data Model join/ER (medium; mostly reuses existing assets)

**First scenario: Tushare-synced stock datasets.** Connectors already produce six tables in schema `tushare`:

| Dataset | Key |
|---------|-----|
| `stock_basic` | `ts_code` |
| `stock_trade_daily` | `ts_code`, `trade_date` |
| `daily_basic` | `ts_code`, `trade_date` |
| `stock_adj_daily` | `ts_code`, `trade_date` |
| `dividends` | `ts_code`, `ex_date` |
| `trade_calendar` | `exchange`, `cal_date` |

Natural joins for the ER model:

- `stock_basic.ts_code` → the daily tables' `ts_code` (1:N)
- `stock_trade_daily` ↔ `daily_basic` ↔ `stock_adj_daily` on (`ts_code`, `trade_date`) (1:1)
- `trade_calendar.cal_date` → `stock_trade_daily.trade_date` (1:N)

Deliverables:
- **Data sources:** tag Console data sources as data-layer or ontology-layer; datasets and file ingest route to data-layer sources.
- Datasets: catalog fields, schema snapshot + change detection, profile, refresh/freshness status; **lineage computed on read** (no lineage table).
- **File ingest:** upload → parse (schema inference + preview) → load into a PostgreSQL table on a data-layer source → register as a Dataset; raw file in object storage.
- Data Model: **register the joins above and render the ER model**.
- Extend `openkms-skill` `datasets` commands (profile, joins) so agents can read the catalog and ER graph.
- **Verify:** an engineer catalogs the Tushare datasets and sees the ER model, and can upload a file into a PostgreSQL-backed dataset; a BA sees profile and quality-ready schema without leaving the app; a project agent can query the catalog.

### Phase 2 — Data Model: quality and metrics (start small, expand as it proves out)

- Quality rule types + runs + results + alerts, exercised on the Tushare sets (not-null keys, PK uniqueness, referential integrity `stock_trade_daily.ts_code ∈ stock_basic.ts_code`, `trade_date` freshness).
- Metric definitions + **on-demand table queries** + lineage; **v1 = single-table aggregation + registered joins** (e.g. turnover, PE/PB percentile, pct change, volume, adjusted return), then widen.
- Change-impact surface from schema/join/definition changes.
- **Verify:** a BA defines a quality rule and a metric, runs them, and sees pass/fail and computed values; a schema change lists affected metrics/ER edges.

### Phase 3 — Data Explorer, AI-native (large)

- NL → analysis pipeline over datasets/joins/metrics, driven by **project agents via `openkms-skill`**, with provenance.
- **Dashboard-like reports** whose charts carry AI suggestions/analysis; AI-authored from the Reveal + Plotly path and **persisted in the Data Explorer app**.
- Agent delivery: business users get analysis through project agents.
- **Verify:** a business user asks a diagnostic question (e.g. "why did this stock underperform its industry recently") through an agent and receives a sourced analysis + exportable dashboard report.

### Cross-cutting

- **Access:** new `data:read` / `data:write` permission keys gate the Data-layer apps (decision #15); joins/metrics/quality/reports still inherit the ACL of their referenced datasets (no new `resource_type`).
- **Audit:** log data access (who read/exported which dataset, especially `confidential`/`restricted`) — scheduled after Phase 2; see [Later](#later-open-items).
- **Agent/skill:** `openkms-skill` gains catalog/join/quality/metrics/explore commands.
- **Python sandbox:** Explorer analysis Python runs in an isolated environment; align with the existing Function OFS executor pattern rather than a new arbitrary-code surface.
- **i18n and design system:** new apps follow existing tokens and locale namespaces.

---

## Decisions (locked)

| # | Decision |
|---|----------|
| 1 | **Console stays shared** — `Connectors` / `Pipelines` / `data-sources` / `job-runs` are platform-wide, not part of the Data layer. |
| 2 | **Data Model manages only datasets**, but models **joins between tables** in a data-engineering style and produces an **ER relationship model**; business object/link types stay in Ontology. |
| 3 | **Metrics query the tables on demand** from their definitions (metric results are not materialized; no cache in v1). |
| 4 | **Explorer carrier is project agents**, operating through **`openkms-skill`**. |
| 5 | **Reports are dashboard-like**; each chart carries AI-authored suggestions and analysis, not just a passive visual. |
| 6 | **First scenario = Tushare-synced stock datasets.** |
| 7 | **Joins are registered manually** — join authoring is the core data-modeling process; no automatic join discovery. |
| 8 | **Quality alerts live in the Data Model app.** |
| 9 | **Dashboard reports are persisted in the Data Explorer app.** |
| 10 | **Data files can be uploaded** — parsed and loaded into PostgreSQL tables; the raw file is stored in object storage. |
| 11 | **Data sources are tagged by layer** — Console → Data Sources marks each source as data-layer or ontology-layer; data-layer sources back datasets and file ingest, ontology-layer sources back the graph. PostgreSQL sources are data-capable by default (untagged allowed); `ontology` is an explicit exclusion. |
| 12 | **Predictive analysis = LLM reasoning + Python + trend extrapolation** — the agent writes Python for analysis (sandboxed); ontology Functions are not required (layered in later). No ML model training or hosting. |
| 13 | **Metrics and quality are declarative** — metrics use a restricted DSL (columns + aggregation + filters + joins); quality is rule type + parameters; neither is arbitrary SQL. |
| 14 | **New data resources inherit dataset ACL** — joins/metrics/quality/reports are dataset-scoped; no new `resource_type`. |
| 15 | **Separate read vs manage permissions** — `data:read` (catalog/profile/quality/rows for all roles) vs `data:write` (register/ingest/joins/metrics/quality for data engineers); `console:datasets` stays console-scoped. |
| 16 | **Dataset → knowledge has two paths** — promote to an object type (ontology) and cite as agent evidence; dataset rows are not ingested into KB/RAG in v1. |

## Still open

- **Ingest semantics:** append / overwrite / rebuild rules for uploaded files, and whether ingest creates a new table or appends to an existing dataset.
- **API-sourced datasets** beyond connector kinds and file upload — later.

## Delivery obligations

Before any phase ships:

- Update `docs/features/data-models.md` (new tables), `docs/features/api-reference.md` (new endpoints), `docs/functionalities.md` (new apps), `docs/development_plan.md` (plan status).
- **Feature toggle:** add a `data` toggle (off during Phase 0–1, on at GA), mirroring `connectors` / `agents`.
- **Acceptance:** backend `pytest` green; frontend `npm run build` + `check:app-modules` + `check:app-layout` + `check:styles` green.

## Later / open items {#later-open-items}

| Item | Notes |
|------|-------|
| Sensitivity behavior | whether `confidential`/`restricted` triggers masking, export limits, or alerts — define before GA |
| Freshness ↔ knowledge lifecycle | how stale data affects dependent knowledge conclusions — undecided |
| Ingest edge cases | empty/oversized files, type-inference errors, duplicate table names, append column mismatch, retry/cleanup |
| Scale | profile full-scan and ER/lineage rendering on very large schemas; sampling / degradation |
| Delete semantics | dataset / join / report delete: cascade vs soft-delete |
| Discoverability | datasets in Global Search; cross-layer search |
| Data access audit | who read/exported which dataset (cross-cutting, scheduled after Phase 2) |

## Explicitly deferred

- Table-to-table transforms, dataset content versioning.
- ML model training / hosting (predictive = LLM reasoning + Python + trend extrapolation only).
- Streaming / CDC ingestion.
- A standalone BI/SQL IDE product.
