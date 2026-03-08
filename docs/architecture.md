# openKMS Architecture

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React/Vite)                     │
│  Home | Documents | Articles | Knowledge Bases | Pipelines | ...  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP (localhost:8102)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                              │
│  /api/channels/documents  |  /api/documents/upload  |  /health  │
│  (async jobs → invoke document_parsing CLI)                       │
└───────────────┬───────────────────────────┬─────────────────────┘
                │                           │
                ▼                           ▼
┌───────────────────────┐     ┌────────────────────────────────────┐
│   PostgreSQL          │     │  document_parsing (CLI, planned)    │
│   documents           │     │  Typer + PaddleOCR-VL               │
│   document_channels    │     │  → mlx-vlm-server (VLM backend)     │
└───────────────────────┘     │  Configurable as pipeline           │
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
│   ├── channels.py          # GET/POST /api/channels/documents
│   └── documents.py         # POST upload, GET document, GET parsing
├── models/
│   ├── document.py          # Document model
│   └── document_channel.py  # DocumentChannel model
├── schemas/
│   ├── document.py
│   └── channel.py           # ChannelNode, ChannelCreate
└── services/
    └── document_parser.py    # PaddleOCR-VL integration (inline)
```

## document_parsing (Planned)

Standalone CLI for document parsing, configurable as a pipeline step and invoked by async jobs.

```
document_parsing/
├── pyproject.toml           # typer>=0.9.0, paddleocr, etc.
├── document_parsing/        # or src/
│   ├── __main__.py          # Entry point
│   ├── cli.py               # Typer app, commands
│   └── parser.py            # PaddleOCR-VL wrapper
└── README.md
```

- **Purpose**: Decouple parsing from backend process; run in worker/job context
- **Pipeline config**: Pipeline definition references this CLI (command, args, env)
- **Async jobs**: Backend job runner spawns `document_parsing parse <input> [options]` for each document

## Data Flow

### Document Upload (Current)

1. Frontend → `POST /api/documents/upload` (file + channel_id)
2. Backend saves file to temp, calls `parse_document()` (PaddleOCR-VL via mlx-vlm-server)
3. Backend stores Document in PostgreSQL (metadata + parsing_result JSONB)
4. Response: DocumentResponse

### Document Upload via Async Job (Planned)

1. Frontend → `POST /api/documents/upload` (file + channel_id)
2. Backend stores file, creates async job (e.g. "parse_document")
3. Job runner invokes `document_parsing parse <path>` (CLI)
4. CLI runs PaddleOCR-VL, writes result to output path
5. Job runner reads result, updates Document in DB

### Channel Tree

1. Frontend `DocumentChannelsContext` fetches `GET /api/channels/documents`
2. Backend returns nested `ChannelNode[]` (id, name, description, children)
3. Sidebar and Documents pages use `channelUtils` (flattenChannels, getDocumentChannelName, etc.)

### Document List by Channel

- Frontend uses `getDocumentLeafChannelIds(channels, channelId)` to resolve channel + descendants
- Document list: currently mock `mockDocumentsByChannel`; backend integration planned

## Configuration

| Layer | Config |
|-------|--------|
| Backend | `.env` / `OPENKMS_*` – database, VLM, PaddleOCR |
| Backend | `AWS_*` – S3/MinIO for file storage (optional) |
| Frontend | `config/index.ts` – `apiUrl` (default localhost:8102) |
| Alembic | `alembic.ini` – uses `settings.database_url_sync` |
| Cursor | `.cursor/rules/` – project rules (e.g. docs-before-commit) |
