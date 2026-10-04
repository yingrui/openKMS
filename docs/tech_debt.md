# Technical Debt

Last updated: 2026-10-04

Open items only. Closed work lives in git history.

**Project agents (Deep Agents):** refactors shipped Aug 2026 (factory, checkpoint-first turns, unified pre-turn compaction). Open gaps: [Project agents](#project-agents-deep-agents).

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
| `fetchAllWikiSpaces` / `fetchAllDataSources` / `fetchAllPipelines` / channel trees (`createChannelTreeApi().fetchAll`) | Pickers, sidebar channel trees | Paginate API internally; still loads full set client-side |

Fine for small tenants; large deployments need server-side tree/search or virtualized UI.

### Embedding semantic search at scale

Embedding columns are **dimensionless** `vector` on purpose (each KB/wiki space may use a different embedding model). Table-level pgvector HNSW/IVFFlat indexes are **not applicable**. Semantic search uses `cosine_distance` (sequential scan). Revisit per-KB partitioning or an external vector index if latency becomes an issue.

---

## Architecture and coupling

### Jobs API and Procrastinate internals

`backend/app/api/jobs.py` (and related paths) read/write `procrastinate_jobs` / `procrastinate_events` with raw SQL instead of only Procrastinate’s public APIs. Risk: schema drift on library upgrades. Mitigation options: use supported query helpers or isolate SQL in one module with integration tests.

### Neo4j index-to-graph write paths

`index_objects_to_neo4j` / `index_links_to_neo4j` still run **sync** Neo4j sessions on the event loop while interleaving **async** SQLAlchemy calls. Read/query paths use `neo4j_async.run_with_neo4j_driver`; write/index paths need prefetch-then-thread or a dedicated worker.

### Project agents (Deep Agents) {#project-agents-deep-agents}

Runtime: `backend/app/services/deep_agents/` + `POST /api/projects/…/messages` (see [Agents](features/openkms-agents.md)).

**Refactored (Aug 2026 — keep out of this debt list):**

- Unified agent build via `deep_agents/factory.py` (workspace + improvement paths).
- OpenAI-compat thinking shim: `deep_agents/llm_chat.py` + `openai_compat/`.
- Pre-turn compaction for **interactive and scheduled** turns (`turn_prepare.py` → `context_compaction.py`).
- Checkpoint-first turn input: append only the latest user message when a LangGraph thread exists; seed from DB without tool-trace reinjection on revert/new session (`turn_input.py`).
- Shared tool-trace storage (`agent/tool_transcripts.py`), NDJSON helper (`agent/ndjson.py`), stale-turn constant (`deep_agents/constants.py`).
- Stream errors yield NDJSON `fatal` instead of raising in the background task.

**Open — medium priority**

| Item | Notes |
|------|--------|
| **HITL policy undecided** | Resume API, interrupt bar, and checkpointing are wired; `hitl.py` `DEFAULT_INTERRUPT_ON` is empty (no tools pause). **Intentionally unchanged for now.** Either populate policy (e.g. `execute`, `write_file`) or gate UI/API behind a feature flag when product decides. |
| **`project_conversations.py` monolith** | ~740 lines: CRUD, NDJSON stream, lessons, skill generate, improvements. Split into `messages_stream.py`, `lessons.py`, etc. when editing. |
| **Wiki-era naming in project path** | DB key `wiki_tool_traces_v1`, `assistant_lc_content_from_db_row` legacy path, frontend `wikiCopilotStreamParts` reused for project NDJSON. Rename incrementally (`AGENT_TOOL_TRANSCRIPTS_KEY` alias exists). |
| **Integration test gap** | Unit tests for `turn_input`, `factory`, stream adapter; **no** mocked end-to-end test for `durable_stream` + `POST …/messages` NDJSON contract or `runner.run_project_turn`. |
| **Checkpoint vs DB drift** | Normal flow: checkpoint is SoT for agent memory; `agent_messages` for UI. If DB rows are changed without `delete_conversation_thread` (revert), agent may disagree with visible history. No repair job today. |

**Open — low priority (Phase 4 / perf)**

| Item | Notes |
|------|--------|
| **Agent graph rebuilt every turn** | `create_deep_agent` on each message, resume, and schedule run. Consider TTL cache keyed by `(project_id, plan_mode)` after measuring build latency in production. |
| **`ClientBridge` queue backpressure** | `durable_stream.py` may drop NDJSON events when the client queue is full (silent). Add logging/metrics or block with timeout. |
| **Stream fallback `ainvoke`** | `runner.iter_project_stream_parts` still runs a second `ainvoke` when streaming produced no text deltas — may double cost; log when triggered. |
| **Improvement agent isolation** | Uses ephemeral `thread_id` (no checkpointer) by design; no `AgentTurnContext` / durable stream. Acceptable unless Session Review needs HITL or long-running turns. |
| **Scheduled failure heuristics** | `run_project_turn` treats empty tool traces + assistant text matching `"failed to initialize"` / `"recursion limit"` as failure — string match is fragile. |

**Not debt (framework lock-in):** Replacing Deep Agents / LangGraph would require reimplementing checkpointer threads, subagents, compaction middleware, and tool loops — out of scope unless product pivots agent runtime.

### ACL implementation layout

`resource_acl_service.py` is a re-export facade; implementation lives in `acl_scope.py`, `acl_identity.py`, `acl_context.py`, `acl_resolve.py`, `acl_store.py`, `acl_channel_filters.py`, `acl_resource_filters.py`, and `acl_content_visibility.py`.

### God modules (split when editing)

| Module | ~Lines | Smell |
|--------|--------|-------|
| `api/knowledge_bases.py` | 950+ | CRUD, chunks, FAQs (search/ask in `knowledge_bases_search.py`) |
| `api/wiki_spaces.py` | 950+ | Pages, files, import, semantic index |
| `api/documents.py` | 1200+ | Upload, pipeline, metadata |
| `api/project_conversations.py` | 740+ | Project agent CRUD, NDJSON stream, lessons, improvements |
| `pages/knowledge-bases/KnowledgeBaseDetail.tsx` | ~1500 | View shell + tab JSX; logic in `useKnowledgeBaseDetail.ts` (~1400) and `KnowledgeBaseDetail.*` helpers |
| `pages/knowledge-bases/useKnowledgeBaseDetail.ts` | ~1400 | KB detail state/handlers — split tab panels into `KnowledgeBaseDetail.*Tab.tsx` when editing |

### Optional query polish

`list_documents` in `backend/app/api/documents.py` loads all channels to resolve subtree IDs when `channel_id` is set — correct but could be cached or expressed as a single recursive SQL pattern if this ever becomes hot.

---

## Low priority

### Hardcoded or duplicated configuration

| Area | Notes |
|------|--------|
| Session cookie | `max_age` in `backend/app/main.py` |
| Presigned URLs | `expires_in` in `backend/app/services/storage.py` |
| Model testing HTTP | Timeouts in `backend/app/services/models/model_testing.py` |
| KB index job | `run_kb_index` in `backend/app/jobs/tasks.py` uses **`subprocess.run`** with a fixed **1800s** timeout (blocks the worker thread); document pipeline path uses async subprocess. |
| VLM URL | `vlm_url` is canonical; `paddleocr_vl_server_url` in `config.py` is deprecated alias — finish removing call sites and duplicate env docs when safe. |

### Missing or partial type hints

Incremental typing backlog (examples): `get_template_variables` in `backend/app/api/pipelines.py`, `_row_to_response` in `backend/app/api/jobs.py`, helpers in `backend/app/services/storage.py`.

### Frontend patterns to consolidate

- CRUD list pages (`Models.tsx`, `Pipelines.tsx`) repeat load / modal / table patterns — candidate for a small hook.
- Repeated search inputs — optional shared component.
- `ConsolePermissionManagement` is still eager-imported in `App.tsx` — make it lazy when touching console routes.

### SPA / SCSS (remaining style debt)

| Area | Notes |
|------|--------|
| **Hex / `rgba` / magic `px` outside `design-system/`** | Many `frontend/src/pages/**/*.scss` and some `components/**/*.scss` still use raw colors or ad hoc spacing. Prefer **`var(--color-*)`**, **`var(--space-*)`**, **`color-mix`**, and **`@use '…/tokens' as ds`** for breakpoints / grid mins (`README.md` conventions). |
| **`z-index` outliers** | Re-audit numeric stacks (e.g. `50`, `200`, chart overlays) when something hides under the shell. |
| **`style={{}}` in TSX** | Tree depth padding in Sidebar, KnowledgeMap, `ChannelTreeManager` — prefer CSS `--depth` custom properties. |
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

Logic overlaps between `backend/app/services/documents/metadata_extraction.py` and `openkms-cli/openkms_cli/extract.py` (schema / pydantic-ai setup). Prefer a single implementation or a thin CLI that calls the backend when online.

### Test coverage gaps

Vitest covers a small set of modules (`App`, `apiClient`, OIDC callback, document detail utils, permission patterns, markdown math, `useIsMobile`). No automated tests for AuthContext, KB detail, ontology explorer, or global search flows.

**Backend — project agents:** `test_deep_agents_turn_input.py`, `test_deep_agents_factory.py`, `test_project_stream_events.py`, `test_durable_project_stream.py`, `test_hitl_resume.py` cover helpers and stream mapping. Missing: API-level NDJSON streaming tests, `durable_stream.run_project_turn_background` persistence cadence, and live LangGraph integration tests (mock agent at minimum).

---

## Long methods (audit snapshot)

AST pass (span **≥55** lines) on `backend/app/**/*.py` and `openkms-cli/openkms_cli/**/*.py` (excluding Alembic; router factories such as `build_channel_tree_router` / `_register_routes` omitted because they only wrap route functions). Snapshot 2026-10-04: ~115 hits. Re-run with `radon` or Ruff only after team agreement on thresholds.

### Representative long Python functions

| ~Lines | File | Function |
|--------|------|----------|
| 479 | `openkms-cli/openkms_cli/pipeline_cli.py` | `pipeline_run` |
| 251 | `backend/app/jobs/tasks.py` | `run_pipeline` |
| 235 | `backend/app/api/kb_agent_conversations.py` | `_ndjson_kb_qa_stream_persist` |
| 214 | `openkms-cli/openkms_cli/kb_indexer.py` | `run_indexer` |
| 207 | `openkms-cli/openkms_cli/parser.py` | `run_parser` |
| 205 | `openkms-cli/openkms_cli/parse_cli.py` | `parse_run` |
| 198 | `backend/app/api/link_types.py` | `list_link_instances` |
| 167 | `backend/app/services/deep_agents/durable_stream.py` | `run_project_turn_background` |
| 161 | `backend/app/services/global_search/global_search.py` | `run_global_search` |
| 155 | `backend/app/jobs/tasks.py` | `run_media_generation` |
| 150 | `backend/app/services/knowledge_bases/kb_search.py` | `search_knowledge_base` |
| 149 | `backend/app/services/knowledge_map/knowledge_map_overview_designer.py` | `iter_overview_designer_chat_ndjson` |
| 149 | `backend/app/services/knowledge_map/knowledge_map_html.py` | `iter_designer_chat_llm_stream_events` |

**Other ≥55-line hits (files):** `documents.py`, `articles.py`, `evaluations.py`, `jobs.py`, `media.py`, `object_types.py`, `project_conversations.py`, `eval_agent_conversations.py`, `strict_permission_patterns.py`, `wiki_vault_import.py`, `wiki_semantic_index.py`, `metadata_extraction.py`, `glossary_term_suggestion.py`, `faq_generation.py`, `search_judge.py`, `extract.py`, `a2ui.py`, `context_compaction.py`.

### Smell summary

- **openkms-cli:** Large CLI commands mix parsing, env, subprocess, storage, and HTTP — extract phases and shared error reporting.
- **Neo4j-heavy APIs:** Move Cypher builders and row mapping toward `services/` with targeted tests; index write paths still on event loop.
- **Worker:** Align KB index subprocess policy with async/non-blocking goals where the runtime allows.
- **Agent / streaming:** Extract serialization and tool-dispatch helpers from long NDJSON/stream loops. Project agent layout: `factory.py`, `turn_prepare.py`, `turn_input.py` (Aug 2026); `project_conversations.py` still large.
- **Frontend file size:** `DocumentDetail.tsx`, `KnowledgeBaseDetail.tsx` / `useKnowledgeBaseDetail.ts`, `ConsolePermissionManagement.tsx`, `KnowledgeMap.tsx`, `WikiSpaceSettings.tsx`, `EvaluationDatasetDetail.tsx`, `ontology/ObjectExplorer.tsx` — split into hooks and presentational components when touching those areas.
