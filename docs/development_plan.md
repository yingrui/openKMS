# openKMS Development Plan

## Current State (as of latest commit)

- Document channels: CRUD, tree, description
- Document upload + parsing via PaddleOCR-VL; store in S3/MinIO under `{file_hash}/`
- Document detail view with Markdown, layout images, block images; loads files via backend proxy
- Document list by channel: `GET /api/documents?channel_id=`
- Delete document: `DELETE /api/documents/{id}`
- Document info & metadata: Edit name (`PUT /api/documents/{id}`), edit metadata (`PUT /metadata`), Extract via pydantic-ai Agent + StructuredDict
- Document markdown: Edit and save (`PUT /markdown`; rebuilds page index in S3), restore from S3 (`POST /restore-markdown`; rebuilds page index), optional `POST /rebuild-page-index` (also triggered from Page Index tab refresh); detail page shows Save/Cancel in panel header when editing (not View toggle); Page Index tab has refresh control (tooltip: parse markdown to tree)
- Document versions: `document_versions` table; explicit snapshots of markdown + metadata (`POST /versions`, `GET /versions`, `GET /versions/{id}`, `POST /versions/{id}/restore`); version checkpoint uses JSON field **`tag`** (DB column `tag`); UI: version column in Document Information (3-column stats), Save version when working copy newer than last snapshot, optional tag in Save as version modal, **Versions** modal as a table (Version / Tag / Saved / Actions); list/preview/restore with optional save-current-first; not created on routine markdown/metadata save
- **Document lifecycle & lineage**: `series_id`, `effective_from` / `effective_to`, `lifecycle_status` on documents; `document_relationships` (supersedes, amends, implements, see_also); `PATCH /lifecycle`, `GET/POST/DELETE /relationships`; document API `is_current_for_rag` (computed: **currently applicable** for normal KB answers/indexing); default KB semantic search and kb-index (`lifecycle_index_mode` default `current_only`) respect that unless opted out; document detail **Lineage & lifecycle** under the METADATA block, collapsed by default (expand loads relationships)
- Documents overview, channel management, channel settings (tabbed: General, Processing, Metadata extraction, Manual Labels)
- Document metadata (unified): extracted metadata and manual labels stored in single `metadata` JSONB; channel extraction_schema supports object_type and list[object_type]; label_config (Manual Labels tab) maps keys to Master Data object types with type (object_type | list[object_type]); single METADATA section on document detail
- Authentication: `OPENKMS_AUTH_MODE=oidc` (default, OIDC via issuer discovery + JWKS) or `local` (PostgreSQL users, `/api/auth/*`, CLI HTTP Basic); backend verifies JWT Bearer or session; `GET /api/auth/public-config` (no auth) exposes `auth_mode` and `allow_signup` only; `GET /internal-api/models/document-parse-defaults` (auth; optional `model_name`) supplies VLM `base_url`, `model_name`, and provider `api_key` for **openkms-cli**; SPA OIDC uses `oidc-client-ts` (`VITE_OIDC_ISSUER`); frontend resolves local vs OIDC from the API with `VITE_AUTH_MODE` as fallback; Vite proxy for `/api` and `/internal-api` in dev
- User profile: `/profile` shows current user from `GET /api/auth/me` (`is_admin`, `roles`, resolved `permissions`, header menu); Console → Users & Roles: `/api/admin/users` with `console:users`; Permission management (`/console/permission-management`): **All** under Roles edits the `security_permissions` catalog; a named role uses checkboxes + **Save role permissions** (draft, no per-click API); `GET /api/admin/permission-reference` includes `operation_key_hints`; overview nudge when catalog is only `all`; Data security (`/console/data-security/*`) remains local-user–centric; group data scopes behind `OPENKMS_ENFORCE_GROUP_DATA_SCOPES`
- Route protection: **Home** (`/`) is always reachable without sign-in (static marketing content via **`HomeStaticLanding`**); all other **`MainLayout`** routes require authentication. **`401`** responses whose body indicates invalid/expired JWT clear SPA session via **`authAwareFetch`** / **`AuthContext`** so the same gate appears instead of raw API error JSON
- **Knowledge Map & home hub**: SQLAlchemy **`app.models.knowledge_map`** (`KnowledgeMapNode`, `KnowledgeMapResourceLink` → `taxonomy_nodes` / `taxonomy_resource_links`); API **`app.api.knowledge_map`** at **`GET /api/taxonomy/nodes/tree`**, node PATCH (move/reorder/edit) + link CRUD; **`GET /api/home/hub`** (taxonomy summary field in JSON + scoped document relationship work items + placeholder share requests); SPA **`KnowledgeMap.tsx`** at **`/knowledge-map`** (legacy **`/taxonomy`** redirects; sidebar above Glossaries; **Tree** + **Node details** panels with scoped refer-tos; **New node** modal); signed-in **`Home.tsx`** with **taxonomy:read** centers **`KnowledgeMapForceGraph`** (`react-force-graph-2d`, wiki-style pan/zoom; tree + links APIs; term → **`/knowledge-map?node=`**, resource → channel/wiki/articles); **`MainLayout`** applies **`app-content--home`** on **`/`** for hub padding; permissions **`taxonomy:read`** / **`taxonomy:write`**; feature toggle key **`taxonomy`** (Console label: Knowledge Map)
- **Articles**: Backend **`article_channels`**, **`articles`**, **`article_versions`**, **`article_attachments`**, **`access_group_article_channels`**; APIs **`/api/article-channels`**, **`/api/articles`** (list, CRUD, lifecycle, markdown, files redirect, attachments, versions); MinIO prefix **`articles/{article_id}/`**; Knowledge Map validates **`article_channel`** links; permissions **`articles:read`** / **`articles:write`**; SPA **`ArticleChannelsContext`**, **`/articles`**, **`/articles/channels`**, **`/articles/channels/:id`**, **`/articles/channels/:id/settings`**, detail + markdown asset URLs
- Knowledge Bases: Full CRUD, documents, FAQs (manual + LLM-generated), chunks (pgvector), semantic search with hybrid filters (metadata_filters) and optional **include_historical_documents**, Q&A proxy, settings (chunk_config incl. lifecycle_index_mode, faq_prompt, metadata_keys); doc_metadata propagated from documents to FAQs/chunks per metadata_keys; openkms-cli pipeline run --pipeline-name kb-index; QA Agent service (FastAPI + LangGraph)
- **Wiki spaces**: `wiki_spaces`, `wiki_pages`, `wiki_files`, **`wiki_space_documents`** (+ `access_group_wiki_spaces`); API `/api/wiki-spaces` (scoped like KBs when `OPENKMS_ENFORCE_GROUP_DATA_SCOPES`); PageIndex; **`GET /api/wiki-spaces/{id}/graph`**; vault mirror + **`POST .../import/vault`**; **paginated** page list (15); **`GET/POST/DELETE` `/api/wiki-spaces/{id}/documents`** for channel document links (GET list: `linked_at` + linked **document** `updated_at` for SPA “last updated”); **embedded agent** `POST/GET/DELETE/PATCH` **`/api/agent/conversations`**, `.../messages` (list by wiki space, conversation **delete**/**title** optional, GFM + auto-scroll in SPA; LangGraph read-only tools; `OPENKMS_AGENT_MODEL_ID` or default **LLM** on **Models** `/models`) — [wiki_agent_prototype.md](./wiki_agent_prototype.md); **openkms-cli** `wiki put` / `sync` / `upload-file`
- **openkms-cli tests:** `openkms-cli/tests/` — `pip install -e ".[dev]" && pytest tests/` (VLM defaults merge + mocked fetch; parser **`_restructure_pages_after_predict`** and layout/bbox helpers; no Paddle in test env)
- Console: **System settings** (`/console/settings`) — **`system_settings`** table (`system_name`, `default_timezone`, `api_base_url_note`); **`GET /api/public/system`** (unauthenticated) returns trimmed **`system_name`** only; **`GET`/`PUT /api/system/settings`** with **`console:settings`**; **sidebar** title is blank until that public response, then shows **`openKMS`** when the name is empty or whitespace; users, feature toggles, object types, link types, data sources, datasets, permission management, data security (groups + resource scopes); entry gated by `console:*` permissions or JWT `admin`; per-page permissions (e.g. `console:feature_toggles`)
- Evaluation (experimental, feature toggle): query + expected answer pairs per KB; topic column; CSV import (topic, query, answer); **items list** paginated (`GET .../items` `offset`/`limit`, default limit 10); run types **search_retrieval** (hybrid search + judge) and **qa_answer** (KB agent + judge); persisted **evaluation_runs** / **evaluation_run_items**; list/get/delete/compare runs in API and dataset detail UI; sidebar link when evaluationDatasets enabled
- Glossaries: CRUD glossaries, terms with bilingual (EN/CN) support, definition, synonyms, AI suggestion (translation + definition + synonyms), search (EN, CN, definition, synonyms), export/import; dev.sh ensures pgvector on start; backend README + dev setup doc: pgvector install, Docker/PGDG, `$libdir/vector` troubleshooting
- Objects & Links: ontology layer (object types, link types, instances); schema in Console; user-facing browse at /ontology (overview), /objects, /links; feature toggle objectsAndLinks
- Data Sources: Console → Data Sources (PostgreSQL/Neo4j connections, encrypted creds). Datasets & object/link **schema** admin: Ontology sidebar (`/ontology/datasets`, `/ontology/object-types`, `/ontology/link-types`); `ontology:read`/`ontology:write` can use the same APIs as `console:datasets` / `console:object_types` / `console:link_types` where wired with `require_any_permission`.
- Docs site: **`mkdocs.yml`** (Material theme) + **`.github/workflows/docs.yml`** publish **`docs/`** to **GitHub Pages** at <https://yingrui.github.io/openKMS/> on every push to `main` that touches `docs/**`, `mkdocs.yml`, or the workflow; reader-friendly entry pages (`index.md`, `overview.md`, `quickstart.md`, `operations/docker.md`, `developer/setup.md`) sit on top of the existing canonical references (`architecture.md`, `functionalities.md`, `development_plan.md`, `security.md`, `tech_debt.md`); **`docs/agents.md`** documents where each kind of doc edit goes, mirroring `.cursor/rules/*.mdc`. Folder rename `docs/for developer/` → `docs/developer/` to keep URLs space-free.

## Short-Term (Next Steps)

### Wiki Copilot and linked documents (build on [wiki_agent_prototype.md](./wiki_agent_prototype.md))

- [x] **Pages \| Documents**; linked-docs picker; **Wiki Copilot** wired to **`/api/agent`** (persisted conversations; read tools; **list/delete** conversations, **markdown** + **auto-scroll** in panel); **wiki-skills** vendored via `git subtree` at `third-party/wiki-skills`, `SKILL.md` content in LangGraph system prompt
- [x] `wiki_space_documents` + `agent_*` tables; link/unlink/list; SPA uses API (not sessionStorage) for links
- [x] Backend embedded agent (v1): LangGraph `create_react_agent` + `agent_conversations` / `agent_messages`
- [x] **Tool visibility** while streaming: `astream_events` (v2) → NDJSON `tool_start` / `tool_end` / `tool_error` (paired by `run_id`); wiki panel shows compact terminal-style rows **interleaved with streamed text** (not all tools then all text) and expandable I/O
- [ ] optional: Langfuse tracing; **write** tools for pages

### 0. openkms-cli (document parsing CLI)

- [x] Wiki CLI: `openkms-cli wiki put|sync|upload-file` for wiki space pages and assets (authenticated API)
- [x] Create `openkms-cli/` folder with Typer CLI (typer>=0.9.0)
- [x] Use PaddleOCR-VL for parsing (optional `pip install openkms-cli[parse]`)
- [x] CLI commands: `openkms-cli parse run <input> [--output <path>] [--config <path>]`
- [x] Configurable via CLI args, env vars, config file (VLM URL, model, concurrency)
- [x] Explicit env → settings: `openkms_cli/settings.py` (`CliSettings`), `get_cli_settings()`; pipeline/parse/auth use it; pydantic-settings dependency
- [x] Design for backend integration: subprocess-invokable
- [x] Pipeline CLI: `openkms-cli pipeline list` (list supported pipelines), `openkms-cli pipeline run --input s3://.../original.pdf` (optional --s3-prefix, --skip-upload; local input supported)
- [x] Backend async job spawns CLI for document parsing (offload from API process) – via procrastinate
- [x] Pipeline metadata extraction: when channel has extraction_model_id and extraction_schema, worker passes --extract-metadata --extraction-model-name; CLI fetches config from backend config-by-name, extracts via pydantic-ai, PUTs metadata to backend
- [x] PageIndex: pipeline builds markdown→tree via built-in md_to_tree (# headings); backend GET /documents/{id}/page-index and GET /documents/{id}/section; frontend Markdown | Page Index toggle; QA agent LangGraph page_index skill (read TOC, select section, extract content)
- [x] Pipeline checkpoint: after successful S3 upload, when `--document-id` and API auth (OIDC token or local Basic) are available, CLI `PUT`s parsed markdown then `POST /api/documents/{id}/versions` with `tag: "Pipeline"` (after optional metadata extraction)

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
- [x] Console Object Types page: CRUD object types and properties; Edit dialog wider; property name/type read-only when editing; key_property (primary key) selector; is_master_data and display_property for document labels
- [x] Console Link Types page: CRUD link types
- [x] Ontology overview page (`/ontology`) – all object types and link types on one page
- [x] User-facing Objects list (`/objects`), Object type detail with instances (`/objects/:typeId`)
- [x] User-facing Links list (`/links`), Link type detail with instances (`/links/:typeId`)
- [x] Search filter on object instances
- [x] Feature toggle `objectsAndLinks` (gates sidebar and routes)

### 4b. Data Sources (Console) & Datasets / schema (Ontology)

- [x] Data sources: CRUD for PostgreSQL and Neo4j connections; credentials encrypted (Fernet)
- [x] Test connection: POST /api/data-sources/{id}/test
- [x] Neo4j delete all: POST /api/data-sources/{id}/neo4j-delete-all; confirmation modal in Console
- [x] Datasets: CRUD for PostgreSQL tables (schema + table) linked to data sources
- [x] List tables: GET /api/datasets/from-source/{id} for table picker
- [x] Console Data Sources page: table, Add/Edit modal, Test button
- [x] Datasets UI under Ontology (`/ontology/datasets`, detail `/ontology/datasets/:id`); legacy `/console/datasets` redirects
- [x] Dataset detail: click dataset → Data tab (rows with pagination, page size selector) and Metadata tab (column info)
- [x] Dataset rows/metadata API: GET /api/datasets/{id}/rows, GET /api/datasets/{id}/metadata
- [x] seed_mock_insurance_data.py: mock diseases, insurance products, relationships for demo datasets
- [x] Object types link to datasets (dataset_id); instance_count uses dataset row count when linked
- [x] Link types: cardinality (one-to-one, one-to-many, many-to-many) and optional dataset_id for many-to-many
- [x] Link types FK mapping: source_key_property, target_key_property, source_dataset_column, target_dataset_column
- [x] Many-to-many with dataset: connections read from junction table; link_count and list links from dataset
- [x] Many-to-one/one-to-many: link_count from source object type dataset where FK column is not null
- [x] Index to Neo4j: Object Types and Link Types pages; Index Objects/Links buttons when Neo4j data source exists; POST /api/object-types/index-to-neo4j, POST /api/link-types/index-to-neo4j
- [x] Ontology sidebar: **Ontology** top-level next to **Glossaries**; indented subnav (Datasets, Object types, Link types, Objects, Links, Object Explorer) when on those routes; schema admin at `/ontology/datasets`, `/ontology/object-types`, `/ontology/link-types`
- [x] Objects & Links visible when Neo4j data source exists (hasNeo4jDataSource in feature toggles)
- [x] Object Explorer: graph view at /object-explorer (react-force-graph-2d, Cypher execution, object/link type selection)
- [x] Objects page: instances and instance_count from Neo4j; Console Object Types: counts from datasets
- [x] Links page: instances and link_count from Neo4j; Console Link Types: counts from datasets
- [x] API params: count_from_neo4j on GET /api/object-types, /object-types/{id}, /api/link-types, /link-types/{id}

### 4. Authentication

- [x] Integrate OIDC IdP with frontend (`oidc-client-ts`, discovery + PKCE; login/logout) when API reports `oidc`
- [x] Local auth mode: PostgreSQL `users`, `/api/auth/register|login|me`, frontend `/login` & `/signup`, CLI HTTP Basic
- [x] `GET /api/auth/public-config` + SPA uses API-reported mode (compatibility with local vs central IdP); optional mismatch banner vs `VITE_AUTH_MODE`
- [x] Profile page `/profile` and `fetchAuthMe`; user admin APIs `/api/admin/users` + Console Users (`console:users`, local only)
- [x] Protect backend routes with JWT Bearer or session (or local Basic for CLI)
- [x] Operation permissions: `security_permissions` (catalog), `security_roles`, `security_role_permissions`, `user_security_roles`; `require_permission` + `GET /api/auth/permission-catalog` (from DB) + admin CRUD `/api/admin/security-permissions`; OIDC resolves permissions by matching JWT realm role names to `security_roles.name`; Console sidebar and APIs use granular `console:*` keys; JWT realm `admin` / `local-cli` bypass
- [x] Pattern-based access control: optional `OPENKMS_ENFORCE_PERMISSION_PATTERNS_STRICT` middleware; default `frontend_route_patterns` / `backend_api_patterns` per catalog key (Alembic); SPA `canAccessPath` from permission-catalog union; docs and `.env.example` updated
- [x] Access groups: `access_groups`, junctions for channels/KBs/wiki/evaluation/datasets/object_types/link_types; **data resources** (`data_resources`, `access_group_data_resources`) with `/api/admin/data-resources` + Console **Data resources** page; group scopes include `data_resource_ids`; `OPENKMS_ENFORCE_GROUP_DATA_SCOPES` unions legacy ID lists with resource predicates (`data_scope` + `data_resource_policy`) for local non-admin filters (no OIDC enforcement in phase 1); **OIDC**: console may still manage groups, scopes, and data resources; `PUT` group members remains local-only
- [x] Feature toggles persisted in PostgreSQL (`feature_toggles` table); `GET/PUT /api/feature-toggles` (PUT requires `console:feature_toggles`)
- [x] Backend `require_admin` retained where needed; sensitive console routes migrated to `require_permission`
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
- [x] run_pipeline task: spawns `openkms-cli pipeline run` as subprocess; wait capped by **`OPENKMS_PIPELINE_TIMEOUT_SECONDS`** (default 1800); when channel has extraction config (model_name from ApiModel), renders extraction args into template and runs metadata extraction in CLI
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

### 6b. Unify Metadata and Labels (2026-03)

- [x] Merge labels into metadata; single METADATA concept in DB and UI
- [x] Alembic migration: merge labels → metadata, label_keys → metadata_keys, drop labels/label_keys columns
- [x] Add object_type and list[object_type] to extraction schema; object_type_extraction_max_instances on channel
- [x] Rename Labels tab to Manual Labels; label_config uses type (object_type | list[object_type]) instead of allow_multiple
- [x] KB: metadata_keys only; openkms-cli and backend propagation use _propagate_metadata(doc_metadata, metadata_keys)

### 6c. Tech Debt Mitigation (2026-03)

- [x] Error boundary around routes (App.tsx)
- [x] Document model status default fix (migration p1q2r3s4t5u6)
- [x] Frontend typecheck script (`npm run typecheck`)
- [x] Cypher injection hardening (ontology_explore: block CALL, apoc., dbms.; require RETURN)
- [x] Docker Compose (Postgres, MinIO)
- [x] Docker workflow documented in `docker/README.md` using `docker compose -f docker/docker-compose.yml` from repo root (`build`, `up -d --build`, `down`)
- [x] .env.example (root, vlm-server)
- [x] Production secret key check (reject startup with default)
- [x] Pipeline command validation (max_length=4096)
- [x] Backend pytest + smoke tests
- [x] Article management key tests (`backend/tests/test_articles_management.py`: channel subtree collection, import `rewrite_markdown_links`, `is_allowed_article_file_path` / safe filenames / S3 key validation)
- [x] Document enum contract tests (`backend/tests/test_documents_constants.py`: `DocumentStatus`, `DocumentLifecycleStatus`, `DocumentRelationType` string values)
- [x] Frontend Vitest + smoke tests
- [x] DocumentStatus enum; async subprocess (run_pipeline); document list query optimization; VLM config consolidation
- [x] Route-level code splitting (React.lazy); ErrorBanner; ConsoleSettings a11y (id/htmlFor)

### 7. Knowledge Bases (RAG)

- [x] Knowledge base CRUD API (`/api/knowledge-bases`)
- [x] Add/remove documents to/from knowledge base (join table `kb_documents`)
- [x] FAQ CRUD (manual create/edit/delete)
- [x] FAQ generation from documents via LLM (`POST /faqs/generate` returns preview; `POST /faqs/batch` saves selected; UI: review step with remove unqualified before save)
- [x] Chunk model with pgvector embeddings
- [x] pgvector extension enabled in database.py
- [x] Semantic search over chunks and FAQs (`POST /search`)
- [x] QA proxy to external agent service (`POST /ask`)
- [x] KB settings: agent URL, embedding model (**`embedding_model_id`** → **Models** / `api_models`; not backend `OPENKMS_EMBEDDING_*`), chunking config, FAQ generation prompt
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
