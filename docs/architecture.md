# openKMS Architecture

**`docker/docker-compose.yml`** can run the full stack (Postgres with pgvector, MinIO, backend API, procrastinate worker with `openkms-cli`, frontend via nginx). For host dev, start only **`postgres`** and **`minio`** with `docker compose -f docker/docker-compose.yml up -d postgres minio`. Images are built from **`docker/Dockerfile`** (targets `backend`, `worker`) and **`docker/Dockerfile.frontend`**. **`docker/Makefile`** wraps **`docker compose build`**, **`up -d --build`**, and **`down`** (`make -C docker build|up|down`). Details: **`docker/README.md`**.

## High-Level Diagram

```mermaid
flowchart TB
  subgraph Frontend["Frontend (React/Vite)"]
    FE["Home, Documents, Articles, Knowledge Bases, Wikis, Glossaries, Pipelines, Jobs, Models"]
  end

  subgraph Backend["Backend (FastAPI)"]
    API["channels, documents, knowledge-bases, wiki-spaces, glossaries, pipelines, jobs, models, object-types, link-types, data-sources, datasets, feature-toggles"]
  end

  subgraph Storage["Data & Processing"]
    PG[("PostgreSQL + pgvector")]
    S3[(S3/MinIO)]
    Worker["procrastinate worker"]
  end

  subgraph WorkerDetail["Worker execution"]
    CLI["openkms-cli pipeline run (doc-parse, kb-index)"]
    VLM["mlx-vlm-server"]
  end

  subgraph QAAgent["QA Agent (FastAPI + LangGraph)"]
    Agent["RAG Agent: retrieve + generate"]
  end

  subgraph External["External Services"]
    LLM["OpenAI compatible Service Provider"]
  end

  Frontend -->|HTTP :8102| Backend
  Backend --> PG
  Backend --> S3
  Backend --> Worker
  Backend -->|metadata extraction, model test, FAQ generation| LLM
  Backend -->|proxy /ask| Agent
  Agent -->|search| Backend
  Agent --> LLM
  Worker --> S3
  Worker --> CLI
  CLI --> VLM
  CLI -->|metadata extraction, embeddings| LLM
  CLI -->|kb-index: chunks, FAQ embeddings| Backend
  CLI -->|wiki put/sync/upload-file| Backend
```

| Layer | Components |
|-------|------------|
| **PostgreSQL + pgvector** | users (local auth), **security_permissions** (permission key catalog: label, route/API patterns), **security_roles**, **security_role_permissions**, **user_security_roles** (local user ↔ role), **access_groups** and junction tables (**access_group_users**, **access_group_channels**, **access_group_knowledge_bases**, **access_group_wiki_spaces**, **access_group_evaluation_datasets**, **access_group_datasets**, **access_group_object_types**, **access_group_link_types**, **access_group_data_resources** → **data_resources**) for data-security scopes and named ABAC-style resources, documents, document_versions (explicit markdown+metadata snapshots per document), doc_channels, pipelines, api_providers, api_models, feature_toggles, object_types, object_instances, link_types, link_instances, data_sources, datasets, knowledge_bases, kb_documents, faqs, chunks, **wiki_spaces**, **wiki_pages**, **wiki_files**, evaluation_datasets, evaluation_dataset_items, evaluation_runs, evaluation_run_items, glossaries, glossary_terms, procrastinate_jobs |
| **S3/MinIO** | File storage under `{file_hash}/original.{ext}`; wiki **vault mirror** `wiki/{space_id}/vault/{relative-path}` for vault imports and multipart uploads with normalizeable paths (binaries + `.md` bodies); markdown pages also written as `…/vault/{wiki_path}.md` when storage is enabled; ad-hoc uploads with non-normalizeable names use `wiki/{space_id}/files/{file_id}/…` |
| **Worker** | Picks up jobs, spawns openkms-cli subprocess, updates document status / indexes knowledge bases |
| **OpenAI compatible Service Provider** | OpenAI, Anthropic, etc.; metadata extraction, FAQ generation, embeddings, and model playground (configured via api_models) |
| **QA Agent** | Separate FastAPI + LangGraph service; retrieves via backend search API (no DB access), generates answers via LLM; configurable per knowledge base |

