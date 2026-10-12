# Data layer implementation design — Phase 0–1

Concrete backend / frontend / skill design to start [Data layer plan](data_layer_plan.md) Phase 0–1. Phase 2–3 (metric DSL, Python sandbox, AI dashboards) are intentionally deferred here.

**Reused primitives:** `app/services/ontology/dataset_tables.py` (`pg_engine_for_datasource`, `is_valid_identifier`, `fetch_dataset_rows`), `app/services/storage.py` (`upload_object`/`get_object`), `app/services/credentials/credential_encryption.decrypt`, procrastinate jobs, `chunked_upload.py` (documents already do chunked upload).

---

## 0. Permission model

New Suite-app permission keys (added to `permission_catalog.py`):

| Key | Grants |
|-----|--------|
| `data:read` | view catalog, schema, profile, quality results, and rows; default for all roles (further constrained by dataset ACL) |
| `data:write` | register datasets, ingest files, manage joins/metrics/quality rules |

`console:datasets` stays console-scoped. The Data-layer Suite apps gate on `data:read`/`data:write`, not on console permissions.

---

## 1. Data source layer tag

### Model

`data_sources` gains one nullable column:

```python
# app/models/data_source.py
layer: Mapped[str | None] = mapped_column(String(16), nullable=True)  # "data" | "ontology" | None
```

- `None` = unassigned (legacy rows stay unchanged; `kind` still drives existing behavior).
- `data` = backs datasets and file ingest (PostgreSQL).
- `ontology` = backs the graph (Neo4j).

### Migration

Alembic autogenerate: `ALTER TABLE data_sources ADD COLUMN layer VARCHAR(16)`. No backfill.

### API

- `schemas/data_source.py`: `DataSourceCreate.layer`, `DataSourceUpdate.layer`, `DataSourceResponse.layer` (all optional).
- `api/data_sources.py`: create/update already do `body.model_dump(exclude_unset=True)`; just add the field to the schema and it flows through.

### Console

- `dataSourcesApi.ts`: add `layer?: string | null` to the type and payloads.
- `ConsoleDataSources.tsx`: add a **Layer** select (`未指定 / 数据层 / 本体层`) in the create/edit form; show a layer badge in the list.

---

## 2. Dataset catalog fields

### Model

`datasets` gains catalog columns:

| Column | Type | Notes |
|--------|------|-------|
| `description` | `Text` nullable | human description |
| `owner_sub` | `String(512)` nullable | JWT sub; display name resolved like `created_by_name` |
| `domain` | `String(128)` nullable | e.g. `finance`, `market` |
| `tags` | `JSONB` default `[]` | array of strings |
| `business_definition` | `Text` nullable | what the data means in business terms |
| `sensitivity` | `String(32)` nullable | `public` / `internal` / `confidential` / `restricted` |

### API / frontend

- `schemas/dataset.py`: extend `DatasetCreate` / `DatasetUpdate` / `DatasetResponse`.
- `datasetsApi.ts` + `DatasetDetailPage.tsx`: add a **Catalog** panel (description, owner, domain, tags, definition, sensitivity) alongside the existing columns/rows/usage tabs.

---

## 2.5 Register existing tables (non-file path)

Reuses existing endpoints — no new backend needed:

- `GET /api/datasets/from-source/{data_source_id}` lists tables in a PostgreSQL source.
- `POST /api/datasets` registers one or more selected tables as `Dataset` rows.

The Datasets app adds the **「Add tables」** flow (see interaction design); the skill adds `datasets discover` (below).

---

## 3. Dataset joins → ER model

### Model — new table `dataset_joins`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String(64)` PK | uuid4 |
| `name` | `String(256)` nullable | optional label |
| `source_dataset_id` | FK → `datasets.id` CASCADE | from side |
| `target_dataset_id` | FK → `datasets.id` CASCADE | to side |
| `cardinality` | `String(16)` | `one-to-one` / `one-to-many` |
| `join_columns` | `JSONB` | `[{ "source": "ts_code", "target": "ts_code" }, …]` |
| `description` | `Text` nullable | |
| `created_by` / `created_by_name` | as elsewhere | |
| `created_at` / `updated_at` | timestamps | |

Constraints: `source_dataset_id != target_dataset_id` (check), unique `(source_dataset_id, target_dataset_id, join_columns)`.

### Validation (service `app/services/data_layer/joins.py`)

