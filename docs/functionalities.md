# openKMS Functionalities

## Implemented Features

### 1. Documents

| Feature | Status | Description |
|---------|--------|-------------|
| Document overview | ✅ | Dashboard at `/documents` with channel count, document count (from API stats), quick actions |
| Channel management | ✅ | Create channels at `/documents/channels` (tree structure); rename, description, move, merge, delete; settings per channel |
| Document channel view | ✅ | Browse documents by channel at `/documents/channels/:channelId`; list from `GET /api/documents?channel_id=` |
| Channel settings | ✅ | Per-channel pipeline, auto-process, metadata extraction (model + schema) at `/documents/channels/:channelId/settings` |
| Document upload | ✅ | Upload to channel via modal (choose files, drag-and-drop); POST `/api/documents/upload` with `channel_id`; stores file to S3 (no parsing at upload); status=uploaded |
| Document processing | ✅ | Process button on document list/detail; creates a job via `POST /api/jobs`; auto-process if channel configured |
| Document status | ✅ | Status badge (uploaded/pending/running/completed/failed) on document list and detail |
| Document detail | ✅ | View parsed Markdown at `/documents/view/:id`; scrollable layout (min-height 720px) for large content |
| Document markdown edit | ✅ | Edit/View toggle, textarea for markdown, Save (`PUT /markdown`), Restore from S3 (`POST /restore-markdown`) |
| Document metadata extraction | ✅ | Metadata card on detail page; Extract button uses channel's LLM; configurable schema per channel (key, label, type, description for LLM prompt); combined with document info in one section |
| Document info & metadata edit | ✅ | Edit document name and channel (PUT /api/documents/{id}); Edit metadata fields inline (PUT /metadata); Move document to channel via modal |
| Channel description | ✅ | Channel description shown on channel page; stored in `document_channels.description` |

### 2. Document Parsing

- **PaddleOCR-VL** with mlx-vlm-server as VLM backend
- Supports: PDF, PNG, JPG, JPEG, WEBP
- Output: Markdown, layout detection, parsing result JSON
- Configurable: server URL, model, max concurrency

### 2b. openkms-cli (CLI for document parsing)

- **CLI** at `openkms-cli/` built with Typer (≥0.9.0)
- **Parse**: `openkms-cli parse run <input> [--output dir] [--vlm-url ...]`
- **Pipeline**: `openkms-cli pipeline list` (list supported pipelines); `openkms-cli pipeline run --input s3://.../original.pdf` – S3 or local input; optional --s3-prefix (defaults to file hash), --skip-upload
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

| Feature | Status | Description |
|---------|--------|-------------|
| KB management | ✅ | CRUD via `/api/knowledge-bases`; KnowledgeBaseList with create/edit/delete |
| KB documents | ✅ | Add/remove documents to KB (join table); link existing documents without copying |
| FAQs | ✅ | Manual create/edit/delete FAQ pairs; LLM-based FAQ generation from documents; FAQ list shows source document |
| FAQ generation | ✅ | Two-step: `POST /faqs/generate` returns preview; user reviews, removes unqualified; `POST /faqs/batch` saves selected; configurable prompt in KB settings and modal |
| Chunks | ✅ | Document chunks stored with pgvector embeddings; configurable chunking strategy (fixed_size, markdown_header, paragraph) |
| Semantic search | ✅ | `POST /api/knowledge-bases/{id}/search` using pgvector cosine distance over chunks and FAQs; returns 503 with install instructions if pgvector missing |
| QA proxy | ✅ | `POST /api/knowledge-bases/{id}/ask` proxies to configurable agent service URL |
| KB settings | ✅ | Agent URL, embedding model selection, chunk strategy/size/overlap, FAQ generation prompt |
| KB indexing (CLI) | ✅ | `openkms-cli pipeline run --pipeline-name kb-index` – chunk documents, generate embeddings, bulk insert to pgvector |
| KB indexing (job) | ✅ | `run_kb_index` procrastinate task for background indexing |
| QA Agent service | ✅ | Separate FastAPI + LangGraph project (`qa-agent/`); retrieves via backend search API, no direct DB access |
| Q&A tab | ✅ | Chat-like interface in KB detail page for asking questions; hidden when agent URL is not configured |

- Toggle visibility via Console → Feature Toggles

### 4b. Glossaries

| Feature | Status | Description |
|---------|--------|-------------|
| Glossary management | ✅ | CRUD via `/api/glossaries`; GlossaryList with create/edit/delete |
| Multiple glossaries | ✅ | Create glossaries for different domains |
| Bilingual terms | ✅ | Add primary EN, primary CN, definition, synonyms EN, synonyms CN per term |
| Term CRUD | ✅ | Add/edit/delete terms in glossary; at least one of primary_en or primary_cn required |
| Search terms | ✅ | `GET /api/glossaries/{id}/terms?search=` filters by primary, definition, or synonyms (case-insensitive); debounced in UI |
| AI suggestion | ✅ | `POST /api/glossaries/{id}/terms/suggest` – LLM suggests translation, definition, and synonyms; button in Add Term form when primary entered |
| Export | ✅ | `GET /api/glossaries/{id}/export` returns JSON with glossary_id, name, terms array |
| Import | ✅ | `POST /api/glossaries/{id}/import` with `{ terms, mode: "append" \| "replace" }`; JSON file picker in UI |

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

