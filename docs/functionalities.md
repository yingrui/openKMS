# openKMS Functionalities

## Implemented Features

### 1. Documents

| Feature | Status | Description |
|---------|--------|-------------|
| Document overview | ✅ | Dashboard at `/documents` with channel stats, quick actions, channel list |
| Channel management | ✅ | Create/manage channels at `/documents/channels` (tree structure) |
| Document channel view | ✅ | Browse documents by channel at `/documents/channels/:channelId`; list from `GET /api/documents?channel_id=` |
| Channel settings | ✅ | Per-channel pipeline, chunk size, extract tables at `/documents/channels/:channelId/settings` |
| Document upload | ✅ | Upload to channel via modal (choose files, drag-and-drop); POST `/api/documents/upload` with `channel_id`; parse via PaddleOCR-VL, store in DB |
| Document detail | ✅ | View parsed Markdown at `/documents/view/:id` |
| Channel description | ✅ | Channel description shown on channel page; stored in `document_channels.description` |

### 2. Document Parsing

- **PaddleOCR-VL** with mlx-vlm-server as VLM backend
- Supports: PDF, PNG, JPG, JPEG, WEBP
- Output: Markdown, layout detection, parsing result JSON
- Configurable: server URL, model, max concurrency

### 2b. document_parsing CLI (Planned)

- **CLI** built with Typer (≥0.9.0)
- Uses PaddleOCR-VL for document parsing (same as backend)
- **Configurable as pipeline** – can be registered and parameterized in pipeline config
- **Async job integration** – backend creates async jobs that invoke this CLI to parse documents
- Enables: offload heavy parsing to worker processes, retry, queue management

### 3. Articles (Feature Toggle)

- CMS-style articles with channel tree
- List, detail, search, filter by status
- Toggle via Console → Feature Toggles

### 4. Knowledge Bases (Feature Toggle)

- List and detail views
- RAG Q&A placeholder
- Toggle via Console → Feature Toggles

### 5. Console (Admin)

- Overview, Settings, Users & Roles, Feature Toggles
- Feature toggles: `articles`, `knowledgeBases`

### 6. Other Pages

- **Pipelines** – Placeholder for extraction pipelines
- **Jobs** – Placeholder for background jobs
- **Models** – Placeholder for model management

## Planned: document_parsing CLI

A standalone CLI module for document parsing, designed to be configurable as a pipeline and invoked by async jobs:

| Aspect | Description |
|--------|-------------|
| **Framework** | Typer ≥0.9.0 |
| **Engine** | PaddleOCR-VL (same as backend) |
| **Purpose** | Configurable pipeline; run as async job (e.g. Celery, ARQ) |
| **Location** | `document_parsing/` (project root) |

Use cases:

- Run parsing as a background job instead of blocking upload
- Batch parse multiple documents
- Integrate with pipeline configuration in channel settings

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/login` | Redirect to Keycloak login |
| GET | `/login/oauth2/code/keycloak` | OAuth2 callback (Keycloak redirect URI) |
| GET | `/logout` | Clear session, redirect to Keycloak logout |
| GET | `/api/channels/documents` | List document channels (tree) |
| POST | `/api/channels/documents` | Create channel |
| POST | `/api/documents/upload` | Upload and parse document |
| GET | `/api/documents?channel_id=` | List documents in channel and descendants |
| GET | `/api/documents/{id}` | Get document metadata |
| GET | `/api/documents/{id}/parsing` | Get parsing result (result.json) |
| GET | `/api/documents/{id}/files/{file_hash}/{path}` | Redirect to presigned S3 URL (verifies document+file_hash; frontend fetches from S3) |
| DELETE | `/api/documents/{id}` | Delete document and its storage files |

## Configuration

- **S3/MinIO** (required for upload): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL`, `AWS_BUCKET_NAME`. Uploaded files, parsed images, result.json, and markdown are stored under `{file_hash}/` in the bucket.
- **Cursor rules**: `.cursor/rules/` – e.g. `docs-before-commit` (update docs before commit).

## Data Models

### Document Channel

- `id`, `name`, `description`, `parent_id`, `sort_order`, `created_at`
- Tree structure: parent → children

### Document

- `id`, `name`, `file_type`, `size_bytes`, `channel_id`, `file_hash`, `markdown`, `parsing_result`, `created_at`, `updated_at`
