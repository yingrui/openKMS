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
- Articles & Knowledge Bases: UI placeholders with feature toggles
- Console: settings, users, feature toggles (database-backed); admin-only (realm role `admin`)

## Short-Term (Next Steps)

### 0. openkms-cli (document parsing CLI)

- [x] Create `openkms-cli/` folder with Typer CLI (typer>=0.9.0)
- [x] Use PaddleOCR-VL for parsing (optional `pip install openkms-cli[parse]`)
- [x] CLI commands: `openkms-cli parse run <input> [--output <path>] [--config <path>]`
- [x] Configurable via CLI args, env vars, config file (VLM URL, model, concurrency)
- [x] Design for backend integration: subprocess-invokable
- [x] Pipeline CLI: `openkms-cli pipeline run --input s3://.../original.pdf` (optional --s3-prefix, --skip-upload; local input supported)
- [x] Backend async job spawns CLI for document parsing (offload from API process) – via procrastinate
- [x] Pipeline metadata extraction: when channel has extraction_model_id and extraction_schema, worker passes --extract-metadata --extraction-model-name; CLI fetches config from backend config-by-name, extracts via pydantic-ai, PUTs metadata to backend

### 1. Document List Integration

- [x] Replace `mockDocumentsByChannel` with backend API
- [x] Add `GET /api/documents?channel_id=...` (filter by channel + descendants)
- [x] Wire DocumentChannel page to real document list

### 2. Channel Description Editing

- [ ] Add description field to channel create/edit UI
- [ ] Backend: `PUT /api/channels/documents/:id` for update (name, description)

### 3. Document Operations

- [ ] Move document between channels
- [x] Delete document
- [x] Document metadata extraction: LLM extracts abstract, author, publish_date, tags, etc.; configurable schema per channel in settings; Extract button on detail page
- [ ] Search/filter in channel

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
- [x] Model detail page with playground (test endpoint proxied through backend)
- [x] Playground adapts per model category: form-based (VL with image upload), embedding (text input → vector output), chat (LLM/other)
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

- [ ] Chunk documents, store embeddings
- [ ] Vector store (e.g. pgvector)
- [ ] Q&A API and UI

### 8. Articles Backend

- [ ] Article model and API
- [ ] Article channels (separate from document channels)
- [ ] Rich text / Markdown editor

## Long-Term

- Multi-tenancy
- Audit logging
- Export/import
- Plugin/extensibility
- Mobile/responsive polish

## Conventions

- **Before commit**: Update `docs/architecture.md`, `docs/development_plan.md`, `docs/functionalities.md` to reflect changes. See `.cursor/rules/docs-before-commit.mdc`.

## Open Questions

1. **All documents view** – Show documents from all channels when no channel selected?
2. **Article channels** – Same tree model as documents or different?
3. **Default channel** – Auto-select first channel or require explicit selection?
