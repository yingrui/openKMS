# Pipelines, jobs, and models

Pipelines define how a document is processed (command template + linked model). **Job runs** execute pipelines on the procrastinate worker. Models capture provider/API endpoint metadata that pipelines and other features reuse.

## Pipelines

| Feature | Status | Description |
|---------|--------|-------------|
| Pipeline management | ✅ | CRUD via `/api/pipelines`; Pipelines.tsx with create/edit/delete |
| Command templates | ✅ | Pipeline `command` field supports `{variable}` placeholders (e.g. `{input}`, `{s3_prefix}`) resolved at runtime |
| Template variables API | ✅ | `GET /api/pipelines/template-variables` returns available placeholders with descriptions |
| Channel-pipeline link | ✅ | Each channel can have a pipeline_id and auto_process flag |
| Default pipeline | ✅ | "PaddleOCR Document Parse" seeded in migration with command template |
| Baidu Cloud pipeline | ✅ | "Baidu Cloud Document Parse" seeded (`pipeline_baidu_doc_parse`; `baidu-doc-parse`) |
| Pipeline active flag | ✅ | `is_active` on pipelines; Pipelines UI toggle; disabled pipelines rejected for new jobs; channel/job pickers show active only |

## Job runs (procrastinate)

| Feature | Status | Description |
|---------|--------|-------------|
| Job queue | ✅ | procrastinate (PostgreSQL-based); schema applied on startup |
| Job runs list pagination | ✅ | `GET /api/jobs` returns `total`, `limit`, `offset`; UI paginates with status/search server-side |
| Job runs API | ✅ | `GET/POST/DELETE /api/jobs`, `GET /api/jobs/{id}`, `POST /api/jobs/{id}/retry`, `POST /api/jobs/{id}/mark-failed` |
| Job runs UI | ✅ | `JobRuns.tsx` at `/job-runs` (legacy `/jobs` redirects), area nav with **Schedules** at `/job-runs/schedules`, status filter, queue run, retry failed, mark stale in-flight runs failed, delete |
| Schedules hub | ✅ | `scheduled_triggers` registry; `GET/PATCH /api/schedules`, `POST /api/schedules/{id}/run-now`; connector sync cron write-through |
| Central scheduler | ✅ | `backend/scheduler.py` (single instance): minute tick, `dispatch_due_schedules`, advisory lock; defers `run_connector_sync` with per-connector `lock` |
| Job run detail | ✅ | `JobDetail.tsx` at `/job-runs/:jobId` – timing, document link, pipeline info, rendered command, event log |
| run_pipeline task | ✅ | Renders command template, spawns CLI subprocess; **`OPENKMS_PIPELINE_TIMEOUT_SECONDS`** (default **3600**) caps wait time; updates document status |
| Worker | ✅ | `backend/worker.py` — procrastinate worker + minute heartbeat (`OPENKMS_WORKER_NAME` or hostname) |
| Process health | ✅ | Console **System health** lists each worker/scheduler instance (2 min offline, 10 min prune from in-memory registry) |
| Document status | ✅ | uploaded → pending → running → completed/failed; shown in list and detail |
| Process button | ✅ | Visible for uploaded/failed documents in list and detail views |
| Reset status | ✅ | Reset pending/failed documents to uploaded (if no active jobs); `POST /api/documents/{id}/reset-status` |
| Toast notifications | ✅ | Project-wide toast system via sonner for success/error/warning messages |

## Models (provider–model hierarchy)

| Feature | Status | Description |
|---------|--------|-------------|
| Service providers | ✅ | CRUD via `/api/providers`; add OpenAI, Anthropic, etc. with base_url and api_key |
| Model registry | ✅ | Models belong to providers; CRUD via `/api/models`; provider selector in Models.tsx sidebar |
| Provider–model UI | ✅ | Models.tsx: left sidebar lists providers (filter models); Add Provider / Add Model modals |
| API kinds | ✅ | `chat-completions`, `embeddings`, `custom`; `GET /api/models/api-kinds` |
| Capabilities | ✅ | Tags on each model (`text[]`, e.g. `vision`, `document-parse`); `GET /api/models/capabilities` |
| Pipeline link | ✅ | Pipelines can link to a model (`model_id` FK); model selector in pipeline create/edit form |
| Command resolution | ✅ | `{vlm_url}` and `{model_name}` template vars resolved from linked model at job creation |
| Job detail model | ✅ | JobDetail.tsx shows model info card when job has a linked model |
| Default per API kind | ✅ | `is_default_in_category` on api_models; one model per `api_kind` can be default; Models list shows Default column with "Set" button |
| Default seed | ✅ | PaddleOCR-VL-1.5 model seeded in migration and linked to default pipeline |
| Model detail | ✅ | ModelDetail.tsx at `/models/:modelId` – connection info (from provider), config, timestamps |
| Model playground | ✅ | Test from detail page: embeddings UI for `embeddings`; chat UI for `chat-completions` / `custom` (image upload when `vision` capability is set) |
| Model test API | ✅ | `POST /api/models/{id}/test` proxies request to provider's base_url; supports chat completions and embeddings |
