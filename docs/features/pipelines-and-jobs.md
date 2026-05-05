# Pipelines, jobs, and models

Pipelines define how a document is processed (command template + linked model). Jobs run pipelines on the procrastinate worker. Models capture provider/API endpoint metadata that pipelines and other features reuse.

## Pipelines

| Feature | Status | Description |
|---------|--------|-------------|
| Pipeline management | ✅ | CRUD via `/api/pipelines`; Pipelines.tsx with create/edit/delete |
| Command templates | ✅ | Pipeline `command` field supports `{variable}` placeholders (e.g. `{input}`, `{s3_prefix}`) resolved at runtime |
| Template variables API | ✅ | `GET /api/pipelines/template-variables` returns available placeholders with descriptions |
| Channel-pipeline link | ✅ | Each channel can have a pipeline_id and auto_process flag |
| Default pipeline | ✅ | "PaddleOCR Document Parse" seeded in migration with command template |

## Jobs (procrastinate)

| Feature | Status | Description |
|---------|--------|-------------|
| Job queue | ✅ | procrastinate (PostgreSQL-based); schema applied on startup |
| Jobs API | ✅ | `GET/POST/DELETE /api/jobs`, `GET /api/jobs/{id}`, `POST /api/jobs/{id}/retry` |
| Jobs UI | ✅ | Jobs.tsx with real API, status filter, create job, retry failed, delete |
| Job detail | ✅ | JobDetail.tsx at `/jobs/:jobId` – timing, document link, pipeline info, rendered command, event log |
| run_pipeline task | ✅ | Renders command template, spawns CLI subprocess; **`OPENKMS_PIPELINE_TIMEOUT_SECONDS`** (default **1800**) caps wait time; updates document status |
| Worker | ✅ | `backend/worker.py` entry point for procrastinate worker |
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
| Categories | ✅ | Fixed categories: OCR, VL, LLM, Embedding, Text Classification; `GET /api/models/categories` |
| Pipeline link | ✅ | Pipelines can link to a model (`model_id` FK); model selector in pipeline create/edit form |
| Command resolution | ✅ | `{vlm_url}` and `{model_name}` template vars resolved from linked model at job creation |
| Job detail model | ✅ | JobDetail.tsx shows model info card when job has a linked model |
| Default in category | ✅ | `is_default_in_category` on api_models; one model per category can be default; Models list shows Default column with "Set" button |
| Default seed | ✅ | PaddleOCR-VL-1.5 model seeded in migration and linked to default pipeline |
| Model detail | ✅ | ModelDetail.tsx at `/models/:modelId` – connection info (from provider), config, timestamps |
| Model playground | ✅ | Test models directly from the detail page; adapts per category: VL (form with image upload + prompt → markdown response), Embedding (text → dimension + values), LLM/other (chat conversation) |
| Model test API | ✅ | `POST /api/models/{id}/test` proxies request to provider's base_url; supports chat completions and embeddings |
