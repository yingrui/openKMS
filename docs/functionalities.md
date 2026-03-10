# openKMS Functionalities

## Implemented Features

### 1. Documents

| Feature | Status | Description |
|---------|--------|-------------|
| Document overview | ✅ | Dashboard at `/documents` with channel count, document count (from API stats), quick actions, channel list |
| Channel management | ✅ | Create/manage channels at `/documents/channels` (tree structure) |
| Document channel view | ✅ | Browse documents by channel at `/documents/channels/:channelId`; list from `GET /api/documents?channel_id=` |
| Channel settings | ✅ | Per-channel pipeline, auto-process, metadata extraction (model + schema) at `/documents/channels/:channelId/settings` |
| Document upload | ✅ | Upload to channel via modal (choose files, drag-and-drop); POST `/api/documents/upload` with `channel_id`; stores file to S3 (no parsing at upload); status=uploaded |
| Document processing | ✅ | Process button on document list/detail; creates a job via `POST /api/jobs`; auto-process if channel configured |
| Document status | ✅ | Status badge (uploaded/pending/running/completed/failed) on document list and detail |
| Document detail | ✅ | View parsed Markdown at `/documents/view/:id`; scrollable layout (min-height 720px) for large content |
| Document markdown edit | ✅ | Edit/View toggle, textarea for markdown, Save (`PUT /markdown`), Restore from S3 (`POST /restore-markdown`) |
| Document metadata extraction | ✅ | Metadata card on detail page; Extract button uses channel's LLM; configurable schema per channel (key, label, type, description for LLM prompt); combined with document info in one section |
| Document info & metadata edit | ✅ | Edit document name (PUT /api/documents/{id}); Edit metadata fields inline (PUT /metadata); supports string, date, array types per extraction schema |
| Channel description | ✅ | Channel description shown on channel page; stored in `document_channels.description` |

### 2. Document Parsing

- **PaddleOCR-VL** with mlx-vlm-server as VLM backend
- Supports: PDF, PNG, JPG, JPEG, WEBP
- Output: Markdown, layout detection, parsing result JSON
- Configurable: server URL, model, max concurrency

### 2b. openkms-cli (CLI for document parsing)

- **CLI** at `openkms-cli/` built with Typer (≥0.9.0)
- **Parse**: `openkms-cli parse run <input> [--output dir] [--vlm-url ...]`
- **Pipeline**: `openkms-cli pipeline run --input s3://.../original.pdf` – S3 or local input; optional --s3-prefix (defaults to file hash), --skip-upload
- **Metadata extraction**: when channel has extraction_model_id and extraction_schema, worker passes `--extract-metadata --extraction-model-name <model_name>`; CLI fetches model config from `GET /api/models/config-by-name`, extracts via pydantic-ai, PUTs to `PUT /api/documents/{id}/metadata`
- Uses PaddleOCR-VL for parsing (optional: `pip install openkms-cli[parse]`); pipeline needs `pip install openkms-cli[pipeline]`; extraction needs `pip install openkms-cli[metadata]`
- Output structure matches backend: `{file_hash}/original.{ext}`, `result.json`, `markdown.md`, `layout_det_*`, `block_*`, `markdown_out/*`
- **Backend integration**: subprocess-invokable for async jobs
- **Extensible**: developers can add new Typer subapps in app.py

### 3. Articles (Feature Toggle)

- CMS-style articles with channel tree
- List, detail, search, filter by status
- Toggle via Console → Feature Toggles

### 4. Knowledge Bases (Feature Toggle)

- List and detail views
- RAG Q&A placeholder
- Toggle via Console → Feature Toggles

### 5. Console (Admin)

- Overview, Settings, Users & Roles, Feature Toggles
- **Admin-only**: visible and accessible only to users with Keycloak realm role `admin`
- Feature toggles: `articles`, `knowledgeBases` – persisted in PostgreSQL (`feature_toggles` table), shared across all users/devices
- `GET /api/feature-toggles` (authenticated) returns current toggle state
- `PUT /api/feature-toggles` (admin-only) updates toggle state; backend `require_admin` checks JWT realm role

### 5b. Authentication

- Keycloak login/logout (SSO, full logout via Keycloak)
- Protected routes: all except home require auth; unauthenticated users see "Authentication Required" message

### 5c. Home (Landing Page)

- Public landing page for non-authorized users
- Pain points: knowledge scattered, unstructured content, manual work
- Benefits: centralized hub, RAG-ready knowledge bases, enterprise security
- Functionalities: document management, articles, knowledge bases, pipelines

