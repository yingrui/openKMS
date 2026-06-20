# API reference

Every HTTP route the backend exposes. Browser-facing routes live under `/api/...`; routes that return provider secrets for **`openkms-cli`**, **qa-agent**, and workers live under `/internal-api/...` and require an **internal service** JWT (`sub=local-cli` or OIDC `azp` on **`OPENKMS_INTERNAL_SERVICE_CLIENT_IDS`**). The unauthenticated routes are explicitly marked.

For per-feature context (when an endpoint is used, what it returns), see the matching feature page in the [Features index](../functionalities.md).

### Localization

Clients may send **`Accept-Language`** (the SPA sends `en` or `zh-CN`). Many auth, search, and document responses use structured JSON for **`detail`**: `{ "code": "<STABLE_CODE>", "message": "<localized human text>" }` instead of a plain string (some paths may still return a string). Stable **`code`** values are defined with English and Chinese templates in **`backend/app/i18n/catalog.py`**.

## Auth, sessions, system

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/login` | OIDC mode: redirect to IdP. Local mode: redirect to frontend `/login` |
| GET | `/api/auth/login/oauth2/code/oidc` | OAuth2 callback (backend confidential client; register on IdP) |
| GET | `/api/auth/login/oauth2/code/keycloak` | Same as above (legacy callback path) |
| GET | `/api/auth/public-config` | No auth: `auth_mode`, `allow_signup` only |
| GET | `/internal-api/models/document-parse-defaults` | **Internal service client only**; query `model_name` optional — named model with **`document-parse`** capability or default; JSON `base_url`, `model_name`, `api_key` for openkms-cli |
| GET | `/internal-api/models/config-by-name` | **Internal service client only**; query **`model_name`** (required), **`api_kind`** (default `chat-completions`); JSON `base_url`, `model_name`, `api_key` for openkms-cli (e.g. pipeline metadata extraction) |
| GET | `/internal-api/models/llm-defaults` | **Internal service client only**; JSON `base_url`, `model_name`, `api_key` for **qa-agent** (default **`chat-completions`** model; same as embedded wiki agent) |
| GET | `/internal-api/models/kb-embedding-credentials` | **Internal service client only**; query **`knowledge_base_id`** (required); JSON `base_url`, `model_name`, `api_key` for **`openkms-cli`** **`kb-index`** (no KB ACL) |
| GET | `/internal-api/documents/{id}` | **Internal service client only**; read document (incl. `metadata`) for pipeline |
| GET | `/internal-api/documents/{id}/metadata-needs-extraction` | **Internal service client only**; `{ needs_extraction }` — true when channel schema fields are all empty |
| PUT | `/internal-api/documents/{id}/markdown` | **Internal service client only**; sync parsed markdown during pipeline (no channel ACL) |
| PUT | `/internal-api/documents/{id}/metadata` | **Internal service client only**; merge extracted metadata during pipeline (no channel ACL) |
| POST | `/internal-api/documents/{id}/versions` | **Internal service client only**; snapshot markdown + metadata after pipeline (no channel ACL) |
| GET | `/internal-api/knowledge-bases/{id}` | **Internal service client only**; read KB config for **`kb-index`** (no KB ACL) |
| GET | `/internal-api/knowledge-bases/{id}/documents` | **Internal service client only**; list linked documents for **`kb-index`** |
| GET | `/internal-api/knowledge-bases/{id}/wiki-pages-for-index` | **Internal service client only**; paginated wiki pages with body for **`kb-index`**; optional **`wiki_space_id`** filter |
| GET | `/internal-api/knowledge-bases/{id}/faqs` | **Internal service client only**; paginated FAQs for **`kb-index`** |
| DELETE | `/internal-api/knowledge-bases/{id}/chunks` | **Internal service client only**; clear all chunks before full re-index |
| DELETE | `/internal-api/knowledge-bases/{id}/wiki-spaces/{wiki_space_id}/chunks` | **Internal service client only**; delete chunks for pages in one linked wiki space |
| POST | `/internal-api/knowledge-bases/{id}/chunks/batch` | **Internal service client only**; bulk insert chunks with embeddings |
| PUT | `/internal-api/knowledge-bases/{id}/faqs/batch-embeddings` | **Internal service client only**; bulk update FAQ embeddings |
| GET | `/api/public/system` | No auth: `{ "system_name" }` trimmed from DB (may be `""`; SPA shows `openKMS` when empty after load) |
| GET | `/api/public/settings` | Authenticated `console:settings` (or admin): `system_name`, `default_timezone`, `api_base_url_note` |
| PUT | `/api/public/settings` | Authenticated `console:settings` (or admin): update system-wide display settings |
| POST | `/api/auth/register` | Local mode only: create user, returns JWT + user |
| POST | `/api/auth/login` | Local mode only: body `{ "login", "password" }` — `login` is username or email; returns JWT + user |
| GET | `/api/auth/me` | Current user from Bearer, session, (local) CLI Basic, or **personal API key** (`okms.*`); includes `permissions` (resolved keys) and optional `ui_locale` (`en` \| `zh-CN`) from `user_preferences` |
| PATCH | `/api/auth/me` | Authenticated user: body `{ "ui_locale": "en" \| "zh-CN" }` — save SPA display language to `user_preferences` (keyed by JWT `sub`; local and OIDC) |
| POST | `/api/auth/api-keys` | Authenticated user: create personal API key; response includes plaintext `token` once |
| GET | `/api/auth/api-keys` | List caller's keys (metadata only; query `include_revoked=true` optional) |
| DELETE | `/api/auth/api-keys/{id}` | Revoke caller's key (soft) |
| GET | `/api/auth/permission-catalog` | Authenticated: list of permission entries (`key`, `label`, `description`, `frontend_route_patterns`, `backend_api_patterns`) for the Console matrix, SPA route gate, and optional strict API enforcement; optional in-process TTL cache (**`OPENKMS_PERMISSION_CATALOG_CACHE_SECONDS`**, default 5; `0` disables), cleared when admins mutate **`security_permissions`** |
| GET | `/api/admin/security-roles` | `console:permissions`: roles and permission keys (includes `all`); `is_system_role` true only for **admin** (cannot delete) |
| POST | `/api/admin/security-roles` | `console:permissions`: create role; reserved names `admin` / `member` rejected |
| DELETE | `/api/admin/security-roles/{role_id}` | `console:permissions`: delete role (**admin** role rejected) |
| PUT | `/api/admin/security-roles/{role_id}/permissions` | `console:permissions`: replace keys (each must exist in `security_permissions`); cannot drop sole `all` without adding another permission first (see Permissions page) |
| GET | `/api/admin/health-status` | `console:access`: dependency checks (API, database, object storage, job queue, **Langfuse** public health when `LANGFUSE_BASE_URL` is set and `LANGFUSE_HEALTHCHECK` is true); probes registered data sources when caller has `console:data_sources` |
| GET | `/api/admin/permission-reference` | `console:permissions`: frontend feature path patterns + full OpenAPI operation list (method, path, summary, tags) to help configure `security_permissions` |
| GET | `/api/admin/security-permissions` | `console:permissions`: paginated catalog (`items`, `total`, `limit`, `offset`; query `search`, `category`) |
| GET | `/api/admin/security-permissions/keys` | `console:permissions`: all catalog keys (for onboarding / hint diff) |
| POST | `/api/admin/security-permissions` | `console:permissions`: create catalog row |
| PATCH | `/api/admin/security-permissions/{id}` | `console:permissions`: update label, description, patterns, sort_order (built-in `all` row rejected) |
| DELETE | `/api/admin/security-permissions/{id}` | `console:permissions`: delete row (`all` and keys still assigned to roles are rejected) |
| GET/POST | `/api/admin/groups` | `console:groups`: paginated list (`items`, `total`, `limit`, `offset`; query `search`) or create group (`member_count`, `shared_resource_count` on each item) |
| GET/PATCH/DELETE | `/api/admin/groups/{id}` | `console:groups`: get/update/delete group (includes counts) |
| GET | `/api/admin/groups/{id}/member-subjects` | `console:groups`: all member subject ids (for full membership state) |
| GET/PUT | `/api/admin/groups/{id}/members` | `console:groups`: paginated member list (`limit`, `offset`) or replace all members (`subjects`) |
| GET | `/api/admin/groups/{id}/shared-resources` | `console:groups`: paginated ACL grants for this group (`items`, `total`, `limit`, `offset`) |
| GET/PUT | `/api/admin/groups/{id}/scopes` | **Deprecated** — `PUT` returns **410**; use resource ACL sharing |
| GET | `/api/admin/resource-acl/issues` | `console:groups`: ACL issue summary (`issue_count`, `by_issue`) when called without query params |
| GET | `/api/admin/resource-acl/issues?issue={code}&limit=&offset=` | `console:groups`: paginated items for one issue code (`others_manage`, `others_write`, `unknown_group`, `empty_group`, `unknown_owner`, `missing_owner`, `owner_no_permissions`, `owner_no_manage`, `implicit_others`, `others_read`); response includes `total`, `limit`, `offset`, refreshed `by_issue` |
| GET/PUT | `/api/admin/resource-acl/{resource_type}/{resource_id}` | `console:groups`: read/replace sharing on any resource without requiring data read/manage on that resource (Console audit) |
| GET | `/api/admin/resource-acl/{resource_type}/{resource_id}/owner-candidates` | `console:groups`: local auth user list for owner picker in Console audit |
| GET/PUT | `/api/resource-acl/{resource_type}/{resource_id}` | Authenticated: get/replace sharing grants (r/w/m) on a securable resource. Response includes `created_by` (document/article channels, wiki spaces, knowledge bases), `owner_subject`, `owner_label`; when no owner ACL exists but `created_by` is set, GET returns a default owner grant (rwm) for the creator. PUT preserves owner when omitted; if none exists, defaults owner to `created_by` when set. |
| GET | `/api/resource-acl/{resource_type}/{resource_id}/owner-candidates` | Requires **manage** on the resource. Returns `{subject, label}` for owner assignment: local auth lists DB users; OIDC lists API-key identities, mapped local users, and access-group member subjects. |
| POST | `/api/auth/logout` | Clear server session |
| POST | `/api/auth/sync-session` | Sync frontend JWT to backend session (Bearer required) |
| POST | `/api/auth/clear-session` | Clear backend session (called before logout) |
| GET | `/api/auth/logout` | Clear session; OIDC: redirect to IdP logout; local: redirect to frontend |
| GET | `/api/home/hub` | Authenticated landing-screen payload: optional **`knowledge_map`** `{ node_count, link_count }`, **`knowledge_map_tree`**, **`resource_links`**, **`map_html_status`**, **`resource_labels`** when the user has **knowledge_map:read**; **`work_items`** (document relationship queue); **`recent_comments`** (latest comments on resources the user owns — Sharing Owner, including inherited channel ACL); **`share_requests`** (placeholder) |
| GET | `/api/search` | Authenticated unified metadata search: query `q`, `types` (`all` or comma-list: `documents`, `articles`, `wiki_spaces`, `knowledge_bases`), optional `document_channel_id`, `article_channel_id`, `updated_after` / `updated_before` (ISO 8601), `limit` (1–100, default 30). Returns sections with `items` (`id`, `name`, `title`, `kind`, `url_path`, `channel_id`, `channel_name`, `updated_at`) and `total` per type; types the user cannot read are empty; **403** if none of the requested types are allowed; **404** if a channel id is unknown. Scoped like list APIs (documents, articles, wiki spaces, KB visibility). **`wiki_spaces`** items use **`url_path`** **`/wikis/{id}/pages/graph`**. |
| HEAD | `/api/search` | Same auth / permission overlap check as GET; no JSON body |
| GET | `/api/providers/{id}/models` | Authenticated: list models registered under this provider |
| GET | `/api/admin/users` | `console:users`: auth mode, IdP notice, `users` (local accounts or OIDC sign-in directory) |
| POST | `/api/admin/users` | `console:users`, **local** only: create user (`email`, `username`, `password`, `is_admin`) |
| PATCH | `/api/admin/users/{id}` | `console:users`, **local** only: set `is_admin` (syncs security roles) |
| DELETE | `/api/admin/users/{id}` | `console:users`, **local** only: delete user |

## Documents

The bundled **openkms-skill** CLI wraps **lifecycle** and **relationships** the same way as the document detail page: `documents lifecycle patch`, `documents relationships list|create|delete` (see `openkms-skill/reference.md`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/document-channels` | List document channels (tree). Query: `limit` (default 200, max 500), `offset` — paginates **root** channels; each page includes full subtrees. Response: `{ items, total, limit, offset }` |
| GET | `/api/document-channels/{id}` | Get channel by ID (includes label_config, extraction_schema) |
| POST | `/api/document-channels` | Create channel |
| PUT | `/api/document-channels/{id}` | Update channel (name, description, parent_id, pipeline_id, auto_process, extraction_model_id, extraction_schema, label_config, object_type_extraction_max_instances) |
| POST | `/api/document-channels/{id}/reorder` | Move channel up or down among siblings (body: `{ direction: "up" \| "down" }`) |
| POST | `/api/document-channels/merge` | Merge source channel into target (move documents, delete source; optional include_descendants) |
| DELETE | `/api/document-channels/{id}` | Delete channel (fails if has documents or sub-channels) |
| POST | `/api/documents/upload` | Multipart: `file`, `channel_id`. Stores original to S3. **XLSX**: sheet preview + markdown in-process, `completed` or `failed` (no parse job). **XMIND**: outline markdown from archive `content.json` / `content.xml`, `completed` or `failed` (no parse job). **Other types** (PDF, images, DOCX, PPTX, EPUB, …): `uploaded`; if channel `auto_process` and pipeline, enqueues `run_pipeline` (not for XLSX/XMIND) |
| GET | `/api/documents?channel_id=&search=&status=&applicable=&offset=&limit=` | List documents; channel_id optional (all if omitted, descendants included when filtering by channel); search filters by name; **status** filters by processing status (`uploaded`, `pending`, `running`, `completed`, `failed`); **applicable** (`true` / `false`) filters by lifecycle-derived applicability (`is_current_for_rag`); offset/limit for pagination. Returns lightweight list items only (no `markdown`, `parsing_result`, or `metadata`) |
| GET | `/api/documents/stats` | Get document counts (e.g. total) for index page |
| GET | `/api/documents/{id}` | Get document by ID |
| PUT | `/api/documents/{id}` | Update document info (name, channel_id) |
| GET | `/api/documents/{id}/parsing` | Get parsing result (result.json) |
| GET | `/api/documents/{id}/files/{file_hash}/{path}` | Redirect to presigned S3 URL via frontend proxy; `?url_only=true` returns `{ "url": "..." }` JSON (for authenticated downloads without following redirects in `fetch`) |
| DELETE | `/api/documents/{id}` | Delete document and its storage files |
| POST | `/api/documents/{id}/reset-status` | Reset processing status to **uploaded** when status is `pending`, `failed`, `completed`, or `running` (rejects if active jobs exist) |
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
| GET | `/api/pipelines` | List pipeline configurations (`limit`, `offset`; default limit 50, max 200) |
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
| GET | `/api/models` | List models (optional `?api_kind=`, `?capability=`, `?provider_id=`, `?search=`) |
| GET | `/api/models/api-kinds` | List API kinds (`chat-completions`, `embeddings`, `custom`) |
| GET | `/api/models/capabilities` | List known capability tags |
| POST | `/api/models` | Create model (provider_id, name, api_kind, capabilities[], model_name) |
| GET | `/api/models/{id}` | Get model detail |
| PUT | `/api/models/{id}` | Update model |
| DELETE | `/api/models/{id}` | Delete model |
| POST | `/api/models/{id}/test` | Test model (proxies to provider; chat-completions with optional vision image) |
| GET | `/api/jobs` | List job runs (`items`, `total`, `limit`, `offset`; optional `?document_id=`, `?knowledge_base_id=`, `?connector_id=`, `?status=`, `?search=`, `?limit=`, `?offset=`) |
| GET | `/api/jobs/{id}` | Get job run detail (includes `events`, and when the worker persisted output: `worker_log` merged command/stderr/stdout as plain text, `worker_log_truncated`, `worker_log_char_limit`; list endpoint omits log fields) |
| POST | `/api/jobs` | Queue processing run (`{ document_id, pipeline_id?, force_reparse? }`). **`force_reparse`** (default `false`): for pipeline document types, if storage already has `{file_hash}/result.json` from a prior successful parse, the worker reuses it and skips VLM (set `true` to always run the CLI). **`.xlsx`**: defers `run_spreadsheet_preview` (no `pipeline_id`; `force_reparse` ignored). **`.xmind`**: defers `run_mindmap_preview` (no `pipeline_id`; `force_reparse` ignored). **Other extensions**: requires channel or body `pipeline_id`; defers `run_pipeline` |
| POST | `/api/jobs/{id}/retry` | Retry a failed run; **`run_pipeline`** retries always set **`force_reparse`** so the VLM CLI runs again; **`run_kb_index`** re-queues the same **`knowledge_base_id`**; **`run_connector_sync`** re-queues the same **`connector_id`** (and **`start_date`** / **`end_date`** when present) |
| POST | `/api/jobs/{id}/mark-failed` | Mark a pending or running run failed when the worker stopped without finishing; reconciles linked document processing status from all runs for that document (does not downgrade `completed` when a later run succeeded) |
| DELETE | `/api/jobs/{id}` | Delete a run (not running) |

