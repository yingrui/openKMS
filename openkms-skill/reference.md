# openkms-skill — API reference

Paths below are relative to `api_base_url` from `config.yml`. The **CLI** sends `Authorization: Bearer <api_key>` on every request. **Agents must not reimplement these calls with `curl` or custom HTTP code**—use `python scripts/cli.py …` only; this file is for humans maintaining the skill and for reviews.

## config.yml

```yaml
api_base_url: "http://127.0.0.1:8102"
api_key: "okms.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.your-secret"
# optional: when set, documents list|upload and articles list|create|from-url may omit --channel-id
# default_document_channel_id: "uuid"
# default_article_channel_id: "uuid"
# optional: default pipeline for document-channels create (see pipelines list --table)
# default_pipeline_id: "pipeline_baidu_doc_parse"
```

All mutating CLI commands accept `-y`/`--yes` and `--dry-run` (see `SKILL.md`). On a non-TTY, writes without `--yes` exit 2.

Create keys in the openKMS web app: **Settings** (header user menu → **Settings**, `/settings`) → **API keys** section. The full token is shown only once at creation time.

## Endpoints used by `scripts/cli.py`

### Auth & search

| CLI | Method | Path | Notes |
|---|---|---|---|
| `ping` | GET | `/api/auth/me` | Returns the authenticated user's profile + permissions. |
| `search` | GET | `/api/search` | Query params: `q` (required), `types` (`all` or comma list of `documents,articles,wiki_spaces,knowledge_bases`), `document_channel_id`, `article_channel_id`, `updated_after`, `updated_before` (ISO-8601), `limit` (1-100, default 30). Returns sections grouped by content type with `items[{id,name,kind,url_path,channel_id,channel_name,updated_at}]` and per-type `total`. |

### Channels

| CLI | Method | Path | Notes |
|---|---|---|---|
| `document-channels list` | GET | `/api/document-channels` | Default: JSON tree. Pass `--tree` for indented human-readable names + ids. |
| `document-channels create` | POST | `/api/document-channels` | Body `{name, sort_order, description?, parent_id?}`. Optional CLI `--pipeline-id` (or `default_pipeline_id` in config) triggers a follow-up PUT to set `pipeline_id`. Requires `--yes` / `--dry-run` on non-TTY. |
| `document-channels update` | PUT | `/api/document-channels/{id}` | Partial body: `name`, `description`, `parent_id`, `sort_order`, `pipeline_id`, `auto_process`, `extraction_model_id`, `extraction_schema` (CLI: `--extraction-schema-json`). Gated. |
| `pipelines list` | GET | `/api/pipelines` | JSON `{items, total}`; each item has `id`, `name`, `description`, `is_active`, `command`, … CLI `--table` prints `id`, `name`, and active/inactive. Read-only. |
| `article-channels list` | GET | `/api/article-channels` | Default: JSON. `--tree` for human-readable. |
| `article-channels create` | POST | `/api/article-channels` | Same create shape as document channels. Gated. |
| `article-channels update` | PUT | `/api/article-channels/{id}` | Partial: `name`, `description`, `parent_id`, `sort_order`. Gated. |

### Documents

