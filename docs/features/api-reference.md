# API reference

Every HTTP route the backend exposes. Browser-facing routes live under `/api/...`; service-only routes for **`openkms-cli`** live under `/internal-api/...`. The unauthenticated routes are explicitly marked.

For per-feature context (when an endpoint is used, what it returns), see the matching feature page in the [Features index](../functionalities.md).

## Auth, sessions, system

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/login` | OIDC mode: redirect to IdP. Local mode: redirect to frontend `/login` |
| GET | `/login/oauth2/code/oidc` | OAuth2 callback (backend confidential client; register on IdP) |
| GET | `/login/oauth2/code/keycloak` | Same as above (legacy callback path) |
| GET | `/api/auth/public-config` | No auth: `auth_mode`, `allow_signup` only |
| GET | `/internal-api/models/document-parse-defaults` | Authenticated (`require_auth`); query `model_name` optional — named **`vl`**/**`ocr`** model or default; JSON `base_url`, `model_name`, `api_key` for openkms-cli |
| GET | `/api/public/system` | No auth: `{ "system_name" }` trimmed from DB (may be `""`; SPA shows `openKMS` when empty after load) |
| GET | `/api/system/settings` | Authenticated `console:settings` (or admin): `system_name`, `default_timezone`, `api_base_url_note` |
| PUT | `/api/system/settings` | Authenticated `console:settings` (or admin): update system-wide display settings |
| POST | `/api/auth/register` | Local mode only: create user, returns JWT + user |
| POST | `/api/auth/login` | Local mode only: body `{ "login", "password" }` — `login` is username or email; returns JWT + user |
| GET | `/api/auth/me` | Current user from Bearer, session, or (local) CLI Basic; includes `permissions` (resolved keys) |
| GET | `/api/auth/permission-catalog` | Authenticated: list of permission entries (`key`, `label`, `description`, `frontend_route_patterns`, `backend_api_patterns`) for the Console matrix, SPA route gate, and optional strict API enforcement; optional in-process TTL cache (**`OPENKMS_PERMISSION_CATALOG_CACHE_SECONDS`**, default 5; `0` disables), cleared when admins mutate **`security_permissions`** |
| GET | `/api/admin/security-roles` | `console:permissions`: roles and permission keys (includes `all`); `is_system_role` true only for **admin** (cannot delete) |
| POST | `/api/admin/security-roles` | `console:permissions`: create role; reserved names `admin` / `member` rejected |
| DELETE | `/api/admin/security-roles/{role_id}` | `console:permissions`: delete role (**admin** role rejected) |
| PUT | `/api/admin/security-roles/{role_id}/permissions` | `console:permissions`: replace keys (each must exist in `security_permissions`); cannot drop sole `all` without adding another permission first (see Permissions page) |
| GET | `/api/admin/permission-reference` | `console:permissions`: frontend feature path patterns + full OpenAPI operation list (method, path, summary, tags) to help configure `security_permissions` |
| GET | `/api/admin/security-permissions` | `console:permissions`: list permission catalog rows (id, key, label, patterns, sort_order) |
| POST | `/api/admin/security-permissions` | `console:permissions`: create catalog row |
| PATCH | `/api/admin/security-permissions/{id}` | `console:permissions`: update label, description, patterns, sort_order (built-in `all` row rejected) |
| DELETE | `/api/admin/security-permissions/{id}` | `console:permissions`: delete row (`all` and keys still assigned to roles are rejected) |
| GET/POST | `/api/admin/groups` | `console:groups`: list/create access groups |
| GET/PATCH/DELETE | `/api/admin/groups/{id}` | `console:groups`: get/update/delete group |
| GET/PUT | `/api/admin/groups/{id}/members` | `console:groups`: list/replace member user ids (**local** auth only for `PUT`; **OIDC**: `GET` returns `[]`, `PUT` **403**) |
| GET/PUT | `/api/admin/groups/{id}/scopes` | `console:groups`: get/replace resource id lists per category (includes `data_resource_ids`) |
| GET/POST | `/api/admin/data-resources` | `console:groups`: list/create **data resources** |
| GET | `/api/admin/data-resources/kinds` | `console:groups`: allowed `resource_kind` strings |
| GET/PATCH/DELETE | `/api/admin/data-resources/{id}` | `console:groups`: get/update/delete data resource |
| POST | `/api/auth/logout` | Clear server session |
| POST | `/sync-session` | Sync frontend JWT to backend session (Bearer required) |
| POST | `/clear-session` | Clear backend session (called before logout) |
| GET | `/logout` | Clear session; OIDC: redirect to IdP logout; local: redirect to frontend |
| GET | `/api/admin/users` | `console:users`: auth mode, IdP notice, `users` (local only) |
| POST | `/api/admin/users` | `console:users`, **local** only: create user (`email`, `username`, `password`, `is_admin`) |
| PATCH | `/api/admin/users/{id}` | `console:users`, **local** only: set `is_admin` (syncs security roles) |
| DELETE | `/api/admin/users/{id}` | `console:users`, **local** only: delete user |

## Documents

| Method | Path | Description |
|--------|------|-------------|
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
| PATCH | `/api/documents/{id}/lifecycle` | Update policy lifecycle fields (`series_id`, `effective_from`, `effective_to`, `lifecycle_status`) |
| GET | `/api/documents/{id}/relationships` | List outgoing and incoming document relationships |
| POST | `/api/documents/{id}/relationships` | Create outgoing edge (`target_document_id`, `relation_type`, optional `note`) |
| DELETE | `/api/documents/{id}/relationships/{relationship_id}` | Delete an outgoing relationship (source must be this document) |

## Pipelines, jobs, providers, models

| Method | Path | Description |
|--------|------|-------------|
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

## Knowledge bases

| Method | Path | Description |
|--------|------|-------------|
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

## Evaluation

| Method | Path | Description |
|--------|------|-------------|
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

## Glossaries

| Method | Path | Description |
|--------|------|-------------|
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

## Ontology — objects, links, datasets, data sources

| Method | Path | Description |
|--------|------|-------------|
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
| GET | `/api/data-sources` | List data sources (`console:data_sources`) |
| POST | `/api/data-sources` | Create data source (`console:data_sources`) |
| GET | `/api/data-sources/{id}` | Get data source (`console:data_sources`) |
| PUT | `/api/data-sources/{id}` | Update data source (`console:data_sources`) |
| DELETE | `/api/data-sources/{id}` | Delete data source (`console:data_sources`) |
| POST | `/api/data-sources/{id}/test` | Test connection (`console:data_sources`) |
| POST | `/api/data-sources/{id}/neo4j-delete-all` | Delete all nodes and relationships in Neo4j (`console:data_sources`, Neo4j only) |
| GET | `/api/datasets` | List datasets (`console:datasets`, optional ?data_source_id=) |
| GET | `/api/datasets/from-source/{id}` | List tables from PostgreSQL data source (`console:datasets`) |
| POST | `/api/datasets` | Create dataset (`console:datasets`) |
| GET | `/api/datasets/{id}` | Get dataset (`console:datasets`) |
| GET | `/api/datasets/{id}/rows` | Get paginated rows from dataset table (`console:datasets`; ?limit=, ?offset=) |
| GET | `/api/datasets/{id}/metadata` | Get column metadata from information_schema (`console:datasets`) |
| PUT | `/api/datasets/{id}` | Update dataset (`console:datasets`) |
| DELETE | `/api/datasets/{id}` | Delete dataset (`console:datasets`) |

## Feature toggles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/feature-toggles` | Get feature toggle state (includes hasNeo4jDataSource; authenticated) |
| PUT | `/api/feature-toggles` | Update feature toggles (admin-only) |