## Knowledge bases

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/knowledge-bases` | List knowledge bases |
| POST | `/api/knowledge-bases` | Create knowledge base |
| GET | `/api/knowledge-bases/{id}` | Get KB with stats |
| PUT | `/api/knowledge-bases/{id}` | Update KB (name, description, agent_url, chunk_config, embedding_model_id, faq_prompt, metadata_keys) |
| POST | `/api/knowledge-bases/{id}/index-job` | Queue **`run_kb_index`** worker job (openkms-cli kb-index); returns **`JobResponse`**; requires **`embedding_model_id`** on the KB |
| POST | `/api/knowledge-bases/{id}/wiki-spaces/{wiki_space_id}/index-job` | Queue **`run_kb_wiki_space_index`** for one linked wiki space (replaces that space’s wiki chunks; one page per chunk when ≤ 8000 chars); returns **`JobResponse`** |
| DELETE | `/api/knowledge-bases/{id}` | Delete KB (cascades documents, FAQs, chunks) |
| GET | `/api/knowledge-bases/{id}/documents` | Paginated list of documents in KB (`?offset=`, `limit` 1–200) |
| POST | `/api/knowledge-bases/{id}/documents` | Add document to KB |
| DELETE | `/api/knowledge-bases/{id}/documents/{doc_id}` | Remove document from KB |
| GET | `/api/knowledge-bases/{id}/wiki-spaces` | List wiki spaces linked to the KB (for RAG indexing) |
| POST | `/api/knowledge-bases/{id}/wiki-spaces` | Link a wiki space (`{ "wiki_space_id": "…" }`); pages are included on next `kb-index` |
| DELETE | `/api/knowledge-bases/{id}/wiki-spaces/{wiki_space_id}` | Unlink wiki space and delete KB chunks whose `wiki_page_id` belongs to that space |
| GET | `/api/knowledge-bases/{id}/wiki-pages-for-index` | Paginated wiki pages with body from linked spaces (`?offset=`, `limit` 1–500); used by `kb-index` |
| GET | `/api/knowledge-bases/{id}/faqs` | List FAQs (paginated; ?offset=, ?limit=, ?current_for_rag_only=) |
| POST | `/api/knowledge-bases/{id}/faqs` | Create FAQ |
| POST | `/api/knowledge-bases/{id}/faqs/polish` | Polish a draft FAQ answer with the KB judge model (preview only; body: `question`, `answer`) |
| PUT | `/api/knowledge-bases/{id}/faqs/{faq_id}` | Update FAQ |
| DELETE | `/api/knowledge-bases/{id}/faqs/{faq_id}` | Delete FAQ |
| POST | `/api/knowledge-bases/{id}/faqs/generate` | Generate FAQ preview from documents via LLM (no DB save) |
| POST | `/api/knowledge-bases/{id}/faqs/batch` | Save selected FAQ pairs to KB |
| GET | `/api/knowledge-bases/{id}/chunks` | List chunks (paginated; ?offset=, ?limit=, ?current_for_rag_only=) |
| GET | `/api/knowledge-bases/{id}/chunks/{chunk_id}` | Get one chunk (same shape as list rows; for deep links from Q&A / search) |
| PUT | `/api/knowledge-bases/{id}/chunks/{chunk_id}` | Update chunk (`content`, `doc_metadata`). If **`content`** changes, the stored **embedding is cleared** until the next indexing job refreshes vectors |
| DELETE | `/api/knowledge-bases/{id}/chunks` | Delete all chunks |
| POST | `/api/knowledge-bases/{id}/chunks/batch` | Bulk create chunks with embeddings (kb-index); each item sets exactly one of `document_id` or `wiki_page_id` |
| PUT | `/api/knowledge-bases/{id}/faqs/batch-embeddings` | Bulk update FAQ embeddings (kb-index pipeline) |
| POST | `/api/knowledge-bases/{id}/search` | Semantic / hybrid search over chunks (documents + linked wiki pages) and FAQs; chunk hits may include `wiki_page_id`, `wiki_space_id`. Response **`results[]`** items may include optional operator fields: **`chunk_index`** (ordinal within the source document or wiki page for chunk hits), **`retrieval_mode`** (`dense`, `hybrid`, `bm25_only`, `dense_fallback`), **`retrieval_debug`** (stage ranks/scores, e.g. `dense_rank`, `dense_similarity`, `bm25_rank`, `bm25_score`, `rrf_score`, `rerank_score`, `pipeline_stages`). **`force_dense`** in the body skips the hybrid QA-agent path when the KB has an agent URL |
| POST | `/api/knowledge-bases/{id}/ask` | Proxy to QA agent (JSON: `question`, `conversation_history`, optional `session_id` opaque string forwarded as Langfuse **session** id) |
| POST | `/api/knowledge-bases/{id}/ask/stream` | Same body; NDJSON stream then `done` with `sources`: hybrid hits unless Page Index **`document_section`** applies, or successful **`run_cypher_tool`** returned graph rows — then **`ontology`** rows (object type list + per-query Cypher summary). Optional `error` {`detail`, `answer?`} |
| GET | `/api/knowledge-bases/{id}/agent-conversations` | List the current user's persisted KB Q&A chats (`agent_conversations` with `surface=knowledge_base` and matching `context.knowledge_base_id`; KB visibility rules) |
| POST | `/api/knowledge-bases/{id}/agent-conversations` | Create chat (optional JSON `{ "title"?: string }`) |
| DELETE | `/api/knowledge-bases/{id}/agent-conversations/{conversation_id}` | Delete chat (cascades messages) |
| PATCH | `/api/knowledge-bases/{id}/agent-conversations/{conversation_id}` | Update chat title |
| GET | `/api/knowledge-bases/{id}/agent-conversations/{conversation_id}/messages` | Paginated messages: query **`limit`** (default 100, max 500), **`offset`**; JSON **`{ items, total, limit, offset }`**. Requires **`knowledge_bases:read`** and KB visibility (same as other KB routes). |
| DELETE | `/api/knowledge-bases/{id}/agent-conversations/{conversation_id}/messages/from/{message_id}` | Delete this message and all later messages (same semantics as wiki copilot regenerate) |
| POST | `/api/knowledge-bases/{id}/agent-conversations/{conversation_id}/messages` | Send a user turn: JSON `content`, `stream` (boolean), optional `session_id`. **`stream: true`** → **`application/x-ndjson`**: `user` (persisted row), forwarded `delta` / `tool_*`, then **`done`** with `answer`, `sources`, `user`, `message` (persisted assistant row). If the upstream stream closes without a terminal **`done`** line but partial text or tool rows were received, the backend still persists a **`done`**-shaped reply with optional **`stream_ended_without_agent_done`: true**. Requires **`knowledge_bases:read`**. Persists tool transcripts (`wiki_tool_traces_v1`), interleaved stream parts (`wiki_assistant_stream_parts_v1` on `tool_calls` for UI replay), and references (`kb_qa_sources_v1`) |
| GET | `/api/knowledge-bases/{id}/faq-assist-conversations` | Same as **`…/agent-conversations`** but threads use **`surface=kb_faq`** (FAQ-assist / exploratory notes against the same qa-agent) |
| POST | `/api/knowledge-bases/{id}/faq-assist-conversations` | Create FAQ-assist chat |
| DELETE | `/api/knowledge-bases/{id}/faq-assist-conversations/{conversation_id}` | Delete FAQ-assist chat |
| PATCH | `/api/knowledge-bases/{id}/faq-assist-conversations/{conversation_id}` | Update title |
| GET | `/api/knowledge-bases/{id}/faq-assist-conversations/{conversation_id}/messages` | Paginated messages (same as KB Q&A list) |
| DELETE | `/api/knowledge-bases/{id}/faq-assist-conversations/{conversation_id}/messages/from/{message_id}` | Truncate from message |
| POST | `/api/knowledge-bases/{id}/faq-assist-conversations/{conversation_id}/messages` | Same streaming contract as KB **`agent-conversations`** POST |

## Evaluation

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/evaluations` | List evaluations (optional ?knowledge_base_id=); filtered by read ACL |
| POST | `/api/evaluations` | Create evaluation (body: `name`, `knowledge_base_id`, optional `wiki_space_id`, optional `description`); bootstraps owner ACL |
| GET | `/api/evaluations/{id}` | Get evaluation (read ACL) |
| PUT | `/api/evaluations/{id}` | Update evaluation (write ACL) |
| DELETE | `/api/evaluations/{id}` | Delete evaluation (manage ACL) |
| GET | `/api/evaluations/{id}/items` | List evaluation items (`offset`, `limit` default 10 max 200; response `{ items, total }`) |
| POST | `/api/evaluations/{id}/items` | Add evaluation item (`query`, `expected_answer`, optional `topic`, optional `sort_order`) |
| POST | `/api/evaluations/{id}/items/import` | Import items from CSV (multipart file; columns: topic, query, answer or expected_answer) |
| PUT | `/api/evaluations/{id}/items/{item_id}` | Update evaluation item |
| DELETE | `/api/evaluations/{id}/items/{item_id}` | Delete evaluation item |
| POST | `/api/evaluations/{id}/run` | Run evaluation; body `{ evaluation_type?: "search_retrieval" \| "qa_answer" \| "wiki_content_coverage" }`; **`wiki_content_coverage`** requires `wiki_space_id` on the evaluation; persists run + per-item results |
| GET | `/api/evaluations/{id}/runs` | List saved runs (`offset`, `limit`) |
| GET | `/api/evaluations/{id}/runs/{run_id}` | Full run with item results |
| DELETE | `/api/evaluations/{id}/runs/{run_id}` | Remove a saved run (cascades `evaluation_run_items`) |
| GET | `/api/evaluations/{id}/runs/compare` | Compare two runs (`run_a`, `run_b` query params) |
| GET | `/api/evaluations/{id}/agent-conversations` | List persisted assistant chats for this evaluation (`surface=evaluation`; same message/stream contract as KB Q&A; requires auth + evaluation scope; linked KB must have **`agent_url`**) |
| POST | `/api/evaluations/{id}/agent-conversations` | Create chat (optional `{ "title" }`) |
| DELETE | `/api/evaluations/{id}/agent-conversations/{conversation_id}` | Delete chat |
| PATCH | `/api/evaluations/{id}/agent-conversations/{conversation_id}` | Update title |
| GET | `/api/evaluations/{id}/agent-conversations/{conversation_id}/messages` | Paginated messages (`limit` default 100 max 500, `offset`) → `{ items, total, limit, offset }` |
| DELETE | `/api/evaluations/{id}/agent-conversations/{conversation_id}/messages/from/{message_id}` | Truncate from message |
| POST | `/api/evaluations/{id}/agent-conversations/{conversation_id}/messages` | Same body/stream behavior as **`POST /api/knowledge-bases/.../agent-conversations/.../messages`** (proxies to that KB’s qa-agent) |

