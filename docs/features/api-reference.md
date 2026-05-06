# API reference

Every HTTP route the backend exposes. Browser-facing routes live under `/api/...`; service-only routes for **`openkms-cli`** live under `/internal-api/...`. The unauthenticated routes are explicitly marked.

For per-feature context (when an endpoint is used, what it returns), see the matching feature page in the [Features index](../functionalities.md).

## Auth, sessions, system

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/login` | OIDC mode: redirect to IdP. Local mode: redirect to frontend `/login` |
| GET | `/api/auth/login/oauth2/code/oidc` | OAuth2 callback (backend confidential client; register on IdP) |
| GET | `/api/auth/login/oauth2/code/keycloak` | Same as above (legacy callback path) |
| GET | `/api/auth/public-config` | No auth: `auth_mode`, `allow_signup` only |
| GET | `/internal-api/models/document-parse-defaults` | Authenticated (`require_auth`); query `model_name` optional — named **`vl`**/**`ocr`** model or default; JSON `base_url`, `model_name`, `api_key` for openkms-cli |
| GET | `/api/public/system` | No auth: `{ "system_name" }` trimmed from DB (may be `""`; SPA shows `openKMS` when empty after load) |
| GET | `/api/public/settings` | Authenticated `console:settings` (or admin): `system_name`, `default_timezone`, `api_base_url_note` |
| PUT | `/api/public/settings` | Authenticated `console:settings` (or admin): update system-wide display settings |
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
| POST | `/api/auth/sync-session` | Sync frontend JWT to backend session (Bearer required) |
| POST | `/api/auth/clear-session` | Clear backend session (called before logout) |
| GET | `/api/auth/logout` | Clear session; OIDC: redirect to IdP logout; local: redirect to frontend |
| GET | `/api/home/hub` | Authenticated landing-screen payload: per-section quick links the user is permitted to see |
| GET | `/api/search` | Authenticated unified metadata search: query `q`, `types` (`all` or comma-list: `documents`, `articles`, `wiki_spaces`, `knowledge_bases`), optional `document_channel_id`, `article_channel_id`, `updated_after` / `updated_before` (ISO 8601), `limit` (1–100, default 30). Returns sections with `items` (`id`, `name`, `title`, `kind`, `url_path`, `channel_id`, `channel_name`, `updated_at`) and `total` per type; types the user cannot read are empty; **403** if none of the requested types are allowed; **404** if a channel id is unknown. Scoped like list APIs (documents, articles, wiki spaces, KB visibility). |
| HEAD | `/api/search` | Same auth / permission overlap check as GET; no JSON body |
| GET | `/api/providers/{id}/models` | Authenticated: list models registered under this provider |
| GET | `/api/models/{id}/config` | Authenticated: full LLM config (base_url, model_name, api_key, defaults) for the openkms-cli |
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
| POST | `/api/documents/upload` | Multipart: `file`, `channel_id`. Stores original to S3. **XLSX**: builds sheet preview + markdown in-process, sets `completed` or `failed` (no parse job). **Other types**: `uploaded`; if channel `auto_process` and pipeline, enqueues `run_pipeline` (not for XLSX) |
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
| POST | `/api/jobs` | Create processing job (`{ document_id, pipeline_id? }`). **`.xlsx`**: defers `run_spreadsheet_preview` (no `pipeline_id` required). **Other extensions**: requires channel or body `pipeline_id`; defers `run_pipeline` |
| POST | `/api/jobs/{id}/retry` | Retry a failed job (same task: `run_pipeline` vs `run_spreadsheet_preview` from original `task_name`) |
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

## Articles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/article-channels` | List article channels (tree) |
| GET | `/api/article-channels/{id}` | Get channel by ID |
| POST | `/api/article-channels` | Create channel |
| PUT | `/api/article-channels/{id}` | Update channel (name, description, parent_id) |
| POST | `/api/article-channels/{id}/reorder` | Move channel up or down among siblings (body: `{ direction }`) |
| POST | `/api/article-channels/merge` | Merge source channel into target (move articles, delete source; optional include_descendants) |
| DELETE | `/api/article-channels/{id}` | Delete channel (fails if has articles or sub-channels) |
| GET | `/api/articles?channel_id=&search=&offset=&limit=` | List articles; channel_id optional; search filters by name |
| GET | `/api/articles/stats` | Article counts for index page |
| GET | `/api/articles/{id}` | Get article with markdown |
| POST | `/api/articles` | Create article (`channel_id`, `name`, `markdown`, optional `metadata`, `origin_article_id`) |
| POST | `/api/articles/import` | Bulk import articles (multipart or JSON; preserves `origin_article_id` for provenance) |
| PATCH | `/api/articles/{id}` | Update article info (name, channel_id, metadata, origin_article_id) |
| PUT | `/api/articles/{id}/markdown` | Update article markdown (rewrites relative asset links to current bundle paths) |
| DELETE | `/api/articles/{id}` | Delete article and its MinIO bundle |
| PATCH | `/api/articles/{id}/lifecycle` | Update lifecycle fields (`series_id`, `effective_from`, `effective_to`, `lifecycle_status`) |
| GET | `/api/articles/{id}/relationships` | List outgoing and incoming article relationships |
| POST | `/api/articles/{id}/relationships` | Create outgoing edge (`target_article_id`, `relation_type`, optional `note`) |
| DELETE | `/api/articles/{id}/relationships/{relationship_id}` | Delete an outgoing relationship |
| GET | `/api/articles/{id}/attachments` | List attachments for an article |
| POST | `/api/articles/{id}/attachments` | Upload attachment (multipart) |
| DELETE | `/api/articles/{id}/attachments/{attachment_id}` | Delete attachment from MinIO + DB |
| POST | `/api/articles/{id}/images` | Upload an image into the article bundle (used by paste / drag-and-drop in the editor) |
| GET | `/api/articles/{id}/files/{path}` | Stream an image or attachment from the article's MinIO bundle |
| GET | `/api/articles/{id}/versions` | List versions (metadata only) |
| POST | `/api/articles/{id}/versions` | Create explicit version (snapshot of current markdown + metadata) |
| GET | `/api/articles/{id}/versions/{version_id}` | Full version snapshot |
| POST | `/api/articles/{id}/versions/{version_id}/restore` | Restore working copy from version |

