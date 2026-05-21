# Data models

Schema for every persisted table. Grouped by area; see the matching feature page in the [Features index](../functionalities.md) for runtime semantics.

## Pipelines and models

### Pipeline

- `id`, `name`, `description`, `command` (template with `{variable}` placeholders), `default_args` (JSONB), `model_id` (FK → api_models, nullable), `created_at`, `updated_at`
- Defines how to process documents; command template resolved at runtime with variables like `{input}`, `{s3_prefix}`, `{vlm_url}`, `{model_name}`, `{bucket}`, etc.
- When linked to a model, `{vlm_url}` and `{model_name}` are resolved from the model's `base_url` and `model_name`

### ApiModel

- `id`, `name`, `provider`, `category`, `is_default_in_category` (one model per category can be default), `base_url`, `api_key` (masked in API responses), `model_name`, `config` (JSONB), `created_at`, `updated_at`
- Represents an external API endpoint (VLM, LLM, Embedding, etc.) that pipelines can reference
- Categories: `ocr`, `vl`, `llm`, `embedding`, `text-classification`

## Documents

### Document Channel

- `id`, `name`, `description`, `parent_id`, `sort_order`, `pipeline_id` (FK → pipelines), `auto_process`, `extraction_model_id` (FK → api_models), `extraction_schema` (json), `label_config` (json: array of `{key, object_type_id, display_label?, type: "object_type"|"list[object_type]"}`), `object_type_extraction_max_instances` (int, nullable, default 100), `created_at`
- Tree structure: parent → children
- When `auto_process=true`, uploads to this channel automatically defer a processing job
- Metadata extraction: pydantic-ai Agent + StructuredDict; `extraction_model_id` designates LLM; `extraction_schema` stored as PostgreSQL `json` (not jsonb) to preserve key order; JSON Schema dict (type, properties, required)

### Document

- `id`, `name`, `file_type`, `size_bytes`, `channel_id`, `file_hash`, `status`, `markdown`, `parsing_result`, `metadata` (JSONB: extracted + manual labels, unified), `series_id` (logical policy line; defaults to `id` on upload), `effective_from`, `effective_to` (optional validity window, timestamptz), `lifecycle_status` (optional: `draft`, `in_force`, `superseded`, `withdrawn`; unset/null treated as legacy "included"), `is_current_for_rag` (computed on read: **currently applicable** for normal knowledge-base answers and re-indexing; follows lifecycle + effective dates below), `created_at`, `updated_at`
- Status: `uploaded` → `pending` → `running` → `completed` / `failed`
- `metadata`: extracted or manually edited (abstract, author, publish_date, tags, etc.)

### DocumentRelationship

- `id`, `source_document_id`, `target_document_id`, `relation_type` (`supersedes`, `amends`, `implements`, `see_also`), `note`, `created_at`
- Unique (`source_document_id`, `target_document_id`, `relation_type`); directed edge from source → target

## Articles

### Article Channel

- `id`, `name`, `description`, `parent_id`, `sort_order`, `created_at`
- Tree structure like document channels; **no** `pipeline_id`, `auto_process`, or extraction fields (articles are not processed by the document VLM pipeline)

### Article

- `id`, `channel_id` (FK → article_channels), `name`, `slug` (optional, legacy / API only; SPA does not emphasize it), `markdown` (TEXT, working copy), `metadata` (JSONB), `series_id` (defaults to `id` on create; RAG grouping), `effective_from`, `effective_to`, `lifecycle_status`, `origin_article_id` (optional external **source ID or URI**), `last_synced_at`, `created_at`, `updated_at`
- `is_current_for_rag` is computed on read (same lifecycle/date rules as documents)
- MinIO bundle (when storage enabled): `articles/{id}/content.md`, `images/`, `attachments/`, optional `origin.html`

### ArticleRelationship

- Same shape as **document_relationships**: `id`, `source_article_id`, `target_article_id`, `relation_type`, `note`, `created_at`; unique `(source, target, type)`

### ArticleVersion / ArticleAttachment

- **ArticleVersion**: `id`, `article_id`, `version_number`, `tag`, `note`, `markdown`, `metadata` (JSONB snapshot), `created_at`, `created_by_sub`, `created_by_name`
- **ArticleAttachment**: `id`, `article_id`, `storage_path` (relative under article prefix), `original_filename`, `size_bytes`, `content_type`, `created_at`

## Knowledge bases and search

### KnowledgeBase

