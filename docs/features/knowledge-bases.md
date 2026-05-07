# Knowledge bases

Index documents into a knowledge base, generate FAQs and chunks, run hybrid semantic search, and proxy questions to a separate **QA Agent** service. Visibility toggles via Console → Feature Toggles.

| Feature | Status | Description |
|---------|--------|-------------|
| KB management | ✅ | CRUD via `/api/knowledge-bases`; KnowledgeBaseList with create/edit/delete |
| KB documents | ✅ | Add/remove documents to KB (join table); link existing documents without copying; Add Documents dialog: left sidebar channel tree, right documents list with search and pagination |
| FAQs | ✅ | Manual create/edit/delete FAQ pairs; LLM-based FAQ generation from documents; FAQ list shows source document; paginated list (offset, limit); Edit FAQ modal with key-value form for document metadata (from KB metadata_keys; channel label_config/extraction_schema for object_type/list[object_type]) |
| FAQ generation | ✅ | Two-step: `POST /faqs/generate` returns preview; user reviews, removes unqualified; `POST /faqs/batch` saves selected; configurable prompt in KB settings and modal; when multiple documents selected, generates one-by-one with progress in dialog |
| Chunks | ✅ | Document chunks stored with pgvector embeddings; configurable chunking strategy (fixed_size, markdown_header, paragraph); paginated list (offset, limit); Edit Chunk modal with content and document metadata (same key-value form as FAQ) |
| Semantic search | ✅ | `POST /api/knowledge-bases/{id}/search` using pgvector cosine distance over chunks and FAQs; search_type (all/chunks/faqs) to choose scope; supports metadata_filters for hybrid search; **`include_historical_documents`** (default false) includes chunks/FAQs tied to superseded or out-of-window documents; Search tab has All/Chunks/FAQs tabs and collapsible Filters when KB has metadata_keys configured; comma-separated for multiple values; returns 503 with install instructions if pgvector missing |
| QA proxy | ✅ | `POST /api/knowledge-bases/{id}/ask` proxies to configurable agent service URL |
| KB settings | ✅ | Agent URL, embedding model selection, chunk strategy/size/overlap, FAQ generation prompt, metadata_keys (keys to propagate from documents to FAQs/chunks) |
| KB indexing (CLI) | ✅ | `openkms-cli pipeline run --pipeline-name kb-index` – chunk documents, generate embeddings (from KB **`embedding_model_id`** / `api_models`; optional `OPENKMS_EMBEDDING_MODEL_*` in **`openkms-cli/.env`** only), bulk insert to pgvector |
| KB indexing (job) | ✅ | `run_kb_index` procrastinate task for background indexing |
| QA Agent service | ✅ | Separate FastAPI + LangGraph project (`qa-agent/`); RAG via backend search API; LangGraph skills: ontology (get schema, run Cypher), page_index (read TOC, select section, extract content, determine sufficient, generate answer) |
| Q&A tab | ✅ | Chat-like interface in KB detail page for asking questions; hidden when agent URL is not configured |