## Frontend Structure

```mermaid
flowchart TB
  subgraph Providers["Provider hierarchy"]
    Auth[AuthContext + permission-catalog union / canAccessPath]
    FT[FeatureTogglesContext]
    DC[DocumentChannelsContext]
    Auth --> FT
    FT --> DC
  end

  subgraph Pages["Routes"]
    Home[Home]
    Docs[DocumentsIndex, DocumentChannel, DocumentDetail]
    Articles[Articles, ArticleDetail]
    KB[KnowledgeBaseList, KnowledgeBaseDetail]
    Wiki[WikiSpaceList, WikiSpaceDetail, WikiPageEditor]
    Eval[EvaluationDatasetList, EvaluationDatasetDetail]
    Glossaries[GlossaryList, GlossaryDetail]
    Pipelines[Pipelines]
    Jobs[Jobs, JobDetail]
    Models[Models, ModelDetail]
    Ontology[OntologyList; Datasets, DatasetDetail, ConsoleObjectTypes, ConsoleLinkTypes; ObjectsList, ObjectTypeDetail; LinksList, LinkTypeDetail; ObjectExplorer]
    Console[Console: Overview, Permission management, Data security, DataSources, Settings, Users, FeatureToggles]
  end

  Providers --> Pages
```

```
frontend/src/
├── main.tsx                 # Entry
├── App.tsx                  # Routes, providers (Auth → FeatureToggles → DocumentChannels), ErrorBoundary, Suspense + lazy routes
├── utils/permissionPatterns.ts  # Frontend glob rules aligned with backend; union of catalog patterns for SPA gate
├── config/index.ts          # API URL; config/permissions.ts (PERM_* mirrors for UI gating)
├── components/Layout/       # MainLayout (route gate), Sidebar (nav items gated by canAccessPath + toggles), Header
├── components/ErrorBoundary.tsx   # Catches uncaught errors, fallback UI with retry
├── components/ErrorBanner.tsx    # Page-level error banner (toast for transient errors)
├── contexts/                # DocumentChannelsContext, FeatureTogglesContext, AuthContext
├── data/                    # channelsApi, …, featureTogglesApi, securityAdminApi (admin permission catalog + roles), channelUtils
└── pages/
    ├── Home.tsx
    ├── DocumentsIndex.tsx   # /documents – overview
    ├── DocumentChannel.tsx  # /documents/channels/:channelId
    ├── DocumentChannels.tsx # /documents/channels – manage
    ├── DocumentChannelSettings.tsx
    ├── DocumentDetail.tsx
    ├── Articles.tsx, ArticleDetail.tsx
    ├── KnowledgeBaseList.tsx, KnowledgeBaseDetail.tsx
    ├── WikiSpaceList.tsx, WikiSpaceDetail.tsx (folder vault import: modal with skip options + folder picker; import runs after browser file-access prompt), WikiPageEditor.tsx
    ├── EvaluationDatasetList.tsx, EvaluationDatasetDetail.tsx
    ├── GlossaryList.tsx, GlossaryDetail.tsx
    ├── Pipelines.tsx, Jobs.tsx, JobDetail.tsx, Models.tsx, ModelDetail.tsx
    ├── OntologyList.tsx, ObjectsList.tsx, ObjectTypeDetail.tsx, LinksList.tsx, LinkTypeDetail.tsx, ObjectExplorer.tsx
    └── console/             # ConsoleLayout, Overview, ConsolePermissionManagement, ConsoleDataSecurityGroups, ConsoleDataResources, ConsoleGroupDataAccess, DataSources, Settings, Users, FeatureToggles (datasets & schema UIs live under /ontology/*)
```

## Backend Structure

