# openKMS Development Plan

## Current State (as of latest commit)

- Document channels: CRUD, tree, description
- Document upload + parsing via PaddleOCR-VL; store in S3/MinIO under `{file_hash}/`
- Document detail view with Markdown, layout images, block images; loads files via backend proxy
- Document list by channel: `GET /api/documents?channel_id=`
- Delete document: `DELETE /api/documents/{id}`
- Documents overview, channel management, channel settings
- OAuth2 Keycloak: backend verifies JWT Bearer or session; frontend sends Bearer token, sync-session for img
- Articles & Knowledge Bases: UI placeholders with feature toggles
- Console: settings, users, feature toggles

## Short-Term (Next Steps)

### 0. document_parsing CLI

- [ ] Create `document_parsing/` folder with Typer CLI (typer>=0.9.0)
- [ ] Use PaddleOCR-VL for parsing (same logic as backend)
- [ ] CLI commands: `parse <input_path> [--output <path>] [--config <path>]`
- [ ] Configurable via CLI args / config file (VLM URL, model, concurrency)
- [ ] Design as pipeline step: pipeline config references this CLI
- [ ] Backend async job spawns CLI for document parsing (offload from API process)

### 1. Document List Integration

- [x] Replace `mockDocumentsByChannel` with backend API
- [x] Add `GET /api/documents?channel_id=...` (filter by channel + descendants)
- [x] Wire DocumentChannel page to real document list

### 2. Channel Description Editing

- [ ] Add description field to channel create/edit UI
- [ ] Backend: `PATCH /api/channels/documents/:id` for update (name, description)

### 3. Document Operations

- [ ] Move document between channels
- [x] Delete document
- [ ] Search/filter in channel

### 4. Authentication

- [x] Integrate Keycloak with frontend (login/logout)
- [x] Protect backend routes with JWT Bearer or session
- [ ] Role-based access (admin vs user)

## Medium-Term

### 5. Pipelines

- [ ] Pipeline CRUD and configuration
- [ ] Register `document_parsing` CLI as a pipeline step (command, args, env)
- [ ] Link pipelines to channels (DocumentChannelSettings)
- [ ] Run extraction pipeline on upload (sync or async via job)

### 6. Jobs

- [ ] Background job queue (e.g. Celery, ARQ)
- [ ] Create async job type: "parse_document" → invokes `document_parsing parse ...`
- [ ] Job status and logs
- [ ] Retry/failure handling

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
