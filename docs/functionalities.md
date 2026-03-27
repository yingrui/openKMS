# openKMS Functionalities

## Implemented Features

### 0. Infrastructure & Quality

| Feature | Status | Description |
|---------|--------|-------------|
| Docker Compose | ✅ | Postgres, MinIO for local dev; `docker compose up -d` |
| Makefile | ✅ | install, migrate, run-backend, run-frontend, run-worker, test |
| Backend tests | ✅ | pytest, pytest-asyncio; smoke tests (health, openapi) |
| Frontend tests | ✅ | Vitest, @testing-library/react; smoke test (App) |
| Error boundary | ✅ | React ErrorBoundary around routes; fallback with retry |
| Route code splitting | ✅ | React.lazy for heavy routes (ObjectExplorer, Models, Pipelines, etc.) |
| Typecheck | ✅ | `npm run typecheck` (tsc --noEmit) |

### 1. Documents

| Feature | Status | Description |
|---------|--------|-------------|
| Document overview | ✅ | Dashboard at `/documents` with channel count, document count (from API stats), quick actions |
| Channel management | ✅ | Create channels at `/documents/channels` (tree structure); rename, description, move, merge, delete; settings per channel |
| Document channel view | ✅ | Browse documents by channel at `/documents/channels/:channelId`; list from `GET /api/documents?channel_id=` |
| Channel settings | ✅ | Per-channel pipeline, auto-process, metadata extraction (model + schema, supports object_type/list[object_type]), manual labels config at `/documents/channels/:channelId/settings`; tabbed UI (General, Processing, Metadata extraction, Manual Labels) |
| Document upload | ✅ | Upload to channel via modal (choose files, drag-and-drop); POST `/api/documents/upload` with `channel_id`; stores file to S3 (no parsing at upload); status=uploaded |
| Document processing | ✅ | Process button on document list/detail; creates a job via `POST /api/jobs`; auto-process if channel configured |
| Document status | ✅ | Status badge (uploaded/pending/running/completed/failed) on document list and detail |
| Document detail | ✅ | View parsed Markdown at `/documents/view/:id`; **Document Information**: 3-column stats (Type, Size, Uploaded | Status, Markdown, File hash | Version panel with Versions + conditional Save version when working copy changed since last snapshot); right panel: Markdown \| Page Index (refresh parses markdown to tree); explicit versions (`document_versions`) not created on routine save; scrollable layout (min-height 720px) |
| Document markdown edit | ✅ | Edit/View toggle, textarea for markdown, Save (`PUT /markdown`; rebuilds page index), Restore from S3 (`POST /restore-markdown`; rebuilds page index); `POST /rebuild-page-index` for manual rebuild from current markdown |
| Document versions | ✅ | User-triggered checkpoints: `POST /documents/{id}/versions` snapshots current markdown and metadata (optional `tag` in API); list, preview, restore (`POST .../versions/{vid}/restore`); optional save-current before restore; Save as version modal (optional tag) |
| Document metadata extraction | ✅ | Single METADATA section on detail page; Extract button uses channel's LLM; configurable schema per channel (key, label, type: text/date/enum/object_type/list[object_type], description); object_type_extraction_max_instances limits instance count for extraction |
| Document info & metadata edit | ✅ | Edit document name and channel (PUT /api/documents/{id}); Edit metadata fields inline (PUT /metadata); Move document to channel via modal |
| Document metadata (unified) | ✅ | All metadata (extracted + manual) in single `metadata` JSONB; manual labels configure in channel settings Manual Labels tab (type: object_type or list[object_type]); object-instance pickers in METADATA section |
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
- Uses PaddleOCR-VL for parsing (optional: `pip install openkms-cli[parse]`); pipeline needs `pip install openkms-cli[pipeline]`; extraction needs `pip install openkms-cli[metadata]`; PageIndex tree built-in (md_to_tree uses # headings)
- Output structure matches backend: `{file_hash}/original.{ext}`, `result.json`, `markdown.md`, `page_index.json` (when pageindex installed), `layout_det_*`, `block_*`, `markdown_out/*`
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
| KB documents | ✅ | Add/remove documents to KB (join table); link existing documents without copying; Add Documents dialog: left sidebar channel tree, right documents list with search and pagination |
| FAQs | ✅ | Manual create/edit/delete FAQ pairs; LLM-based FAQ generation from documents; FAQ list shows source document; paginated list (offset, limit); Edit FAQ modal with key-value form for document metadata (from KB metadata_keys; channel label_config/extraction_schema for object_type/list[object_type]) |
| FAQ generation | ✅ | Two-step: `POST /faqs/generate` returns preview; user reviews, removes unqualified; `POST /faqs/batch` saves selected; configurable prompt in KB settings and modal; when multiple documents selected, generates one-by-one with progress in dialog |
| Chunks | ✅ | Document chunks stored with pgvector embeddings; configurable chunking strategy (fixed_size, markdown_header, paragraph); paginated list (offset, limit); Edit Chunk modal with content and document metadata (same key-value form as FAQ) |
| Semantic search | ✅ | `POST /api/knowledge-bases/{id}/search` using pgvector cosine distance over chunks and FAQs; search_type (all/chunks/faqs) to choose scope; supports metadata_filters for hybrid search; Search tab has All/Chunks/FAQs tabs and collapsible Filters when KB has metadata_keys configured; comma-separated for multiple values; returns 503 with install instructions if pgvector missing |
| QA proxy | ✅ | `POST /api/knowledge-bases/{id}/ask` proxies to configurable agent service URL |
| KB settings | ✅ | Agent URL, embedding model selection, chunk strategy/size/overlap, FAQ generation prompt, metadata_keys (keys to propagate from documents to FAQs/chunks) |
| KB indexing (CLI) | ✅ | `openkms-cli pipeline run --pipeline-name kb-index` – chunk documents, generate embeddings, bulk insert to pgvector |
| KB indexing (job) | ✅ | `run_kb_index` procrastinate task for background indexing |
| QA Agent service | ✅ | Separate FastAPI + LangGraph project (`qa-agent/`); RAG via backend search API; LangGraph skills: ontology (get schema, run Cypher), page_index (read TOC, select section, extract content, determine sufficient, generate answer) |
| Q&A tab | ✅ | Chat-like interface in KB detail page for asking questions; hidden when agent URL is not configured |

- Toggle visibility via Console → Feature Toggles

### 4a. Evaluation (Feature Toggle, Experimental)

| Feature | Status | Description |
|---------|--------|-------------|
| Evaluation dataset CRUD | ✅ | Create/edit/delete datasets; each linked to one knowledge base |
| Evaluation items | ✅ | Add/edit/delete items: query + expected answer pairs; optional topic column; list API paginated (`offset`/`limit`, default limit 10); dataset detail UI: per-page size (10/25/50/100), prev/next, range label |
| CSV import | ✅ | Import Data button uploads CSV (columns: topic, query, answer or expected_answer) |
| Run evaluation | ✅ | `POST /api/evaluation-datasets/{id}/run` body `{ evaluation_type }`: **`search_retrieval`** (default) — hybrid search + LLM judge on snippets; **`qa_answer`** — KB QA agent `/ask` per item + LLM judge on generated answer vs expected; persists **`evaluation_runs`** + **`evaluation_run_items`** (JSONB `detail`); response includes `run_id`, aggregates |
| Run history & compare | ✅ | `GET .../runs`, `GET .../runs/{run_id}`, `DELETE .../runs/{run_id}`, `GET .../runs/compare?run_a=&run_b=`; dataset detail: type selector, history table, load/delete run, compare two runs (per-item pass/score deltas) |
| Sidebar | ✅ | "Evaluation" link when `evaluationDatasets` toggle enabled |
| Feature toggle | ✅ | `evaluationDatasets` (default: false); Console → Feature Toggles |

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

### 5. Objects & Links (Feature Toggle)

| Feature | Status | Description |
|---------|--------|-------------|
| Object types | ✅ | Schema for entity types (name, description, properties JSONB, optional dataset_id, key_property, is_master_data, display_property); managed in Console → Object Types; Edit dialog: wider, property name/type read-only when editing, primary key radio selector; Master Data flag (only master data types usable for document labels); display_property for label picker display |
| Object instances | ✅ | Instances of object types with property values; CRUD at `/objects/:typeId` (admin write) |
| Link types | ✅ | Schema for relationships between two object types; managed in Console → Link Types |
| Link instances | ✅ | Instances of link types (source → target); CRUD at `/links/:typeId` (admin write) |
| Objects list | ✅ | User-facing list at `/objects`; instances and instance_count from Neo4j when Neo4j data source exists |
| Links list | ✅ | User-facing list at `/links`; instances and link_count from Neo4j when Neo4j data source exists |
| Object Explorer | ✅ | Graph view at `/object-explorer`; runs Cypher on Neo4j, renders force-directed graph via react-force-graph-2d; checkbox selection for object/link types, directional arrows; layout modes (force, left-to-right, top-to-bottom, radial); zoom in/out/fit, fullscreen; style panel overlays canvas with Object/Link type color pickers |
| Ontology overview | ✅ | Single page at `/ontology` showing all object types and link types with links to detail pages |
| Ontology sidebar | ✅ | Clickable "Ontology" menu (links to `/ontology`); subnav Objects, Links, Object Explorer when on ontology pages; shown when Neo4j exists or objectsAndLinks toggle |
| Search | ✅ | Optional search filter on object instances |
| Feature toggle | ✅ | `objectsAndLinks` toggle; sidebar also shows Objects & Links when Neo4j data source exists (`hasNeo4jDataSource`) |
| Console counts | ✅ | Console Object Types and Link Types: instance_count and link_count from datasets (PostgreSQL) |

- Toggle visibility via Console → Feature Toggles

### 5b. Data Sources & Datasets (Console, Admin)

| Feature | Status | Description |
|---------|--------|-------------|
| Data Source CRUD | ✅ | PostgreSQL and Neo4j connection configs; Console → Data Sources |
| Credential encryption | ✅ | Username/password encrypted with Fernet before storage; key from OPENKMS_DATASOURCE_ENCRYPTION_KEY or derived from secret_key |
| Test connection | ✅ | `POST /api/data-sources/{id}/test` validates connectivity |
| Neo4j delete all | ✅ | `POST /api/data-sources/{id}/neo4j-delete-all` wipes all nodes and relationships; confirmation modal in Console |
| Dataset CRUD | ✅ | Map PostgreSQL tables (schema.table) from a data source; Console → Datasets |
| List tables from source | ✅ | `GET /api/datasets/from-source/{id}` returns tables for picker when creating dataset |
| Dataset detail | ✅ | Click dataset name → `/console/datasets/:id` with Data tab (rows, pagination) and Metadata tab (column info) |
| Dataset rows | ✅ | `GET /api/datasets/{id}/rows?limit=&offset=` fetches paginated rows from table |
| Dataset metadata | ✅ | `GET /api/datasets/{id}/metadata` returns column name, type, nullable, position from information_schema |
| Search datasets | ✅ | Client-side search by display name, schema.table, data source on list page |
| Object type–dataset link | ✅ | Object types can link to a dataset (dataset_id); instance_count shows dataset table row count |
| Link type cardinality | ✅ | Link types have cardinality (one-to-one, one-to-many, many-to-many) and optional dataset link for many-to-many |
| Link type FK mapping | ✅ | Source/Target key properties; junction table columns (source_dataset_column, target_dataset_column) for many-to-many |
| M:M junction table links | ✅ | When link type has dataset_id, links and link_count come from junction table; Add/Delete disabled for dataset-backed links |
| M:1/1:M link count | ✅ | When source object type has dataset and source_key_property (FK column), link_count from rows where FK is not null |
| Index to Neo4j | ✅ | Object Types and Link Types: Index Objects/Links button when Neo4j data source exists; indexes datasets as nodes, link types as relationships |

### 6. Console (Admin)

- Overview, Data Sources, Datasets, Object Types, Link Types, System Settings, Users & Roles, Feature Toggles
- **Admin-only**: visible and accessible only to users with Keycloak realm role `admin`
- Feature toggles: `articles`, `knowledgeBases`, `objectsAndLinks` – persisted in PostgreSQL (`feature_toggles` table), shared across all users/devices
- `GET /api/feature-toggles` (authenticated) returns current toggle state
- `PUT /api/feature-toggles` (admin-only) updates toggle state; backend `require_admin` checks JWT realm role

### 6b. Authentication

- Keycloak login/logout (SSO, full logout via Keycloak)
- Protected routes: all except home require auth; unauthenticated users see "Authentication Required" message

### 6c. Home (Landing Page)

- Public landing page for non-authorized users
- Pain points: knowledge scattered, unstructured content, manual work
- Benefits: centralized hub, RAG-ready knowledge bases, enterprise security
- Functionalities: document management, articles, knowledge bases, pipelines

### 7. Pipelines

| Feature | Status | Description |
|---------|--------|-------------|
| Pipeline management | ✅ | CRUD via `/api/pipelines`; Pipelines.tsx with create/edit/delete |
| Command templates | ✅ | Pipeline `command` field supports `{variable}` placeholders (e.g. `{input}`, `{s3_prefix}`) resolved at runtime |
| Template variables API | ✅ | `GET /api/pipelines/template-variables` returns available placeholders with descriptions |
| Channel-pipeline link | ✅ | Each channel can have a pipeline_id and auto_process flag |
| Default pipeline | ✅ | "PaddleOCR Document Parse" seeded in migration with command template |

### 8. Jobs (procrastinate)

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

### 9. Models (Provider–Model Hierarchy)

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
| GET | `/api/document-channels/{id}` | Get channel by ID (includes label_config, extraction_schema) |
| POST | `/api/document-channels` | Create channel |
| PUT | `/api/document-channels/{id}` | Update channel (name, description, parent_id, pipeline_id, auto_process, extraction_model_id, extraction_schema, label_config, object_type_extraction_max_instances) |
| POST | `/api/document-channels/{id}/reorder` | Move channel up or down among siblings (body: `{ direction: "up" \| "down" }`) |
| POST | `/api/document-channels/merge` | Merge source channel into target (move documents, delete source; optional include_descendants) |
| DELETE | `/api/document-channels/{id}` | Delete channel (fails if has documents or sub-channels) |
| POST | `/api/documents/upload` | Upload document (store only, no parsing); auto-process if channel configured |
| GET | `/api/documents?channel_id=&search=&offset=&limit=` | List documents; channel_id optional (all if omitted); search filters by name; offset/limit for pagination |
| GET | `/api/documents/stats` | Get document counts (e.g. total) for index page |
| GET | `/api/documents/{id}` | Get document by ID |
| PUT | `/api/documents/{id}` | Update document info (name, channel_id) |
| GET | `/api/documents/{id}/parsing` | Get parsing result (result.json) |
| GET | `/api/documents/{id}/files/{file_hash}/{path}` | Redirect to presigned S3 URL via frontend proxy |
| DELETE | `/api/documents/{id}` | Delete document and its storage files |
| POST | `/api/documents/{id}/reset-status` | Reset document status to uploaded (if no active jobs) |
| PUT | `/api/documents/{id}/metadata` | Update document metadata (partial merge) |
| PUT | `/api/documents/{id}/markdown` | Update document markdown and rebuild page index in S3 |
| POST | `/api/documents/{id}/restore-markdown` | Restore markdown from S3 `{file_hash}/markdown.md` and rebuild page index |
| POST | `/api/documents/{id}/rebuild-page-index` | Rebuild page index from current markdown (DB or S3) and store in S3 |
| GET | `/api/documents/{id}/page-index` | Get PageIndex tree structure (built during pipeline or after markdown edit, served from S3) |
| GET | `/api/documents/{id}/section` | Get markdown section by line range (start_line, end_line; 1-based inclusive; for QA agent Page Index skill) |
| POST | `/api/documents/{id}/versions` | Create explicit version (snapshot of current markdown + metadata; body: optional `tag` / `note`) |
| GET | `/api/documents/{id}/versions` | List document versions (metadata only; no full markdown in list) |
| GET | `/api/documents/{id}/versions/{version_id}` | Get full version snapshot (markdown + metadata) |
| POST | `/api/documents/{id}/versions/{version_id}/restore` | Restore working copy from version (body: optional save_current_as_version, tag, note); rebuilds page index |
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
| PUT | `/api/knowledge-bases/{id}` | Update KB (name, description, agent_url, chunk_config, embedding_model_id, faq_prompt, metadata_keys) |
| DELETE | `/api/knowledge-bases/{id}` | Delete KB (cascades documents, FAQs, chunks) |
| GET | `/api/knowledge-bases/{id}/documents` | List documents in KB |
| POST | `/api/knowledge-bases/{id}/documents` | Add document to KB |
| DELETE | `/api/knowledge-bases/{id}/documents/{doc_id}` | Remove document from KB |
| GET | `/api/knowledge-bases/{id}/faqs` | List FAQs (paginated; ?offset=, ?limit=) |
| POST | `/api/knowledge-bases/{id}/faqs` | Create FAQ |
| PUT | `/api/knowledge-bases/{id}/faqs/{faq_id}` | Update FAQ |
| DELETE | `/api/knowledge-bases/{id}/faqs/{faq_id}` | Delete FAQ |
| POST | `/api/knowledge-bases/{id}/faqs/generate` | Generate FAQ preview from documents via LLM (no DB save) |
| POST | `/api/knowledge-bases/{id}/faqs/batch` | Save selected FAQ pairs to KB |
| GET | `/api/knowledge-bases/{id}/chunks` | List chunks (paginated; ?offset=, ?limit=) |
| PUT | `/api/knowledge-bases/{id}/chunks/{chunk_id}` | Update chunk (content, doc_metadata) |
| DELETE | `/api/knowledge-bases/{id}/chunks` | Delete all chunks |
| POST | `/api/knowledge-bases/{id}/chunks/batch` | Bulk create chunks with embeddings (kb-index pipeline) |
| PUT | `/api/knowledge-bases/{id}/faqs/batch-embeddings` | Bulk update FAQ embeddings (kb-index pipeline) |
| POST | `/api/knowledge-bases/{id}/search` | Semantic search over chunks and FAQs |
| POST | `/api/knowledge-bases/{id}/ask` | Proxy question to QA agent service |
| GET | `/api/evaluation-datasets` | List evaluation datasets (optional ?knowledge_base_id=) |
| POST | `/api/evaluation-datasets` | Create evaluation dataset |
| GET | `/api/evaluation-datasets/{id}` | Get evaluation dataset |
| PUT | `/api/evaluation-datasets/{id}` | Update evaluation dataset |
| DELETE | `/api/evaluation-datasets/{id}` | Delete evaluation dataset |
| GET | `/api/evaluation-datasets/{id}/items` | List evaluation items (`offset`, `limit` default 10 max 200; response `{ items, total }`) |
| POST | `/api/evaluation-datasets/{id}/items` | Add evaluation item |
| POST | `/api/evaluation-datasets/{id}/items/import` | Import items from CSV (multipart file; columns: topic, query, answer or expected_answer) |
| PUT | `/api/evaluation-datasets/{id}/items/{item_id}` | Update evaluation item |
| DELETE | `/api/evaluation-datasets/{id}/items/{item_id}` | Delete evaluation item |
| POST | `/api/evaluation-datasets/{id}/run` | Run evaluation; body `{ evaluation_type?: "search_retrieval" \| "qa_answer" }`; persists run + per-item results |
| GET | `/api/evaluation-datasets/{id}/runs` | List saved runs (`offset`, `limit`) |
| GET | `/api/evaluation-datasets/{id}/runs/{run_id}` | Full run with item results |
| DELETE | `/api/evaluation-datasets/{id}/runs/{run_id}` | Remove a saved run (cascades `evaluation_run_items`) |
| GET | `/api/evaluation-datasets/{id}/runs/compare` | Compare two runs (`run_a`, `run_b` query params) |
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
| GET | `/api/object-types` | List object types (authenticated); ?count_from_neo4j=true for instance_count from Neo4j |
| POST | `/api/object-types` | Create object type (admin-only) |
| GET | `/api/object-types/{id}` | Get object type; ?count_from_neo4j=true for instance_count from Neo4j |
| PUT | `/api/object-types/{id}` | Update object type (admin-only) |
| DELETE | `/api/object-types/{id}` | Delete object type (admin-only) |
| GET | `/api/object-types/{id}/objects` | List object instances (from Neo4j when available; optional ?search=, ?limit=, ?offset=) |
| POST | `/api/object-types/{id}/objects` | Create object instance (admin-only) |
| GET | `/api/object-types/{id}/objects/{obj_id}` | Get object instance |
| PUT | `/api/object-types/{id}/objects/{obj_id}` | Update object instance (admin-only) |
| DELETE | `/api/object-types/{id}/objects/{obj_id}` | Delete object instance (admin-only) |
| POST | `/api/object-types/index-to-neo4j` | Index object type datasets to Neo4j as nodes (admin-only; body: neo4j_data_source_id) |
| GET | `/api/link-types` | List link types (authenticated); ?count_from_neo4j=true for link_count from Neo4j |
| POST | `/api/link-types` | Create link type (admin-only) |
| GET | `/api/link-types/{id}` | Get link type; ?count_from_neo4j=true for link_count from Neo4j |
| PUT | `/api/link-types/{id}` | Update link type (admin-only) |
| DELETE | `/api/link-types/{id}` | Delete link type (admin-only) |
| GET | `/api/link-types/{id}/links` | List link instances (from Neo4j when available; ?limit=, ?offset=) |
| POST | `/api/link-types/{id}/links` | Create link instance (admin-only; rejected when link type uses junction dataset) |
| DELETE | `/api/link-types/{id}/links/{link_id}` | Delete link instance (admin-only; rejected when link type uses junction dataset) |
| POST | `/api/link-types/index-to-neo4j` | Index link types (M:M junction + M:1/1:M from source dataset) to Neo4j as relationships (admin-only) |
| POST | `/api/ontology/explore` | Execute read-only Cypher query against Neo4j (body: `{ cypher }`); used by Object Explorer |
| GET | `/api/data-sources` | List data sources (admin-only) |
| POST | `/api/data-sources` | Create data source (admin-only) |
| GET | `/api/data-sources/{id}` | Get data source (admin-only) |
| PUT | `/api/data-sources/{id}` | Update data source (admin-only) |
| DELETE | `/api/data-sources/{id}` | Delete data source (admin-only) |
| POST | `/api/data-sources/{id}/test` | Test connection (admin-only) |
| POST | `/api/data-sources/{id}/neo4j-delete-all` | Delete all nodes and relationships in Neo4j (admin-only, Neo4j only) |
| GET | `/api/datasets` | List datasets (admin-only, optional ?data_source_id=) |
| GET | `/api/datasets/from-source/{id}` | List tables from PostgreSQL data source (admin-only) |
| POST | `/api/datasets` | Create dataset (admin-only) |
| GET | `/api/datasets/{id}` | Get dataset (admin-only) |
| GET | `/api/datasets/{id}/rows` | Get paginated rows from dataset table (admin-only; ?limit=, ?offset=) |
| GET | `/api/datasets/{id}/metadata` | Get column metadata from information_schema (admin-only) |
| PUT | `/api/datasets/{id}` | Update dataset (admin-only) |
| DELETE | `/api/datasets/{id}` | Delete dataset (admin-only) |
| GET | `/api/feature-toggles` | Get feature toggle state (includes hasNeo4jDataSource; authenticated) |
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

- `id`, `name`, `description`, `parent_id`, `sort_order`, `pipeline_id` (FK → pipelines), `auto_process`, `extraction_model_id` (FK → api_models), `extraction_schema` (json), `label_config` (json: array of `{key, object_type_id, display_label?, type: "object_type"|"list[object_type]"}`), `object_type_extraction_max_instances` (int, nullable, default 100), `created_at`
- Tree structure: parent → children
- When `auto_process=true`, uploads to this channel automatically defer a processing job
- Metadata extraction: pydantic-ai Agent + StructuredDict; `extraction_model_id` designates LLM; `extraction_schema` stored as PostgreSQL `json` (not jsonb) to preserve key order; JSON Schema dict (type, properties, required)

### Document

- `id`, `name`, `file_type`, `size_bytes`, `channel_id`, `file_hash`, `status`, `markdown`, `parsing_result`, `metadata` (JSONB: extracted + manual labels, unified), `created_at`, `updated_at`
- Status: `uploaded` → `pending` → `running` → `completed` / `failed`
- `metadata`: extracted or manually edited (abstract, author, publish_date, tags, etc.)

### FeatureToggle

- `key` (PK, string), `enabled` (boolean), `updated_at`
- Stores feature flags shared across all users; seeded with `articles`, `knowledgeBases`, `objectsAndLinks` (enabled by default), `evaluationDatasets` (disabled by default, experimental)
- Read by all authenticated users; write restricted to admins

### KnowledgeBase

- `id`, `name`, `description`, `embedding_model_id` (FK → api_models), `agent_url`, `chunk_config` (JSONB: strategy, chunk_size, chunk_overlap), `faq_prompt` (optional default for FAQ generation), `metadata_keys` (JSONB array: keys from document metadata to propagate to FAQs/chunks), `created_at`, `updated_at`
- Groups documents, FAQs, and chunks for RAG Q&A

### KBDocument

- `id`, `knowledge_base_id` (FK → knowledge_bases), `document_id` (FK → documents), `created_at`
- Join table with unique constraint on (knowledge_base_id, document_id)

### FAQ

- `id`, `knowledge_base_id` (FK → knowledge_bases), `document_id` (FK → documents, nullable), `question`, `answer`, `embedding` (pgvector), `doc_metadata` (JSONB), `created_at`, `updated_at`
- Q&A pairs; embedding on question for semantic search; doc_metadata inherited from source document when metadata_keys is configured

### Chunk

- `id`, `knowledge_base_id` (FK → knowledge_bases), `document_id` (FK → documents), `content`, `chunk_index`, `token_count`, `embedding` (pgvector), `chunk_metadata` (JSONB: strategy, char_start, etc.), `doc_metadata` (JSONB), `created_at`
- Document segments with vector embeddings for semantic search; doc_metadata inherited from source document per metadata_keys; supports hybrid search (vector + metadata filters)

### EvaluationDataset

- `id`, `name`, `knowledge_base_id` (FK → knowledge_bases), `description`, `created_at`, `updated_at`
- Container for query + expected answer pairs to evaluate KB QA performance

### EvaluationDatasetItem

- `id`, `evaluation_dataset_id` (FK → evaluation_datasets, CASCADE), `query`, `expected_answer`, `topic` (optional), `sort_order`, `created_at`
- Single evaluation item: question to ask and expected answer; topic for categorization

### EvaluationRun

- `id`, `evaluation_dataset_id` (FK → evaluation_datasets, CASCADE), `knowledge_base_id`, `evaluation_type` (`search_retrieval` \| `qa_answer`), `status`, `error_message`, `item_count`, `pass_count`, `avg_score`, `config_snapshot` (JSONB), `created_at`, `finished_at`
- One persisted evaluation execution (report); config snapshot records judge model and search params used

### EvaluationRunItem

- `id`, `evaluation_run_id` (FK → evaluation_runs, CASCADE), `evaluation_dataset_item_id` (FK → evaluation_dataset_items, CASCADE), `passed`, `score`, `reasoning`, `detail` (JSONB: search snippets or QA answer + sources)
- Per-item outcome for a run

### Glossary

- `id`, `name`, `description`, `created_at`, `updated_at`
- Container for domain terms and synonyms

### GlossaryTerm

- `id`, `glossary_id` (FK → glossaries, CASCADE), `primary_en`, `primary_cn`, `definition` (text), `synonyms_en` (JSONB array), `synonyms_cn` (JSONB array), `created_at`, `updated_at`
- Bilingual term with definition and synonyms; at least one of primary_en or primary_cn required

### ObjectType

- `id`, `name`, `description`, `dataset_id`, `key_property`, `is_master_data`, `display_property`, `properties` (JSONB: list of `{name, type, required}`), `created_at`, `updated_at`
- Schema for entity types; property types: string, number, boolean
- `is_master_data`: only master data types can be used for document labels in channel settings
- `display_property`: property used to display object instances in document label pickers

### ObjectInstance

- `id`, `object_type_id` (FK), `data` (JSONB: property values), `created_at`, `updated_at`
- Instance of an object type

### LinkType

- `id`, `name`, `description`, `source_object_type_id` (FK), `target_object_type_id` (FK), `cardinality` (one-to-one | one-to-many | many-to-many), `dataset_id` (FK → datasets, nullable, for many-to-many), `source_key_property`, `target_key_property`, `source_dataset_column`, `target_dataset_column` (nullable, junction table columns for M:M), `created_at`, `updated_at`
- Schema for relationships between two object types; when many-to-many with dataset_id, links and link_count come from junction table

### LinkInstance

- `id`, `link_type_id` (FK), `source_object_id` (FK), `target_object_id` (FK), `created_at`, `updated_at`
- Instance of a link type connecting two object instances

### DataSource

- `id`, `name`, `kind` (postgresql | neo4j), `host`, `port`, `database`, `username_encrypted`, `password_encrypted`, `options` (JSONB), `created_at`, `updated_at`
- Connection config; credentials encrypted with Fernet

### Dataset

- `id`, `data_source_id` (FK), `schema_name`, `table_name`, `display_name`, `created_at`, `updated_at`
- PostgreSQL table reference; can be mapped to ObjectType/LinkType in future

### Jobs (procrastinate_jobs)

- Managed by procrastinate; stores task_name, args (document_id, pipeline_id, knowledge_base_id, etc.), status, attempts, timestamps
