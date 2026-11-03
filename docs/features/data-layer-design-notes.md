# Data layer — design notes

Decisions behind the data layer that are still true in the code. This page replaces the separate
interaction, implementation, Playground and grid-filter design docs; the feature reference is
[Data layer](data-layer.md), the semantic-model spec is
[semantic model (Ossie)](data-layer-semantic-model.md), and the consumption surface is
[Data Insights](data-layer-insights.md).

Status: shipped. Keep this page for the reasoning; put behaviour in `data-layer.md`.

## Layers and permissions

- Three layers: **Application / Ontology / Data**. Data sources are tagged `data` or `ontology`
  (PostgreSQL sources are data-capable by default; `ontology` is an explicit exclusion).
- Suite-app permission keys: `data:read` (browse catalog, schema, profile, quality, rows),
  `data:write` (register datasets, ingest, joins/metrics/quality), `data:edit` (row edits, audited in
  `dataset_edits`). Data Insights has its own `insights:read` / `insights:write`.
- Row edits need `data:edit`; `data:read` is enforced for the rows POST path through a specific
  permission pattern, not by skipping middleware.

## Catalog vs model

- **Catalog** owns the physical substrate: columns, relationships, quality rules, rows, file versions.
- **A semantic model** is a named scope over that base; it owns **fields** and **metrics**.
- **Fields ≠ columns.** A column is physical (Catalog); a field is a model-scoped projection (column
  ref or computed expression, `is_time` role, `ai_context`).
- A relationship carries only edge facts: `from` (many) → `to` (one), ordered column pairs,
  `required`. **Cardinality is derived, not stored.**

## Two dataset kinds

- `table` — a table in a SQL source; read with SQL, filtered row browsing, quality rules.
- `file` — immutable numbered versions of files in the platform bucket; frozen at publish; read with
  column/date selection through the version endpoint, never SQL; a manifest records files, sha256,
  row counts and schema. A single file over 512 MB is refused by name, not by OOM.
- The detail page follows the kind: a table gets Data · Columns · Relationships · Quality; a file
  dataset gets Data · Versions · Columns (no relationships, no SQL rules).

## Query vocabulary

One filter object for the Playground, metrics and the Data tab: `{field, op, value}` with a shared
operator whitelist (`= != > >= < <= like in not_in between is_null is_not_null`). The address space
differs: the Playground addresses declared **fields**, the Data tab addresses **columns**.

- **AND only** in v1; a boolean tree is a model-level feature, not a browsing grid.
- **Builder / Data tab:** no free-text `where`; no new operators (`contains` is UI sugar over `like`).
- **Playground Advanced:** opt-in free-text `where` / `having` (and `expression`) on the same `/query` contract — fragments only; FROM/JOIN still compiled.
- **Playground SQL Lab:** free `SELECT` via `/sql` — shape check + model table allowlist + single data source + READ ONLY txn (not a full SQL parser product).
- **Safety (structured filters):** identifiers validated against the table, values parameterized, operators whitelisted,
  ≤ 10 conditions, read-only, statement timeout, row cap.
- **Classified errors:** `400 {code, message, kind}` with `kind` = `definition` / `data` / `request`;
  raw SQL is a details line, never the message.
- **The count reflects the filters**; it shares the statement timeout.
- **URL state:** a filtered view and a Playground question are reproducible from the URL.

## Playground

- The human twin of the model query API: Builder/Advanced share `/query` with agents; SQL Lab uses
  `/sql` (Playground-first, not the agent path yet).
- **No save, no pivot, table only.** Saved answers/charts belong to Data Insights.
- `POST /semantic-models/{id}/query` replaces `/preview`; `POST /metrics/{id}/compute` stays as the
  metric-addressed single value (the same engine with no grouping). `POST …/sql` is the free-SELECT
  path (allowlisted tables, single data source).
- A failed query is classified, not just reported; the pane says who can fix it.

## Data tab

- `POST /api/datasets/{id}/rows/query` replaces `GET /rows` (no alias). A structured filter set is one
  object, not JSON encoded into a query string.
- Keyset paging still requires `sort`; filtering does not change that.
- Temporal columns get a date picker with quick ranges (last 7/30 days, this month, last month, this
  year, last year); a reversed range is shown, not silently returned as zero rows.

## Data Insights

- A **story** is the document; a **finding** is a tile that owns **its own source** (dataset or
  semantic model) and the query it came from. A story can mix sources by construction.
- `POST /api/stories/{id}/run` re-runs every finding through its own engine and persists the results;
  one finding failing does not fail the story.
- **No third query engine**: both sources reuse the existing read-only engines with their timeouts,
  row caps and classified errors.
- Provenance is part of every tile: the source, plus the metric/fields inside its query.

## Interaction rules

1. **Reuse the mental models users already have** — `EntityViewShell`, rail layouts, `<Dialog>`,
   `<MetricGrid>`, `<EmptyState>`, `useConfirm`; no new interaction language.
2. **Progressive disclosure** — catalog → detail → action; a list never shows what only a detail needs.
3. **The picture is the primary artifact** — the ER map is drawn, not tabulated.
4. **The empty state is the next action** — one button that does the obvious thing.