```
backend/
├── app/
│   ├── main.py                  # FastAPI app, middleware (StrictPermissionPattern inside Session/CORS stack), routers, procrastinate lifespan; rejects default secret in production
│   ├── middleware/
│   │   └── strict_permission_patterns.py  # Optional OPENKMS_ENFORCE_PERMISSION_PATTERNS_STRICT: catalog pattern match + permission key check
│   ├── config.py                # Settings (env: OPENKMS_*); vlm_url primary for VLM
│   ├── oidc_discovery.py        # Cached GET {issuer}/.well-known/openid-configuration (JWKS + OAuth endpoints)
│   ├── constants.py             # DocumentStatus enum (uploaded, pending, running, completed, failed)
│   ├── database.py              # Async engine, get_db, init_db
│   ├── api/
│   │   ├── auth.py              # OIDC (discovery + JWKS) or local HS256 JWT; require_auth, require_admin, require_permission; /api/auth/* (me + permission-catalog with route/API patterns), sync-session
│   │   ├── admin/
│   │   │   ├── groups.py        # CRUD /api/admin/groups, scopes PUT (any auth); members PUT local-only (OIDC: GET empty, PUT 403)
│   │   │   ├── security_roles.py  # GET /api/admin/security-roles, PUT …/permissions
│   │   │   ├── security_permissions.py  # CRUD /api/admin/security-permissions (catalog rows)
│   │   │   └── permission_reference.py  # GET /api/admin/permission-reference (routes + APIs + operation_key_hints for admins)
│   │   ├── channels.py         # GET/POST/PUT /api/document-channels
│   │   ├── documents.py        # POST upload (store only), GET (channel_id, search, offset, limit), DELETE, PUT (name, channel_id), PUT metadata, PUT markdown, POST restore-markdown, POST rebuild-page-index, POST/GET versions, GET version, POST version restore, POST extract-metadata, GET page-index, GET section (by line range)
│   │   ├── object_types.py     # CRUD /api/object-types; is_master_data, display_property; is_master_data filter for label config; instances from Neo4j when available
│   │   ├── link_types.py       # CRUD /api/link-types; instances from Neo4j when available; count_from_neo4j param for Links page
│   │   ├── ontology_explore.py # POST /api/ontology/explore; execute read-only Cypher against Neo4j (Object Explorer)
│   │   ├── data_sources.py     # CRUD /api/data-sources (admin), POST /{id}/test, POST /{id}/neo4j-delete-all; credentials encrypted
│   │   ├── datasets.py         # CRUD /api/datasets (admin), GET /from-source/{id} lists PG tables, GET /{id}/rows and /{id}/metadata
│   │   ├── feature_toggles.py  # GET/PUT /api/feature-toggles (PUT admin-only); hasNeo4jDataSource for sidebar visibility
│   │   ├── knowledge_bases.py  # CRUD /api/knowledge-bases, documents, FAQs, chunks, search, ask proxy
│   │   ├── wiki_spaces.py      # /api/wiki-spaces: spaces, pages list (optional limit/offset/path_prefix), pages CRUD, PUT by-path, files, page-index; POST import/vault (zip/bulk), POST import/vault/markdown-file (single .md + rewrite)
│   │   ├── evaluation_datasets.py  # CRUD /api/evaluation-datasets, items, import (CSV), run (search_retrieval | qa_answer), runs list/get/delete/compare
│   │   ├── glossaries.py       # CRUD /api/glossaries, terms, export, import
│   │   ├── pipelines.py       # CRUD /api/pipelines, template-variables
│   │   ├── models.py           # CRUD /api/models, GET config-by-name (service client), POST test
│   │   ├── providers.py        # CRUD /api/providers (service providers: OpenAI, Anthropic, etc.)
│   │   ├── users_admin.py      # GET/POST/PATCH/DELETE /api/admin/users (console:users; local user CRUD + OIDC notice)
│   │   └── jobs.py             # GET/POST/DELETE /api/jobs, POST retry
│   ├── models/
│   │   ├── document.py          # Document model (+ status, metadata JSONB)
│   │   ├── document_version.py  # DocumentVersion (document_id FK, version_number, tag, note, markdown, metadata JSONB snapshot, created_by_*)
│   │   ├── document_channel.py  # DocumentChannel (+ pipeline_id, auto_process, extraction_model_id, extraction_schema, label_config, object_type_extraction_max_instances)
│   │   ├── pipeline.py         # Pipeline model (name, command, default_args, model_id)
│   │   ├── api_provider.py      # ApiProvider (name, base_url, api_key)
│   │   ├── api_model.py        # ApiModel (provider_id FK, name, category, model_name; inherits base_url/api_key from provider)
│   │   ├── feature_toggle.py  # FeatureToggle (key-value flags)
│   │   ├── user.py            # User (local auth: email, username, password_hash, is_admin)
│   │   ├── security_role.py # SecurityRole, SecurityRolePermission, UserSecurityRole
│   │   ├── security_permission.py # SecurityPermission (key, label, description, JSONB route/API patterns, sort_order)
│   │   ├── access_group.py  # AccessGroup, AccessGroupUser, junctions for channels/KBs/wiki/eval/datasets/object_types/link_types/data_resources
│   │   ├── data_resource.py  # DataResource, AccessGroupDataResource
│   │   ├── object_type.py     # ObjectType (name, description, properties JSONB, dataset_id FK, key_property, is_master_data, display_property)
│   │   ├── object_instance.py # ObjectInstance (object_type_id FK, data JSONB)
│   │   ├── link_type.py       # LinkType (source_object_type_id, target_object_type_id)
│   │   ├── link_instance.py   # LinkInstance (link_type_id, source_object_id, target_object_id)
│   │   ├── data_source.py     # DataSource (kind, host, port, database, username_encrypted, password_encrypted)
│   │   ├── dataset.py         # Dataset (data_source_id FK, schema_name, table_name)
│   │   ├── knowledge_base.py  # KnowledgeBase (name, description, embedding_model_id, judge_model_id, agent_url, chunk_config, faq_prompt, metadata_keys)
│   │   ├── kb_document.py     # KBDocument join table (knowledge_base_id, document_id)
│   │   ├── faq.py             # FAQ (knowledge_base_id, question, answer, embedding via pgvector)
│   │   ├── chunk.py           # Chunk (knowledge_base_id, document_id, content, embedding via pgvector)
│   │   ├── evaluation_dataset.py  # EvaluationDataset, EvaluationDatasetItem (query + expected answer)
│   │   ├── evaluation_run.py   # EvaluationRun, EvaluationRunItem (persisted run + per-item detail JSONB)
│   │   ├── glossary.py        # Glossary (name, description)
│   │   └── glossary_term.py   # GlossaryTerm (glossary_id, primary_en, primary_cn, definition, synonyms_en, synonyms_cn)
│   ├── schemas/
│   │   ├── document.py
│   │   ├── channel.py           # ChannelNode, ChannelCreate, ChannelUpdate, LabelConfigItem (label_config)
│   │   ├── pipeline.py         # PipelineCreate/Update/Response (+ model_id)
│   │   ├── api_model.py        # ApiModelCreate/Update/Response (+ provider_id)
│   │   ├── api_provider.py     # ApiProviderCreate/Update/Response
│   │   ├── job.py              # JobCreate/Response
│   │   ├── knowledge_base.py  # KB/FAQ/Chunk/Search/Ask schemas
│   │   ├── glossary.py        # Glossary/Term Create/Update/Response, Export/Import schemas
│   │   ├── ontology.py        # ObjectType/LinkType/ObjectInstance/LinkInstance schemas
│   │   └── data_source.py     # DataSourceCreate/Response; dataset.py for Dataset schemas
│   ├── jobs/
│   │   ├── __init__.py          # procrastinate App (PsycopgConnector)
│   │   └── tasks.py            # run_pipeline task, run_kb_index task (subprocess openkms-cli)
│   └── services/
│       ├── credential_encryption.py # Fernet encrypt/decrypt for DataSource credentials
│       ├── model_testing.py         # Model playground: build URL/headers/payload, parse response by category
│       ├── metadata_extraction.py   # pydantic-ai Agent + StructuredDict for metadata extraction (abstract, author, tags, object_type, list[object_type])
│       ├── faq_generation.py             # LLM-based FAQ pair generation from document markdown
│       ├── glossary_term_suggestion.py   # LLM suggests translation, definition, synonyms for glossary terms
│       ├── kb_search.py                  # Semantic search over chunks and FAQs (used by search route and evaluation)
│       ├── search_judge.py               # LLM judges: search retrieval vs expected answer; QA answer vs expected answer
│       ├── evaluation/execute.py         # Run strategies: search_retrieval, qa_answer (agent HTTP + judge)
│       ├── page_index.py                 # md_to_tree_from_markdown (# headings); used when saving/restoring markdown
│       ├── wiki_vault_import.py          # Obsidian vault bulk import: S3 vault mirror `wiki/{space_id}/vault/{path}`, upsert wiki_files on same path, markdown mirrors, link rewrite; strip NUL for PostgreSQL
│       ├── storage.py                    # S3/MinIO client (upload, delete)
│       ├── permission_catalog.py       # PERM_* constants, OPERATION_KEY_HINTS for admin reference UI
│       ├── permission_seed.py          # Alembic seed: only ``all`` row for security_permissions when table empty
│       ├── permission_pattern_engine.py   # Compile ``backend_api_patterns`` / match method+path; frontend-style glob helpers
│       ├── permission_pattern_cache.py    # TTL cache for compiled rules; invalidated on admin catalog mutations
│       ├── permission_default_patterns.py # Default frontend/backend pattern lists per PERM_* (used by Alembic backfill)
│       ├── permission_reference.py     # Frontend route catalog + OpenAPI-derived API list for admin permission setup
│       ├── security_permission_service.py  # List/sort permissions from DB; keys set for role validation
│       ├── permission_resolution.py    # Permissions: local via user_security_roles; OIDC via JWT realm role name matching security_roles.name
│       ├── user_roles_sync.py          # Sync user_security_roles from users.is_admin; create member role with `all` if missing
│       ├── data_scope.py               # OPENKMS_ENFORCE_GROUP_DATA_SCOPES: effective channel/KB/eval/dataset/ontology IDs; channel subtree expansion
│       └── data_resource_policy.py     # Validate data resource payloads; SQL predicates (documents); entity matchers (KB, eval, dataset, ontology types)
├── scripts/
│   ├── ensure_pgvector.py       # Pre-start: check/create pgvector extension; auto-install in Docker if missing
│   └── seed_mock_insurance_data.py  # Create mock diseases, insurance_products, disease_insurance_product tables in schema 'mock'
├── pyproject.toml               # Dependencies (uv.lock for reproducible installs)
└── worker.py                    # procrastinate worker entry point
```

