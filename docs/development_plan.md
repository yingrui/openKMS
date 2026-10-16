# openKMS Development Plan

Business **why** and long-form narrative: [Goals (vision)](goals.md) — [user vs organization](goals.md) framing (same knowledge network; personal **retrieve / contribute** vs enterprise **governance / AI-ready**). This page tracks **what is shipped**, **strategic priorities**, and **backlog**.

## How priorities map to Goals {#goals-mapping}

| [Goals](goals.md) lens | What “done” looks like in product | Where tracked here |
|------------------------|-----------------------------------|--------------------|
| **User** — [pains](goals.md#goals-user-value) (e.g. can’t find, can’t trust) | Shorter paths to **find, trust, learn, contribute** | [Backlog](#backlog) rows tagged **user** below |
| **User** — [retrieve / contribute](goals.md#goals-user-value) | Retrieve with provenance; deposit without heavy authoring | Shipped: KB delivery (search/Q&A), wiki, parse+edit, **KB Q&A → Save as FAQ**; gaps: in-app maintenance assistant, eval→fix loop, wiki promote |
| **User** — [enterprise roles](goals.md#goals-user-value) | Frontline staff and experts adopt daily; admins and compliance can govern | Console, ACL, eval, connectors (partial) — see [Current State](#current-state) |
| **Organization** — [organization pillar](goals.md#goals-organization) | Structure, lifecycle, multimodal ingest, unified layer for agents | **Strategic priorities** + org-tagged backlog |

If a release improves only org tooling but not **frontline staff / domain experts** daily paths, pains such as **keeping answers private** and **no time to contribute** will persist (see [Goals](goals.md)).

## Agent lanes (delivery vs in-app) {#agent-lanes}

Track these **separately** — see [Goals — agent service](goals.md#goals-agent-service).

| Lane | What it is | Tracked under |
|------|------------|---------------|
| **KB Q&A delivery** | Per-KB **qa-agent** service: hybrid search, `/ask`, `/retrieve`, sourced answers for apps and agents | [Knowledge bases](features/knowledge-bases.md) (API + optional SPA Q&A UI) |
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
7. **Data layer** — **Planned:** [Data layer plan](features/data-layer.md) — Datasets (catalog + file ingest + **Model** view: joins/ER, quality, metrics), Data Explorer (project-agent analysis). **Phase 0 shipped:** three-layer App Rail (Application / Ontology / Data) and `Datasets` as a first-class app at `/datasets`. **Phase 1 shipped:** data-source layer tag; dataset catalog fields; dataset joins + ER view; file upload wizard (CSV/Excel/JSON → PostgreSQL); profile / schema history; `openkms-skill` dataset commands (**lineage removed** — it could only name the data source and repeated Usage/Relationships). **Phase 2 shipped:** Datasets **Model** view (global joins + quality alerts); declarative quality rules (create / run / history); declarative metrics (on-demand compute); `openkms-skill` quality / metrics commands. **Phase 3 shipped:** Data Explorer app (saved analyses); `explorer_dashboards` persistence API; `openkms-skill` explorer dashboard commands. **Row editing shipped:** dataset `primary_key_columns` + `is_editable`; `data:edit` permission + audit (`dataset_edits`); keyset paging + `POST /datasets/{id}/rows/apply`; Data tab migrated to **TanStack Table** (server sort + inline cell editing). **Semantic model design (Apache Ossie):** relationships re-modelled as **FK edges** (`from` many → `to` one); metrics become model-level; datasets gain `unique_keys` + `ai_context`; the Model tab authors datasets + relationships + metrics with an Ossie YAML export — see [semantic model design](features/data-layer-semantic-model.md) and [Ossie research](research/ossie_semantic_layer.md). **Relationship re-model shipped (Stage 1):** `dataset_joins` now stores Ossie FKs (`from`/`to`/`from_columns`/`to_columns`/`required`); `cardinality` removed. **Dataset semantic fields shipped (Stage 2):** `datasets.unique_keys` + `ai_context` (Settings UI + `datasets update`); relationship `to` columns validate against the target's PK/unique keys. **Fields layer shipped (Stage 3, revised):** fields are **model-scoped** (`semantic_model_fields`; column ref or computed expression + `is_time` role + `ai_context`), seeded from the datasets' columns; the **Model → a model → Fields** section manages them. Physical **Columns** (with a maintained `description`, `dataset_columns`) live with the dataset. **Model metrics shipped (Stage 4):** `metric_definitions` is now **model-level** with an Ossie `expression` (aggregate SQL fragment), `type`, `datatype`, `ai_context` (no `dimensions`); the engine wraps it into a generated query executed **read-only with a statement timeout + row cap**; new `metric_runs` audit + `GET /api/metrics/{id}/runs`; the Model view authors + runs metrics (`/api/metrics`). **Saved queries withdrawn (Stage 5):** `saved_queries` removed — a query is a consumption concern (Data Explorer), not part of the Ossie semantic model. **Semantic-model export/import shipped (Stage 6):** `GET /api/semantic-models/{id}/export` emits one model's Ossie document (JSON/YAML) — datasets (+columns/fields), relationships, metrics; `POST /api/semantic-models/import` upserts a model. **The refactoring plan (Stages 1–6) is complete.** **Datasets IA adjusted:** the Catalog landing has a **List / Map** toggle (Map = the ER graph, relationships as many→one FK edges); Relationships are configured per dataset (Catalog → detail → Relationships). **Semantic models shipped:** `semantic_models` (+ `semantic_model_datasets`) are **named scopes** over the shared datasets/columns/relationships (Catalog-owned); a model owns its **fields** and **metrics**. **Columns** (with a maintained `description`, `dataset_columns`) live with the dataset; **fields are model-scoped** (`semantic_model_fields`), so a field's `role`/`ai_context` can differ per model. **`saved_queries` was removed** (a consumption concern → Data Explorer). The Model tab is a **list → model detail** (setup guide + Fields + Metrics) with per-model Ossie export/import; models are created explicitly (no default).

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
| **Tushare sync** | ✅ `run_connector_sync`, dataset outputs, manual + scheduled runs, Probe tab |
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

### The dashboard's identity row (2026-10) — done

- The rail's identity block reads in three parts: the name, the question, then **one quiet row** —
  `draft` · `3 reports` · `Delete dashboard`.
- The delete is an **icon that names itself on hover** (`is-icon-action`, shared with any identity
  action): quiet, but never nameless — the label stays in the DOM and the button carries an
  `aria-label`, so a keyboard user hears it without hovering.

### The dashboard's rail became its table of contents (2026-10) — done

- **Follow-up: it did not scroll.** The report sections never got the id the rail linked to (the panel
  lives inside `DashboardReportView`, and only the answer's panel was given one), and the link relied
  on a hash jump while the scrolling box is the main pane. Both fixed: the tile takes an `id`, and a
  section link moves the pane with `scrollIntoView`. `EntityViewShell.test.tsx` now asserts the click
  asks to scroll to the right id — the assertion that would have caught it.

- The left rail was blank for a dashboard (it is the app's navigation column, and a dashboard has no
  tabs). It now lists the document's sections — the answer, then each report with where it reads from —
  and clicking one scrolls there.
- `EntityViewShell`'s nav item is now either a **route** or a **section of the page** (`sectionId`), and
  `EntityViewPanel` takes an `id`: a capability any long detail page can use, not a dashboard special.
- Trying to verify it against the build led to a second lesson: chunk names are **hashed**, so a stale
  `dist/` keeps the previous build around and a "missing" class can be a stale file. The verification
  rule now says to clear `dist/` (or grep the newest chunk) first.
- The "which source does this report read" resolution was written twice (the tile and the rail) —
  it is `reportSource()` now, with the tile and the contents list sharing it.

### The narrative editor had no styles (2026-10) — fixed

- Tidying `data-explorer.scss` with a **line-range slice** cut `.dashboard-narrative` and its editor
  out of the sheet — the tile styles survived only because they are nested inside `.dashboard-report`.
  Restored, and the page now imports its own sheet rather than relying on a child component to.
- Because this was the third "a class styles nothing" incident, and every one came from a mechanical
  edit (rename / move / delete), `scripts/check-undefined-classes.py` now checks it: 83 accepted
  classes, a baseline that only shrinks, and a probe confirming a deleted block fails with the file
  and class named.

### Add a report from the dashboard (2026-10) — done

- **Add a report** on the dashboard page: pick the source, write the query, **Try it** (nothing is saved
  on a guess), then title/insight/presentation and save. Three shapes — a dataset's **rows**, a
  dataset's **summary**, a model's **metric by fields** — with anything richer left to the Playground
  and the Data tab, which save into a dashboard too.
- `FilterRows` (the filter-row editor, with date inputs and quick ranges) moved out of the Playground
  into `src/components/ontology/` **with its own sheet**, because two routes now render it — the
  shared-but-local rule caught it on the first run.
- Printing the form's three specs at the API found **two real bugs** in the dataset summary endpoint
  (a schema that rejected `{column, granularity}`, and a reader that silently *dropped* a group entry
  it could not read — answering "everything" for "by month"). Both fixed, with tests.

### One action row per dashboard (2026-10) — done

- Run sat in `EntityViewShell`'s **identity slot**, whose CSS strips button styling and whose contract
  was a *text-style read* action (`View YAML`) — so the document's primary action rendered as muted
  text, and Delete floated alone in the header corner.
- Fixing that by putting both in the action row made the **delete as loud as the primary action**,
  which is worse. The slot's own styling turned out to be the answer: Run is now the page's primary
  button, and Delete is a **text link with the identity** (`is-danger`, red on hover) — low
  prominence, still discoverable. The slot's contract was widened to "identity-level actions,
  rendered as text links" for exactly this case.

### All dashboards joins the app's card list (2026-10) — done

- The "nothing here yet" line (`entity-view__readonly`) moved to the shared utilities — it was
  defined in one page's sheet while ~10 pages across several routes used it (rule 16's baseline
  29 → 28), and `DashboardDetailPage` stopped importing the manager sheet for two global button
  classes.
- The list page was the one screen that matched nothing: its own header, its own grid, its own card.
  It now uses the shared `resource-list.scss` (the same chrome as Knowledge Bases and Wiki spaces) —
  page header + primary action, card grid, icon/title/description/meta card — with the question as
  the card description and state + report count + sources in the meta line. 82 lines of bespoke CSS
  deleted, and the `resource-list` vocabulary means the page reads like the rest of the app.

### Analyse deeper: compare, combo, and dead classes (2026-10) — done

- **KPI comparison distance**: `metric` + `trend.compare` compares the last row against the one **N
  rows back** (1 = previous, 12 = the same month last year on monthly data, 4 = a quarter, 7 = a
  weekday count). It is a row count, never a guessed period, and the editor labels each choice with
  the reading it assumes. Tests cover 1/4/12, a series shorter than the comparison (no delta invented)
  and nulls being skipped *before* counting back.
- **Combo charts**: `chart` gains `type: "combo"` — `y` as bars on the **left** axis, `lines` on the
  **right**. Two axes because a count and a ratio share no scale, and pretending otherwise is exactly
  how a combo chart misleads. A grouped combo is rejected (the lines would have nowhere to pivot), and
  a render smoke test covers the wiring (a wrong `yAxisId` throws).
- **Dead class names**: `AppCatalogGrid` carried `app-catalog` / `app-catalog-section` /
  `app-catalog-grid` on its elements — defined in no stylesheet and referenced nowhere (the SCSS file
  beside it defines only the `--launcher` / `--home` variants, which are kept). Dropped.
  *Reported, not removed* (used consistently and deliberately unstyled, or out of this area):
  `app-loading` (4 call sites, no definition — style it or drop all four), `HomeStaticLanding`'s
  `home` / `home--public`, and the `--home` catalog variants that `Home.scss` overrides but nothing
  defines.

### Date filters that speak in periods (2026-10) — done

- A temporal column (or a model field with `is_time`) gets a day picker + **quick ranges** (last 7/30
  days, this month, last month, this year, last year); the grammar maps onto the operators we already
  have (`between` / `>=` / `<=` / `=`), and a reversed range is shown rather than silently empty.
- `dateRange.ts` is pure, so the month/year boundaries are tested (previous December, leap February,
  31-day months). Verified against live data: this month 11,116 rows, last month 116,588, this year
  1,007,340.
- The Playground's filter had a plain text value even for time fields; it now has the picker too
  (extracted to `PlaygroundFilters` when the section hit the 700-line guardrail).

### Data Explorer aligned with the app's pages (2026-10) — done

- Audited against a sibling detail page, a sibling list page and the design system
  ([table](features/data-layer-explorer.md#how-it-looks-next-to-the-rest-of-the-app)). The dashboard
  page was the only detail page **not** using `EntityViewShell`; it does now (identity rail with
  **Run** as its action, the answer and every report as `.account-card` sections), so the tiles read
  like every other section in the app.
- `<EntityViewPanel>` gained an `actions` slot (revealed on hover/focus-within); `<StatusChip>` and
  `EntityViewLoading` replace the page's own pill and spinner.
- From Tremor's *styling* (not its dependencies): the chart palette became theme tokens
  (`--report-series-1…8`, lifted in dark mode) and number formatting moved into one module.

### Data Explorer UI pass (2026-10) — done

- The document reads top-down: answer → a section per report (title, source, insight, result, a
  quieter provenance line with **as of**); tile actions reveal on hover/focus.
- Vocabulary in CSS matches the model: no more `explorer-report-*` (the inverted names that survived
  the backend rename).
- The report views' styles moved to `src/styles/report-view.scss` — they were page-owned while the
  Playground and the Data tab rendered them, so that preview was unstyled.
- **Rule 16 was measuring the wrong thing** (route *areas*, not routes), which is how that slipped
  through. It now derives routes from the `App.tsx` import graph, finds **29** pre-existing
  shared-but-local classes (frozen as debt; e.g. `.auth-mode-compat-banner`, used by 26 routes), and
  fails on the next one — probed both ways.
- `<StatusChip>` (`ds-status`) added for state words; empty states get their action button.

### Report views and export (2026-10) — done

- A report's presentation is a **`view`**: `metric` (one number), `bar_list` (a ranking), `chart`
  (line/bar) or the table — vocabulary taken from [Tremor](research/tremor-evaluation.md) after
  evaluating it (Tailwind + React 18 peer + a second recharts major → not adopted).
- CSV export, client-side, with RFC-4180 quoting and a UTF-8 BOM; every report shows **as of** when
  it was run (and nothing pretends the data has not changed — that needs a declared watermark).
- The Tremor vocabulary is complete for what our data supports: a **KPI** (`metric` + `trend`: last
  value, change vs the previous one, CSS-bar sparkline) and a **coverage strip** (`tracker`). Targets
  and limits (category/progress bars) stay unimplemented — we declare none, so drawing them would be a
  lie; combo/scatter charts and a date-range picker are the real remaining gaps.
- First component tests in the repo, which caught an i18next placeholder bug (`{max}` vs `{{max}}`)
  now enforced by `check-i18n-keys.py`.

### Dashboards of reports (2026-10) — done

- The model was inverted: the saved document is a **dashboard**, each tile in it is a **report**, and
  a report owns **its own source** — so one dashboard mixes a model metric with a raw-dataset check.
  `explorer_reports`/`blocks` renamed to `explorer_dashboards`/`reports`, API included.
- Per-report source ACLs: a report out of reach answers `EXPLORER_SOURCE_FORBIDDEN`, never its rows.
- **Save to a dashboard** closes the round trip the design promised: a Playground query (model) or a
  Data-tab slice (dataset) becomes a report, with the chart offered as a default the person can change
  and previewed with the same component the dashboard draws.

### Data Explorer charts (2026-10) — done

- A block's `chart` spec draws its result (line/bar, optional grouping series); the table stays one
  click away, and a spec the result cannot satisfy falls back to it.
- recharts (MIT) — [selection note](research/chart-library-selection.md); the shared
  `<QueryFailureNotice>` moved from a page sheet into the design system.
- Dataset summaries (`POST /api/datasets/{id}/aggregate`) give the Catalog half "by month" without a
  semantic model.

### Data Explorer permissions (2026-10) — done

- Reports moved off `data:read` / `data:write` onto their own `explorer:read` / `explorer:write`; a
  refresh is a **read**. The migration re-applies the two old keys' patterns and backfills grants, so
  nobody loses access.
- Viewing/running a dataset-backed report is now checked against **that dataset's ACL** (it used to
  be a way around it, since the results are stored).

## Conventions

- **Before commit**: Update the matching `docs/features/*.md` page, [API reference](features/api-reference.md) / [Data models](features/data-models.md) when needed; add or remove rows in [Functionalities](./functionalities.md) only when a feature page is added or removed. See `AGENTS.md` (docs before commit).

## Open Questions

1. **All documents view** – Show documents from all channels when no channel selected?
2. **Default channel** – Auto-select first channel or require explicit selection?
3. **Global in-app agent** – Single maintenance chat shell vs contextual assistant per surface (wiki, documents, articles)? *(KB Q&A delivery stays per-KB `qa-agent` — out of scope.)*
4. **Connector vs pipeline** – Is every external sync a **connector job**, or some as generic `openkms-cli` pipelines only?