### 6. Pipelines

| Feature | Status | Description |
|---------|--------|-------------|
| Pipeline management | ✅ | CRUD via `/api/pipelines`; Pipelines.tsx with create/edit/delete |
| Command templates | ✅ | Pipeline `command` field supports `{variable}` placeholders (e.g. `{input}`, `{s3_prefix}`) resolved at runtime |
| Template variables API | ✅ | `GET /api/pipelines/template-variables` returns available placeholders with descriptions |
| Channel-pipeline link | ✅ | Each channel can have a pipeline_id and auto_process flag |
| Default pipeline | ✅ | "PaddleOCR Document Parse" seeded in migration with command template |

### 7. Jobs (procrastinate)

| Feature | Status | Description |
|---------|--------|-------------|
| Job queue | ✅ | procrastinate (PostgreSQL-based); schema applied on startup |
| Jobs API | ✅ | `GET/POST/DELETE /api/jobs`, `GET /api/jobs/{id}`, `POST /api/jobs/{id}/retry` |
| Jobs UI | ✅ | Jobs.tsx with real API, status filter, create job, retry failed, delete |
| Job detail | ✅ | JobDetail.tsx at `/jobs/:jobId` – timing, document link, pipeline info, rendered command, event log |
| run_pipeline task | ✅ | Renders command template, spawns CLI subprocess; updates document status |
| Worker | ✅ | `backend/worker.py` entry point for procrastinate worker |
| Document status | ✅ | uploaded → pending → running → completed/failed; shown in list and detail |
| Process button | ✅ | Visible for uploaded/failed documents in list and detail views |
| Reset status | ✅ | Reset pending/failed documents to uploaded (if no active jobs); `POST /api/documents/{id}/reset-status` |
| Toast notifications | ✅ | Project-wide toast system via sonner for success/error/warning messages |

### 8. Models (API Provider Registry)

