# openkms-skill — API reference

Paths below are relative to `api_base_url` from `config.yml`. Send header `Authorization: Bearer <api_key>` on every request.

## config.yml

```yaml
api_base_url: "http://127.0.0.1:8102"
api_key: "okms.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.your-secret"
# optional: when set, documents list|upload and articles list|create|from-url may omit --channel-id
# default_document_channel_id: "uuid"
# default_article_channel_id: "uuid"
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

| CLI | Method | Path |
|---|---|---|
| `document-channels list` | GET | `/api/document-channels` |
| `document-channels create` | POST | `/api/document-channels` body `{name, sort_order, description?, parent_id?}` |
| `article-channels list` | GET | `/api/article-channels` |
| `article-channels create` | POST | `/api/article-channels` (same body shape) |

### Documents

| CLI | Method | Path | Notes |
|---|---|---|---|
| `documents list` | GET | `/api/documents` | Query: `channel_id?`, `search?`, `limit?`, `offset?`. If `--channel-id` is omitted, `default_document_channel_id` from `config.yml` is used when set. |
| `documents get` | GET | `/api/documents/{id}` | Full document, including `markdown`. 404 if user lacks access to the document's channel. |
| `documents markdown` | GET | `/api/documents/{id}` | Same as `get`; CLI extracts `.markdown` and writes to stdout (or `--out FILE`). |
| `documents upload` | POST multipart | `/api/documents/upload` | Fields: `file`, `channel_id`. For `.xlsx` the server builds a sheet preview synchronously; for other types it enqueues the channel pipeline if `auto_process` is on. |

### Articles

| CLI | Method | Path | Notes |
|---|---|---|---|
| `articles list` | GET | `/api/articles` | Query: `channel_id?`, `search?`, `limit?`, `offset?`. If `--channel-id` is omitted, `default_article_channel_id` from `config.yml` is used when set. Returns `{items, total}`. |
| `articles get` | GET | `/api/articles/{id}` | Full article, including `markdown`. |
| `articles markdown` | GET | `/api/articles/{id}` | Extracts `.markdown` for stdout/file. |
| `articles create` | POST | `/api/articles` | Body `{channel_id, name, markdown, origin_article_id?}`. CLI accepts `--markdown` inline or `--markdown-file`. |
| `articles from-url` | GET (external) + POST | `/api/articles` | CLI fetches the URL, simplifies HTML to text via regex heuristic, then POSTs. Sets `origin_article_id` to the source URL (truncated 512). |

### Wiki

| CLI | Method | Path | Notes |
|---|---|---|---|
| `wiki-spaces list` | GET | `/api/wiki-spaces` | Requires `console:wikis_read` (server-enforced). |
| `wiki-spaces create` | POST | `/api/wiki-spaces` | Requires `console:wikis_write`. |
| `wiki list-pages` | GET | `/api/wiki-spaces/{space_id}/pages` | Paginated. |
| `wiki get-page` | GET | `/api/wiki-spaces/{space_id}/pages/by-path/{path}` | `path` is Obsidian-style; CLI URL-encodes with `safe=""`. |
| `wiki put-page` | PUT | `/api/wiki-spaces/{space_id}/pages/by-path/{path}` | Body `{title, body, metadata: null}`. Upserts. |

### Knowledge bases

| CLI | Method | Path | Notes |
|---|---|---|---|
| `kb list` | GET | `/api/knowledge-bases` | |
| `kb get` | GET | `/api/knowledge-bases/{id}` | Includes counts (documents, chunks, FAQs) + embedding status. |
| `kb search` | POST | `/api/knowledge-bases/{id}/search` | Body `{query, limit?}`. Returns ranked chunk + FAQ matches with confidence scores. |
| `kb ask` | POST | `/api/knowledge-bases/{id}/ask` | Body `{question}`. Proxies to the QA agent — returns a grounded answer with source citations. Slower than `kb search` (LLM in the loop). |
| `kb-faq list` | GET | `/api/knowledge-bases/{id}/faqs` | Paginated. |
| `kb-faq create` | POST | `/api/knowledge-bases/{id}/faqs` | Body `{question, answer}`. |

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
| `ontology objects sync-neo4j` *(write)* | POST | `/api/object-types/index-to-neo4j` | Body `{neo4j_data_source_id}`. Returns `{object_types_indexed, nodes_created}`. MERGEs all object instances into Neo4j as nodes. |

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
| `ontology links sync-neo4j` *(write)* | POST | `/api/link-types/index-to-neo4j` | Body `{neo4j_data_source_id}`. MERGEs all link instances into Neo4j as relationships. |

### Evaluation

| CLI | Method | Path | Notes |
|---|---|---|---|
| `evaluation-datasets list` | GET | `/api/evaluation-datasets` | Optional query `knowledge_base_id`. |
| `evaluation-datasets create` | POST | `/api/evaluation-datasets` | Body `{name, knowledge_base_id, description?}`. |
| `evaluation-datasets get` | GET | `/api/evaluation-datasets/{id}` | Includes stats. |
| `evaluation-datasets items` | GET | `/api/evaluation-datasets/{id}/items` | Paginated. Each item is `{topic, query, expected_answer}`. |
| `evaluation-datasets run` | POST | `/api/evaluation-datasets/{id}/run` | Body optionally `{evaluation_type: "search_retrieval"\|"qa_answer"}`; default runs both. |
| `evaluation-runs list` | GET | `/api/evaluation-datasets/{dataset_id}/runs` | Paginated. |
| `evaluation-runs get` | GET | `/api/evaluation-datasets/{dataset_id}/runs/{run_id}` | Full run with per-item results. |
| `evaluation-runs compare` | GET | `/api/evaluation-datasets/{dataset_id}/runs/compare?run_a=&run_b=` | Returns per-metric diffs between two runs. |

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

For authoritative tables and extra routes the skill does not yet wrap (admin: providers, models, data sources, glossaries, taxonomy, pipelines, jobs), see the repository file `docs/features/api-reference.md`.
