# openKMS Architecture

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React/Vite)                   │
│  Home | Documents | Articles | Knowledge Bases | Pipelines | ...│
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP (localhost:8102)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                            │
│  /api/channels | /api/documents | /api/pipelines | /api/jobs    │
│  (upload stores file only; jobs deferred via procrastinate)      │
└───────┬────────────────┬──────────────────┬─────────────────────┘
        │                │                  │
        ▼                ▼                  ▼
┌──────────────┐ ┌────────────────┐ ┌────────────────────────────┐
│ PostgreSQL   │ │ S3/MinIO       │ │ procrastinate worker       │
│ documents    │ │ file storage   │ │ (picks up jobs, spawns     │
│ doc_channels │ │                │ │  openkms-cli subprocess)   │
│ pipelines    │ │                │ │                            │
│ procrastinate│ │                │ │ → openkms-cli pipeline run │
│  _jobs       │ │                │ │ → mlx-vlm-server (VLM)    │
└──────────────┘ └────────────────┘ └────────────────────────────┘
```

## Frontend Structure

```
frontend/src/
├── main.tsx                 # Entry, providers (Auth, FeatureToggles, DocumentChannels)
├── App.tsx                  # Routes
├── config/index.ts          # API URL
├── components/Layout/       # MainLayout, Sidebar, Header
├── contexts/                # DocumentChannelsContext, FeatureTogglesContext, AuthContext
├── data/                    # channelsApi, documentsApi, pipelinesApi, jobsApi, channelUtils
└── pages/
    ├── Home.tsx
    ├── DocumentsIndex.tsx   # /documents – overview
    ├── DocumentChannel.tsx  # /documents/channels/:channelId
    ├── DocumentChannels.tsx # /documents/channels – manage
    ├── DocumentChannelSettings.tsx
    ├── DocumentDetail.tsx
    ├── Articles.tsx, ArticleDetail.tsx
    ├── KnowledgeBaseList.tsx, KnowledgeBaseDetail.tsx
    ├── Pipelines.tsx, Jobs.tsx, JobDetail.tsx, Models.tsx
    └── console/             # ConsoleLayout, Overview, Settings, Users, FeatureToggles