## openkms-cli

Standalone CLI for document parsing, designed for backend integration. Developers can add CLI tools for pipeline steps.

```
openkms-cli/
├── pyproject.toml           # typer>=0.9.0, optional [parse], [pipeline], [metadata], [kb]
├── openkms_cli/
│   ├── __init__.py
│   ├── __main__.py          # python -m openkms_cli
│   ├── app.py               # Typer app, registers subcommands
│   ├── settings.py          # CliSettings: explicit env var names (validation_alias); pydantic-settings
│   ├── auth.py              # OIDC client credentials or local HTTP Basic (try_api_request_auth)
│   ├── extract.py           # Metadata extraction via pydantic-ai (optional [metadata])
│   ├── parse_cli.py         # parse run command
│   ├── parser.py            # PaddleOCR-VL wrapper (optional [parse])
│   ├── pipeline_cli.py      # pipeline list, pipeline run (doc-parse, kb-index); optional [pipeline], [kb]
│   └── kb_indexer.py        # Chunking, embedding, pgvector bulk insert (optional [kb])
└── README.md
```

- **Purpose**: Decouple parsing from backend; run via subprocess in worker/job context
- **Configuration**: `openkms_cli/settings.py` maps each environment variable explicitly (no hidden prefix); loads `openkms-cli/.env` then cwd `.env`; CLI flags override when passed
- **Commands**: `parse run`, `pipeline list`, `pipeline run`
- **Pipeline run**: Download from S3 → parse → upload to S3. When channel has extraction_model_id and extraction_schema, worker passes `--extract-metadata --extraction-model-name <model_name>`; CLI fetches model config via `GET /api/models/config-by-name`, extracts via pydantic-ai, PUTs to backend
- **Output**: result.json, markdown.md, layout_det_*, block_*, markdown_out/* (compatible with openKMS backend)
- **KB indexing**: `openkms-cli pipeline run --pipeline-name kb-index --knowledge-base-id <id>` – fetches KB config and documents from backend API, splits documents into chunks (fixed_size, markdown_header, paragraph), propagates document metadata to chunks/FAQs per `metadata_keys`, generates embeddings via OpenAI-compatible API, writes chunks via `POST /chunks/batch` and FAQ embeddings via `PUT /faqs/batch-embeddings` (no direct DB access)
- **Extensible**: Add new Typer subapps in app.py for additional CLI tools

## QA Agent Service

```
qa-agent/
├── pyproject.toml           # FastAPI, LangGraph, langchain-openai, httpx
├── qa_agent/
│   ├── __init__.py
│   ├── main.py              # FastAPI app with /ask endpoint
│   ├── config.py            # Settings (backend URL, LLM)
│   ├── agent.py             # LangGraph agent: retrieve → generate (with tools) → tools
│   ├── retriever.py         # Calls backend search API (no DB access)
│   ├── ontology_client.py   # GET object-types, link-types; POST ontology/explore (Cypher)
│   ├── tools.py             # get_ontology_schema_tool, run_cypher_tool
│   └── schemas.py           # AskRequest/AskResponse
├── .env.example
└── README.md
```

- **Purpose**: Separate RAG + ontology service for Q&A against knowledge bases; configurable per KB via `agent_url`
- **Architecture**: LangGraph state graph: `retrieve` (KB search) → `generate` (LLM with tools) ⇄ `tools` (ontology). RAG via `POST /api/knowledge-bases/{id}/search`; ontology via `GET /api/object-types`, `GET /api/link-types`, `POST /api/ontology/explore` (Cypher). Does not access the database directly.
- **Ontology skills**: For coverage questions (e.g. "Which insurance products cover heart attack?"), the agent calls `get_ontology_schema_tool` to learn node labels and relationship types, then `run_cypher_tool` to query Neo4j.
- **Integration**: Backend proxies `POST /api/knowledge-bases/{kb_id}/ask` to `{kb.agent_url}/ask`, passing the user's access token so the agent can call the backend APIs
- **Port**: 8103 by default

## Data Flow

### Document Upload (Decoupled)

```mermaid
sequenceDiagram
  participant U as User
  participant FE as Frontend
  participant BE as Backend
  participant S3 as S3/MinIO
  participant DB as PostgreSQL
  participant Q as procrastinate

  U->>FE: Select files, choose channel
  FE->>BE: POST /api/documents/upload
  BE->>S3: Store {file_hash}/original.{ext}
  BE->>DB: Create Document (status=uploaded)
  alt channel.auto_process && pipeline_id
    BE->>Q: defer run_pipeline job
    BE->>DB: status=pending
  end
  BE-->>FE: DocumentResponse
```

1. Frontend opens upload modal on channel page; user selects files; `POST /api/documents/upload` (multipart: file + channel_id)
2. Backend stores original file to S3/MinIO under `{file_hash}/original.{ext}`; creates Document with `status=uploaded` (no parsing at upload time)
3. If channel has `auto_process=true` and a linked pipeline, a procrastinate job is deferred automatically (`status=pending`)
4. Response: DocumentResponse with status

### Document Processing (Job Queue)

```mermaid
sequenceDiagram
  participant Q as procrastinate worker
  participant DB as PostgreSQL
  participant CLI as openkms-cli
  participant S3 as S3/MinIO
  participant VLM as mlx-vlm-server
  participant BE as Backend API

  Q->>DB: Pick up job, status=running
  Q->>CLI: Spawn pipeline run (rendered command)
  CLI->>S3: Download original
  CLI->>VLM: Parse (PaddleOCR-VL)
  VLM-->>CLI: Markdown, layout
  CLI->>S3: Upload result.json, markdown.md, images
  alt extraction enabled
    CLI->>BE: PUT /api/documents/{id}/metadata
  end
  Q->>S3: Read result.json
  Q->>DB: status=completed, parsing_result, markdown
```

1. Jobs can be created: manually via `POST /api/jobs`, or automatically on upload (if channel has auto_process)
2. The job references a Pipeline configuration (command template with `{variable}` placeholders, default_args, optional linked model)
3. procrastinate worker picks up the job, renders the command template (substituting `{input}`, `{s3_prefix}`, `{vlm_url}`, `{model_name}`, etc.; model-linked values override defaults), sets `Document.status=running`
4. If document's channel has extraction_model_id and extraction_schema, worker appends `--extract-metadata --document-id ... --api-url ... --extraction-schema-file ... --extraction-model-base-url ... --extraction-model-name ...` and passes `EXTRACTION_MODEL_API_KEY` in env
5. Worker spawns the rendered command (e.g. `openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input s3://bucket/{file_hash}/original.{ext} --s3-prefix {file_hash}`)
6. CLI authenticates to the API (OIDC client credentials Bearer token, or HTTP Basic in `OPENKMS_AUTH_MODE=local`), parses document via PaddleOCR-VL, uploads results to S3; if extraction enabled, extracts metadata via pydantic-ai and PUTs to `PUT /api/documents/{id}/metadata`
7. Worker reads result.json from S3, updates Document (parsing_result, markdown, `status=completed`)
8. On failure: `status=failed`; user can retry via `POST /api/jobs/{id}/retry`

### Document Detail

1. Frontend fetches `GET /api/documents/{id}` – document includes parsing_result, markdown, and status
2. Document files (images, markdown assets): frontend requests `GET /api/documents/{id}/files/{file_hash}/{path}`; backend redirects (302) to presigned S3 URL via frontend proxy
3. If document status is `uploaded` or `failed`, a "Process" button appears to trigger processing
4. If document status is `pending` or `failed`, a "Reset" button appears to reset status to `uploaded` (only if no active jobs exist)
5. Metadata section: single unified METADATA section (extracted + manual labels); extract via pydantic-ai Agent + StructuredDict (channel's extraction_model_id + extraction_schema, supports object_type and list[object_type]); `POST /api/documents/{id}/extract-metadata`; manual edit via `PUT /api/documents/{id}/metadata` (editable fields per extraction_schema and label_config)
6. Document info: Name editable via Edit button; `PUT /api/documents/{id}` with `{ name }`
7. Markdown edit: Edit/View toggle in markdown panel; edit mode shows textarea with Save (`PUT /api/documents/{id}/markdown`) and Restore (`POST /api/documents/{id}/restore-markdown`) from S3 `{file_hash}/markdown.md`; only for real documents (not examples)
8. Document versions: **Save version** / **Versions** in Document Information section (version column); explicit snapshots via `POST /api/documents/{id}/versions` (current markdown + metadata); list, preview, restore (`POST .../versions/{vid}/restore`); routine saves do not create versions

### Channel Tree

1. Frontend `DocumentChannelsContext` fetches `GET /api/document-channels`
2. Backend returns nested `ChannelNode[]` (id, name, description, children)
3. Sidebar and Documents pages use `channelUtils` (flattenChannels, getDocumentChannelName, etc.)

### Document List by Channel

- Frontend fetches `GET /api/documents?channel_id=` for the current channel; `channel_id` optional (all documents)
- Optional `search` param filters by document name; `limit` defaults to 200
- Backend returns documents in channel and descendants (or all if no channel)

## Authentication (`OPENKMS_AUTH_MODE`)

Two modes (default **`oidc`**). Deployments should keep **backend** `OPENKMS_AUTH_MODE` and **frontend** behavior in sync: the SPA calls **`GET /api/auth/public-config`** (no auth) for `auth_mode` and `allow_signup`, chooses **OIDC (Authorization Code + PKCE via `oidc-client-ts`)** vs local forms from the API, and shows a banner if `VITE_AUTH_MODE` is set and disagrees. `VITE_AUTH_MODE` is only a fallback when that request fails.

### OIDC mode (standards-compliant OpenID Connect IdP)

```mermaid
flowchart LR
  subgraph UserFlow["User auth flow"]
    U[User] -->|"kc.login()"| KC[OIDC IdP]
    KC -->|"Auth Code + PKCE"| FE[Frontend]
    FE -->|"Bearer JWT"| BE[Backend API]
    FE -->|"POST /sync-session"| BE
  end

  subgraph BackendAuth["Backend accepts"]
    BE
    BE -->|"JWT or session cookie"| JWKS[IdP JWKS]
  end

  subgraph CLIAuth["openkms-cli (worker)"]
    CLI[openkms-cli] -->|"Client credentials"| KC
    CLI -->|"Bearer token"| BE
  end
```

- **Backend**: Resolves **`OPENKMS_OIDC_ISSUER`** or **`{OPENKMS_OIDC_AUTH_SERVER_BASE_URL}/realms/{OPENKMS_OIDC_REALM}`**, fetches **`{issuer}/.well-known/openid-configuration`**, validates JWTs with **`jwks_uri`**, and uses discovery **`authorization_endpoint`**, **`token_endpoint`**, **`end_session_endpoint`**. Session cookie optional after `POST /sync-session`.
- **Frontend**: **`oidc-client-ts`** (`UserManager`) when `public-config` reports `oidc`; redirect URIs **`/auth/callback`** and **`/auth/silent-renew`**; `POST /sync-session` after login.
- `GET /login` / `GET /login/oauth2/code/oidc` (and legacy `/login/oauth2/code/keycloak`) – backend OAuth redirect and callback for the confidential client.
- `GET /logout` – clears session; redirects to IdP logout when configured.

### Local mode (PostgreSQL users)

- **Backend**: `OPENKMS_AUTH_MODE=local`. Users in `users` table; passwords hashed (bcrypt); access tokens are HS256 JWTs signed with `OPENKMS_SECRET_KEY` (claims mirror OIDC-style `sub`, `realm_access.roles`, etc.).
- **Endpoints**: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` (returns `is_admin` and `roles` from `realm_access.roles`), `POST /api/auth/logout`. `POST /sync-session` accepts local JWT for cookie-backed requests.
- **CLI**: `OPENKMS_CLI_BASIC_USER` / `OPENKMS_CLI_BASIC_PASSWORD` → `Authorization: Basic` (use only on trusted networks without TLS).
- **Frontend**: `/login` and `/signup` when `public-config` reports `local`; signup link hidden if `allow_signup` is false; session cookie after sync-session; API calls use `credentials: 'include'`.
- OIDC redirect routes redirect to `/login?notice=local_auth` when hit in local mode.

### Shared

- **Route protection**: All pages except home (and `/login`, `/signup` in local mode) require auth. **`/profile`** shows the current user from `GET /api/auth/me` (administrator flag, role list, header user menu).
- **Console**: `admin` in `realm_access.roles` (OIDC) grants full permissions (all keys from `security_permissions`). Other OIDC users: each JWT realm role whose **name equals** a `security_roles.name` row contributes that role’s permission keys (union). Local: `is_admin` or `user_security_roles`.
- `POST /clear-session` – clears backend session cookie.

## Configuration

| Layer | Config |
|-------|--------|
| Backend | `.env` / `OPENKMS_*` – database, VLM, PaddleOCR, extraction_model_id, OPENKMS_BACKEND_URL (for CLI metadata extraction) |
| Backend | `OPENKMS_AUTH_MODE` – `oidc` (default) or `local`; `OPENKMS_ALLOW_SIGNUP`, `OPENKMS_INITIAL_ADMIN_USER`, `OPENKMS_CLI_BASIC_*`, `OPENKMS_LOCAL_JWT_EXP_HOURS` |
| Backend | `OPENKMS_OIDC_*`, `OPENKMS_FRONTEND_URL` – issuer, confidential client, SPA origin, post-logout client id, service client id (`azp`) for CLI JWT |
| Backend | `AWS_*` – S3/MinIO for file storage (optional) |
| Frontend | `config/index.ts` – `apiUrl`, `authMode` (fallback), `oidc` (`VITE_OIDC_*`). Runtime mode from `GET /api/auth/public-config`. Optional `VITE_AUTH_MODE` fallback if the API is unreachable |
| Vite dev | Proxy `/api`, `/sync-session`, `/clear-session` → backend; `/buckets/openkms` → MinIO |
| Alembic | `alembic.ini` – uses `settings.database_url_sync` |
| Cursor | `.cursor/rules/` – project rules (e.g. docs-before-commit, alembic-migrations) |