| CLI | Method | Path | Notes |
|---|---|---|---|
| `documents list` | GET | `/api/documents` | Query: `channel_id?`, `search?`, `limit?`, `offset?`. If `--channel-id` is omitted, `default_document_channel_id` from `config.yml` is used when set. |
| `documents get` | GET | `/api/documents/{id}` | Full document, including `markdown`, `series_id`, `effective_from` / `effective_to`, `lifecycle_status`, `is_current_for_rag`. 404 if user lacks access to the document's channel. |
| `documents markdown` | GET | `/api/documents/{id}` | Same as `get`; CLI extracts `.markdown` and writes to stdout (or `--out FILE`). |
| `documents upload` | POST multipart | `/api/documents/upload` | Fields: `file`, `channel_id`. For `.xlsx` the server builds a sheet preview synchronously; for other types it enqueues the channel pipeline if `auto_process` is on. |
| `documents relationships list` | GET | `/api/documents/{id}/relationships` | `{outgoing:[{id, relation_type, peer_document_id, peer_document_name, note, created_at}], incoming:[…]}`. |
| `documents lifecycle patch` *(write)* | PATCH | `/api/documents/{id}/lifecycle` | Partial JSON: `series_id`, `effective_from`, `effective_to`, `lifecycle_status`; CLI mirrors document-detail fields. `--clear-effective-from` / `--clear-effective-to` send JSON `null`. |
| `documents relationships create` *(write)* | POST | `/api/documents/{id}/relationships` | Body `{target_document_id, relation_type, note?}`. `relation_type ∈ {supersedes, amends, implements, see_also}`. Edge is **source** = path `id` → **target**. |
| `documents relationships delete` *(write)* | DELETE | `/api/documents/{id}/relationships/{relationship_id}` | **Outgoing only** (row's `source_document_id` must equal `{id}`). To remove an edge that appears under *incoming* for doc B, call `delete` with `--id` set to the **source** document and that edge's `id`. 204. |

### Articles

| CLI | Method | Path | Notes |
|---|---|---|---|
| `articles list` | GET | `/api/articles` | Query: `channel_id?`, `search?`, `limit?`, `offset?`. If `--channel-id` is omitted, `default_article_channel_id` from `config.yml` is used when set. Returns `{items, total}`. |
| `articles get` | GET | `/api/articles/{id}` | Full article, including `markdown`. |
| `articles markdown` | GET | `/api/articles/{id}` | Extracts `.markdown` for stdout/file. |
| `articles create` | POST | `/api/articles` | Body `{channel_id, name, markdown, origin_article_id?}`. CLI accepts `--markdown` inline or `--markdown-file`. |
| `articles from-url` | GET (external) + POST | `/api/articles` | CLI fetches the URL, simplifies HTML to text via regex heuristic, then POSTs. Sets `origin_article_id` to the source URL (truncated 512). |
| `articles reviews latest` | GET | `/api/articles/{id}/reviews/latest` | Latest persisted LLM rubric review. `result`: `{overall_score, pass, summary, criteria[{id,label,score,notes}], suggestions[]}`. 404 when none yet. |
| `articles reviews list` | GET | `/api/articles/{id}/reviews` | Query `limit?` (1–50, default 20). `{items:[ArticleReviewResponse…]}`. |
| `articles review run` *(write)* | POST | `/api/articles/{id}/review` | Body optional `{model_id?, prompt?}`; uses channel `review_model_id` / `review_prompt` / `review_criteria` when omitted. Returns saved `ArticleReviewResponse`. |
| `articles relationships list` | GET | `/api/articles/{id}/relationships` | `{outgoing:[{id, relation_type, peer_article_id, peer_article_name, note, created_at}], incoming:[…]}`. |
| `articles relationships create` *(write)* | POST | `/api/articles/{id}/relationships` | Body `{target_article_id, relation_type, note?}`. Same `relation_type` set as documents (`supersedes`, `amends`, `implements`, `see_also`). |
| `articles relationships delete` *(write)* | DELETE | `/api/articles/{id}/relationships/{relationship_id}` | **Outgoing only** (same rule as `documents relationships delete`). 204. |

### Wiki

| CLI | Method | Path | Notes |
|---|---|---|---|
| `wiki-spaces list` | GET | `/api/wiki-spaces` | Requires `console:wikis_read` (server-enforced). |
| `wiki-spaces create` | POST | `/api/wiki-spaces` | Requires `console:wikis_write`. |
| `wiki-spaces documents list` | GET | `/api/wiki-spaces/{space_id}/documents` | Linked channel documents (reference only). |
| `wiki-spaces documents link` | POST | `/api/wiki-spaces/{space_id}/documents` | Body `{document_id}`. 409 if already linked. Gated. |
| `wiki-spaces documents unlink` | DELETE | `/api/wiki-spaces/{space_id}/documents/{document_id}` | Removes link only. Gated. |
| `wiki list-pages` | GET | `/api/wiki-spaces/{space_id}/pages` | Paginated. |
| `wiki pages semantic-matches` | GET | `/api/wiki-spaces/{space_id}/pages/semantic-matches` | Query `q` (required), optional `top_k`, `text_match_limit`. Substring title/path first; else semantic `semantic_matched_pages` when embeddings exist. |
| `wiki get-page` | GET | `/api/wiki-spaces/{space_id}/pages/by-path/{path}` | `path` is Obsidian-style; CLI URL-encodes with `safe=""`. |
| `wiki put-page` | PUT | `/api/wiki-spaces/{space_id}/pages/by-path/{path}` | Body `{title, body, metadata: null}`. Upserts. |
| `wiki files list` | GET | `/api/wiki-spaces/{space_id}/files` | All **stored files** for the space: vault imports (including **`.md`** and assets), uploads, etc. — not “attachments only”. Response `{items:[{id,filename,content_type,size_bytes,wiki_page_id,created_at}], total}`. |
| `wiki files delete` | DELETE | `/api/wiki-spaces/{space_id}/files/{file_id}` | Deletes **one stored-file row** (same list as above): may be a vault-mirrored `.md`, an image, or any other stored object. Removes DB row + storage object when configured. **Distinct from** editing page body via `wiki put-page`. Gated. |

### Knowledge bases

| CLI | Method | Path | Notes |
|---|---|---|---|
| `kb list` | GET | `/api/knowledge-bases` | |
| `kb get` | GET | `/api/knowledge-bases/{id}` | Includes counts (documents, wiki spaces, chunks, FAQs) + embedding status. |
| `kb search` | POST | `/api/knowledge-bases/{id}/search` | Body `{query, limit?}`. Returns ranked chunk + FAQ matches; chunk hits from wiki pages include `wiki_page_id` / `wiki_space_id`. |
| `kb ask` | POST | `/api/knowledge-bases/{id}/ask` | Body `{question}`. Proxies to the QA agent — returns a grounded answer with source citations. Slower than `kb search` (LLM in the loop). |
| `kb index` *(write)* | POST | `/api/knowledge-bases/{id}/index-job` | Queue full KB reindex (documents + all linked wiki spaces + FAQ embeddings). Returns `JobResponse`; requires `embedding_model_id` on the KB. |
| `kb wiki-spaces list` | GET | `/api/knowledge-bases/{kb_id}/wiki-spaces` | Wiki spaces linked for KB indexing. |
| `kb wiki-spaces reindex` *(write)* | POST | `/api/knowledge-bases/{kb_id}/wiki-spaces/{wiki_space_id}/index-job` | Re-index pages from one linked wiki space (replaces that space's wiki chunks; one page per chunk when ≤8000 chars). Returns `JobResponse`. |
| *(HTTP)* | POST | `/api/knowledge-bases/{id}/wiki-spaces` | Body `{wiki_space_id}`. Link a wiki space (no CLI yet). |
| *(HTTP)* | DELETE | `/api/knowledge-bases/{id}/wiki-spaces/{wiki_space_id}` | Unlink; removes wiki-sourced chunks for that space from this KB. |
| *(HTTP)* | GET | `/api/knowledge-bases/{id}/wiki-pages-for-index` | Paginated pages with body (used by `kb-index` worker). |
| `kb-faq list` | GET | `/api/knowledge-bases/{id}/faqs` | Paginated. |
| `kb-faq create` | POST | `/api/knowledge-bases/{id}/faqs` | Body `{question, answer}`. |

### Glossaries

| CLI | Method | Path | Notes |
|---|---|---|---|
| `glossaries list` | GET | `/api/glossaries` | `{items, total}`. |
| `glossaries get` | GET | `/api/glossaries/{id}` | Includes `term_count`. |
| `glossaries create` *(write)* | POST | `/api/glossaries` | Body `{name, description?}`. |
| `glossaries update` *(write)* | PUT | `/api/glossaries/{id}` | Partial `{name?, description?}`; empty update exits 2. |
| `glossaries delete` *(write)* | DELETE | `/api/glossaries/{id}` | Deletes all terms first; 204, CLI prints one line. |
| `glossaries export` | GET | `/api/glossaries/{id}/export` | `{glossary_id, glossary_name, exported_at, terms:[…]}`. |
| `glossaries import` *(write)* | POST | `/api/glossaries/{id}/import` | Body `{terms:[{primary_en?, primary_cn?, definition?, synonyms_en?, synonyms_cn?}], mode:"append"\|"replace"}`. `--terms-file` may be that object or a bare JSON array (then `--mode` applies). |
| `glossaries terms list` | GET | `/api/glossaries/{id}/terms` | Optional `?search=` substring filter. |
| `glossaries terms get` | GET | `/api/glossaries/{id}/terms/{term_id}` | — |
| `glossaries terms create` *(write)* | POST | `/api/glossaries/{id}/terms` | At least one of `primary_en` / `primary_cn`. Optional `--synonyms-en-json` / `--synonyms-cn-json` (JSON arrays). |
| `glossaries terms update` *(write)* | PUT | `/api/glossaries/{id}/terms/{term_id}` | Partial fields; empty update exits 2. |
| `glossaries terms delete` *(write)* | DELETE | `/api/glossaries/{id}/terms/{term_id}` | 204. |
| `glossaries terms suggest` *(write)* | POST | `/api/glossaries/{id}/terms/suggest` | Body `{primary_en?, primary_cn?}`; calls default LLM (same confirm gate as other writes). |

### Ontology (Neo4j graph)

| CLI | Method | Path | Notes |
|---|---|---|---|
| `ontology cypher` | POST | `/api/ontology/explore` | Body `{cypher}`. **Read-only**: server rejects `CREATE/MERGE/DELETE/SET/REMOVE/DETACH/DROP/CALL/apoc/dbms`; query must contain `RETURN`. |
| `ontology text-to-cypher` | POST | `/api/ontology/text-to-cypher` | Body `{question}`. Grounded in current ontology object/link types. Requires a default LLM configured. |
| `ontology answer` | POST | `/api/ontology/answer` | Body `{question, cypher, columns, rows}`. Summarises a Cypher result back to NL. |
| `ontology ask` | (chain) | three calls above | Convenience: text-to-cypher → explore → answer. CLI emits `{question, cypher, explanation, columns, rows, answer}`. |

### Ontology — object types (`ontology objects`)

All write subcommands accept `--yes` / `--dry-run`. Without `--yes` on non-TTY stdin → exit 2 (no HTTP call).

| CLI | Method | Path | Body / params |
|---|---|---|---|
| `ontology objects list` | GET | `/api/object-types` | Optional `?is_master_data=true&count_from_neo4j=true`. Returns `{items:[ObjectType], total}`. |
| `ontology objects get` | GET | `/api/object-types/{id}` | Optional `?count_from_neo4j=true`. |
| `ontology objects create-type` *(write)* | POST | `/api/object-types` | Body `{name, description?, dataset_id?, key_property?, is_master_data, display_property?, properties:[{name,type,required}]}`. |
| `ontology objects update-type` *(write)* | PUT | `/api/object-types/{id}` | Only the flags you pass are sent (all `ObjectTypeUpdate` fields optional). Empty update exits 2. |
| `ontology objects delete-type` *(write)* | DELETE | `/api/object-types/{id}` | Cascades; no body. |
| `ontology objects instances list` | GET | `/api/object-types/{id}/objects` | `?search=&limit=&offset=`. |
| `ontology objects instances get` | GET | `/api/object-types/{type-id}/objects/{id}` | — |
| `ontology objects instances create` *(write)* | POST | `/api/object-types/{type-id}/objects` | Body `{data: {…property values…}}`. |
| `ontology objects instances update` *(write)* | PUT | `/api/object-types/{type-id}/objects/{id}` | Body `{data: {…}}`. |
| `ontology objects instances delete` *(write)* | DELETE | `/api/object-types/{type-id}/objects/{id}` | — |
| `ontology objects sync-neo4j` *(write)* | POST | `/api/object-types/index-to-neo4j` | Body `{neo4j_data_source_id}`. Returns `{object_types_indexed, nodes_created}`. Indexes every object type that has a linked dataset or stored instances. |
| `ontology objects sync-neo4j-type` *(write)* | POST | `/api/object-types/{id}/index-to-neo4j` | Same body. One type only (dataset rows or `object_instances` when no dataset). |

### Ontology — link types (`ontology links`)

| CLI | Method | Path | Body / params |
|---|---|---|---|
| `ontology links list` | GET | `/api/link-types` | Optional `?count_from_neo4j=true`. |
| `ontology links get` | GET | `/api/link-types/{id}` | Optional `?count_from_neo4j=true`. |
| `ontology links create-type` *(write)* | POST | `/api/link-types` | Body `{name, source_object_type_id, target_object_type_id, cardinality, description?, dataset_id?, source_key_property?, target_key_property?, source_dataset_column?, target_dataset_column?}`. `cardinality ∈ {one-to-one, one-to-many, many-to-one, many-to-many}` (default `one-to-many`). |
| `ontology links update-type` *(write)* | PUT | `/api/link-types/{id}` | Only the flags you pass are sent. Empty update exits 2. |
| `ontology links delete-type` *(write)* | DELETE | `/api/link-types/{id}` | — |
| `ontology links instances list` | GET | `/api/link-types/{id}/links` | `?limit=&offset=`. |
| `ontology links instances create` *(write)* | POST | `/api/link-types/{type-id}/links` | Body `{source_object_id, target_object_id}`. **Server rejects when type is m2m+dataset** (junction table is the source of truth) — surface the 4xx. |
| `ontology links instances delete` *(write)* | DELETE | `/api/link-types/{type-id}/links/{id}` | Same m2m+dataset rejection rule. |
| `ontology links sync-neo4j` *(write)* | POST | `/api/link-types/index-to-neo4j` | Body `{neo4j_data_source_id}`. Returns `{link_types_indexed, relationships_created}`. Junction / source-FK datasets or saved link rows. |
| `ontology links sync-neo4j-type` *(write)* | POST | `/api/link-types/{id}/index-to-neo4j` | Same body. One link type only. |

### Knowledge map (`knowledge-map`)

Requires **`knowledge_map:read`** (tree, link list) and **`knowledge_map:write`** (mutations) when the server enforces permissions.

| CLI | Method | Path | Body / params |
|---|---|---|---|
| `knowledge-map nodes tree` | GET | `/api/knowledge-map/nodes/tree` | Nested nodes with `link_count` per node. |
| `knowledge-map nodes create` *(write)* | POST | `/api/knowledge-map/nodes` | Body `{name, parent_id?, description?, sort_order?}`. |
| `knowledge-map nodes patch` *(write)* | PATCH | `/api/knowledge-map/nodes/{id}` | Partial: `name`, `description`, `sort_order`, `parent_id`; `--clear-parent` sends `parent_id: null`. Empty patch exits 2. |
| `knowledge-map nodes delete` *(write)* | DELETE | `/api/knowledge-map/nodes/{id}` | 204. |
| `knowledge-map resource-links list` | GET | `/api/knowledge-map/resource-links` | All mappings; filter with `jq` if needed. |
| `knowledge-map resource-links put` *(write)* | PUT | `/api/knowledge-map/resource-links` | Body `{knowledge_map_node_id, resource_type, resource_id}`. `resource_type ∈ {document_channel, article_channel, wiki_space}`. |
| `knowledge-map resource-links delete` *(write)* | DELETE | `/api/knowledge-map/resource-links` | Query `resource_type`, `resource_id`. 204. |

### Evaluation

| CLI | Method | Path | Notes |
|---|---|---|---|
| `evaluations list` | GET | `/api/evaluations` | Optional query `knowledge_base_id`. |
| `evaluations create` | POST | `/api/evaluations` | Body `{name, knowledge_base_id, description?, wiki_space_id?}`. Optional wiki link enables **`wiki_content_coverage`** runs. |
| `evaluations update` | PUT | `/api/evaluations/{id}` | Partial body: `name`, `description`, `knowledge_base_id`, `wiki_space_id`, or clear wiki link (`wiki_space_id: null` via `--clear-wiki-space`). Keeps the same id and run history. |
| `evaluations get` | GET | `/api/evaluations/{id}` | Includes stats. |
| `evaluations items list` | GET | `/api/evaluations/{id}/items` | Paginated. Each item is `{topic, query, expected_answer}`. |
| `evaluations items add` | POST | `/api/evaluations/{id}/items` | Body `{query, expected_answer, topic?, sort_order?}`. |
| `evaluations items update` | PUT | `/api/evaluations/{id}/items/{item_id}` | Partial: `query`, `expected_answer`, `topic`, `sort_order`. |
| `evaluations items delete` | DELETE | `/api/evaluations/{id}/items/{item_id}` | 204. |
| `evaluations run` | POST | `/api/evaluations/{id}/run` | Body optionally `{evaluation_type: "search_retrieval"\|"qa_answer"\|"wiki_content_coverage"}` (default `search_retrieval`). `wiki_content_coverage` requires a linked `wiki_space_id`. |
| `evaluation-runs list` | GET | `/api/evaluations/{evaluation_id}/runs` | Paginated. |
| `evaluation-runs get` | GET | `/api/evaluations/{evaluation_id}/runs/{run_id}` | Full run with per-item results. |
| `evaluation-runs compare` | GET | `/api/evaluations/{evaluation_id}/runs/compare?run_a=&run_b=` | Returns per-metric diffs between two runs. |

## Errors

The CLI surfaces non-2xx responses as:

```
HTTP <status>
<body, JSON-pretty-printed if parseable>
```

…and exits 1. Common cases:

- **401** — invalid or revoked API key. Mint a new key in Settings → API keys.
- **403** — endpoint requires a permission your account doesn't have (e.g. `console:wikis_write`). Server returns `{detail: "..."}`.
- **404** — resource does not exist *or* is filtered by your data-scope. The skill cannot tell these apart from the response.
- **422** — pydantic validation error; check argument shapes.
- **502** — upstream LLM or Neo4j failure (mostly seen on `ontology *` and `kb ask`).

For authoritative tables and extra routes the skill does not yet wrap (admin: providers, models, data sources, jobs), see the repository file `docs/features/api-reference.md`.