### 8. Models (Provider–Model Hierarchy)

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

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/login` | Redirect to Keycloak login |
| GET | `/login/oauth2/code/keycloak` | OAuth2 callback (Keycloak redirect URI) |
| POST | `/sync-session` | Sync frontend JWT to backend session (Bearer required) |
| POST | `/clear-session` | Clear backend session (called by frontend before Keycloak logout) |
| GET | `/logout` | Clear session, redirect to Keycloak logout (legacy backend flow) |
| GET | `/api/document-channels` | List document channels (tree) |
| POST | `/api/document-channels` | Create channel |
| PUT | `/api/document-channels/{id}` | Update channel (name, description, parent_id, pipeline_id, auto_process, extraction_model_id, extraction_schema) |
| POST | `/api/document-channels/{id}/reorder` | Move channel up or down among siblings (body: `{ direction: "up" \| "down" }`) |
| POST | `/api/document-channels/merge` | Merge source channel into target (move documents, delete source; optional include_descendants) |
| DELETE | `/api/document-channels/{id}` | Delete channel (fails if has documents or sub-channels) |
| POST | `/api/documents/upload` | Upload document (store only, no parsing); auto-process if channel configured |
| GET | `/api/documents?channel_id=&search=&limit=` | List documents; channel_id optional (all if omitted); search filters by name |
| GET | `/api/documents/stats` | Get document counts (e.g. total) for index page |
| GET | `/api/documents/{id}` | Get document by ID |
| PUT | `/api/documents/{id}` | Update document info (name, channel_id) |
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
| GET | `/api/providers` | List service providers |
| POST | `/api/providers` | Create provider |
| GET | `/api/providers/{id}` | Get provider |
| PUT | `/api/providers/{id}` | Update provider |
| DELETE | `/api/providers/{id}` | Delete provider (fails if has models) |
| GET | `/api/models` | List models (optional `?category=`, `?provider_id=`, `?search=`) |
| GET | `/api/models/categories` | List model categories |
| POST | `/api/models` | Create model under provider (provider_id, name, category, model_name) |
| GET | `/api/models/config-by-name` | Get model config by model_name (service client; for CLI extraction) |
| GET | `/api/models/{id}` | Get model detail |
| PUT | `/api/models/{id}` | Update model |
| DELETE | `/api/models/{id}` | Delete model |
| POST | `/api/models/{id}/test` | Test model (proxies to provider's base_url; supports chat/embedding/VL) |
| GET | `/api/jobs` | List jobs (optional `?document_id=`) |
| GET | `/api/jobs/{id}` | Get job detail |
| POST | `/api/jobs` | Create processing job (`{ document_id, pipeline_id? }`) |
| POST | `/api/jobs/{id}/retry` | Retry a failed job |
| DELETE | `/api/jobs/{id}` | Delete a job (not running) |
| GET | `/api/knowledge-bases` | List knowledge bases |
| POST | `/api/knowledge-bases` | Create knowledge base |
| GET | `/api/knowledge-bases/{id}` | Get KB with stats |
| PUT | `/api/knowledge-bases/{id}` | Update KB (name, description, agent_url, chunk_config, embedding_model_id, faq_prompt) |
| DELETE | `/api/knowledge-bases/{id}` | Delete KB (cascades documents, FAQs, chunks) |
| GET | `/api/knowledge-bases/{id}/documents` | List documents in KB |
| POST | `/api/knowledge-bases/{id}/documents` | Add document to KB |
| DELETE | `/api/knowledge-bases/{id}/documents/{doc_id}` | Remove document from KB |
| GET | `/api/knowledge-bases/{id}/faqs` | List FAQs |
| POST | `/api/knowledge-bases/{id}/faqs` | Create FAQ |
| PUT | `/api/knowledge-bases/{id}/faqs/{faq_id}` | Update FAQ |
| DELETE | `/api/knowledge-bases/{id}/faqs/{faq_id}` | Delete FAQ |
| POST | `/api/knowledge-bases/{id}/faqs/generate` | Generate FAQ preview from documents via LLM (no DB save) |
| POST | `/api/knowledge-bases/{id}/faqs/batch` | Save selected FAQ pairs to KB |
| GET | `/api/knowledge-bases/{id}/chunks` | List chunks (paginated) |
| DELETE | `/api/knowledge-bases/{id}/chunks` | Delete all chunks |
| POST | `/api/knowledge-bases/{id}/chunks/batch` | Bulk create chunks with embeddings (kb-index pipeline) |
| PUT | `/api/knowledge-bases/{id}/faqs/batch-embeddings` | Bulk update FAQ embeddings (kb-index pipeline) |
| POST | `/api/knowledge-bases/{id}/search` | Semantic search over chunks and FAQs |
| POST | `/api/knowledge-bases/{id}/ask` | Proxy question to QA agent service |
| GET | `/api/glossaries` | List glossaries |
| POST | `/api/glossaries` | Create glossary |
| GET | `/api/glossaries/{id}` | Get glossary with term count |
| PUT | `/api/glossaries/{id}` | Update glossary |
| DELETE | `/api/glossaries/{id}` | Delete glossary (cascades terms) |
| GET | `/api/glossaries/{id}/terms` | List terms (optional `?search=`) |
| POST | `/api/glossaries/{id}/terms/suggest` | AI suggest translation, definition, synonyms (body: `{ primary_en?, primary_cn? }`); uses default LLM |
| POST | `/api/glossaries/{id}/terms` | Create term |
| GET | `/api/glossaries/{id}/terms/{term_id}` | Get term |
| PUT | `/api/glossaries/{id}/terms/{term_id}` | Update term |
| DELETE | `/api/glossaries/{id}/terms/{term_id}` | Delete term |
| GET | `/api/glossaries/{id}/export` | Export terms as JSON |
| POST | `/api/glossaries/{id}/import` | Import terms (body: `{ terms, mode: "append" \| "replace" }`) |
| GET | `/api/feature-toggles` | Get feature toggle state (authenticated) |
| PUT | `/api/feature-toggles` | Update feature toggles (admin-only) |

## Configuration

- **Backend deps**: `pyproject.toml` + `uv.lock`; install with `uv sync` or `pip install -e .`
- **pgvector**: FAQ/chunk list excludes embedding when pgvector not installed (has_embedding=false). Semantic search returns 503 with install instructions. `backend/dev.sh` runs `scripts/ensure_pgvector.py` on start to check/create extension and optionally auto-install in Docker.
- **S3/MinIO** (required for upload): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL`, `AWS_BUCKET_NAME`. Uploaded files stored under `{file_hash}/`. Dev: Vite proxies `/buckets/openkms` to MinIO for image loads.
- **Cursor rules**: `.cursor/rules/` – e.g. `docs-before-commit` (update docs before commit).

