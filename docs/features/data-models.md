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

### FAQ

- `id`, `knowledge_base_id` (FK → knowledge_bases), `document_id` (FK → documents, nullable), `question`, `answer`, `embedding` (pgvector), `doc_metadata` (JSONB), `created_at`, `updated_at`
- Q&A pairs; embedding on question for semantic search; doc_metadata inherited from source document when metadata_keys is configured

### Chunk

- `id`, `knowledge_base_id` (FK → knowledge_bases), `document_id` (FK → documents), `content`, `chunk_index`, `token_count`, `embedding` (pgvector), `chunk_metadata` (JSONB: strategy, char_start, etc.), `doc_metadata` (JSONB), `created_at`
- Document segments with vector embeddings for semantic search; doc_metadata inherited from source document per metadata_keys; supports hybrid search (vector + metadata filters)

## Evaluation

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
- Stores feature flags shared across all users; seeded with `articles`, `knowledgeBases`, `objectsAndLinks` (enabled by default), `evaluationDatasets` (disabled by default, experimental)
- Read by all authenticated users; write restricted to admins

### Jobs (procrastinate_jobs)

- Managed by procrastinate; stores task_name, args (document_id, pipeline_id, knowledge_base_id, etc.), status, attempts, timestamps
