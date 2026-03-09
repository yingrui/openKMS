# Technical Debt

Last updated: 2026-03-09

---

## High Priority

### 1. No tests

There is no test framework or test suite for either backend or frontend. No `tests/` directory, no pytest/unittest config, no Jest/Vitest config. The frontend `package.json` has no `test` or type-check scripts.

---

## Medium Priority

### 2. PipelineCreate.command has no length or format validation

**File:** `backend/app/schemas/pipeline.py`

`PipelineCreate.command` accepts any string; long or malformed commands can be stored. Consider adding max length and basic format validation.

### 3. Inconsistent error handling in frontend

- Some pages use `setError` + UI banner (`Pipelines.tsx`, `Jobs.tsx`, `DocumentDetail.tsx`)
- Others use `toast.error` only (`Models.tsx`, `ModelDetail.tsx`, `JobDetail.tsx`)

Consider standardizing on one pattern project-wide.

### 4. Frontend mock data not replaced with real APIs

| File | Description |
|------|-------------|
| `pages/console/ConsoleOverview.tsx` | Hardcoded stats (3, 2, 7, 12) |
| `pages/console/ConsoleUsers.tsx` | Mock users; Add User button is non-functional |
| `pages/console/ConsoleSettings.tsx` | Form inputs are not wired to any API |
| `pages/DocumentsIndex.tsx` | Uses empty `mockDocumentsByChannel` for document count |
| `pages/KnowledgeBaseList.tsx` | Mock KB list |
| `pages/KnowledgeBaseDetail.tsx` | All tabs use mocks; all actions are no-ops |
| `pages/Articles.tsx` | Mock articles; action buttons do nothing |
| `data/documents.ts` | `mockDocumentsByChannel` is empty `{}` |
| `data/articles.ts` | Mock article data |

### 5. Non-functional buttons

Several UI buttons have no `onClick` handlers:

- `DocumentChannel.tsx` – Edit, Move, Download actions on documents
- `Articles.tsx` – New Article, Edit, Move, Duplicate, Delete
- `KnowledgeBaseDetail.tsx` – Add document/article, Generate FAQ, View, Remove
- `KnowledgeBaseList.tsx` – New Knowledge Base
- `ConsoleUsers.tsx` – Add User
- `Header.tsx` – Profile, Settings dropdown items

### 6. Missing infrastructure

- No `docker-compose.yml` for local development (Postgres, MinIO, Keycloak, VLM must be started manually)
- No `Makefile` or task runner for common operations (install, migrate, run, test)
- No root `.env.example`; `vlm-server/` also missing `.env.example`

---

## Low Priority

### 7. Hardcoded values that could be configurable

| File | Value |
|------|-------|
| `backend/app/main.py` | Session cookie `max_age=86400 * 7` |
| `backend/app/services/storage.py` | Presigned URL `expires_in=3600` |
| `backend/app/services/model_testing.py` | HTTP timeout `timeout=120.0` |
| `backend/app/jobs/tasks.py` | Subprocess `timeout=600` |
| `backend/app/config.py` | Both `vlm_server_url` and `paddleocr_vl_server_url` default to `http://localhost:8101` (duplicate config) |
| `backend/app/config.py` | `paddleocr_vl_max_concurrency` is defined but never used |

### 8. Missing type hints

| File | Function |
|------|----------|
| `backend/app/api/models.py` | `get_categories()` |
| `backend/app/api/pipelines.py` | `get_template_variables()` |
| `backend/app/api/jobs.py` | `_row_to_response(row)` |
| `backend/app/services/storage.py` | `_client()`, `get_object_stream()` |

### 9. Frontend accessibility: ConsoleSettings form controls

Form controls in `ConsoleSettings.tsx` lack proper `id`/`htmlFor` linkage for screen readers.

### 10. Frontend patterns to consolidate

- CRUD table pattern (`Models.tsx`, `Pipelines.tsx`, `Jobs.tsx`) shares load/fetch/modal/table/actions logic – could extract a `useCrudList<T>` hook
- Search input pattern repeated across many pages – could be a shared `SearchInput` component
- `KnowledgeBaseDetail.tsx` has four near-identical tab sections

### 11. Security notes

| Item | Details |
|------|---------|
| Default secret key | `backend/app/config.py` – `secret_key = "openkms-dev-secret-change-in-production"` |
| CORS single origin | `backend/app/main.py` – only `keycloak_frontend_url` is allowed |
| Legacy logout | `GET /logout` endpoint is marked as legacy; consider removing |
| Migration seed data | Alembic migrations seed `http://localhost:8101/` and fixed IDs – not environment-aware |