## Glossaries

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/glossaries` | List glossaries (read ACL filter) |
| POST | `/api/glossaries` | Create glossary; bootstraps owner ACL |
| GET | `/api/glossaries/{id}` | Get glossary with term count (read ACL) |
| PUT | `/api/glossaries/{id}` | Update glossary (write ACL) |
| DELETE | `/api/glossaries/{id}` | Delete glossary (manage ACL; cascades terms) |
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
| GET | `/api/object-types` | List object types (authenticated, read ACL); ?count_from_neo4j=true for instance_count from Neo4j |
| POST | `/api/object-types` | Create object type (admin-only); bootstraps owner ACL |
| GET | `/api/object-types/{id}` | Get object type; ?count_from_neo4j=true for instance_count from Neo4j |
| PUT | `/api/object-types/{id}` | Update object type (admin-only) |
| DELETE | `/api/object-types/{id}` | Delete object type (admin-only) |
| GET | `/api/object-types/{id}/objects` | List object instances (read ACL on parent type; from Neo4j when available; optional ?search=, ?limit=, ?offset=) |
| POST | `/api/object-types/{id}/objects` | Create object instance (admin-only + write ACL on parent type) |
| GET | `/api/object-types/{id}/objects/{obj_id}` | Get object instance (read ACL on parent type) |
| PUT | `/api/object-types/{id}/objects/{obj_id}` | Update object instance (admin-only + write ACL on parent type) |
| DELETE | `/api/object-types/{id}/objects/{obj_id}` | Delete object instance (admin-only + write ACL on parent type) |
| POST | `/api/object-types/index-to-neo4j` | Index object types that have a linked dataset or stored instances to Neo4j as nodes (admin-only; body: neo4j_data_source_id) |
| POST | `/api/object-types/{id}/index-to-neo4j` | Index one object type to Neo4j from its dataset, or from `object_instances` when there is no dataset (admin-only; body: neo4j_data_source_id; 400 if neither applies) |
| GET | `/api/link-types` | List link types (authenticated); ?count_from_neo4j=true for link_count from Neo4j |
| POST | `/api/link-types` | Create link type (admin-only) |
| GET | `/api/link-types/{id}` | Get link type; ?count_from_neo4j=true for link_count from Neo4j |
| PUT | `/api/link-types/{id}` | Update link type (admin-only) |
| DELETE | `/api/link-types/{id}` | Delete link type (admin-only) |
| GET | `/api/link-types/{id}/links` | List link instances (from Neo4j when available; ?limit=, ?offset=) |
| POST | `/api/link-types/{id}/links` | Create link instance (admin-only; rejected when link type uses junction dataset) |
| DELETE | `/api/link-types/{id}/links/{link_id}` | Delete link instance (admin-only; rejected when link type uses junction dataset) |
| POST | `/api/link-types/index-to-neo4j` | Index link types to Neo4j: M:M junction, M:1/1:M from source dataset when configured, else saved link instances (admin-only) |
| POST | `/api/link-types/{id}/index-to-neo4j` | Index one link type to Neo4j (same rules as bulk; 400 if nothing to index) (admin-only) |
| POST | `/api/ontology/explore` | Execute read-only Cypher query against Neo4j (body: `{ cypher }`); used by Object Explorer |
| GET | `/api/data-sources` | List data sources (`limit`, `offset`; `console:data_sources`) |
| POST | `/api/data-sources` | Create data source (`console:data_sources`) |
| GET | `/api/data-sources/{id}` | Get data source (`console:data_sources`) |
| PUT | `/api/data-sources/{id}` | Update data source (`console:data_sources`) |
| DELETE | `/api/data-sources/{id}` | Delete data source (`console:data_sources`) |
| POST | `/api/data-sources/{id}/test` | Test connection (`console:data_sources`) |
| POST | `/api/data-sources/{id}/neo4j-delete-all` | Delete all nodes and relationships in Neo4j (`console:data_sources`, Neo4j only) |

### Connectors (`connectors:read` / `connectors:write`)

**Auth:** `GET` / `HEAD` on `/api/connectors` and `/api/connectors/*` require **`connectors:read`** or **`connectors:write`**. `POST`, `PUT`, and `DELETE` require **`connectors:write`**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/connectors/kinds` | List connector kinds (`category`: `sync` \| `search_tool`), **input fields**, **output slots** (sync only; each slot may include `dataset_schema`, `default_pg_schema`, `default_table_name`), **output_schema** (search_tool), secret key names; optional `?category=` |
| GET | `/api/connectors` | List connector instances; optional `?category=` |
| POST | `/api/connectors/provision-dataset` | Create a PostgreSQL table matching a sync slot schema and register a **Dataset** row (`body`: `kind`, `slot`, `data_source_id`, optional `schema_name`, `table_name`, `display_name`); requires **`connectors:write`** and **`console:datasets`** |
| POST | `/api/connectors` | Create connector: **sync** kinds require `outputs` (slot → dataset id); bound datasets must match the slot `dataset_schema` when defined; **search_tool** kinds omit `outputs` |
| GET | `/api/connectors/{id}` | Get one connector (`sync_schedule` for sync kinds: `enabled`, `cron`, `timezone` from settings; `next_run_at`, `last_run_at`, `last_status`, `last_job_id` from central `scheduled_triggers` registry) |
| POST | `/api/connectors/{id}/sync` | Queue a **sync** connector job (`run_connector_sync`); returns `{ job_id }` (202). Body optional: `{ start_date, end_date }` (ISO dates, inclusive). **Manual:** pass both dates. **No dates:** each connector kind resolves its own default window (Tushare: incremental daily from last row through today). **Tushare** output slots (schema `tushare`): `trade_calendar`, `stock_basic` (one `stock_basic` call per sync), `stock_trade_daily` (daily OHLCV), `daily_basic` (valuation/liquidity metrics), `stock_adj_daily` (`adj_factor`), `dividends` (`dividend` by `ex_date`); respects `settings.sync_api_min_interval_seconds` and `sync_trade_cal_min_interval_seconds` (default **0.31** s ≈ 200 req/min); skips `trade_cal` when the calendar table already spans the window; on rate limits, short waits retry in-process and longer waits re-queue with `scheduled_at` |
| POST | `/api/connectors/{id}/search` | Run **search_tool** connector (`body`: `{ "query": "…", "params"?: { … } }` one-shot input overrides for playground); returns normalized `{ query, search_intent?, results[], debug? }` (`debug`: endpoint, request body, raw provider JSON) |
| POST | `/api/connectors/{id}/probe` | **Tushare only:** live **daily** (历史日线) probe from the detail **Probe** tab (`body`: `{ "api_name"?: "daily", "ts_code"?, "trade_date"?, "start_date"?, "end_date"?, "limit"?, "offset"? }` — at least one of the date/code filters required); returns `{ api_name, params, row_count, truncated, rows[], debug? }` (`debug.endpoint`: connector `api_base_url`, default `https://api.tushare.pro`); no dataset writes; **429** when rate-limited |
| PUT | `/api/connectors/{id}` | Update connector; replace `inputs` / `outputs` / `settings` when provided (output datasets validated against slot schema; **sync** `settings.sync_schedule` write-through to `scheduled_triggers`); merge `secrets` or send `{}` to clear secrets |
| DELETE | `/api/connectors/{id}` | Delete connector and its `scheduled_triggers` row |
| GET | `/api/schedules` | List central schedule registry (`limit`, `offset`; default 25, max 200); returns `items`, `total`, `limit`, `offset`. Permissions: `connectors:read/write` or `projects:read/write`; rows include `connector_id`, `project_id`, `mode` when applicable |
| PATCH | `/api/schedules/{id}` | Update schedule (`enabled`, `cron`, `timezone`; agent kinds also `prompt`); sync kinds mirror `settings.sync_schedule` on the connector (`connectors:write` or `projects:write`) |
| POST | `/api/schedules/{id}/run-now` | Queue the scheduled target now (`run_connector_sync` or `run_scheduled_project_agent`); returns `{ job_id }` (202) |
| POST | `/internal-api/process-heartbeat` | **Internal service client only**; worker/scheduler liveness (`role`, `instance_id`); in-memory registry for Console health (no history table) |
| GET | `/api/datasets` | List datasets (`console:datasets` or `ontology:read`; filtered by dataset ACL) |
| GET | `/api/datasets/from-source/{id}` | List tables from PostgreSQL data source (`console:datasets`) |
| POST | `/api/datasets` | Create dataset (`console:datasets`) |
| GET | `/api/datasets/{id}` | Get dataset (`console:datasets` or `ontology:read`; dataset ACL) |
| GET | `/api/datasets/{id}/rows` | Get paginated rows (`console:datasets` or `ontology:read`; dataset ACL) |
| GET | `/api/datasets/{id}/metadata` | Column metadata (`console:datasets` or `ontology:read`; dataset ACL) |
| PUT | `/api/datasets/{id}` | Update dataset (`console:datasets`; write on dataset) |
| DELETE | `/api/datasets/{id}` | Delete dataset (`console:datasets`; manage on dataset) |

## Feature toggles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/feature-toggles` | Get feature toggle state (`evaluations`, `connectors`, `agents`, `media`, `hasNeo4jDataSource`; authenticated) |
| PUT | `/api/feature-toggles` | Update feature toggles (admin-only) |

### Console object storage

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/console/storage` | Bucket name and whether storage is configured (`console:storage`) |
| GET | `/api/console/storage/objects` | Paginated listing: `prefix`, `continuation_token`, `max_keys` (metadata only) |
| POST | `/api/console/storage/folders` | Create folder placeholder under `parent_prefix` + `name` |
| POST | `/api/console/storage/move` | Copy (and optionally delete) selected prefixes or objects to `destination_prefix` |

## Articles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/article-channels` | List article channels (tree). Query: `limit`, `offset` (root pagination + subtrees; same shape as document channels) |
| GET | `/api/article-channels/{id}` | Get channel by ID |
| POST | `/api/article-channels` | Create channel |
| PUT | `/api/article-channels/{id}` | Update channel (name, description, parent_id, `review_model_id`, `review_prompt`, `review_criteria`) |
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
| POST | `/api/articles/{id}/review` | Run LLM rubric review (channel `review_model_id` / `review_prompt` / `review_criteria`; optional body `model_id`, `prompt`); persists to `article_reviews` |
| GET | `/api/articles/{id}/reviews` | List recent reviews (`limit` 1–50) |
| GET | `/api/articles/{id}/reviews/latest` | Latest review (`result`: `overall_score`, `pass`, `summary`, `criteria[]`, `suggestions[]`); 404 if none |
| GET | `/api/articles/{id}/attachments` | List attachments for an article |
| POST | `/api/articles/{id}/attachments` | Upload attachment (multipart) |
| DELETE | `/api/articles/{id}/attachments/{attachment_id}` | Delete attachment from MinIO + DB |
| POST | `/api/articles/{id}/images` | Upload an image into the article bundle (used by paste / drag-and-drop in the editor) |
| GET | `/api/articles/{id}/files/{path}` | Stream an image or attachment from the article's MinIO bundle |
| GET | `/api/articles/{id}/versions` | List versions (metadata only) |
| POST | `/api/articles/{id}/versions` | Create explicit version (snapshot of current markdown + metadata) |
| GET | `/api/articles/{id}/versions/{version_id}` | Full version snapshot |
| POST | `/api/articles/{id}/versions/{version_id}/restore` | Restore working copy from version |

## Comments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/comments` | List comments for a resource. Query: `resource_type` (`article` \| `document` \| `knowledge_base` \| `wiki_space` \| `project`), `resource_id`, `limit`, `offset`. Returns nested top-level items with `replies[]`, plus `total`, `avg_rank`, `rank_count` |
| POST | `/api/comments` | Create top-level comment: `resource_type`, `resource_id`, `body`, `rank` (0–5, required) |
| POST | `/api/comments/{id}/replies` | Reply to a top-level comment: `body` only |
| PATCH | `/api/comments/{id}` | Author update: `body`; top-level may also update `rank` |
| DELETE | `/api/comments/{id}` | Author delete (cascades replies when top-level) |

## Wiki spaces

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/wiki-spaces` | List wiki spaces (`limit`, `offset`; ACL-filtered) |
| POST | `/api/wiki-spaces` | Create wiki space |
| GET | `/api/wiki-spaces/{id}` | Get wiki space |
| PATCH | `/api/wiki-spaces/{id}` | Update wiki space (`name`, `description`, optional `semantic_similarity_threshold` 0–1, `semantic_match_top_k` integer ≥ 1, `semantic_embedding_model_id` embedding ApiModel id or `null` to clear) |
| POST | `/api/wiki-spaces/{id}/semantic-index` | Offline: embed all pages using the space’s configured embedding model when set, otherwise the **global default** embedding ApiModel (`wikis:write`); sets `last_semantic_index_at` on success; returns `{ indexed, failed, embedding_model_id, embedding_model_label }`; **503** if PostgreSQL cannot persist `vector` columns (pgvector not installed / `$libdir/vector` missing) |
| DELETE | `/api/wiki-spaces/{id}` | Delete wiki space (cascades pages, files, document links) |
| GET | `/api/wiki-spaces/{id}/graph` | Wiki page graph (nodes + edges) for the navigator |
| GET | `/api/wiki-spaces/{id}/pages` | List pages (paginated). Each item is metadata only (**no** `body` — avoids large payloads; use `GET .../pages/{page_id}` for markdown). Optional `path_prefix`, `limit` (1–500), `offset` (`wikis:read`) |
| GET | `/api/wiki-spaces/{id}/pages/semantic-matches` | Match for `q` with **short-circuit**: if string (title/path) matches are non-empty, only those are returned; else **`semantic_matched_pages`** when the space has **indexed embeddings** (`{ page_id, similarity }`, ordered by similarity). Uses the space’s **`semantic_similarity_threshold`**, **`semantic_match_top_k`** (optional query `top_k` overrides the cap), and the same embedding model family as indexing (`WikiPage.embedding_model_id` matches the resolved model). If **no** pages in the space have embeddings, only string matching applies (empty semantic list, `semantic_skipped` false). Query params: `text_match_limit`, optional `top_k` (`wikis:read`) |
| POST | `/api/wiki-spaces/{id}/pages` | Create page (`path`, `title`, optional `body`, `metadata`) |
| GET | `/api/wiki-spaces/{id}/pages/{page_id}` | Get page (with body and metadata) |
| PATCH | `/api/wiki-spaces/{id}/pages/{page_id}` | Update page (title, body, metadata) |
| DELETE | `/api/wiki-spaces/{id}/pages/{page_id}` | Delete page |
| GET | `/api/wiki-spaces/{id}/pages/by-path/{page_path:path}` | Resolve page by Obsidian-style path |
| PUT | `/api/wiki-spaces/{id}/pages/by-path/{page_path:path}` | Upsert page by path (create or update) |
| DELETE | `/api/wiki-spaces/{id}/pages/by-path/{page_path:path}` | Delete page by path |
| GET | `/api/wiki-spaces/{id}/pages/{page_id}/page-index` | PageIndex tree for in-page navigation |
| GET | `/api/wiki-spaces/{id}/files` | List **stored files** for the space (`wiki_files`): vault mirror paths (including **`.md`**), ad-hoc uploads, etc. |
| POST | `/api/wiki-spaces/{id}/files` | Upload file (multipart); vault-relative filename → mirror under `wiki/{id}/vault/…`, else `wiki/{id}/files/{file_id}/…` |
| GET | `/api/wiki-spaces/{id}/files/{file_id}/content` | Redirect to presigned object URL |
| DELETE | `/api/wiki-spaces/{id}/files/{file_id}` | Delete one **stored file** row (storage + DB); may be a vault `.md`/asset or an upload — same list as GET `…/files` |
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
| GET | `/api/agent/conversations/{id}/messages` | Paginated messages: query **`limit`** (default 100, max 500), **`offset`**; JSON **`{ items, total, limit, offset }`**. Requires **`wikis:read`** and wiki space scope. |
| POST | `/api/agent/conversations/{id}/messages` | Send a user message (`content`, optional `stream`, optional `session_id` for Langfuse grouping on the embedded wiki agent). **`stream: true`** → **`application/x-ndjson`** lines: `user`, `delta`, `tool_*`, `done` / `error`; **`stream: false`** → JSON with user + assistant messages |
| DELETE | `/api/agent/conversations/{id}/messages/from/{message_id}` | Delete this message and everything after it (used by "regenerate") |

## Projects (Agents workspace)

Deep Agents runtime in `backend/app/services/deep_agents/`. Disk root: `OPENKMS_PROJECTS_ROOT/{project_id}/`. Permissions: `projects:read`, `projects:write`. Feature toggle: `agents`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List current user's projects (`limit`, `offset`) |
| POST | `/api/projects` | Create project (scaffolds `AGENTS.md`, `.openkms/skills/`; auto-installs skills where `agent_skills.is_default=true`) |
| GET | `/api/projects/{id}` | Get project |
| PATCH | `/api/projects/{id}` | Update name, description, slug, settings |
| DELETE | `/api/projects/{id}` | Delete project and on-disk folder |
| GET | `/api/projects/{id}/files?path=` | List directory |
| GET | `/api/projects/{id}/files/content?path=` | Read file |
| PUT | `/api/projects/{id}/files/content` | Write file |
| POST | `/api/projects/{id}/files/upload` | Upload file (multipart; optional `path` query prefix; filename may include nested relative path for folder uploads) |
| DELETE | `/api/projects/{id}/files` | Delete file or directory |
| GET | `/api/projects/{id}/skills` | Installed skills metadata from `projects.settings.installed_skills` |
| POST | `/api/projects/{id}/skills/{skill_id}/install` | Install registry version into `.openkms/skills/{skill_id}/` (body: optional `version`) |
| DELETE | `/api/projects/{id}/skills/{skill_id}` | Uninstall skill from project |
| GET/PATCH | `/api/projects/{id}/settings` | Project agent settings (web search, git identity, `installed_skills`) |
| GET/POST | `/api/projects/{id}/conversations` | List / create chat sessions (`surface=project`) |
| PATCH/DELETE | `/api/projects/{id}/conversations/{cid}` | Update title / delete session |
| POST | `/api/projects/{id}/conversations/{cid}/suggest-title` | LLM title from message history |
| GET/POST | `/api/projects/{id}/conversations/{cid}/messages` | History; POST body: `content`, optional `stream`, optional `session_id` (Langfuse session on Deep Agents), optional `mode` (`plan` \| agent). **`stream: true`** → NDJSON (`user`, `delta`, `tool_*`, `subagent_*`, `todo`, `interrupt`, **`error`**, `done`). On failure: persist assistant row + **`error`** `{ detail, message }` (HTTP **200**). Streamed assistant rows persist `tool_calls` (`wiki_tool_traces_v1`, incl. input/output) for UI replay; **`context.last_turn`** updated on the conversation |
| DELETE | `/api/projects/{id}/conversations/{cid}/messages/from/{message_id}` | Delete this message and everything after it; clears LangGraph checkpoint thread (revert / regenerate) |
| POST | `/api/projects/{id}/conversations/{cid}/messages/resume` | HITL resume (`decision`: approve/reject/edit/respond) |
| GET/POST | `/api/projects/{id}/schedules` | List / create project agent cron schedules (`projects:read` / `projects:write`); kinds `project_agent_stateless` (new session each run) or `project_agent_stateful` (fixed `conversation_id`); body: `display_name`, `mode`, `cron`, `timezone`, `prompt`, `enabled`, optional `on_run_completed` (`keep` \| `delete`, stateless only), optional `conversation_id` (stateful) |
| PATCH/DELETE | `/api/projects/{id}/schedules/{sid}` | Update prompt/cron/enabled or delete schedule |
| POST | `/api/projects/{id}/schedules/{sid}/run-now` | Queue `run_scheduled_project_agent`; returns `{ job_id }` (202) |
| POST | `/api/projects/{id}/git/init` | Local `git init` |
| GET | `/api/projects/{id}/git/status` | Porcelain status |
| GET | `/api/projects/{id}/git/log` | Recent commits |
| POST | `/api/projects/{id}/git/commit` | Commit (`message`, optional `paths`) |
| POST | `/api/projects/{id}/git/clone` | Clone HTTPS URL into empty project (requires `credential_id`) |
| POST | `/api/projects/{id}/git/remote` | Set `origin` (HTTPS only) |
| POST | `/api/projects/{id}/git/pull` | Pull (PAT via `credential_id`) |
| POST | `/api/projects/{id}/git/push` | Push (PAT via `credential_id`) |
| GET/POST/DELETE | `/api/user/git-credentials` | Manage encrypted HTTPS PATs (Profile UI) |

## Agent skills (global registry)

Disk root: `OPENKMS_AGENT_SKILLS_ROOT/{skill_id}/{version}/`. Permissions: same as projects (`projects:read` / `projects:write`). UI: **Agents → Skills**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agent-skills` | List skills and versions |
| GET | `/api/agent-skills/{skill_id}` | Get one skill and its versions |
| POST | `/api/agent-skills` | Upload skill package (multipart: `skill_id`, `version`, optional `display_name`/`notes`, and either `archive` zip or `files[]` + `relative_paths[]`) |
| PATCH | `/api/agent-skills/{skill_id}` | Update `display_name`, `is_default`, `default_version` |
| DELETE | `/api/agent-skills/{skill_id}` | Delete skill and all version files (409 if installed in a project) |
| DELETE | `/api/agent-skills/{skill_id}/versions/{version}` | Delete version (409 if default or installed in a project) |

Each `agent_skill_versions` row includes `content_hash`, `uploaded_by`, `uploaded_by_name`.

## Knowledge map

The bundled **openkms-skill** CLI exposes the same routes as the Console **Knowledge Map**: `knowledge-map nodes …` and `knowledge-map resource-links …` (see `openkms-skill/reference.md`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/knowledge-map/nodes/tree` | Full Knowledge Map tree for the navigator |
| POST | `/api/knowledge-map/nodes` | Create node (`name`, optional `parent_id`, `description`, `sort_order`) |
| PATCH | `/api/knowledge-map/nodes/{id}` | Update node (rename, move, reorder) |
| DELETE | `/api/knowledge-map/nodes/{id}` | Delete node and its subtree |
| GET | `/api/knowledge-map/resource-links` | List all resource–node mappings (filter client-side if needed) |
| PUT | `/api/knowledge-map/resource-links` | Replace the node mapping for a single resource (`resource_type`, `resource_id`, `knowledge_map_node_id`) |
| DELETE | `/api/knowledge-map/resource-links?resource_type=&resource_id=` | Unmap a resource from any node |
| GET | `/api/knowledge-map/map-html/status` | HTML overview snapshot: compares live semantic `content_hash` to stored artifact; `stale`, `has_artifact`, `nodes_modified_at` |
| GET | `/api/knowledge-map/map-html` | Cached HTML document (`text/html`) when a snapshot exists (`404` otherwise). Response applies **`ensure_spa_link_targets`** so in-app anchors get **`target="_top"`** for sandboxed Home/designer iframes (does not rewrite the stored row) |
| POST | `/api/knowledge-map/map-html/regenerate` | One-shot rebuild via LLM (`knowledge_map:write`); hydrates placeholders |
| GET | `/api/knowledge-map/map-html/designer/conversations` | List designer chats for the signed-in user (`knowledge_map:read`): `{ conversations: [{ id, title, created_at, updated_at }] }` (newest first) |
| POST | `/api/knowledge-map/map-html/designer/conversations` | Create an empty designer chat (`knowledge_map:write`; `201`, same object shape as list items) |
| GET | `/api/knowledge-map/map-html/designer/session` | Messages for one chat: query **`conversation_id`** (optional; omit = most recently updated chat). Response `{ conversation_id, messages: [{ id, role, content, created_at }] }` (`knowledge_map:read`) |
| DELETE | `/api/knowledge-map/map-html/designer/conversations/{conversation_id}` | Delete that designer chat and its messages (`knowledge_map:write`) |
| POST | `/api/knowledge-map/map-html/designer/chat` | Body `{ messages, working_html?, stream?, conversation_id? }`. Optional **`conversation_id`** must belong to the user when set; otherwise the latest designer chat is used for persistence. **`stream: false`** (default): JSON `{ content }` (full assistant text). **`stream: true`**: `application/x-ndjson` — lines are JSON objects: **`delta`** (`t` text chunk), optional **`tool_start`** / **`tool_end`**, then **`done`** (`content` full text) or **`error`** (`detail`). Same context as non-streaming; model may use **`apply_html_patches`** and/or a fenced `html` artifact. Each successful turn appends the last **user** message and full **assistant** reply to the target conversation (server-side; no migration) |
| POST | `/api/knowledge-map/map-html/preview` | Hydrate + sanitize a draft HTML string for iframe preview (`knowledge_map:write`) |
| POST | `/api/knowledge-map/map-html/publish` | Save draft as the live snapshot (`knowledge_map:write`; same finalize rules as regenerate) |
| DELETE | `/api/knowledge-map/map-html` | Remove saved map HTML row (`knowledge_map:write`) so the designer can start from scratch |