- `id`, `name`, `description`, `embedding_model_id` (FK → api_models), `agent_url`, `chunk_config` (JSONB: strategy, chunk_size, chunk_overlap; optional **`lifecycle_index_mode`**: `current_only` (default) skips documents that are **not currently applicable** per lifecycle rules during `kb-index`; `all` indexes every linked document regardless of lifecycle), `faq_prompt` (optional default for FAQ generation), `metadata_keys` (JSONB array: keys from document metadata to propagate to FAQs/chunks), `created_at`, `updated_at`
- Groups documents, FAQs, and chunks for RAG Q&A; semantic search defaults to documents that **are currently applicable** unless the client sets `include_historical_documents: true` on the search request

### KBDocument

- `id`, `knowledge_base_id` (FK → knowledge_bases), `document_id` (FK → documents), `created_at`
- Join table with unique constraint on (knowledge_base_id, document_id)

### KBWikiSpace

- `id`, `knowledge_base_id` (FK → knowledge_bases, CASCADE), `wiki_space_id` (FK → wiki_spaces, CASCADE), `created_at`
- Join table with unique constraint on (knowledge_base_id, wiki_space_id); linking a space causes `kb-index` to chunk all wiki pages in that space into this KB’s `chunks` rows

### FAQ

- `id`, `knowledge_base_id` (FK → knowledge_bases), `document_id` (FK → documents, nullable), `question`, `answer`, `embedding` (pgvector), `doc_metadata` (JSONB), `created_at`, `updated_at`
- Q&A pairs; embedding on question for semantic search; doc_metadata inherited from source document when metadata_keys is configured

### Chunk

- `id`, `knowledge_base_id` (FK → knowledge_bases), **`document_id`** (FK → documents, nullable) **or** **`wiki_page_id`** (FK → wiki_pages, nullable): exactly one is set (check constraint); `content`, `chunk_index`, `token_count`, `embedding` (pgvector, nullable — cleared when **`PUT …/chunks/{id}`** changes **`content`** until the next indexing job recomputes it), `chunk_metadata` (JSONB: strategy, char_start, etc.; wiki-sourced chunks may include `wiki_space_id`, `wiki_path`), `doc_metadata` (JSONB), `created_at`
- Segments with vector embeddings for semantic search; doc_metadata from channel documents or wiki page `metadata` when `metadata_keys` is configured; supports hybrid search (vector + metadata filters)

## Evaluation

### Evaluations

- `id`, `name`, `knowledge_base_id` (FK → knowledge_bases), optional `wiki_space_id` (FK → wiki_spaces, `ON DELETE SET NULL`), `description`, `created_at`, `updated_at`
- Container for query + expected answer pairs; optional wiki space for wiki-side evaluation runs

### EvaluationItem

- `id`, `evaluation_id` (FK → evaluations, CASCADE), `query`, `expected_answer`, `topic` (optional), `sort_order`, `created_at`
- Single evaluation item: question to ask and expected answer; topic for categorization

### EvaluationRun

- `id`, `evaluation_id` (FK → evaluations, CASCADE), `knowledge_base_id`, `evaluation_type` (`search_retrieval` \| `qa_answer` \| `wiki_content_coverage`), `status`, `error_message`, `item_count`, `pass_count`, `avg_score`, `config_snapshot` (JSONB), `created_at`, `finished_at`
- One persisted evaluation execution (report); `config_snapshot` records judge model and, for KB search, search params; for **`wiki_content_coverage`**, wiki space id and wiki semantic settings (`semantic_match_top_k`, `semantic_similarity_threshold`)

### EvaluationRunItem

- `id`, `evaluation_run_id` (FK → evaluation_runs, CASCADE), `evaluation_item_id` (FK → evaluation_items, CASCADE), `passed`, `score`, `reasoning`, `detail` (JSONB: search snippets, QA answer + sources, or wiki judge snippets / recall metadata)
- Per-item outcome for a run

## Glossaries

### Glossary

- `id`, `name`, `description`, `created_at`, `updated_at`
- Container for domain terms and synonyms

### GlossaryTerm

- `id`, `glossary_id` (FK → glossaries, CASCADE), `primary_en`, `primary_cn`, `definition` (text), `synonyms_en` (JSONB array), `synonyms_cn` (JSONB array), `created_at`, `updated_at`
- Bilingual term with definition and synonyms; at least one of primary_en or primary_cn required

## Ontology — objects, links, datasets

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

## Console / system

### FeatureToggle

- `key` (PK, string), `enabled` (boolean), `updated_at`
- Stores feature flags shared across all users. Seeded defaults from `app/api/feature_toggles.py`: `articles`, `knowledgeBases`, `wikiSpaces`, `objectsAndLinks`, `knowledge_map` (all enabled); `evaluations` (disabled by default, experimental)
- Read by all authenticated users; write restricted to admins

### SystemSettings

- `id` (PK, integer; singleton row `id=1`), `system_name` (display name shown in the SPA header), `default_timezone` (default `UTC`), `api_base_url_note` (free-text operator note; SPA API URL is build-time), `updated_at`
- Loaded by the Console settings page and the public `system_name` lookup

