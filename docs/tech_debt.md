# Technical Debt

Last updated: 2026-06-12

Open items only. Closed work lives in git history.

---

## Medium priority

### Frontend error handling convention

**Blocking load failures** → `ErrorBanner` + `setError` (dismissible). **Mutations / actions** → `toast.error`. See `frontend/src/components/ErrorBanner.tsx`. List/detail pages updated to match (`Models`, `ModelDetail`, `JobDetail`, `JobRuns`, `SchedulesPage`, `WikiSpaceList`, `ProjectList`, `ConsoleDataSources`).

### Frontend load-all client helpers

| Helper | Used by | Risk |
|--------|---------|------|
| `fetchAllWikiPages` | `WikiWorkspace` | Loads entire space into memory for tree/tabs |
| `fetchAllKBDocuments` | `KnowledgeBaseDetail` | All linked docs for bulk UI |
| `fetchAllModels` | Settings / KB / pipelines | Paginates API but accumulates all models |
| `fetchAllKnowledgeBases` / `fetchAllEvaluations` / `fetchAllGlossaries` | Evaluation settings, create dialogs | Same pattern for dropdown options |
| `fetchAllWikiSpaces` / `fetchAllDocumentChannels` / `fetchAllDataSources` / `fetchAllPipelines` | Pickers, sidebar channel trees | Paginate API internally; still loads full set client-side |

Fine for small tenants; large deployments need server-side tree/search or virtualized UI.

### Embedding semantic search at scale

Embedding columns are **dimensionless** `vector` on purpose (each KB/wiki space may use a different embedding model). Table-level pgvector HNSW/IVFFlat indexes are **not applicable**. Semantic search uses `cosine_distance` (sequential scan). Revisit per-KB partitioning or an external vector index if latency becomes an issue.

---

## Architecture and coupling

### Jobs API and Procrastinate internals

`backend/app/api/jobs.py` (and related paths) read/write `procrastinate_jobs` / `procrastinate_events` with raw SQL instead of only Procrastinate’s public APIs. Risk: schema drift on library upgrades. Mitigation options: use supported query helpers or isolate SQL in one module with integration tests.

### Neo4j index-to-graph write paths

`index_objects_to_neo4j` / `index_links_to_neo4j` still run **sync** Neo4j sessions on the event loop while interleaving **async** SQLAlchemy calls. Read/query paths use `neo4j_async.run_with_neo4j_driver`; write/index paths need prefetch-then-thread or a dedicated worker.

### Duplicate agent conversation routers

`kb_agent_conversations.py`, `kb_faq_agent_conversations.py`, and `eval_agent_conversations.py` share nearly the same streaming CRUD shape. Consolidate into a shared factory or base service when touching agent APIs.

### God modules (split when editing)

| Module | ~Lines | Smell |
|--------|--------|-------|
| `api/knowledge_bases.py` | 950+ | CRUD, chunks, FAQs (search/ask in `knowledge_bases_search.py`) |
| `services/resource_acl_service.py` | 1200+ | ACL resolution, channel trees |
| `api/wiki_spaces.py` | 950+ | Pages, files, import, semantic index |
| `api/documents.py` | 970+ | Upload, pipeline, metadata |
| `pages/knowledge-bases/KnowledgeBaseDetail.tsx` | 3300+ | All KB tabs in one file |

### Optional query polish

`list_documents` in `backend/app/api/documents.py` loads all channels to resolve subtree IDs when `channel_id` is set — correct but could be cached or expressed as a single recursive SQL pattern if this ever becomes hot.

---

## Low priority

### Hardcoded or duplicated configuration

| Area | Notes |
|------|--------|
| Session cookie | `max_age` in `backend/app/main.py` |
| Presigned URLs | `expires_in` in `backend/app/services/storage.py` |
| Model testing HTTP | Timeouts in `backend/app/services/model_testing.py` |
| KB index job | `run_kb_index` in `backend/app/jobs/tasks.py` uses **`subprocess.run`** with a fixed **1800s** timeout (blocks the worker thread); document pipeline path uses async subprocess. |
| VLM URL | `vlm_url` is canonical; `paddleocr_vl_server_url` in `config.py` is deprecated alias — finish removing call sites and duplicate env docs when safe. |

### Missing or partial type hints

Incremental typing backlog (examples): `get_categories` in `backend/app/api/models.py`, `get_template_variables` in `backend/app/api/pipelines.py`, `_row_to_response` in `backend/app/api/jobs.py`, helpers in `backend/app/services/storage.py`.

