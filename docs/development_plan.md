# openKMS Development Plan

Business **why** and long-form narrative: [Goals](goals.md) — the direction is organized around three questions: build fast, be trustworthy, and change. This page tracks **what is shipped**, **strategic priorities**, and **backlog**.

## How priorities map to Goals {#goals-mapping}

Priorities are judged against the three questions in [Goals](goals.md): does it make the system faster to build, more trustworthy, or easier to change? Items that serve none of them stay in the backlog.

Backlog tags (**user** / **org**) are internal shorthand for who is affected; they do not replace the three-question test.

## Agent lanes (delivery vs in-app) {#agent-lanes}

Track these **separately** — see [Goals — agent service](goals.md#goals-agent-service).

| Lane | What it is | Tracked under |
|------|------------|---------------|
| **KB Q&A delivery** | Per-KB **qa-agent** service: path-scoped `/knowledge-bases/{id}/ask|stream|retrieve`, sourced answers; KB **`agent_skills`** + optional **Catalog + ontology-group scope** (live query tools, not RAG) | [Knowledge bases](features/knowledge-bases.md) (API + SPA Q&A UI) |
| **In-app agents** | Assistants and workspaces to **author and maintain** content inside openKMS | [openkms-agents](features/openkms-agents.md), map designer; backlog [#in-product-agents-high](#in-product-agents-high) |

**Not in scope for “unified in-app assistant”:** merging KB Q&A delivery with project agents or a single global chat shell.

## Current State {#current-state}

Shipped scope is indexed in [Functionalities](./functionalities.md); each linked feature page is the source of truth for APIs, UI, and behavior. Status that spans several features:

| Area | Status |
|---|---|
| In-app agents (cross-cutting) | **Partial:** [knowledge map designer](features/knowledge-map.md) and [project agents](features/openkms-agents.md); **eval assist** API only; **no** unified **maintenance** assistant across wiki/documents/map ([backlog](#in-product-agents-high)) — **excludes** KB Q&A delivery |
| Connectors | Tushare sync + Zhipu search shipped; more sync kinds and downstream hooks ([backlog](#connectors-high)) |
| Evaluation | Experimental toggle; quality-improvement workflows still evolving ([backlog](#evaluation--knowledge-quality-high)) |
| Project agents runtime | Open gaps in [Tech debt — Project agents](tech_debt.md#project-agents-deep-agents) |

## Strategic priorities {#strategic-priorities}

Product direction (not a commitment order). Shipped basics live under **Current State**; gaps below are intentional next investments.

| Priority | Organization ([Goals — organization](goals.md#goals-organization)) | User outcomes ([Goals — user value](goals.md#goals-user-value)) |
|----------|---------------------------------------------------------------------|------------------------------------------------------------------|
| 1. Connectors | [Breaking silos](goals.md#goals-unified-source) · [Retrieval to decisions](goals.md#goals-decision) | Less **search friction**; operational data and documents in one trusted layer |
| 2. In-product agents | [Tacit knowledge externalized](goals.md#goals-tacit) | Shorter **authoring/maintenance** paths for experts (wiki, map, projects) — not KB Q&A delivery |
| 3. Multimodal knowledge | [Non-standard documents](goals.md#goals-documents) | Image/audio/video findable and auditable, not attachments only |
| 4. Evaluation for quality | [Tacit knowledge externalized](goals.md#goals-tacit) · measurable corpus | Feedback after contribution: what is wrong and what to fix |
| 5. Policy impact (medium) | [Lifecycle and provenance](goals.md#goals-lifecycle) | Less **obsolete unnoticed**; compliance and standards roles can drive review |
| 6. Ontology logic (high) | [Retrieval to decisions](goals.md#goals-decision) | **Functions + Actions** on the ontology — publish rules, run in sandbox, observe executions |
| 7. Data layer (high) | [Unified layer for Data for AI](goals.md#goals-unified-source) · [Retrieval to decisions](goals.md#goals-decision) | Catalog, model (joins/ER), quality, metrics, and AI-native exploration over external tables; agents cite data beside knowledge |

1. **Connectors** — Finish the loop: external sources → **reliable sync jobs** → ontology **datasets** (and downstream KB/wiki), not only credential storage and output wiring.
2. **In-product agents** — **Domain experts and knowledge admins** get capable **maintenance** assistants inside openKMS (map designer, Deep Agents projects), not only [openkms-skill](features/openkms-skill.md) in an external IDE. **Per-KB Q&A** remains a separate [delivery lane](#agent-lanes) (`qa-agent`), not part of this unification.
3. **Multimodal knowledge** — **Image and video** (and related assets) as managed evidence: model registry support, ingestion/derivatives, search/RAG — see [knowledge-types](features/knowledge-types.md#rich-media-and-3d).
4. **Evaluation for quality** — Turn evaluations from pass/fail runs into **actionable improvement** for KBs, wiki, and corpora (gaps, suggested edits, regression tracking).
5. **Policy & lifecycle impact** — When rules change, surface dependents and review queues for **knowledge administrators** and **legal/compliance / standards** roles (see [Policy & lifecycle](#policy--lifecycle-medium)).
6. **Ontology logic** — **Shipped:** Suite Apps (Manager / Object Explorer / Function Editor / **Apps** hosted modules); function versions; ofs executor; `@function` + `openkms_functions.Client` (string api names; no generated ontology SDK package); Action **types** (bind Function, execute, audit); Action **`create` / `modify` / `delete` apply** on resolvable object instances from `output.edits`; object list `prop.<name>=` filters; link list `source_object_id`; **module Apps** (register Kubernetes Service → iframe proxy + identity headers). **Removed:** in-product A2UI App authoring. **Deferred:** dataset/Neo4j synthetic Action `object_id`; link create/delete as edit ops ([Manager alignment](research/ontology_manager_alignment.md#product-decision-action-write-back-b1)); Palantir-style generated ontology marker SDK; per-app Rail icons. Domain ontologies (e.g. market analysis, Kanban DIY types) are tenant content, not product seeds. See [Ontology Functions](features/ontology-functions.md) · [Apps (hosted modules)](features/app-builder.md) · [Ontology Function Client](features/ontology-sdk.md) · [Understanding ontology](tutorials/understanding-ontology.md) · [Tushare DIY](tutorials/tushare-market-ontology.md).
7. **Data layer** — **Planned:** [Data layer plan](features/data-layer.md) — Datasets (catalog + file ingest + **Model** view: joins/ER, quality, metrics), Data Insights (project-agent analysis). **Phase 0 shipped:** three-layer App Rail (Application / Ontology / Data) and `Datasets` as a first-class app at `/datasets`. **Phase 1 shipped:** data-source layer tag; dataset catalog fields; dataset joins + ER view; file upload wizard (CSV/Excel/JSON → PostgreSQL); profile / schema history; `openkms-skill` dataset commands (**lineage removed** — it could only name the data source and repeated Usage/Relationships). **Phase 2 shipped:** Datasets **Model** view (global joins + quality alerts); declarative quality rules (create / run / history); declarative metrics (on-demand compute); `openkms-skill` quality / metrics commands. **Phase 3 shipped:** Data Insights app (saved analyses); `dashboards` persistence API; `openkms-skill` explorer dashboard commands. **Row editing shipped:** dataset `primary_key_columns` + `is_editable`; `data:edit` permission + audit (`dataset_edits`); keyset paging + `POST /datasets/{id}/rows/apply`; Data tab migrated to **TanStack Table** (server sort + inline cell editing). **Semantic model design (Apache Ossie):** relationships re-modelled as **FK edges** (`from` many → `to` one); metrics become model-level; datasets gain `unique_keys` + `ai_context`; the Model tab authors datasets + relationships + metrics with an Ossie YAML export — see [semantic model design](features/data-layer-semantic-model.md) and [Ossie research](research/ossie_semantic_layer.md). **Relationship re-model shipped (Stage 1):** `dataset_joins` now stores Ossie FKs (`from`/`to`/`from_columns`/`to_columns`/`required`); `cardinality` removed. **Dataset semantic fields shipped (Stage 2):** `datasets.unique_keys` + `ai_context` (Settings UI + `datasets update`); relationship `to` columns validate against the target's PK/unique keys. **Fields layer shipped (Stage 3, revised):** fields are **model-scoped** (`semantic_model_fields`; column ref or computed expression + `is_time` role + `ai_context`), seeded from the datasets' columns; the **Model → a model → Fields** section manages them. Physical **Columns** (with a maintained `description`, `dataset_columns`) live with the dataset. **Model metrics shipped (Stage 4):** `metric_definitions` is now **model-level** with an Ossie `expression` (aggregate SQL fragment), `type`, `datatype`, `ai_context` (no `dimensions`); the engine wraps it into a generated query executed **read-only with a statement timeout + row cap**; new `metric_runs` audit + `GET /api/metrics/{id}/runs`; the Model view authors + runs metrics (`/api/metrics`). **Saved queries withdrawn (Stage 5):** `saved_queries` removed — a query is a consumption concern (Data Insights), not part of the Ossie semantic model. **Semantic-model export/import shipped (Stage 6):** `GET /api/semantic-models/{id}/export` emits one model's Ossie document (JSON/YAML) — datasets (+columns/fields), relationships, metrics; `POST /api/semantic-models/import` upserts a model. **The refactoring plan (Stages 1–6) is complete.** **Datasets IA adjusted:** the Catalog landing has a **List / Map** toggle (Map = the ER graph, relationships as many→one FK edges); Relationships are configured per dataset (Catalog → detail → Relationships). **Semantic models shipped:** `semantic_models` (+ `semantic_model_datasets`) are **named scopes** over the shared datasets/columns/relationships (Catalog-owned); a model owns its **fields** and **metrics**. **Columns** (with a maintained `description`, `dataset_columns`) live with the dataset; **fields are model-scoped** (`semantic_model_fields`), so a field's `role`/`ai_context` can differ per model. **`saved_queries` was removed** (a consumption concern → Data Insights). The Model tab is a **list → model detail** (setup guide + Fields + Metrics) with per-model Ossie export/import; models are created explicitly (no default).

## Backlog {#backlog}

Tag: **user** = primarily improves daily paths for **frontline staff / domain experts**; **org** = governance, integration, or specialist roles (knowledge admin, legal/compliance, internal control, standards).

### User experience (high) {#user-experience-high}

Aligns with [Goals — retrieve and contribute](goals.md#goals-user-value) and [user pains](goals.md#goals-user-value).

| Item | Tags | Addresses (Goals pains / actions) |
|------|------|-----------------------------------|
| Source citations everywhere | user | **Can’t trust without evidence** — KB Q&A, search, agent replies consistently show version + link |
| Ask → contribute shortcut | user | **Partial:** KB Q&A thumbs-up → **Save as FAQ** (review in dialog, then create); wiki paragraph promote still open |
| Onboarding paths | user | **Don’t know where to start** — role- or map-guided “start here” for new hires / role changes |
| Trust indicators in UI | user | **Can’t trust**, **obsolete unnoticed** — “current for RAG”, effective dates visible in consumer surfaces |

### Connectors (high) {#connectors-high}

| Item | Notes |
|------|--------|
| **Tushare sync** | ✅ `run_connector_sync`, dataset outputs, manual + scheduled runs, Probe tab; slots: trade calendar, stock basic, daily quotes/basics, adj factor, dividends, index basic + index daily (`sync_index_codes`) |
| **search_tool** (Zhipu web search) | ✅ kind + `POST /api/connectors/{id}/search`; Agents **`search_connector_id`** + `web_search` tool |
| Operator UX | ✅ Manual **Run sync**, **Schedules** hub (`/job-runs/schedules`), scheduler cron, last run on trigger row; richer per-slot stats still open |
| Kind expansion | Additional **sync** catalogs beyond Tushare (`run_connector_sync_for_row` is kind-dispatched) |
| Downstream | Optional hooks: refresh datasets → re-index linked KBs or notify operators |

Shipped surfaces: [Connectors](features/connectors.md), [API reference — Connectors](features/api-reference.md).

### In-product agents (high) {#in-product-agents-high}

**Scope:** Wiki, documents, articles, map, and project workspaces — **not** [KB Q&A delivery](#agent-lanes) (`qa-agent`).

| Item | Notes |
|------|--------|
| Unified maintenance assistant | user — One discoverable pattern to **curate** across documents, wiki, ontology (draft, fix, link). **Today:** map designer, [Deep Agents projects](features/openkms-agents.md) — separate entry points |
| Eval assist UI | user · org — Wire [eval agent conversations](features/evaluation.md) into evaluation pages (API shipped) |
| Broader tool coverage | user · org — Read/write with ACL: documents, articles, glossary, search, ontology (within explore limits) |
| Maintenance workflows | user · org — From eval failures → suggested wiki/KB fixes (quality loop, contribution feedback) |
| Parity with external skill | user — [openkms-skill](features/openkms-skill.md) capabilities reachable in-app where permissions allow |
| K8s deploy from Agents | ✅ Console browse/apply/logs/Secret+env + Project deploy secrets sync; skill apply; hosted `module` Apps ([Kubernetes clusters](features/kubernetes-clusters.md), [Apps](features/app-builder.md#module-hosted-services)) |

Existing surfaces: [Wiki spaces](features/wiki-spaces.md), [Knowledge bases](features/knowledge-bases.md), [Knowledge map](features/knowledge-map.md).

### Multimodal models & media (high) {#multimodal-models--media-high}

| Item | Notes |
|------|--------|
| Model registry | Categories/playgrounds for **image** and **video** understanding models (not only `vl` / `ocr` / `embedding` / `llm` for documents) |
| Media functionality | [Media library](features/media.md) shipped; next: derivatives, transcripts/segments, links to specimens/taxa |
| Pipelines | Parse/index paths for audio/video (and still frames) into searchable text for KB |
| RAG | Chunk/provenance model for multimodal sources |

### Evaluation & knowledge quality (high) {#evaluation--knowledge-quality-high}

| Item | Notes |
|------|--------|
| Failure drill-down | user · org — Per-item: which chunks/pages failed, expected vs retrieved, judge rationale export |
| Improvement loop | user — From a run: suggested FAQs, chunk edits, wiki gaps, re-index prompts (quality improvement) |
| Dashboards | Trends across runs (pass rate, score), compare after corpus changes |
| Coverage | Stronger wiki checklist runs + KB retrieval baselines; optional export for CI |
| Product default | Consider enabling evaluations toggle by default once workflows are clearer |

Today: [Evaluation](features/evaluation.md) (`search_retrieval`, `qa_answer`, `wiki_content_coverage`).

### Policy & lifecycle (medium) {#policy--lifecycle-medium}

Aligns with [Goals — lifecycle and provenance](goals.md#goals-lifecycle) (e.g. regulatory change rippling to SOPs and training material).

| Item | Notes |
|------|--------|
| Change impact | org · user — Surface **dependents** when superseded or out of effective window (**obsolete unnoticed**) |
| Review queue | org — **needs review** list for knowledge admins / legal-compliance / standards management; optional bulk actions |
| Visibility | Home hub or channel dashboards: stale / affected counts after a known change |
| Notifications | Optional hooks (email/webhook) when `lifecycle_status` or `effective_to` changes — org-specific |

Today: [Documents](features/documents.md) lifecycle + relationships; `is_current_for_rag` on default KB search (dense + hybrid BM25 corpus via `current_for_rag_only`) — **no** automated impact workflow.

### Ontology logic (deferred / DIY) {#ontology-logic}

| Item | Notes |
|------|--------|
| Ontology access goes through the graph | **Shipped** — object list/detail **and** link list read Neo4j only (datasets and the `*_instances` rows are the index source and the write queue). No Neo4j data source → 409; graph unreachable → 503; type not indexed while it has rows to index → `indexed: false`, which the Explorer surfaces as "index it". Filters and paging run in the graph. Link endpoints are keyed by the object layer's identity, and hand-created links MERGE/DELETE their edge in the same request (409 when an endpoint is unindexed). |
| Action edits on dataset-backed objects | **Shipped** — create / modify / delete, with one rule: a create must carry the business key so the node and the app's row are the same object. Overlay edits by business id; the webhook announces them; the next index re-asserts the bound table, so a lost delivery is reverted rather than believed. |
| Deleting a Function from the UI | **Shipped** — a published Function is callable, so the API keeps "archive before delete"; Function Editor's Delete now performs that second step (with a confirmation that says what breaks) instead of failing with a toast nobody can act on. `delete_function` also stopped reading a non-existent `name` column (every delete was a 500). |
| Create: key columns required, everything else optional | **Shipped** — a dataset-backed `object_create` asks only for its key columns; a surrogate `id` is an ordinary property a caller may pass and the app may adopt, ignore, or replace with its own. Verified both ways against turtle (supplied id honoured; omitted id generated by the app). The webhook also carries `object.key` so a receiver can address its row without parsing properties. |
| Duplicate graph nodes removed | **Shipped** — the hand-created object types carried a second generation of nodes from an earlier indexing run: same object once with `__rid`, once without, and the copy without is the one the API cannot address (its instance id renders as `-`). `backend/scripts/dedupe_object_nodes.py` keeps the `__rid` node per key, re-attaches every edge of the copy to the keeper, and snapshots what it deletes. AlphaFactor cleaned: 91 → 47 nodes for 47 names. Applied to every affected type: FactorCategory 52 → 26, CauseCategory 68 → 34, CauseEvent 128 → 88, EffectObservation 195 → 116 — 179 nodes removed in total. Verified by relationship triple set (`src, type, dst`) before and after: 1 817 distinct triples, 0 lost; the edge count dropped 2 022 → 1 899 because duplicate edges collapsed into one. |
| File datasets with versions | **Shipped** — [Datasets — file datasets and versions](features/datasets-files.md). A dataset stops meaning "a table": `kind='table' \| 'file'`, with integer-named **versions** (v1, v2) assembled as drafts and frozen on publish whose manifests reference immutable **files** (one per slice, e.g. per month), reused across versions rather than copied. One built-in, unconfigured object-storage source (the deployment's MinIO bucket); schema is recorded, not enforced. Deliberately **no joins, no object-type binding, no SQL over files** — a file dataset is a versioned asset, and the Catalog's job is identity, provenance, pinning and governance. Verified end to end: turtle exported a 96,295-row parquet slice, openKMS took it as `training-set-5d` v1 draft, published it (manifest written), and served rows back with column + date selection. |
| Transactions in the ontology | **Shipped** — `Transaction` object type over `public.portfolio_transactions` (key `id`, 38 instances) with `ofPortfolio`, `onStock` and `fromRun` many-to-one links, so "which trades did this run make, on which stock, with what P&L" is one Cypher traversal. The earlier `traded` (Simulation → Stock, junction = the same ledger) remains as the roll-up. Writes still go through turtle's API: there is no Action for recording a fill. |
| Factor library in the ontology | **Shipped** — `Factor` object type over `public.factor_definitions` (key `code`, 47 instances): the definition plus its coverage (`value_count`, `stock_count`, `last_date`, `computed_at`), so "which factors exist and how far did each get" is a graph question. The panel `public.factor_values` is a dataset (key `factor_id,ts_code,trade_date`) joined to `Factor definitions` and `Stock basic`. No `Factor —appliesTo→ Stock` link type: the junction would be the whole panel, and an edge set that duplicates millions of rows costs hours to index and answers nothing the dataset cannot. |
| Simulation results as objects + datasets | **Shipped** — a run's summary (window, initial/final equity, return %, CAGR, max drawdown, win/loss, open positions, trade count) is stored on `simulation_runs` by turtle and mirrored as `Simulation` properties, so the object answers "how did it do". The equity curve stays a fact: `public.simulation_daily` is registered as a dataset (key `run_id,trade_date`) joined to `Simulation runs`. Trades stay ledger rows; a `traded` many-to-many link type over `portfolio_transactions` (`simulation_run_id` → `ts_code`) answers "which stocks did this run trade" from the graph. No `SimulationTrade` object type — a ledger is not a graph. |
| Composite object keys | **Shipped** — `object_types.key_properties` (1..n) replaces `key_property`; the API id is the encoded join and every merge/list/get/delete matches on all of them. Holding is finally modelled as `[portfolio_id, ts_code]` instead of borrowing turtle's surrogate `id`. A create no longer has to supply a surrogate the app owns — the app generates it. Junction/FK links with a composite endpoint are refused rather than mis-merged. |
| Webhook object identity on create | **Shipped** — the payload used to be built from the request, so a create's `object` block was null and the receiver could only learn the id from `input`. It is built from the result now: `object.id` = the created id (same value in `input`, `applied.created_ids` and the action log). Dataset-backed types refuse a create without their key; the receiver is expected to store the supplied id. |
| Action log names its object | **Shipped** — a create had no `object_id` (it appears as the result), so its log row read "—"; modify/delete showed a bare uuid. The log now records the created id and `object_label` (the type's display/key property) at run time, and the Log tab shows the label with type + short id. |
| Webhook visibility | **Shipped** — the **Action types** list carries the webhook as columns (target = method + path, and the **last delivery**); the settings live on the Action's own **Webhook** tab, not mixed into Overview and not in a menu of its own. `last_webhook` comes from one DISTINCT ON query over the action log. |
| Action webhooks | **Shipped** — an Action registers an external service + path; after a successful run the platform posts a fixed envelope (the object it acted on, the input, the applied ids, the caller, the log id) and records the delivery next to the Action log. Best-effort after commit; path checked against the service allowlist; credential from the registry — no per-integration Function. |
| External services for Functions | **Shipped** — `client.external("name")` calls a registered service (the **External services** app, `/external-services`; Function Editor and Action webhooks link to it). Two kinds: `http` (the sandbox calls the URL), `k8s_service` (the backend relays through the cluster's kubeconfig, because a Service's DNS only resolves inside the cluster). Same credential model (`none`/`bearer`/`header`/`hmac`) and allowlist for both; the call site does not change when the transport does. `http` still leaves from the sandbox — a network boundary would need the runner isolated; `k8s_service` is the kind that keeps working once it is. |
| Index prune for mirror types | **Shipped** — `index-to-neo4j?prune=true` deletes nodes/edges the run did not write, so a removed row stops answering queries; opt-in, refused when the source is empty, and reported via `nodes_pruned` / `relationships_pruned`. turtle's re-index callback uses it (`{"prune": true}` per target). |
| Frozen `api_name` for object/link types | **Shipped** — `api_name` (unique, `^[A-Za-z][A-Za-z0-9_]*$`) is the name code and Cypher use, fixed at creation; `name` is the display label. Generated from `name` when it has ASCII parts, required explicitly otherwise. Legacy rows keep `NULL` and resolve by `name`; claiming one is a one-time `PUT` and does not re-index. `Client` resolves api_name → name → id. |
| Stable graph identity | **Shipped** — `object_types.neo4j_label` / `link_types.neo4j_rel_type` are fixed at creation (backfilled to the previous name-derived value), so a rename no longer orphans indexed nodes; label collisions are rejected at create. `key_property` / `display_property` must name a declared property. |
| Action `create` / `modify` / `delete` apply (resolvable instance ids) | **Shipped** — apply `output.edits` after Action OFS ok (`applied.created_ids` / `modified_ids` / `deleted_ids`). |
| Dataset/Neo4j synthetic Action `object_id` + link create/delete edit ops | **Deferred** — see [Manager alignment](research/ontology_manager_alignment.md#capability-audit-shipped-vs-diy-blockers). |
| Discover / Explorer Home by group / global draft chrome | P1–P2 UX — **decoupled** from domain DIY and from Action-write work |
| Domain ontologies (Stock, screens, watchlists, …) | **Not backlog** — tenant DIY: [understanding ontology](tutorials/understanding-ontology.md) · [Tushare case](tutorials/tushare-market-ontology.md) · [openkms-skill](features/openkms-skill.md) `references/workflows.md` G; optional hosted board UI = workflow H + [Apps](features/app-builder.md) |

Shipped: [Ontology](features/ontology.md) · [Ontology Functions](features/ontology-functions.md) · [Manager alignment](research/ontology_manager_alignment.md).

### Other

| Area | Item | Feature doc |
|------|------|-------------|
| Documents | Advanced filter in channel document list | [Documents](features/documents.md) |
| Articles | Editor / detail UX polish | [Articles](features/articles.md) |
| Jobs | Job logs / stdout capture; configurable worker concurrency | [Pipelines, jobs & models](features/pipelines-and-jobs.md) |
| Data security | Hierarchical list batching for document/article channels | [Data security](features/data-security.md) |

Active UX / quality gaps: [Tech debt](./tech_debt.md).

## Long-Term

- Multi-tenancy
- Audit logging (beyond resource ACL admin Issues)
- Document export/import
- Plugin/extensibility (connector kinds, agent tools)
- Mobile/responsive polish (Phase 1: App Shell drawers + compact header ≤768px; Phase 1.1: reading-page tables/toolbars/dialogs wrap & scroll; Agents workspace phone IA: chat-primary + Sessions drawer + Files sheet, Session Review tabs)
- Domain depth (specimen/event, Darwin Core, interactive keys) — see [knowledge-types](features/knowledge-types.md) entomology workflow **future** column
- Agent ↔ frontend protocol: align to **AG-UI** (today custom NDJSON `delta`/`tool_*`/`done`; artifacts via A2UI surfaces)

Shipped work and design history: [Shipped history](shipped-history.md).

## Conventions

- **Before commit**: Update the matching `docs/features/*.md` page, [API reference](features/api-reference.md) / Data models when needed; add or remove rows in [Functionalities](./functionalities.md) only when a feature page is added or removed. See `AGENTS.md` (docs before commit).

## Open Questions

1. **All documents view** – Show documents from all channels when no channel selected?
2. **Default channel** – Auto-select first channel or require explicit selection?
3. **Global in-app agent** – Single maintenance chat shell vs contextual assistant per surface (wiki, documents, articles)? *(KB Q&A delivery stays per-KB `qa-agent` — out of scope.)*
4. **Connector vs pipeline** – Is every external sync a **connector job**, or some as generic `openkms-cli` pipelines only?