```

## Backend Structure

```
backend/
├── app/
│   ├── main.py                  # FastAPI app, CORS, routers, procrastinate lifespan
│   ├── config.py                # Settings (env: OPENKMS_*)
│   ├── database.py              # Async engine, get_db, init_db
│   ├── api/
│   │   ├── auth.py              # OAuth2 Keycloak login/logout
│   │   ├── channels.py         # GET/POST/PUT /api/channels/documents
│   │   ├── documents.py        # POST upload (store only), GET, DELETE
│   │   ├── pipelines.py        # CRUD /api/pipelines, template-variables
│   │   └── jobs.py             # GET/POST/DELETE /api/jobs, POST retry
│   ├── models/
│   │   ├── document.py          # Document model (+ status field)
│   │   ├── document_channel.py  # DocumentChannel (+ pipeline_id, auto_process)
│   │   └── pipeline.py         # Pipeline model (name, command, default_args)
│   ├── schemas/
│   │   ├── document.py
│   │   ├── channel.py           # ChannelNode, ChannelCreate, ChannelUpdate
│   │   ├── pipeline.py         # PipelineCreate/Update/Response
│   │   └── job.py              # JobCreate/Response
│   ├── jobs/
│   │   ├── __init__.py          # procrastinate App (PsycopgConnector)
│   │   └── tasks.py            # run_pipeline task (subprocess openkms-cli)
│   └── services/
│       ├── document_parser.py       # PaddleOCR-VL integration
│       ├── document_storage.py      # parse_and_store → S3/MinIO (legacy)
│       ├── document_extraction_utils.py
│       └── storage.py               # S3/MinIO client (upload, delete)
└── worker.py                    # procrastinate worker entry point
```

## openkms-cli

Standalone CLI for document parsing, designed for backend integration. Developers can add CLI tools for pipeline steps.

```
openkms-cli/
├── pyproject.toml           # typer>=0.9.0, optional [parse], [pipeline]
├── openkms_cli/
│   ├── __init__.py
│   ├── __main__.py          # python -m openkms_cli
│   ├── app.py               # Typer app, registers subcommands
│   ├── parse_cli.py         # parse run command
│   ├── parser.py            # PaddleOCR-VL wrapper (optional [parse])
│   └── pipeline_cli.py     # pipeline download, upload, run (optional [pipeline])
└── README.md
```

- **Purpose**: Decouple parsing from backend; run via subprocess in worker/job context
- **Commands**: `parse run`, `pipeline run`
- **Pipeline run**: Download from S3 → parse → upload to S3 (`--input s3://...`, `--s3-prefix {file_hash}`)
- **Output**: result.json, markdown.md, layout_det_*, block_*, markdown_out/* (compatible with openKMS backend)
- **Extensible**: Add new Typer subapps in app.py for additional CLI tools

## Data Flow

### Document Upload (Decoupled)

1. Frontend opens upload modal on channel page; user selects files; `POST /api/documents/upload` (multipart: file + channel_id)
2. Backend stores original file to S3/MinIO under `{file_hash}/original.{ext}`; creates Document with `status=uploaded` (no parsing at upload time)
3. If channel has `auto_process=true` and a linked pipeline, a procrastinate job is deferred automatically (`status=pending`)
4. Response: DocumentResponse with status

### Document Processing (Job Queue)

1. Jobs can be created: manually via `POST /api/jobs`, or automatically on upload (if channel has auto_process)
2. The job references a Pipeline configuration (command template with `{variable}` placeholders, default_args)
3. procrastinate worker picks up the job, renders the command template (substituting `{input}`, `{s3_prefix}`, etc.), sets `Document.status=running`
4. Worker spawns the rendered command (e.g. `openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input s3://bucket/{file_hash}/original.{ext} --s3-prefix {file_hash}`)
5. CLI parses document via PaddleOCR-VL, uploads results to S3
6. Worker reads result.json from S3, updates Document (parsing_result, markdown, `status=completed`)
7. On failure: `status=failed`; user can retry via `POST /api/jobs/{id}/retry`

### Document Detail

1. Frontend fetches `GET /api/documents/{id}` – document includes parsing_result, markdown, and status
2. Document files (images, markdown assets): frontend requests `GET /api/documents/{id}/files/{file_hash}/{path}`; backend redirects (302) to presigned S3 URL via frontend proxy
3. If document status is `uploaded` or `failed`, a "Process" button appears to trigger processing
4. If document status is `pending` or `failed`, a "Reset" button appears to reset status to `uploaded` (only if no active jobs exist)

### Channel Tree

1. Frontend `DocumentChannelsContext` fetches `GET /api/channels/documents`
2. Backend returns nested `ChannelNode[]` (id, name, description, children)
3. Sidebar and Documents pages use `channelUtils` (flattenChannels, getDocumentChannelName, etc.)

### Document List by Channel

- Frontend fetches `GET /api/documents?channel_id=` for the current channel
- Backend returns documents in channel and descendants

## Authentication (Keycloak)

- **Backend**: Requires auth for `/api/*` (channels, documents). Accepts either session cookie (from backend OAuth flow) or `Authorization: Bearer <JWT>`. JWT validated via Keycloak JWKS.
- **Frontend**: Keycloak JS adapter (Authorization Code + PKCE); sends Bearer token in API requests; calls `POST /sync-session` after login to sync JWT to backend session (for img requests that use cookies).
- **Login**: Uses `kc.login()` (SSO if user already has Keycloak session).
- **Logout**: Uses `kc.logout()` – redirects to Keycloak logout, then back to frontend. Requires frontend origin in Keycloak "Valid Post Logout Redirect URIs".
- `GET /login` – redirects to Keycloak (backend OAuth, optional)
- `GET /login/oauth2/code/keycloak` – OAuth callback; stores tokens in session
- `POST /sync-session` – accepts Bearer JWT; stores in session (for frontend Keycloak JS flow)
- `POST /clear-session` – clears backend session only (called before Keycloak logout)
- `GET /logout` – clears session; redirects to Keycloak logout (legacy)
- **Route protection**: All pages except home require auth; unauthenticated users see "Authentication Required" with Sign in button.
- **Console**: Only users with realm role `admin` can access (Header link, Sidebar, routes). Non-admins redirected to home.

## Configuration

| Layer | Config |
|-------|--------|
| Backend | `.env` / `OPENKMS_*` – database, VLM, PaddleOCR |
| Backend | `KEYCLOAK_*` – auth server, realm, client id/secret, redirect URI, frontend URL |
| Backend | `AWS_*` – S3/MinIO for file storage (optional) |
| Frontend | `config/index.ts` – `apiUrl`, `keycloak` (url, realm, clientId). In dev, `apiUrl` defaults to '' (uses proxy). |
| Vite dev | Proxy `/api`, `/sync-session`, `/clear-session` → backend; `/buckets/openkms` → MinIO |
| Alembic | `alembic.ini` – uses `settings.database_url_sync` |
| Cursor | `.cursor/rules/` – project rules (e.g. docs-before-commit) |
