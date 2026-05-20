# Knowledge bases

Index documents into a knowledge base, generate FAQs and chunks, run hybrid semantic search, and proxy questions to a separate **QA Agent** service. Visibility toggles via Console → Feature Toggles.

| Feature | Status | Description |
|---------|--------|-------------|
| SPA i18n | ✅ | List + detail UI use **`knowledgeBase`** namespace (`frontend/src/i18n/locales/{en,zh-CN}/knowledgeBase.json`) |
| KB management | ✅ | CRUD via `/api/knowledge-bases`; KnowledgeBaseList with create/edit/delete |
| KB documents | ✅ | Add/remove documents to KB (join table); link existing documents without copying; Add Documents dialog: left sidebar channel tree, right documents list with search and pagination |
| KB wiki spaces | ✅ | Dedicated **Wiki spaces** tab on KB detail (same pattern as Documents): link spaces (`GET/POST/DELETE …/wiki-spaces`); `kb-index` pulls page bodies via `GET …/wiki-pages-for-index`, chunks them with the same strategy as documents, and stores `chunks` with `wiki_page_id` (and optional `doc_metadata` from page metadata when `metadata_keys` matches); unlinking a space removes those chunks from the KB |
| FAQs | ✅ | Manual create/edit/delete FAQ pairs; LLM-based FAQ generation from documents; FAQ list shows source document; paginated list (offset, limit); Edit FAQ modal with key-value form for document metadata (from KB metadata_keys; channel label_config/extraction_schema for object_type/list[object_type]) |
| FAQ generation | ✅ | Two-step: `POST /faqs/generate` returns preview; user reviews, removes unqualified; `POST /faqs/batch` saves selected; configurable prompt in KB settings and modal; when multiple documents selected, generates one-by-one with progress in dialog |
| Chunks | ✅ | Document or wiki-page chunks stored with pgvector embeddings; configurable chunking strategy (fixed_size, markdown_header, paragraph); paginated list (offset, limit); Edit Chunk modal with content and document metadata (same key-value form as FAQ) |
| Semantic search | ✅ | `POST /api/knowledge-bases/{id}/search` using pgvector cosine distance over **chunks** (document-backed and wiki-page-backed) and FAQs; wiki-sourced chunk hits include `wiki_page_id` and `wiki_space_id` for linking; with a QA agent URL and no filters, hybrid recall (BM25 + dense + RRF) includes the same chunks. **`search_type`** `chunks` \| `faqs` \| `all` chooses scope; metadata filters apply to stored `doc_metadata` on chunks (wiki pages can populate this when `metadata_keys` match page metadata). **`include_historical_documents`** (default false) includes chunks/FAQs tied to superseded or out-of-window documents; Search tab has All/Chunks/FAQs toggles and collapsible Filters when KB has metadata_keys configured; comma-separated for multiple values; returns 503 with install instructions if pgvector missing |
| QA proxy | ✅ | `POST /api/knowledge-bases/{id}/ask` proxies to configurable agent service URL |
| KB settings | ✅ | Agent URL, embedding model selection, chunk strategy/size/overlap, FAQ generation prompt, metadata_keys (keys to propagate from documents to FAQs/chunks). **Index in background** is a compact fieldset at the bottom of the form (same bordered style as chunking). **Save** sits in the settings header next to the title. On wide screens the form uses a two-column layout (connection & chunking left, FAQ prompt and metadata keys right) |
| KB indexing (CLI) | ✅ | `openkms-cli pipeline run --pipeline-name kb-index --knowledge-base-id <id> --api-url <backend>` — chunks **linked documents** and pages from **linked wiki spaces** (via `GET …/wiki-pages-for-index`); embeddings via **`GET /internal-api/models/kb-embedding-credentials`** (same auth as VLM defaults; optional `OPENKMS_EMBEDDING_MODEL_*` in **`openkms-cli/.env`** overrides); bulk insert to pgvector. Requires API auth matching the backend (`OPENKMS_AUTH_MODE` + Basic or OIDC client credentials per `openkms-cli/.env`). See **Indexing with openkms-cli** below. |
| KB indexing (job) | ✅ | **`run_kb_index`** procrastinate task (worker runs openkms-cli kb-index). **Settings** tab: **Queue indexing job** calls **`POST /api/knowledge-bases/{id}/index-job`** (no pipeline pick); same rows on **Jobs** as document jobs |
| QA Agent service | ✅ | Separate FastAPI + LangGraph project (`qa-agent/`); RAG via backend search API; hybrid recall then optional cross-encoder rerank (`POST …/v1/rerank`). If the LLM host returns **404** on rerank, set **`OPENKMS_RERANK_BASE_URL`** or **`OPENKMS_RERANK_ENABLED=false`**. **Langfuse** (optional `LANGFUSE_*`): traces join a **Session** when the SPA sends **`session_id`** on ask/stream (opaque UUID per full-page Q&A open). **`LANGFUSE_TRACE_STREAMING`** defaults **true** (stream + `/ask` traced); set **false** to trace only **`/ask`** if OpenTelemetry logs noise. Bearer token is not copied into trace metadata. Skills include ontology and page_index |
| Q&A | ✅ | **Q&A** full-page chat streams **`POST …/ask/stream`**. **`done.sources`**: retrieval chunks unless **Page Index** (`document_section`) or successful **ontology** **`run_cypher_tool`** (then **`ontology`** rows: object-type list + Cypher summaries, not chunk snippets). **Back** clears the trace session id for the next visit. Without an agent URL, the button is hidden |

### Indexing with openkms-cli (documents + linked wiki spaces)

1. In the app: link **documents** and/or **wiki spaces** to the knowledge base.
2. **Optional — from the app:** open the KB **Settings** tab and use **Queue indexing job** to enqueue **`run_kb_index`** on the worker (requires a saved **embedding model**). Track progress on **Jobs** (same listing as document parse jobs).
3. Install CLI extras: `cd openkms-cli && pip install -e ".[kb]"`.
4. Configure **`openkms-cli/.env`**: at minimum **`OPENKMS_API_URL`** (e.g. `http://127.0.0.1:8102`), **`OPENKMS_AUTH_MODE`** (`local` or `oidc`), and credentials (**`OPENKMS_CLI_BASIC_USER`** / **`OPENKMS_CLI_BASIC_PASSWORD`** for local, or OIDC client fields per `openkms_cli/settings.py`). Embeddings use **`GET /internal-api/models/kb-embedding-credentials`** with that auth (same pattern as VLM **`document-parse-defaults`**); optional **`OPENKMS_EMBEDDING_MODEL_*`** overrides base URL, model name, or API key.
5. Run:

```bash
openkms-cli pipeline run --pipeline-name kb-index --knowledge-base-id <KB_UUID> --api-url http://127.0.0.1:8102
```

`--api-url` defaults from `OPENKMS_API_URL` if omitted. The job replaces all chunks for that KB and re-embeds FAQs; wiki pages are included only for spaces linked to the KB.