## Data Models

### Pipeline

- `id`, `name`, `description`, `command` (template with `{variable}` placeholders), `default_args` (JSONB), `model_id` (FK → api_models, nullable), `created_at`, `updated_at`
- Defines how to process documents; command template resolved at runtime with variables like `{input}`, `{s3_prefix}`, `{vlm_url}`, `{model_name}`, `{bucket}`, etc.
- When linked to a model, `{vlm_url}` and `{model_name}` are resolved from the model's `base_url` and `model_name`

### ApiModel

- `id`, `name`, `provider`, `category`, `is_default_in_category` (one model per category can be default), `base_url`, `api_key` (masked in API responses), `model_name`, `config` (JSONB), `created_at`, `updated_at`
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

### KnowledgeBase

- `id`, `name`, `description`, `embedding_model_id` (FK → api_models), `agent_url`, `chunk_config` (JSONB: strategy, chunk_size, chunk_overlap), `faq_prompt` (optional default for FAQ generation), `created_at`, `updated_at`
- Groups documents, FAQs, and chunks for RAG Q&A

### KBDocument

- `id`, `knowledge_base_id` (FK → knowledge_bases), `document_id` (FK → documents), `created_at`
- Join table with unique constraint on (knowledge_base_id, document_id)

### FAQ

- `id`, `knowledge_base_id` (FK → knowledge_bases), `document_id` (FK → documents, nullable), `question`, `answer`, `embedding` (pgvector), `created_at`, `updated_at`
- Q&A pairs; embedding on question for semantic search

### Chunk

- `id`, `knowledge_base_id` (FK → knowledge_bases), `document_id` (FK → documents), `content`, `chunk_index`, `token_count`, `embedding` (pgvector), `chunk_metadata` (JSONB), `created_at`
- Document segments with vector embeddings for semantic search

### Glossary

- `id`, `name`, `description`, `created_at`, `updated_at`
- Container for domain terms and synonyms

### GlossaryTerm

- `id`, `glossary_id` (FK → glossaries, CASCADE), `primary_en`, `primary_cn`, `definition` (text), `synonyms_en` (JSONB array), `synonyms_cn` (JSONB array), `created_at`, `updated_at`
- Bilingual term with definition and synonyms; at least one of primary_en or primary_cn required

### Jobs (procrastinate_jobs)

- Managed by procrastinate; stores task_name, args (document_id, pipeline_id, knowledge_base_id, etc.), status, attempts, timestamps