### Jobs (procrastinate_jobs)

- Managed by procrastinate; stores task_name, args (document_id, pipeline_id, knowledge_base_id, etc.), status, attempts, timestamps

### JobWorkerLog (job_worker_logs)

- `procrastinate_job_id` (PK, bigint): same id as `procrastinate_jobs.id`
- `log_text` (TEXT): captured worker output (command + stderr + stdout), truncated server-side to `char_limit_applied` when over limit
- `truncated` (boolean)
- `char_limit_applied` (integer): cap used for that row (from **`OPENKMS_JOB_LOG_MAX_CHARS`**)
- `created_at`
- Removed when the job is deleted via **`DELETE /api/jobs/{id}`**

## Auth and permissions

### User (local auth only)

- `id` (UUID), `email` (unique), `username` (unique), `password_hash`, `is_admin`, `created_at`, `updated_at`
- Only present in `OPENKMS_AUTH_MODE=local`. In OIDC mode users are not stored here; identity comes from the JWT.

### UserPreference (UI preferences)

- `subject_sub` (PK, string): JWT `sub` (local user id or OIDC subject line); same principal space as `UserApiKey.owner_sub`
- `ui_locale` (`en` \| `zh-CN` \| null): SPA display language saved from **Settings**; read on `GET /api/auth/me`
- `updated_at`

### UserApiKey (personal API keys)

- `id` (UUID string; embedded in issued token as `okms.{id}.{secret}`), `owner_sub` (JWT `sub`: local user id or OIDC IdP subject), `auth_mode` (`local` \| `oidc`), `name`, `key_prefix` (short display prefix, no secret), `secret_hash` (bcrypt of secret segment only), `oidc_realm_roles` (JSONB snapshot of realm role names at creation; OIDC only), `display_username`, `display_email` (snapshot for `/me`-style claims), `created_at`, `last_used_at`, `revoked_at` (soft revoke)
- **Bearer** tokens matching `okms.{id}.{secret}` authenticate as `owner_sub` with the same permission rules as a normal JWT (local: `user_security_roles`; OIDC: role snapshot on the key row).

### SecurityRole

- `id` (UUID), `name` (unique; e.g. `admin`, `member`), `description`, `created_at`
- `admin` is seeded with key `all` and cannot be deleted; `member` is created on first non-admin local sign-in

### SecurityRolePermission

- `id`, `role_id` (FK → security_roles, CASCADE), `permission_key` (free-form key from the permission catalog); unique `(role_id, permission_key)`

### UserSecurityRole

- `user_id` (FK → users, CASCADE; PK), `role_id` (FK → security_roles, CASCADE; PK)
- Local mode only; `is_admin=true` keeps a row for the admin role in sync

### SecurityPermission (permission catalog)

- `id`, `key` (unique; e.g. `articles:write`, `console:groups`), `label`, `description`, `frontend_route_patterns` (JSONB array of route globs for the SPA route gate / console sidebar), `backend_api_patterns` (JSONB array of `METHOD path-glob` rules used by strict middleware enforcement), `sort_order`, `created_at`
- Editable from `/console/permission-management`. The built-in `all` row is rejected for edit/delete.

## Data security (access groups, data resources)

### AccessGroup

- `id` (UUID), `name` (unique), `description`, `created_at`
- A bag of users plus per-resource scope tables. Membership is editable in local mode only; OIDC clusters manage membership at the IdP.

### AccessGroupUser

- `user_id` (FK → users, CASCADE), `group_id` (FK → access_groups, CASCADE); composite PK

### DataResource

- `id`, `name` (unique), `description`, `resource_kind` (`document`, `knowledge_base`, `evaluation`, `dataset`, `object_type`, `link_type`), `attributes` (JSONB; whitelisted keys per kind, interpreted as scope predicates), `anchor_channel_id` (FK → document_channels), `anchor_knowledge_base_id` (FK → knowledge_bases), `created_at`, `updated_at`
- Admin-defined access predicates. Used together with the legacy ID allow-lists when `OPENKMS_ENFORCE_GROUP_DATA_SCOPES=true`.

### Access-group ↔ resource junctions

- `access_group_channels` — `(group_id, channel_id)` PK; FK → access_groups, document_channels
- `access_group_article_channels` — `(group_id, article_channel_id)`
- `access_group_knowledge_bases` — `(group_id, knowledge_base_id)`
- `access_group_wiki_spaces` — `(group_id, wiki_space_id)`
- `access_group_evaluations` — `(group_id, evaluation_id)`
- `access_group_datasets` — `(group_id, dataset_id)`
- `access_group_object_types` — `(group_id, object_type_id)`
- `access_group_link_types` — `(group_id, link_type_id)`
- `access_group_data_resources` — `(group_id, data_resource_id)`

