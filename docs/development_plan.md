# openKMS Development Plan

## Current State (as of latest commit)

- Document channels: CRUD, tree, description
- Document upload + parsing via PaddleOCR-VL; store in S3/MinIO under `{file_hash}/`
- Document detail view with Markdown, layout images, block images; loads files via backend proxy
- Document list by channel: `GET /api/documents?channel_id=`
- Delete document: `DELETE /api/documents/{id}`
- Document info & metadata: Edit name (`PUT /api/documents/{id}`), edit metadata (`PUT /metadata`), Extract via pydantic-ai Agent + StructuredDict
- Document markdown: Edit and save (`PUT /markdown`), restore from S3 (`POST /restore-markdown`)
- Documents overview, channel management, channel settings
- OAuth2 Keycloak: backend verifies JWT Bearer or session; frontend sends Bearer token, sync-session for img; Vite proxy for API in dev
- Route protection: home public; other pages show "Authentication Required" when not logged in
- Articles: UI placeholder with feature toggle
- Knowledge Bases: Full CRUD, documents, FAQs (manual + LLM-generated), chunks (pgvector), semantic search, Q&A proxy, settings; openkms-cli pipeline run --pipeline-name kb-index; QA Agent service (FastAPI + LangGraph)
- Console: settings, users, feature toggles (database-backed, includes objectsAndLinks), object types, link types, data sources, datasets; admin-only (realm role `admin`)
- Glossaries: CRUD glossaries, terms with bilingual (EN/CN) support, definition, synonyms, AI suggestion (translation + definition + synonyms), search (EN, CN, definition, synonyms), export/import; dev.sh ensures pgvector on start
- Objects & Links: ontology layer (object types, link types, instances); schema in Console; user-facing browse at /objects, /links; feature toggle objectsAndLinks
- Data Sources & Datasets: Console → Data Sources (PostgreSQL/Neo4j connections, encrypted creds), Datasets (map PG tables); future: link datasets to Object Types / Link Types

## Short-Term (Next Steps)

### 0. openkms-cli (document parsing CLI)

- [x] Create `openkms-cli/` folder with Typer CLI (typer>=0.9.0)
- [x] Use PaddleOCR-VL for parsing (optional `pip install openkms-cli[parse]`)
- [x] CLI commands: `openkms-cli parse run <input> [--output <path>] [--config <path>]`
- [x] Configurable via CLI args, env vars, config file (VLM URL, model, concurrency)
- [x] Design for backend integration: subprocess-invokable
- [x] Pipeline CLI: `openkms-cli pipeline list` (list supported pipelines), `openkms-cli pipeline run --input s3://.../original.pdf` (optional --s3-prefix, --skip-upload; local input supported)
- [x] Backend async job spawns CLI for document parsing (offload from API process) – via procrastinate
- [x] Pipeline metadata extraction: when channel has extraction_model_id and extraction_schema, worker passes --extract-metadata --extraction-model-name; CLI fetches config from backend config-by-name, extracts via pydantic-ai, PUTs metadata to backend

### 1. Document List Integration

- [x] Replace `mockDocumentsByChannel` with backend API
- [x] Add `GET /api/documents?channel_id=...` (filter by channel + descendants)
- [x] Wire DocumentChannel page to real document list

### 2. Channel Management (Rename, Move, Merge, Delete)

- [x] **Rename channel**: Name field in channel settings; backend `PUT` supports `name`
- [x] **Edit description**: Description in channel create form and settings; backend supports it
- [x] **Move channel**: `parent_id` in `ChannelUpdate`; Move button in manage UI with parent dropdown
- [x] **Delete channel**: `DELETE /api/document-channels/{id}`; blocks if has documents or sub-channels; confirm UI
- [x] **Merge channels**: `POST /api/document-channels/merge`; move docs to target, delete source; optional include_descendants

### 3. Document Operations

- [x] Move document between channels (`PUT /api/documents/{id}` with `channel_id`; Move modal in document list)
- [x] Delete document
- [x] Document metadata extraction: LLM extracts abstract, author, publish_date, tags, etc.; configurable schema per channel in settings; Extract button on detail page
- [x] Search in document list (`GET /api/documents?search=...`; optional when no channel)
- [ ] Advanced filter in channel

### 4a. Objects & Links (Ontology)

- [x] Object types: schema with name, description, properties (string/number/boolean)
- [x] Object instances: CRUD under `/api/object-types/{id}/objects` (admin write)
- [x] Link types: schema with source/target object types
- [x] Link instances: CRUD under `/api/link-types/{id}/links` (admin write)
- [x] Console Object Types page: CRUD object types and properties
- [x] Console Link Types page: CRUD link types
- [x] User-facing Objects list (`/objects`), Object type detail with instances (`/objects/:typeId`)
- [x] User-facing Links list (`/links`), Link type detail with instances (`/links/:typeId`)
- [x] Search filter on object instances
- [x] Feature toggle `objectsAndLinks` (gates sidebar and routes)

### 4b. Data Sources & Datasets (Console)