| Feature | Status | Description |
|---------|--------|-------------|
| Model registry | ✅ | CRUD via `/api/models`; Models.tsx with category filter, search, create/edit/delete |
| Categories | ✅ | Fixed categories: OCR, VL, LLM, Embedding, Text Classification; `GET /api/models/categories` |
| Pipeline link | ✅ | Pipelines can link to a model (`model_id` FK); model selector in pipeline create/edit form |
| Command resolution | ✅ | `{vlm_url}` and `{model_name}` template vars resolved from linked model at job creation |
| Job detail model | ✅ | JobDetail.tsx shows model info card when job has a linked model |
| Default seed | ✅ | PaddleOCR-VL-1.5 model seeded in migration and linked to default pipeline |
| Model detail | ✅ | ModelDetail.tsx at `/models/:modelId` – connection info, config, timestamps |
| Model playground | ✅ | Test models directly from the detail page; adapts per category: VL (form with image upload + prompt → markdown response), Embedding (text → dimension + values), LLM/other (chat conversation) |
| Model test API | ✅ | `POST /api/models/{id}/test` proxies request to model's base_url; supports chat completions and embeddings |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/login` | Redirect to Keycloak login |
| GET | `/login/oauth2/code/keycloak` | OAuth2 callback (Keycloak redirect URI) |
| POST | `/sync-session` | Sync frontend JWT to backend session (Bearer required) |
| POST | `/clear-session` | Clear backend session (called by frontend before Keycloak logout) |
| GET | `/logout` | Clear session, redirect to Keycloak logout (legacy backend flow) |
| GET | `/api/channels/documents` | List document channels (tree) |
| POST | `/api/channels/documents` | Create channel |
| PUT | `/api/channels/documents/{id}` | Update channel (name, pipeline_id, auto_process, extraction_model_id, extraction_schema) |
| POST | `/api/documents/upload` | Upload document (store only, no parsing); auto-process if channel configured |
| GET | `/api/documents?channel_id=` | List documents in channel and descendants |
| GET | `/api/documents/stats` | Get document counts (e.g. total) for index page |
| GET | `/api/documents/{id}` | Get document by ID |
| PUT | `/api/documents/{id}` | Update document info (e.g. name) |
| GET | `/api/documents/{id}/parsing` | Get parsing result (result.json) |
| GET | `/api/documents/{id}/files/{file_hash}/{path}` | Redirect to presigned S3 URL via frontend proxy |
| DELETE | `/api/documents/{id}` | Delete document and its storage files |
| POST | `/api/documents/{id}/reset-status` | Reset document status to uploaded (if no active jobs) |
| PUT | `/api/documents/{id}/metadata` | Update document metadata (partial merge) |
| PUT | `/api/documents/{id}/markdown` | Update document markdown (DB only) |
| POST | `/api/documents/{id}/restore-markdown` | Restore markdown from S3 `{file_hash}/markdown.md` |
| POST | `/api/documents/{id}/extract-metadata` | Extract metadata from markdown using channel's LLM |
| GET | `/api/pipelines` | List pipeline configurations |
| GET | `/api/pipelines/template-variables` | List available command template variables |
| POST | `/api/pipelines` | Create pipeline |
| GET | `/api/pipelines/{id}` | Get pipeline detail |
| PUT | `/api/pipelines/{id}` | Update pipeline |
| DELETE | `/api/pipelines/{id}` | Delete pipeline |
| GET | `/api/jobs` | List jobs (optional `?document_id=`) |
| GET | `/api/jobs/{id}` | Get job detail |
| POST | `/api/jobs` | Create processing job (`{ document_id, pipeline_id? }`) |
| POST | `/api/jobs/{id}/retry` | Retry a failed job |
| DELETE | `/api/jobs/{id}` | Delete a job (not running) |
| GET | `/api/models` | List models (optional `?category=`, `?search=`) |
| GET | `/api/models/categories` | List model categories |
| POST | `/api/models` | Register a new model/API endpoint |
| GET | `/api/models/config-by-name` | Get model config by model_name (service client; for CLI extraction) |
| GET | `/api/models/{id}` | Get model detail |
| PUT | `/api/models/{id}` | Update model |
| DELETE | `/api/models/{id}` | Delete model |
| POST | `/api/models/{id}/test` | Test model (proxies to model's base_url; supports chat/embedding/VL) |
| GET | `/api/feature-toggles` | Get feature toggle state (authenticated) |
| PUT | `/api/feature-toggles` | Update feature toggles (admin-only) |

## Configuration

- **Backend deps**: `pyproject.toml` + `uv.lock`; install with `uv sync` or `pip install -e .`
- **S3/MinIO** (required for upload): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL`, `AWS_BUCKET_NAME`. Uploaded files stored under `{file_hash}/`. Dev: Vite proxies `/buckets/openkms` to MinIO for image loads.
- **Cursor rules**: `.cursor/rules/` – e.g. `docs-before-commit` (update docs before commit).

## Data Models

### Pipeline

- `id`, `name`, `description`, `command` (template with `{variable}` placeholders), `default_args` (JSONB), `model_id` (FK → api_models, nullable), `created_at`, `updated_at`
- Defines how to process documents; command template resolved at runtime with variables like `{input}`, `{s3_prefix}`, `{vlm_url}`, `{model_name}`, `{bucket}`, etc.
- When linked to a model, `{vlm_url}` and `{model_name}` are resolved from the model's `base_url` and `model_name`

### ApiModel

- `id`, `name`, `provider`, `category`, `base_url`, `api_key` (masked in API responses), `model_name`, `config` (JSONB), `created_at`, `updated_at`
- Represents an external API endpoint (VLM, LLM, Embedding, etc.) that pipelines can reference
- Categories: `ocr`, `vl`, `llm`, `embedding`, `text-classification`

### Document Channel

- `id`, `name`, `description`, `parent_id`, `sort_order`, `pipeline_id` (FK → pipelines), `auto_process`, `extraction_model_id` (FK → api_models), `extraction_schema` (json), `created_at`
- Tree structure: parent → children
- When `auto_process=true`, uploads to this channel automatically defer a processing job
- Metadata extraction: pydantic-ai Agent + StructuredDict; `extraction_model_id` designates LLM; `extraction_schema` stored as PostgreSQL `json` (not jsonb) to preserve key order; JSON Schema dict (type, properties, required)

### Document

- `id`, `name`, `file_type`, `size_bytes`, `channel_id`, `file_hash`, `status`, `markdown`, `parsing_result`, `metadata` (JSONB), `created_at`, `updated_at`
- Status: `uploaded` → `pending` → `running` → `completed` / `failed`
- `metadata`: extracted or manually edited (abstract, author, publish_date, tags, etc.)

### FeatureToggle

- `key` (PK, string), `enabled` (boolean), `updated_at`
- Stores feature flags shared across all users; seeded with `articles` and `knowledgeBases` (both enabled by default)
- Read by all authenticated users; write restricted to admins

### Jobs (procrastinate_jobs)

- Managed by procrastinate; stores task_name, args (document_id, pipeline_id, etc.), status, attempts, timestamps