### Frontend patterns to consolidate

- CRUD list pages (`Models.tsx`, `Pipelines.tsx`, `Jobs.tsx`) repeat load / modal / table patterns — candidate for a small hook.
- Repeated search inputs — optional shared component.
- `KnowledgeBaseDetail.tsx` remains very large — split tabs into subcomponents or hooks over time.
- Heavy console/ontology pages (`ConsolePermissionManagement`, `ObjectExplorer`, `KnowledgeMap`) still eager-imported in `App.tsx` — extend lazy loading when touching routes.

### SPA / SCSS (remaining style debt)

| Area | Notes |
|------|--------|
| **Hex / `rgba` / magic `px` outside `design-system/`** | Many `frontend/src/pages/**/*.scss` and some `components/**/*.scss` still use raw colors or ad hoc spacing. Prefer **`var(--color-*)`**, **`var(--space-*)`**, **`color-mix`**, and **`@use '…/tokens' as ds`** for breakpoints / grid mins (`README.md` conventions). |
| **`z-index` outliers** | Re-audit numeric stacks (e.g. `50`, `200`, chart overlays) when something hides under the shell. |
| **`style={{}}` in TSX** | Tree depth padding in Sidebar, KnowledgeMap, DocumentChannels — prefer CSS `--depth` custom properties. |
| **Redundant `[data-theme='dark']` blocks** | Some files repeat rules that only mirror `:root` semantic vars — delete when next editing that stylesheet. |

### Security and operations (ongoing)

| Topic | Notes |
|-------|--------|
| CORS | Single allowed origin from `OPENKMS_FRONTEND_URL` — intentional; document for multi-origin deployments. |
| Legacy `GET /logout` | Marked legacy in API; consider removal after clients migrate. |
| Migrations | Seed URLs / fixed IDs in Alembic — not environment-parameterized. |
| Production | Document required env for prod deployments. |

### API tokens and machine authentication {#api-tokens-machine-auth}

Operators use `POST /api/auth/login` or Bearer JWTs per [Obtaining an API token](features/console-and-auth.md#obtaining-an-api-token). Open themes: shorter-lived tokens or refresh, first-class PATs / device code / client-credentials with explicit role mapping, rate limiting on login, audit for issuance, IdP recipes for automation users, stricter warnings on long `OPENKMS_LOCAL_JWT_EXP_HOURS` in prod-like configs.

### OpenAPI / Redoc

FastAPI serves `/docs` and `/redoc`; optional export of `openapi.json` for external consumers.

### Metadata extraction duplication

Logic overlaps between `backend/app/services/metadata_extraction.py` and `openkms-cli/openkms_cli/extract.py` (schema / pydantic-ai setup). Prefer a single implementation or a thin CLI that calls the backend when online.

### Test coverage gaps

Vitest covers a small set of modules (`App`, `apiClient`, auth callback, document detail utils). No automated tests for AuthContext, KB detail, ontology explorer, or global search flows.

---

## Long methods (audit snapshot)

AST pass (span **≥55** lines) on `backend/app/**/*.py` and `openkms-cli/openkms_cli/**/*.py` (excluding Alembic). Re-run with `radon` or Ruff only after team agreement on thresholds.

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

**Other ≥55-line hits:** `channels.py`, `documents.py`, `evaluations.py`, `home_hub.py`, `jobs.py`, `strict_permission_patterns.py`, `wiki_vault_import.py`, `extract.py`, `search_judge.py`, `faq_generation.py`, `wiki_runner.py`, `object_types.py` (`index_objects_to_neo4j`), `link_types.py`, `metadata_extraction.py`, `tasks.py` (`run_kb_index`).

### Smell summary

- **openkms-cli:** Large CLI commands mix parsing, env, subprocess, storage, and HTTP — extract phases and shared error reporting.
- **Neo4j-heavy APIs:** Move Cypher builders and row mapping toward `services/` with targeted tests; index write paths still on event loop.
- **Worker:** Align KB index subprocess policy with async/non-blocking goals where the runtime allows.
- **Agent / streaming:** Extract serialization and tool-dispatch helpers from long NDJSON/stream loops.
- **Frontend file size:** `DocumentDetail.tsx`, `KnowledgeBaseDetail.tsx`, `ConsolePermissionManagement.tsx`, `KnowledgeMap.tsx`, `WikiSpaceSettings.tsx`, `EvaluationDatasetDetail.tsx`, `ontology/ObjectExplorer.tsx` — split into hooks and presentational components when touching those areas.