- [x] Data sources: CRUD for PostgreSQL and Neo4j connections; credentials encrypted (Fernet)
- [x] Test connection: POST /api/data-sources/{id}/test
- [x] Datasets: CRUD for PostgreSQL tables (schema + table) linked to data sources
- [x] List tables: GET /api/datasets/from-source/{id} for table picker
- [x] Console Data Sources page: table, Add/Edit modal, Test button
- [x] Console Datasets page: table, Add/Edit with table picker, filter by data source, search
- [x] Dataset detail: click dataset → Data tab (rows with pagination, page size selector) and Metadata tab (column info)
- [x] Dataset rows/metadata API: GET /api/datasets/{id}/rows, GET /api/datasets/{id}/metadata
- [x] seed_mock_insurance_data.py: mock diseases, insurance products, relationships for demo datasets
- [x] Object types link to datasets (dataset_id); instance_count uses dataset row count when linked
- [x] Link types: cardinality (one-to-one, one-to-many, many-to-many) and optional dataset_id for many-to-many

### 4. Authentication

- [x] Integrate Keycloak with frontend (login/logout)
- [x] Protect backend routes with JWT Bearer or session
- [x] Role-based access: Console restricted to users with realm role `admin`
- [x] Feature toggles persisted in PostgreSQL (`feature_toggles` table); `GET/PUT /api/feature-toggles` (PUT admin-only)
- [x] Backend `require_admin` dependency for admin-only endpoints (checks JWT `realm_access.roles`)
- [x] Backend dependency management via pyproject.toml + uv.lock (replaces requirements.txt)

## Medium-Term

### 5. Pipelines

- [x] Pipeline model (name, command, default_args) + CRUD API (`/api/pipelines`)
- [x] Link pipelines to channels (`pipeline_id`, `auto_process` on DocumentChannel)
- [x] DocumentChannelSettings fetches real pipelines from API
- [x] Pipelines.tsx: CRUD UI with real API
- [x] Model management: API provider registry (CRUD, linked to pipelines)
- [x] Provider–model hierarchy: manage service providers first, then add models under them
- [x] Model detail page with playground (test endpoint proxied through backend)
- [x] Playground adapts per model category: form-based (VL with image upload), embedding (text input → vector output), chat (LLM/other)
- [x] Model default in category: `is_default_in_category` on api_models; Models list Default column
- [ ] Additional pipeline types beyond PaddleOCR

### 6. Jobs (procrastinate)

- [x] procrastinate (PostgreSQL-based job queue) integration
- [x] Upload decoupled from parsing: stores file only, `status=uploaded`
- [x] Document status field: uploaded → pending → running → completed/failed
- [x] run_pipeline task: spawns `openkms-cli pipeline run` as subprocess; when channel has extraction config (model_name from ApiModel), renders extraction args into template and runs metadata extraction in CLI
- [x] Jobs API: list, detail, create, retry, delete (`/api/jobs`)
- [x] Jobs.tsx: real API, status filter, create job, retry, delete
- [x] JobDetail.tsx: full job detail page with timing, document link, pipeline info, rendered command, event log
- [x] Process button on document list and detail for uploaded/failed docs
- [x] Reset status button for pending/failed docs (resets to uploaded if no active jobs)
- [x] Pipeline command template system: `{variable}` placeholders resolved at runtime
- [x] Template variables API: `GET /api/pipelines/template-variables`
- [x] Sonner toast system for project-wide notifications
- [x] Worker entry point: `backend/worker.py`
- [x] Model-aware command template: `{vlm_url}`, `{model_name}` resolved from linked ApiModel
- [ ] Job logs/stdout capture
- [ ] Configurable concurrency for worker

### 7. Knowledge Bases (RAG)

- [x] Knowledge base CRUD API (`/api/knowledge-bases`)
- [x] Add/remove documents to/from knowledge base (join table `kb_documents`)
- [x] FAQ CRUD (manual create/edit/delete)
- [x] FAQ generation from documents via LLM (`POST /faqs/generate` returns preview; `POST /faqs/batch` saves selected; UI: review step with remove unqualified before save)
- [x] Chunk model with pgvector embeddings
- [x] pgvector extension enabled in database.py
- [x] Semantic search over chunks and FAQs (`POST /search`)
- [x] QA proxy to external agent service (`POST /ask`)
- [x] KB settings: agent URL, embedding model, chunking config, FAQ generation prompt
- [x] openkms-cli `pipeline run --pipeline-name kb-index`: chunk documents, generate embeddings, bulk insert to pgvector
- [x] `run_kb_index` procrastinate task for background indexing
- [x] Frontend: KnowledgeBaseList with real CRUD (create, edit, delete)
- [x] Frontend: KnowledgeBaseDetail with Documents, FAQs, Chunks, Search, Q&A, Settings tabs
- [x] QA Agent Service project (`qa-agent/`): FastAPI + LangGraph, retrieves via backend search API (no DB access)
- [x] Batch document selection for FAQ generation in the UI (modal with doc picker, review generated FAQs, remove unqualified, save)
- [ ] Re-index button triggers job via procrastinate (currently settings only saves config)

### 8. Articles Backend

- [ ] Article model and API
- [ ] Article channels (separate from document channels)
- [ ] Rich text / Markdown editor

## Long-Term

- Multi-tenancy
- Audit logging
- Glossary export/import (implemented); document export/import
- Plugin/extensibility
- Mobile/responsive polish

## Conventions

- **Before commit**: Update `docs/architecture.md`, `docs/development_plan.md`, `docs/functionalities.md` to reflect changes. See `.cursor/rules/docs-before-commit.mdc`.

## Open Questions

1. **All documents view** – Show documents from all channels when no channel selected?
2. **Article channels** – Same tree model as documents or different?
3. **Default channel** – Auto-select first channel or require explicit selection?
