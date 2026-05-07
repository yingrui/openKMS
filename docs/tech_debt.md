# Technical Debt

Last updated: 2026-05-06

This file lists **remaining** debt. Items that are done stay in [Resolved (historical)](#resolved-historical) only so the body does not contradict the codebase.

---

## Resolved (historical)

These were previously called out as problems; they are **addressed** in the current tree (verify in git history if needed):

- **Tests:** `backend/tests/` (pytest), frontend `npm test` / Vitest, `openkms-cli/tests/`.
- **Frontend tooling:** `frontend/package.json` includes `typecheck` (`tsc --noEmit`); heavy routes use `React.lazy` in `App.tsx`.
- **Errors:** `ErrorBoundary` wraps main app content; some list pages use `ErrorBanner` / `setError` (pattern still mixed — see [Active](#active-medium-priority)).
- **Document status:** `Document.status` uses aligned Python and DB defaults with `DocumentStatus` in `backend/app/constants.py`.
- **Ontology Cypher:** `validate_ontology_explore_cypher` blocks writes, `CALL`, `apoc.` / `dbms.`, and requires `RETURN`; covered by `backend/tests/test_ontology_explore_cypher.py`.
- **Infra docs:** `docker/docker-compose.yml`, root `.env.example`, `backend/.env.example`, `vlm-server/.env.example`.
- **Pipeline command:** `PipelineCreate.command` has `max_length` and validation in schemas.
- **Secrets:** non-debug startup refuses default `OPENKMS_SECRET_KEY` (`main.py`).
- **Document pipeline subprocess:** `run_pipeline` uses `asyncio.create_subprocess_exec` (async path).
- **Console users / settings:** wired to admin and system APIs; `ConsoleSettings` uses `id` / `htmlFor` on main fields.
- **Knowledge bases (SPA):** list and detail use real KB APIs (no mock-only KB UI).
- **Article channel list:** row opens detail; no separate mock row actions in the table.
- **Document channel list:** channel tree + document list are batched queries (not per-document N+1); further SQL consolidation is optional polish.

---

## Active: medium priority

### Inconsistent error handling in the frontend

Some pages use `setError` + a visible banner (`Pipelines.tsx`, `Jobs.tsx`, `DocumentDetail.tsx`). Others rely on `toast.error` only (`Models.tsx`, `ModelDetail.tsx`, `JobDetail.tsx`). Consider a project convention (e.g. toast for transient failures, banner for blocking load errors).

### Dead frontend module

`frontend/src/data/documents.ts` defines mock maps and `getDocumentById` but **nothing imports this file** (all callers use `documentsApi`). Remove the file or replace with shared types only, after confirming no external imports.

### Non-functional or incomplete controls

| Location | Issue |
|----------|--------|
| `frontend/src/pages/DocumentChannel.tsx` | **Edit** and **Download** icon buttons have no `onClick` (row still opens detail on click elsewhere). |

---

## Active: architecture and coupling

### Jobs API and Procrastinate internals

`backend/app/api/jobs.py` (and related paths) read/write `procrastinate_jobs` / `procrastinate_events` with raw SQL instead of only Procrastinate’s public APIs. Risk: schema drift on library upgrades. Mitigation options: use supported query helpers or isolate SQL in one module with integration tests.

### Optional query polish

`list_documents` in `backend/app/api/documents.py` loads all channels to resolve subtree IDs when `channel_id` is set — correct but could be cached or expressed as a single recursive SQL pattern if this ever becomes hot.

---

## Active: low priority

### Hardcoded or duplicated configuration

| Area | Notes |
|------|--------|
| Session cookie | `max_age` in `backend/app/main.py` |
| Presigned URLs | `expires_in` in `backend/app/services/storage.py` |
| Model testing HTTP | Timeouts in `backend/app/services/model_testing.py` |
| KB index job | `run_kb_index` in `backend/app/jobs/tasks.py` still uses **`subprocess.run`** with a fixed **1800s** timeout (blocks the worker thread during the call); document pipeline path uses async subprocess. |
| VLM URL | `vlm_url` is canonical; `paddleocr_vl_server_url` in `config.py` is deprecated alias — finish removing call sites and duplicate env docs when safe. |

### Missing or partial type hints

Incremental typing backlog (examples): `get_categories` in `backend/app/api/models.py`, `get_template_variables` in `backend/app/api/pipelines.py`, `_row_to_response` in `backend/app/api/jobs.py`, helpers in `backend/app/services/storage.py`.

### Frontend patterns to consolidate

- CRUD list pages (`Models.tsx`, `Pipelines.tsx`, `Jobs.tsx`) repeat load / modal / table patterns — candidate for a small hook.
- Repeated search inputs — optional shared component.
- `KnowledgeBaseDetail.tsx` remains very large — split tabs into subcomponents or hooks over time.

### Security and operations (ongoing)

| Topic | Notes |
|-------|--------|
| CORS | Single allowed origin from `OPENKMS_FRONTEND_URL` — intentional; document for multi-origin deployments. |
| Legacy `GET /logout` | Marked legacy in API; consider removal after clients migrate. |
| Migrations | Seed URLs / fixed IDs in Alembic — not environment-parameterized. |
| Production | Default secret rejection is implemented; keep documenting required env for prod. |

### API tokens and machine authentication (backlog) {#api-tokens-machine-auth}

Operators use `POST /api/auth/login` or Bearer JWTs per [Obtaining an API token](security.md#obtaining-an-api-token). Open themes: shorter-lived tokens or refresh, first-class PATs / device code / client-credentials with explicit role mapping, rate limiting on login, audit for issuance, IdP recipes for automation users, stricter warnings on long `OPENKMS_LOCAL_JWT_EXP_HOURS` in prod-like configs.

### OpenAPI / Redoc

FastAPI serves `/docs` and `/redoc`; optional export of `openapi.json` for external consumers.

### Metadata extraction duplication

Logic overlaps between `backend/app/services/metadata_extraction.py` and `openkms-cli/openkms_cli/extract.py` (schema / pydantic-ai setup). Prefer a single implementation or a thin CLI that calls the backend when online.

---

## Long methods and structural smells (audit snapshot)

Automated pass (AST span **≥55** lines) on `backend/app/**/*.py` and `openkms-cli/openkms_cli/**/*.py` (excluding Alembic) highlighted large functions — usual drivers: nested branching, HTTP + DB + side effects in one block, or duplicated CLI steps.

### Representative long Python functions

| ~Lines | File | Function |
|--------|------|----------|
| 430 | `openkms-cli/openkms_cli/pipeline_cli.py` | `pipeline_run` |
| 251 | `openkms-cli/openkms_cli/kb_indexer.py` | `run_indexer` |
| 208 | `openkms-cli/openkms_cli/parser.py` | `run_parser` |
| 184 | `backend/app/jobs/tasks.py` | `run_pipeline` |
| 159 | `backend/app/api/link_types.py` | `list_link_instances` |
| 138 | `backend/app/api/link_types.py` | `index_links_to_neo4j` |
| 127 | `backend/app/services/agent/wiki_tools.py` | `make_wiki_tools` |
| 126 | `openkms-cli/openkms_cli/parse_cli.py` | `parse_run` |
| 125 | `backend/app/services/kb_search.py` | `search_knowledge_base` |
| 116 | `backend/app/services/wiki_vault_import.py` | `import_vault_entries` |
| 107 | `backend/app/services/metadata_extraction.py` | `resolve_extraction_schema_for_llm` |
| 106 | `backend/app/services/evaluation/execute.py` | `run_qa_answer_evaluation` |
| 106 | `backend/app/api/agent.py` | `_ndjson_wiki_message_response` |
| 100 | `backend/app/services/glossary_term_suggestion.py` | `suggest_glossary_term` |
| 98 | `backend/app/api/object_types.py` | `list_object_instances` |

**Other ≥55-line hits:** `channels.py` (`merge_document_channels`, `reorder_document_channel`, `update_document_channel`), `documents.py` (`upload_document`, `extract_document_metadata`), `evaluation_datasets.py` (`run_evaluation`, `compare_evaluation_runs`), `home_hub.py` (`get_home_hub`), `jobs.py` (`create_job`, `retry_job`), `ontology_explore.py` (`execute_cypher`), `strict_permission_patterns.py` (`dispatch`), `wiki_vault_import.py` (`rewrite_markdown_assets`, `import_markdown_vault_file`), `extract.py` (`extract_metadata_sync`), `search_judge.py`, `faq_generation.py`, `wiki_runner.py` (`iter_wiki_conversation_stream_parts`), `object_types.py` (`index_objects_to_neo4j`, `_query_neo4j_nodes`), `link_types.py` (`_query_neo4j_relationships`), `metadata_extraction.py` (`extract_metadata`), `tasks.py` (`run_kb_index`).

### Smell summary

- **openkms-cli:** Large CLI commands mix parsing, env, subprocess, storage, and HTTP — extract phases and shared error reporting.
- **Neo4j-heavy APIs:** Move Cypher builders and row mapping toward `services/` with targeted tests.
- **Worker:** Align KB index subprocess policy with async/non-blocking goals where the runtime allows.
- **Agent / streaming:** Extract serialization and tool-dispatch helpers from long NDJSON/stream loops.
- **Frontend file size:** `DocumentDetail.tsx`, `KnowledgeBaseDetail.tsx`, `ConsolePermissionManagement.tsx`, `KnowledgeMap.tsx`, `WikiSpaceDetail.tsx`, `EvaluationDatasetDetail.tsx`, `ObjectExplorer.tsx` — split into hooks and presentational components when touching those areas.

### Partial mitigations (CLI)

- **`openkms_cli/backend_defaults`:** `_merge_document_parse_defaults_payload` extracted; tests in `openkms-cli/tests/test_backend_defaults.py`.
- **`openkms_cli/parser`:** `_restructure_pages_after_predict` extracted; tests in `openkms-cli/tests/test_parser_restructure.py` and `test_parser_helpers.py`.

**Re-run:** small AST script or optional `radon` / Ruff rules — only after team agreement on thresholds to avoid noise.