1. Both datasets exist and are PostgreSQL-backed.
2. Every `source`/`target` column passes `is_valid_identifier`.
3. Columns exist in each dataset's `information_schema.columns` (reuse the metadata query).
4. `cardinality` ∈ {`one-to-one`, `one-to-many`}.

### API

- `POST /api/datasets/joins` (create) · `GET /api/datasets/joins?dataset_id=` (list both directions) · `PUT /api/datasets/joins/{id}` · `DELETE /api/datasets/joins/{id}`.
- Read requires `data:read` + `dataset_visible` on **both** datasets; write requires `data:write` + `require_dataset_write` on both.

### ER rendering (frontend)

Reuse the existing ontology schema-graph engine rather than a new graph library:

- `frontend/src/pages/ontology/OntologySchemaGraph.tsx` + `ontologySchemaGraphModel.ts` already render a layered node/edge diagram with per-type colors.
- Add a `datasetErGraphModel.ts`: nodes = datasets (label = display name, stat = row count), edges = joins (label = cardinality + column pairs).
- Render it in a **Data Model** app page (`/data-model/er`), or inside `DatasetDetailPage` as a "Relationships" tab in v1 (cheaper — reuse the detail shell and only one new page).

**v1 decision:** put the ER view in the **Data Model app** as its own page; `DatasetDetailPage` gets a "Joins" list tab (cheap, reuses EntityViewShell).

---

## 4. File ingest pipeline

"Access" path that turns an uploaded file into a PostgreSQL table on a **data-layer** data source.

### Data model — new table `dataset_ingests`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String(64)` PK | uuid4 |
| `data_source_id` | FK → `data_sources.id` | must be `layer = 'data'` |
| `dataset_id` | FK → `datasets.id` nullable | set after load |
| `storage_key` | `Text` | object-storage key of the raw file |
| `filename` | `String(512)` | original name |
| `status` | `String(32)` | `uploaded` → `parsing` → `preview_ready` → `loading` → `completed` / `failed` |
| `schema_name` / `table_name` | `String(128/256)` nullable | target table |
| `parse_config` | `JSONB` | header row, delimiter, sheet, column type overrides |
| `row_count` | `Integer` nullable | loaded rows |
| `error_message` | `Text` nullable | |
| `created_by` / `created_by_name` | as elsewhere | |
| `created_at` / `updated_at` | timestamps | |

### Flow (three steps)

**1) Upload** — chunked (reuse `chunked_upload.py` pattern), stored under `datasets/uploads/{ingest_id}/{filename}`. Returns `ingest_id`.

**2) Preview** — parse head of the file, infer schema, return sample.

- CSV: `pandas.read_csv(nrows=1000, engine="c")`; Excel: `read_excel(nrows=1000)`; JSON: `read_json` (records). Parquet deferred.
- Infer per column: pandas dtype → PostgreSQL type (see map below) + nullability from the sample.
- Response: `{ columns: [{name, pg_type, sample_values, null_ratio_in_sample}], total_rows_estimate, warnings }`.
- Store the chosen `parse_config` (header/delimiter/sheet/overrides) so load is reproducible.

**3) Load** — user confirms target (`schema_name`, `table_name`, overwrite vs append) and corrected types.

- Validate `schema_name` / `table_name` / every column via `is_valid_identifier`.
- Target source must be `layer = 'data'` and `kind = 'postgresql'`.
- Create table if new: `CREATE TABLE "schema"."table" ("col" TYPE, …)`.
- Append if existing: verify column intersection; reject on mismatch.
- Bulk-write with `COPY` (SQLAlchemy `copy_expert`) for speed — not row-by-row `INSERT`.
- Register a `Dataset` row (`data_source_id`, `schema_name`, `table_name`, `display_name` = filename stem) and link `dataset_ingests.dataset_id`.
- Run as a procrastinate **job** (`task_name="dataset_ingest_load"`) so large files don't block the request; status polled via `GET /api/datasets/ingests/{id}`.

### pandas → PostgreSQL type map

| pandas dtype | PostgreSQL |
|--------------|-----------|
| `int64` | `BIGINT` |
| `float64` | `DOUBLE PRECISION` |
| `bool` | `BOOLEAN` |
| `datetime64` / `object` parsed as date | `TIMESTAMP` / `DATE` |
| `object` (strings) | `TEXT` |

User can override any column type at the preview step (stored in `parse_config`).

### API

