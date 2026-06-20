# Connectors

External integrations configured in the SPA at **`/connectors`** (detail **`/connectors/:id`**). Instances store non-secret **inputs**, optional **settings**, Fernet-encrypted **secrets**, and—for **sync** kinds—**output** bindings from catalog **slots** to ontology **datasets** (PostgreSQL tables).

Toggle: **`connectors`** (default on). Permissions: **`connectors:read`** (list, kinds, schedules, playground search responses) and **`connectors:write`** (create, update, delete, sync, provision datasets). Credential encryption uses **`OPENKMS_DATASOURCE_ENCRYPTION_KEY`** — see [Configuration](configuration.md).

Related: [Ontology datasets](ontology.md#data-sources-and-datasets), [Pipelines, jobs & models](pipelines-and-jobs.md) (`run_connector_sync`, scheduler), [Agents](openkms-agents.md) (`web_search` tool), [API reference — Connectors](api-reference.md#connectors-connectorsread-connectorswrite).

## Categories

| Category | Purpose | Outputs | Example kind |
|----------|---------|---------|--------------|
| **`sync`** | Pull external data on demand or on a schedule; write rows into bound datasets | One **dataset** per catalog **output slot** | `tushare` |
| **`search_tool`** | On-demand search for operators (playground) and Agents | None; kind defines **`output_schema`** for normalized JSON | `zhipu_web_search` |

Kind metadata (labels, input fields, secret key names, slots, schemas) is served by **`GET /api/connectors/kinds`** and defined in `backend/app/services/connector_catalog.py`.

## UI

| Route | Description |
|-------|-------------|
| `/connectors` | List instances; create modal (kind picker); legacy `/console/connectors` redirects here |
| `/connectors/:id` | Detail — tabs depend on kind category (below) |
| `/job-runs/schedules` | Central **Schedules** hub — all `scheduled_triggers` rows; enable/disable cron, **Run now**, link to connector |

**Sync** detail (e.g. Tushare): **General** (name, inputs, secrets, extra settings), **Output datasets** (slot → dataset; **Provision dataset** when `connectors:write` + `console:datasets`), **Schedule** (cron write-through to `scheduled_triggers`; **Run sync now** opens date-range dialog), **Probe** (Tushare live `daily` API — JSON only, no writes).

**search_tool** detail (e.g. Zhipu): **General**, **Playground** (query + optional param overrides, Send, JSON response).

Job runs from sync appear under **`/job-runs`** with task name **`run_connector_sync`**.

## Sync execution

1. Operator triggers **`POST /api/connectors/{id}/sync`** (optional `{ start_date, end_date }` ISO dates) or schedule fires via **`scheduler.py`** → **`dispatch_due_schedules`** (minute tick, PostgreSQL advisory lock).
2. API defers **`run_connector_sync`** on the procrastinate worker with per-connector lock `connector_sync:{id}`.
3. Worker calls **`run_connector_sync_for_row`** (`backend/app/services/connector_sync/run.py`) by **`connector.kind`**.
4. On completion, **`scheduled_triggers`** updates `last_run_at`, `last_status`, `last_job_id` (also mirrored on connector GET as `sync_schedule` runtime fields).

**Manual date range:** both `start_date` and `end_date` required. **Omitted dates:** kind-specific default window (Tushare: incremental from last row through today).

**Schedules:** connector **Schedule** tab and **`PATCH /api/schedules/{id}`** both update `settings.sync_schedule` on the connector and the registry row (`kind=connector_sync`, `target_id=connector id`). Delete connector removes its trigger row.

Docker runs a dedicated **`scheduler`** service (`python scheduler.py`); worker heartbeats and scheduler liveness surface on Console **System health** — see [Pipelines, jobs & models](pipelines-and-jobs.md).

### Tushare (`sync`)

China market data via [tushare.pro](https://tushare.pro). Secret: **`TUSHARE_TOKEN`**. Default input: `api_base_url` → `https://api.tushare.pro`.

| Output slot | PG schema (default) | Table (default) | API / notes |
|-------------|---------------------|-----------------|-------------|
| `trade_calendar` | `tushare` | `trade_calendar` | `trade_cal`; skipped when table already spans window |
| `stock_basic` | `tushare` | `stock_basic` | One `stock_basic` call per sync run |
| `stock_trade_daily` | `tushare` | `stock_trade_daily` | `daily` OHLCV |
| `daily_basic` | `tushare` | `daily_basic` | `daily_basic` — turnover, PE/PB/PS, market cap, limit status |
| `stock_adj_daily` | `tushare` | `stock_adj_daily` | `adj_factor` |
| `dividends` | `tushare` | `dividends` | `dividend` by `ex_date` |

Rate limiting: `settings.sync_api_min_interval_seconds` and `sync_trade_cal_min_interval_seconds` (default **0.31** s ≈ 200 req/min). Short rate-limit waits retry in-process; longer waits re-queue with `scheduled_at`.

**Probe:** **`POST /api/connectors/{id}/probe`** — live `daily` request; returns rows + `debug`; **429** when rate-limited; no dataset writes.

**Provision dataset:** **`POST /api/connectors/provision-dataset`** creates a table matching the slot column schema and registers a Dataset row (`connectors:write` + `console:datasets`).

## Search tool execution

**`POST /api/connectors/{id}/search`** — body `{ "query": "…", "params"?: { … } }`; returns normalized `{ query, search_intent?, results[], debug? }`.

### Zhipu web search (`search_tool`)

Secret: **`ZHIPU_API_KEY`**. Inputs include `api_base_url`, `search_engine`, `count`, `content_size`, `search_recency_filter`, optional `search_domain_filter`. Settings may override `web_search_url`.

**Agents:** project settings **`web_search`** + **`search_connector_id`** register the Deep Agents **`web_search`** tool (`backend/app/services/deep_agents/tools/web_search.py`). See [Agents](openkms-agents.md).

## Data model

| Table | Role |
|-------|------|
| **`connectors`** | Instance row: `kind`, `inputs`, `outputs` (slot → `dataset_id`), `settings`, `secrets_encrypted`, `enabled` |
| **`scheduled_triggers`** | Cron registry; v1 target kind `connector_sync` |
| **`datasets`** | Sync sink — must match slot `dataset_schema` when the kind defines columns |

Full columns: [Data models — Connector](data-models.md#connector).

## Implementation map

| Area | Path |
|------|------|
| HTTP API | `backend/app/api/connectors.py`, `backend/app/api/schedules.py` |
| Kind catalog | `backend/app/services/connector_catalog.py` |
| Sync dispatch | `backend/app/services/connector_sync/run.py`, `backend/app/jobs/tasks.py` (`run_connector_sync`) |
| Tushare sync / probe | `backend/app/services/connector_sync/tushare/` |
| Zhipu search | `backend/app/services/connector_search/zhipu.py` |
| Scheduler | `backend/scheduler.py`, `backend/app/services/schedule_dispatch.py` |
| SPA | `frontend/src/pages/connectors/`, `frontend/src/pages/jobs/SchedulesPage.tsx` |

## Backlog

| Item | Notes |
|------|--------|
| Additional **sync** kinds | Only **Tushare** is implemented in `run_connector_sync_for_row` today |
| Downstream automation | Optional: dataset refresh → re-index linked KBs or operator notifications |
| Broader operator UX | Richer per-slot row counts and failure drill-down in connector detail |

Strategic context: [Development plan — Connectors](../development_plan.md#connectors-high).