## Wiki spaces

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/wiki-spaces` | List wiki spaces |
| POST | `/api/wiki-spaces` | Create wiki space |
| GET | `/api/wiki-spaces/{id}` | Get wiki space |
| PATCH | `/api/wiki-spaces/{id}` | Update wiki space (name, description) |
| DELETE | `/api/wiki-spaces/{id}` | Delete wiki space (cascades pages, files, document links) |
| GET | `/api/wiki-spaces/{id}/graph` | Wiki page graph (nodes + edges) for the navigator |
| GET | `/api/wiki-spaces/{id}/pages` | List pages (paginated) |
| POST | `/api/wiki-spaces/{id}/pages` | Create page (`path`, `title`, optional `body`, `metadata`) |
| GET | `/api/wiki-spaces/{id}/pages/{page_id}` | Get page (with body and metadata) |
| PATCH | `/api/wiki-spaces/{id}/pages/{page_id}` | Update page (title, body, metadata) |
| DELETE | `/api/wiki-spaces/{id}/pages/{page_id}` | Delete page |
| GET | `/api/wiki-spaces/{id}/pages/by-path/{page_path:path}` | Resolve page by Obsidian-style path |
| PUT | `/api/wiki-spaces/{id}/pages/by-path/{page_path:path}` | Upsert page by path (create or update) |
| DELETE | `/api/wiki-spaces/{id}/pages/by-path/{page_path:path}` | Delete page by path |
| GET | `/api/wiki-spaces/{id}/pages/{page_id}/page-index` | PageIndex tree for in-page navigation |
| GET | `/api/wiki-spaces/{id}/files` | List uploaded files in this space |
| POST | `/api/wiki-spaces/{id}/files` | Upload file (multipart) — used by Obsidian assets and embedded images |
| GET | `/api/wiki-spaces/{id}/files/{file_id}/content` | Stream file content from MinIO |
| DELETE | `/api/wiki-spaces/{id}/files/{file_id}` | Delete file (storage + DB) |
| GET | `/api/wiki-spaces/{id}/documents` | List documents linked to this wiki space |
| POST | `/api/wiki-spaces/{id}/documents` | Link an existing document into this space |
| DELETE | `/api/wiki-spaces/{id}/documents/{document_id}` | Unlink a document (does not delete the document) |
| POST | `/api/wiki-spaces/{id}/import/vault` | Bulk import an Obsidian vault (zip / multi-file upload) |
| POST | `/api/wiki-spaces/{id}/import/vault/markdown-file` | Append a single markdown file from a vault upload |

## Agent (embedded LangGraph assistant)

Used by the Wiki agent surface (and any other in-app assistant). Uses `OPENKMS_AGENT_MODEL_ID` if set, else falls back to the first available LLM model.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agent/conversations?surface=&context=` | List the user's conversations on a surface |
| POST | `/api/agent/conversations` | Create conversation (`surface`, optional `context`, `title`) |
| GET | `/api/agent/conversations/{id}` | Get conversation header |
| PATCH | `/api/agent/conversations/{id}` | Update conversation (title, context) |
| DELETE | `/api/agent/conversations/{id}` | Delete conversation (cascades messages) |
| GET | `/api/agent/conversations/{id}/messages` | List messages |
| POST | `/api/agent/conversations/{id}/messages` | Send a user message and stream back the agent reply (`text/event-stream`) |
| DELETE | `/api/agent/conversations/{id}/messages/from/{message_id}` | Delete this message and everything after it (used by "regenerate") |

## Knowledge map (taxonomy)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/taxonomy/nodes/tree` | Full Knowledge Map tree for the navigator |
| POST | `/api/taxonomy/nodes` | Create node (`name`, optional `parent_id`, `description`, `sort_order`) |
| PATCH | `/api/taxonomy/nodes/{id}` | Update node (rename, move, reorder) |
| DELETE | `/api/taxonomy/nodes/{id}` | Delete node and its subtree |
| GET | `/api/taxonomy/resource-links?node_id=` | List resources mapped to a node |
| PUT | `/api/taxonomy/resource-links` | Replace the node mapping for a single resource (`resource_type`, `resource_id`, `taxonomy_node_id`) |
| DELETE | `/api/taxonomy/resource-links?resource_type=&resource_id=` | Unmap a resource from any node |