- `POST /api/datasets/ingests` (start upload) · `POST /api/datasets/ingests/{id}/preview` · `POST /api/datasets/ingests/{id}/load` · `GET /api/datasets/ingests/{id}`.
- Permission: `PERM_CONSOLE_DATASETS` (data engineer) for ingest; read of the resulting dataset follows normal dataset ACL.

### Object-storage keys

`datasets/uploads/{ingest_id}/{filename}` — raw file kept for audit/rebuild; not deleted on load.

---

## 5. Profile, schema snapshot, lineage (read-time)

### Profile — table `dataset_profiles`

| Column | Type |
|--------|------|
| `id` / `dataset_id` FK | uuid / FK CASCADE, unique per dataset |
| `row_count` | `Integer` |
| `column_stats` | `JSONB` — per column: `{null_rate, distinct_count, min, max, quantiles?}` |
| `computed_at` | timestamptz |

Computed on demand (`POST /api/datasets/{id}/profile`) against the source table using `COUNT(*)`, `COUNT(col)`, `COUNT(DISTINCT col)`, `MIN/MAX`. v1: full-table scan for small/medium tables; add `LIMIT`-based sampling later. Results cached in `dataset_profiles` until invalidated (schema change or manual refresh).

### Schema snapshot — table `schema_snapshots`

| Column | Type |
|--------|------|
| `id` / `dataset_id` FK | uuid / FK CASCADE |
| `columns` | `JSONB` — snapshot of `ColumnMetadata[]` |
| `captured_at` | timestamptz |

On each `GET /api/datasets/{id}/metadata`, diff against the latest snapshot; if changed, append a snapshot. Change detection = compare `column_name` + `data_type` sets. Expose `GET /api/datasets/{id}/schema-history` for the UI.

### Lineage — computed, no table

`GET /api/datasets/{id}/lineage` returns a read-time graph:

- **Upstream:** `data_source` (and connector sync if the dataset is a connector output slot).
- **Downstream:** `object_type` / `link_type` rows with `dataset_id = {id}` (ontology) and `dataset_joins` edges to other datasets.

Edges are assembled by querying existing relations — no persisted lineage table in v1.

---

## 6. openkms-skill extensions

New `datasets` subcommands (all JSON-print, matching existing style):

| Command | Maps to |
|---------|---------|
| `datasets profile --id ID` | `POST /api/datasets/{id}/profile` |
| `datasets schema-history --id ID` | `GET /api/datasets/{id}/schema-history` |
| `datasets lineage --id ID` | `GET /api/datasets/{id}/lineage` |
| `datasets joins list --id ID` | `GET /api/datasets/joins?dataset_id=ID` |
| `datasets joins add --source-id A --target-id B --cardinality one-to-many --columns "ts_code=ts_code" --yes` | `POST /api/datasets/joins` |
| `datasets joins delete --id JOIN_ID --yes` | `DELETE /api/datasets/joins/{id}` |
| `datasets discover --data-source-id ID` | `GET /api/datasets/from-source/{id}` (list tables to register) |
| `datasets ingest --file x.csv --data-source-id ID --schema imports --table x [--append] --yes` | `POST …/ingests` + `preview` + `load` |

`joins add`/`ingest` are write commands → `--dry-run` / `-y` gating (reuse `add_write_flags` / `confirm_or_abort`).

---

## 7. API surface summary (new)

| Method & path | Purpose |
|---------------|---------|
| `POST /api/datasets/ingests` | start file ingest |
| `POST /api/datasets/ingests/{id}/preview` | parse + schema inference |
| `POST /api/datasets/ingests/{id}/load` | create/append table + register Dataset |
| `GET /api/datasets/ingests/{id}` | ingest status |
| `GET /api/datasets/{id}/profile` (POST refresh) | compute/read profile |
| `GET /api/datasets/{id}/schema-history` | schema snapshots |
| `GET /api/datasets/{id}/lineage` | read-time lineage |
| `POST/GET/PUT/DELETE /api/datasets/joins…` | join/ER CRUD |

## 8. Migration checklist (Phase 0–1)

1. `data_sources.layer` (nullable `VARCHAR(16)`)
2. `datasets` catalog columns (`description`, `owner_sub`, `domain`, `tags` JSONB, `business_definition`, `sensitivity`)
3. `dataset_joins` (new)
4. `dataset_ingests` (new)
5. `dataset_profiles` (new)
6. `schema_snapshots` (new)

(Phase 2 tables — `quality_*`, `metric_definitions`; Phase 3 — `explorer_reports` — are listed in the plan but not migrated yet.)