All junctions cascade on either side; no extra columns.

## Wiki

### WikiSpace

- `id`, `name`, `description`, `semantic_similarity_threshold` (float, 0–1, default **0.4** for new rows; minimum cosine similarity for semantic page matches), `semantic_match_top_k` (int ≥ 1, default **10**; max semantic hits for the tree API), `semantic_embedding_model_id` (nullable FK → `api_models`, **SET NULL**; null = use global default embedding model for index + search), `last_semantic_index_at` (nullable timestamptz; set when **POST …/semantic-index** completes successfully), `created_at`, `updated_at`

### WikiPage

- `id`, `wiki_space_id` (FK → wiki_spaces, CASCADE), `path` (Obsidian-style; unique per space), `title`, `body` (markdown), `metadata` (JSONB), `page_index` (JSONB; PageIndex tree for in-page navigation), `embedding` (pgvector `vector`, nullable; filled by offline **Build semantic index** in space settings), `embedding_model_id` (FK → api_models, SET NULL), `embedded_at` (nullable), `created_at`, `updated_at`
- Unique `(wiki_space_id, path)`
- **HTTP:** `GET /api/wiki-spaces/{id}/pages` returns list items **without** `body` (smaller payloads); full markdown via `GET /api/wiki-spaces/{id}/pages/{page_id}`.

### WikiFile

- `id`, `wiki_space_id` (FK → wiki_spaces, CASCADE), `wiki_page_id` (FK → wiki_pages, SET NULL), `storage_key` (unique MinIO key), `filename`, `content_type`, `size_bytes`, `created_at`
- Embedded images and file attachments inside a wiki space; `wiki_page_id` lets a file be associated with a specific page (or unattached).

### WikiSpaceDocument

- `id`, `wiki_space_id`, `document_id`; unique `(wiki_space_id, document_id)`
- Links a Document into a wiki space as a referenced source (no copy).

## Agent (embedded LangGraph assistant)

### AgentConversation

- `id`, `user_sub` (owner; OIDC sub or local user id), **`surface`** (`wiki_space` \| `knowledge_base` \| `evaluation` \| `kb_faq`), **`context`** (JSONB; e.g. `{ "wiki_space_id" }`, `{ "knowledge_base_id" }`, `{ "evaluation_id", "knowledge_base_id" }` for evaluation threads), `title`, `created_at`, `updated_at`

### AgentMessage

- `id`, `conversation_id` (FK → agent_conversations, CASCADE), `role` (`user` / `assistant` / `tool`), `content` (user-visible text for assistant turns), `tool_calls` (JSONB; wiki Copilot may store `wiki_tool_traces_v1`: tool name + output for model replay without re-running tools; **KB Q&A / evaluation / kb_faq** may add `kb_qa_sources_v1` and optional `wiki_tool_traces_v1` when the qa-agent streams tools), `created_at` (DB default **`clock_timestamp()`** so rows inserted in the same transaction get distinct timestamps; list APIs use `ORDER BY created_at, id`)

## Knowledge map

### KnowledgeMapNode (`taxonomy_nodes`)

- `id`, `parent_id` (FK → taxonomy_nodes, CASCADE), `name`, `description`, `sort_order`, `created_at`, `updated_at`
- Hierarchical knowledge map shown in the navigator; many nodes per workspace.

### KnowledgeMapResourceLink (`taxonomy_resource_links`)

- `id`, `taxonomy_node_id` (FK → taxonomy_nodes, CASCADE), `resource_type` (`document_channel`, `article_channel`, `wiki_space`, …), `resource_id`; unique `(resource_type, resource_id)`
- Maps each content surface to **at most one** Knowledge Map node.

### KnowledgeMapHtmlArtifact (`taxonomy_map_html_artifact`)

- Singleton row (`id` = `default`): `html` (sanitized document), `content_hash` (SHA-256 of canonical map terms + links JSON), `generated_at` — LLM-built **HTML overview** of the Knowledge Map; `GET /api/knowledge-map/map-html/status` compares the live hash to `content_hash` to report **stale**.

## Provider details

### ApiProvider

- `id`, `name`, `base_url`, `api_key` (masked in API responses; raw value used by the worker), `config` (JSONB), `created_at`, `updated_at`
- Parent of `ApiModel`; one provider can host many models.

### DocumentVersion

- `id`, `document_id` (FK → documents, CASCADE), `version_number` (sequential per document), `tag`, `note`, `markdown`, `metadata` (JSONB snapshot), `created_at`, `created_by_sub`, `created_by_name`
- User-triggered checkpoint of `documents.markdown` + `documents.metadata`; restored via `POST /api/documents/{id}/versions/{vid}/restore`.
