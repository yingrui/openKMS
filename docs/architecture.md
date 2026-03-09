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
│  /api/channels/documents  |  /api/documents/upload  |  /health  │
│  (async jobs → invoke document_parsing CLI)                     │
└───────────────┬───────────────────────────┬─────────────────────┘
                │                           │
                ▼                           ▼
┌───────────────────────┐     ┌────────────────────────────────────┐
│   PostgreSQL          │     │  openkms-cli (CLI)                 │
│   documents           │     │  Typer + PaddleOCR-VL              │
│   document_channels   │     │  → mlx-vlm-server (VLM backend)    │
└───────────────────────┘     │  Backend can invoke for async jobs │
                              └────────────────────────────────────┘
```

## Frontend Structure

```
frontend/src/
├── main.tsx                 # Entry, providers (Auth, FeatureToggles, DocumentChannels)
├── App.tsx                  # Routes
├── config/index.ts          # API URL
├── components/Layout/       # MainLayout, Sidebar, Header
├── contexts/                # DocumentChannelsContext, FeatureTogglesContext, AuthContext
├── data/                    # channelsApi, channelUtils, documents
└── pages/
    ├── Home.tsx
    ├── DocumentsIndex.tsx   # /documents – overview
    ├── DocumentChannel.tsx  # /documents/channels/:channelId
    ├── DocumentChannels.tsx # /documents/channels – manage
    ├── DocumentChannelSettings.tsx
    ├── DocumentDetail.tsx
    ├── Articles.tsx, ArticleDetail.tsx
    ├── KnowledgeBaseList.tsx, KnowledgeBaseDetail.tsx
    ├── Pipelines.tsx, Jobs.tsx, Models.tsx
    └── console/             # ConsoleLayout, Overview, Settings, Users, FeatureToggles
```

## Backend Structure

```
backend/app/
├── main.py                  # FastAPI app, CORS, routers
├── config.py                # Settings (env: OPENKMS_*)
├── database.py              # Async engine, get_db, init_db
├── api/
│   ├── auth.py               # OAuth2 Keycloak login/logout
│   ├── channels.py          # GET/POST /api/channels/documents
│   └── documents.py         # POST upload, GET document, GET parsing, DELETE
├── models/
│   ├── document.py          # Document model
│   └── document_channel.py  # DocumentChannel model
├── schemas/
│   ├── document.py
│   └── channel.py           # ChannelNode, ChannelCreate
└── services/
    ├── document_parser.py       # PaddleOCR-VL integration
    ├── document_storage.py      # parse_and_store → S3/MinIO
    ├── document_extraction_utils.py
    └── storage.py               # S3/MinIO client (upload, delete)
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

### Document Upload (Current)

1. Frontend opens upload modal on channel page; user selects files (or drag-and-drop); `POST /api/documents/upload` (multipart: file + channel_id)
2. Backend validates channel exists; parses via PaddleOCR-VL (mlx-vlm-server); stores in S3/MinIO under `{file_hash}/`: original, layout images, block images, result.json, markdown, markdown_out
3. Backend creates Document in PostgreSQL with parsing_result and markdown
4. Response: DocumentResponse

### Document Detail (Current)

1. Frontend fetches `GET /api/documents/{id}` – document includes parsing_result and markdown (single request)
2. Document files (images, markdown assets): frontend requests `GET /api/documents/{id}/files/{file_hash}/{path}`; backend verifies document+file_hash and redirects (302) to `{frontend}/buckets/openkms/{key}?params`; Vite dev proxy forwards `/buckets/openkms` to MinIO, avoiding S3/MinIO CORS

### Document Upload via Async Job (Planned)

1. Frontend → `POST /api/documents/upload` (file + channel_id)
2. Backend stores file, creates async job (e.g. "parse_document")
3. Job runner invokes `openkms-cli parse run <path>` (CLI)
4. CLI runs PaddleOCR-VL, writes result to output path
5. Job runner reads result, updates Document in DB

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
