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
| Ontology access goes through the graph | **Shipped** — object list/detail **and** link list read Neo4j only (datasets and the `*_instances` rows are the index source and the write queue). No Neo4j data source → 409; graph unreachable → 503; type not indexed while it has rows to index → `indexed: false`, which the Explorer surfaces as "index it". Filters and paging run in the graph. Link endpoints are keyed by the object layer's identity, and hand-created links MERGE/DELETE their edge in the same request (409 when an endpoint is unindexed). |
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

### Run history (2026-10) — added, then **removed**

- It recorded every run (when, how long, how many reports failed, who) and served the last 20 as a
  section on the dashboard, with the health said above the list: the newest clean run, and how many
  runs in a row had failed. Those two are the only questions a tile's `as of` cannot answer — it moves
  on a failed attempt too.
- **It was removed anyway.** A table, an endpoint, a panel, a skill command and two migrations, for a
  failure pattern nobody had asked about, while every tile already says how fresh it is. Judged not
  worth the surface — the lineage precedent: delete, do not decorate.
- If that pattern ever does matter, the cheap answer is two fields on the report itself
  (`last_success_at`, `consecutive_failures`), not a log. Dropped by `a1b2c3d4e5f9`, hand-written:
  `--autogenerate` on this database also proposes dropping the LangGraph `checkpoint*` tables, several
  indexes and NOT NULL changes (the metadata has drifted) — still worth its own look.

### Scatter: two measures against each other (2026-10) — done

- `chart` gains `type: "scatter"`: the horizontal `x` is a **number** (not a category axis) and `y` is
  a single vertical measure — "is a bigger company more expensive?" is a question this data actually
  raises. More than one `y`, any `lines` and any grouping are refused: those are different charts.
- The axis type is declared (`type="number"`), because recharts otherwise treats every price as a
  category and stacks the points into columns. Covered by parse/series tests and the render smoke test.

### The rail follows the reader (2026-10) — done

- The table of contents highlights the section being read (`useActiveSection`): an
  `IntersectionObserver` over the pane's top 40%, and the **last** section in that zone wins — the one
  scrolled furthest into. (The first rule took the *earliest*, which parked the highlight on the
  opening section for most of the page and read as "it never moves"; the test had encoded that wrong
  rule, so it passed.) The previous highlight is kept when nothing is in the zone, and a click marks
  the target at once instead of waiting for the scroll to settle.

### Run and "add a report" moved where they belong (2026-10)

- Both sat in a page-header row of their own, with nothing on its left — a whole line of vertical space
  for two buttons. They are not the same kind of action, so they split:
  - **Run** is the action you keep coming back to, so it sits with the **identity** in the rail (a real
    primary button under the state/size/delete line: "this dashboard → run it"). At `btn-sm`, with the icon at 14 px and the row's\    gap tightened: a 220 px rail has one text size, and a full-size primary button was the largest
    thing on the page for the smallest label. The rail's slot strips
    button skins for its text-style actions (`View YAML`, the quiet delete), so that rule is now scoped
    to `:not(.btn)` — a real button beside them keeps its skin.
  - **Add a report** adds a *section*, so it sits **where the document ends** — an affordance at the
    bottom of the stack, not a toolbar button.
- The empty header row is gone.

### Fix: the delete icon flickered on hover (2026-10)

- The dashboard's delete was an icon whose label **expanded** on hover (`max-width: 0 → 12rem`). In a
  220 px rail that widened the identity row past its width, the row **wrapped**, the button moved out
  from under the cursor, the hover ended, the label collapsed, the row unwrapped — a self-sustaining
  loop, seen as a flicker.
- The reveal is gone: an icon with the platform's own tooltip (`title`, plus `aria-label` for readers)
  shows the name on hover and cannot change layout while doing it. Buttons whose labels reveal on hover
  must not push layout — the two other reveals in this app (report tiles, section cards) animate
  `opacity` only, which is why neither flickers.

### "Save first" on a rule nobody touched (2026-10)

A reader opened the `range` rule and was told *"Save first — Run re-reads the saved rule, not this
draft"* about a rule that was exactly as saved. The draft comparison was
`JSON.stringify(config) !== JSON.stringify(rule.config)`, and the config is stored as **JSONB** — which
normalizes object keys. The API returned `{"max":300,"min":0.1}`, the form built `{"min":0.1,"max":300}`,
and the two strings were never equal.

The sharp part: **only that rule could show it.** `range` is the only config with two keys; `not_null`
holds `{}`, `freshness` and `sql` hold one key each, and those serialize identically either way. A
comparison that fails only for multi-key data reads like a one-off glitch rather than a bug.

Fixed by comparing **by value**: `canonicalJson` (sorted keys, recursive) and `isRuleDraftDirty`, with
the exact live shape as a test. The general rule is the one this cost: **never compare structured data
by its JSON text** — key order, number formatting and `undefined` all make that lie, and a database is
entitled to reorder what it stores.

### "Today has data" is a calendar question (2026-10)

The coverage rule the `expect: nonzero` direction was built for read `WHERE trade_date = CURRENT_DATE`, and
a reader corrected it: on a weekend or a holiday that is a **false alarm** — the data is not missing, the
market is closed. The question is not "does today have rows" but "does the **latest trading day** have
rows", and only a calendar can answer it:

```sql
SELECT count(*) FROM {{table}} WHERE {{column}} = (
  SELECT max(cal_date::date) FROM tushare.trade_calendar
  WHERE is_open = 1 AND cal_date::date <= CURRENT_DATE)
```

Which is also the first time the `sql` type earned its place in production: it reaches another table of
the same source, which no declarative form can do. (The calendar's `cal_date` is **text** — `'20261231'`
— and the table carries *future* dates, so both the cast and the `<= CURRENT_DATE` bound matter.)

Two things followed:

- the editor's coverage starting point is a **window** now (`>= CURRENT_DATE - 7`), not `= CURRENT_DATE`,
  because I had written the same mistake into it;
- `freshness` still compares to `current_date`, which is right for "not older than N days" and wrong for
  "the last trading day is present". The skill reference says which to use for which.

### The search box wrapped, and the sheet nobody imported (2026-10)

The new search field on Data Insights landed **above** the "New dashboard" button. Two mistakes:

- It was in the header's **action cluster**, which is `flex-wrap: wrap`; an 18rem field beside a primary
  button wrapped under it. Search is a **view control**, not an action, so it moved to its own toolbar row
  above the list — where the catalog already puts its search. It also stays visible while a search finds
  nothing, or the box that would clear it would disappear with the results.
- The styles went into `data-insights.scss`, which the **list** page does not import (it imports
  `styles/resource-list.scss`; only the detail page imports the other). So the rules shipped in the wrong
  chunk and applied to nothing. They live in the shared sheet now.

The second one is the same trap as the report-view classes earlier in this project, and the guardrails
still do not cover it: `check-global-classes` catches a class **used by 2+ routes** but defined in one
route's sheet; nothing catches a class used by **one** page and defined in a sheet that page never loads.
Adding that needs parent-route reachability (a tab's parent sheet *is* in scope, e.g. `quality-pill` from
`dataset-detail.scss`), which is why it is a follow-up rather than a five-line check.

### Backups: written, and honestly not yet proven (2026-10)

The first item on the list was the only real net: backups with a restore that has been performed. Two
scripts now exist — `scripts/pg_backup.sh` (`pg_dump -Fc`, keeps the newest N, connection from
`app.config` so there is one DSN source) and `scripts/restore_drill.sh` (restores into a scratch database,
compares row counts on the tables that would break loudly, drops it).

They are **not claimed to work**: this machine has no `pg_dump`, so only the preflight was exercised (it
refuses with an installation hint, verified). The drill is what turns a file into a backup, and until it
prints `restore drill ok`, the honest state is untested.

### The rail now follows the Documents channel rail (2026-10)

Sharing the Ontology Manager's rail was the right instinct and the wrong reference: that rail is a plain
200px list of 0.875rem links, and the audit page inherited its plainness. The **Documents channel rail** is
the app's best-made left column, so the shared rail now follows it:

- **240px**, `height: 100%`, `align-self: stretch` — a rail is a column of the page, not a box in it;
- a **head** (14/12/10 padding, title 0.8125rem semibold in normal case, a rule under it) instead of an
  uppercase micro-label shouting "SCOPE";
- one **scroll area** (8/10/12) holding the groups, so the title stays put while the list moves;
- items at the channel tree's spec — `4px 8px`, 0.8125rem, muted text lifting on hover, the accent pair when
  selected — with the label ellipsised and the count as a quiet 999px badge rather than a second label.

Three navigation rails (Ontology Manager, Object Explorer, Function editor) and the audit page share it, and
their titles moved into the new head. The lesson is the one this file keeps relearning: before inventing a
component, read the app for the one that already solved it.

### The rail is the Ontology Manager's, and paging is the app's (2026-10)

Two things were wrong with the first rail: it *looked* like the Ontology Manager's rail without being it
(parallel `audit-log__*` rules that drifted on the first try), and it reserved a group for **people**, which
cannot be a navigation — there are as many actors as there are keys.

- The rail is now **shared**: `src/styles/filter-rail.scss` (`.filter-rail*`), used by the audit page and by
  the three Ontology Manager rails. Their own sheet is gone; `App.scss`'s layout rules follow the class that
  exists.
- **No "who" group.** Filtering by actor still exists on the endpoint and in `openkms audit list --actor`,
  for when you know which key you are looking for — that is a filter, not a map.
- **Paging is the app's `Pagination`**, not a hand-rolled "load older": the list and the rail now read the
  **same 30-day window** (an append-only log has no stable offsets, which is why the window matters), and
  the API returns a real `total` over that window, so the rail's count is the number of pages you can turn.

Verified live: `total=51`, pages 1 and 2 with no overlap, and `filter-rail__*` in the shared stylesheet.

### The audit page gets a rail, because "where" is a map (2026-10)

The page opened with four empty filter boxes, which asks the reader to guess what exists. It now borrows the
ontology manager's shape: a **rail on the left that answers "where"** — the parts of the system, how the
mutation turned out (`succeeded` / `rejected 4xx` / `crashed 5xx`), and who did it — each row carrying a
**count**, so the shape of the log is visible before anything is filtered. The right side is the record.

Counts need a query, not a page of results: `GET /api/console/audit-events/facets` groups over a **30-day
window** (a log only grows, and a `GROUP BY` over a year would stall a page that should open instantly).
The window is returned so the rail can say what it counted.

A `status` group filter came with it (`ok` / `4xx` / `5xx` / `error`), because "what failed" is the second
question anyone asks and a min/max range UI would be worse than a word.

### The audit log has a page, behind the user menu (2026-10)

Reading it needed `curl`. Now: **top-right user menu → Audit log** → `/audit-log`, a table of every
mutation — when, who, `METHOD path`, status (with `detail.error` beside a 500), and the resource.

- The menu item is shown only to accounts holding `console:permissions` — the same key the API requires, so
  the entry does not appear for someone who would get a 403.
- `/audit-log` is a **top-level route**, not a console page: the flow is the user menu, and a console
  deep-link would drag in the console shell's own gate (`console:access`) that an auditor need not have.
- Filters: actor, method, resource type, resource id. Newest first, key-set paged ("load older"), because a
  log only grows.
- A 403 renders "your account cannot read the audit log" rather than a toast that says something went wrong
  — that state is not an error, it is the answer.

### The audit log: a mutation is recorded even when it fails (2026-10)

The security note ended with "backups, then a key per agent, then soft delete and an audit log". The log is
here; it is a **middleware**, not a handler concern, because the operations worth recording are exactly the
ones nobody wants to think about afterwards.

- `audit_events` + `AuditMiddleware`: method, path, status, the key's owner (`actor_sub` / `actor_name`), and
  a coarse subject read out of the path (`datasets` + the id when it is a UUID). Mutations only — reads are
  volume without a destruction story.
- **Failures are the point.** The first version recorded after `call_next`, so an endpoint that **raised**
  produced no event at all — the case you most want. It now catches, records `status 500` with
  `detail.error` = the exception type, and re-raises: a crash is in the log and still crashes.
- It writes with **its own session** (a request rollback must not erase the record of the attempt) and
  swallows only `SQLAlchemyError` / `OSError`, loudly: an audit outage must not turn a successful write into
  a 500.
- **No request bodies** are stored. Bodies carry secrets; the path and the status answer the question.
- Read side: `GET /api/console/audit-events` (`console:permissions`, keyset paging) and `openkms audit list
  --actor/--resource-id/--path/--since`.

Verified live: creating a story recorded `POST /api/stories → 201`, deleting it recorded `DELETE
/api/stories/{id} → 204`, both attributed and pointing at the id. Still missing: retention, and soft delete
— the log makes an incident *readable*, not *undoable*.

### Reading a route is not permission to call it (2026-10)

`api spec` raised the fair objection that if the skill can read the backend's API, an agent can bypass the
CLI. The measurement made it worse than the objection: the key this runs with is **`is_admin` with `all`**,
so the CLI was never a boundary — it was a convention, and a `curl` would already have done anything.

Two things follow, and they are not the same:

- **capability vs knowledge.** The key already had the capability; the spec adds knowledge (paths,
  parameters, responses). Hiding knowledge is not a control either: `/openapi.json` is served
  **unauthenticated**, so the shape of the API was always public.
- **the boundary is the key's role**, enforced server-side. Nothing a client-side convention does can
  substitute for it. The honest recommendation for agents is a scoped role (`data:read` + `insights:write`,
  no `console:*`, not admin) — then a bypass can only do what the agent was allowed to do anyway.

What the CLI is actually for, then: validated inputs, `-y` before writes, dry runs, and being tested. That
is reliability and hygiene, worth keeping — but it is not access control, and the skill now says so in all
three places it could be read otherwise (`api spec`'s docstring, the routing table, and `api-reference.md`).

### The reference keeps concepts; agents read the generated spec (2026-10)

The page's job is the part a generator cannot write: auth shape, permissions, the edge case that bit
someone. The complete route list is FastAPI's, and an **agent** should read it from there rather than from
prose — which raised the only real obstacle: the skill forbids ad-hoc HTTP (`curl` / `httpx`), so an agent
could not reach `/openapi.json` at all.

`openkms api spec` is the sanctioned path: it reads the document and prints an **index** of
`{method, path, summary}`, with `--path /api/<area>` to narrow by prefix, `--method` by verb, and `--full`
for the operation objects (parameters, request body, responses). So the skill's rule holds — no ad-hoc
HTTP — and its routing table can say "you were not told about this route; ask the spec" instead of inviting
a guess from prose.

That command also exposed a test-infra trap: the mock fixture patched `client` in a **hand-kept list** of
command modules, so a new module silently talked to the network. The list is derived now — every module
under `openkms/commands/` whose source imports `client` — and a probe proved a brand-new module is covered
without touching the fixture.

### The route table is not a mirror either (2026-10)

Filling the 93 undocumented routes was the obvious next step, until the count said what they were: **85
real consumer routes**, most with no docstring. Writing one line per route from a path string would have
made the number zero and the page worse — and it is the *same mistake* the
`data-models.md` decision was about: a hand-kept table of 566 operations is a mirror of the code, and it had
already drifted 93 routes, exactly like the table of 88 models drifted 45.

An earlier draft of this entry justified the decision by saying those routes were "in areas nobody is
working on". That was unsupported when written and wrong on the numbers: in the 30 days to this decision,
269 commits touched the API, including `projects` (7), `admin` (4), `ontology` (2) and `media` (2). The only
defensible statement is narrower — *we* were not working there — and the decision never needed it: whether a
page is a mirror does not depend on how busy its subject is.

So the reference no longer claims to be complete. Its scope is **the routes whose behaviour needs
explaining** — auth, permissions, edge cases — and the complete list is what FastAPI already publishes:
`/openapi.json`. The check keeps only what is always a bug: a route **documented here that the app does not
serve**. The gap direction is informational.

The baseline is gone with it. A ratchet that can be satisfied by writing 85 unverified rows is not a
guardrail, it is a target.

### `data-models.md` is gone, and the route table is checked (2026-10)

**Deleted** `docs/features/data-models.md` (456 lines). It mirrored the SQLAlchemy models by hand, and the
drift scan had just shown what hand-mirrors do: 45 of 88 tables missing, including the `stories` table the
rename had added. Everything in it was derivable — columns from the models, seeded rows from migrations,
enum meanings from the code — and its own opening line sent readers to a feature page for runtime
semantics anyway, so it was duplicating by construction. Links were rewritten in 17 docs (plus `AGENTS.md`,
`agents.md`, `architecture.md`/`.zh`), and the authority is now stated where the mirror used to be: the
models and the Alembic revisions.

**The route table is checked now** (`backend/scripts/check_api_doc.py`, run by `backend/check.sh`). It
compares `docs/features/api-reference.md` against **FastAPI's own `app.routes`** — not against parsed
`@router` decorators: prefixes come from `include_router(...)` in several places and routers are nested, so
a static reader missed 99 real routes and invented as many phantoms.

The two directions are not equally bad, so they are treated differently:

- a **documented route the app does not serve** is a lie → always fails, no baseline (there are none);
- a **route the app serves and the page omits** is a gap → frozen in `scripts/api-doc-baseline.txt`
  (**93** today, the four FastAPI built-ins excluded), a ratchet that only shrinks. `--update-baseline`
  regenerates it, and documenting a route without deleting its line is harmless: the comparison is a set,
  so the baseline being larger than the gap never fails.

Both directions were proven with probes — a fabricated row in the reference fails, and a shortened
baseline fails — and the reference says at the top that it is checked, so nobody has to guess.

### Documentation drift scan (2026-10)

Asked to find where docs and implementation disagree. Compared against the **code**, not by reading:
FastAPI's own `app.routes`, the models' `__tablename__`, `permission_catalog`, the skill manifest, and the
guardrail baselines.

**No ghosts, and our line is clean.** Of 431 real routes (566 operations — the comparison collapses different
paths that differ only in a parameter name), **none** is documented-but-missing (every route
`api-reference.md` describes exists), and the Data Insights / quality / datasets routes are **all**
documented. The drift is incompleteness elsewhere — 97 routes undocumented, by area: ontology 24,
projects 18, admin 11, media 10, app-builder 10, knowledge-map 7, media-channels 7, user 3, resource-acl 2
(plus `/docs`, `/redoc`, `/openapi.json`, `/health`, which should stay undocumented).

Fixed here, because it is ours or it is plainly wrong:

- **`stories` was missing from `data-models.md`** — a page that opens with "Schema for every persisted
  table". The rename added the table and forgot the doc. Documented with its JSONB finding shape.
- **One stale ratchet number**: `check-ds-controls` froze "273" unskinned controls; the real count is
  **70** (the other three — 28 / 83 / 0 — were correct).
- **`media:read` / `media:write`** existed in the catalog and in no doc; they are in the permission table.
- **The rename never reached `console-and-auth.md`** ("read reports", "a dataset-backed report") — the
  page still said report where the API says finding.

Known and not fixed (recorded so it is a decision, not an oversight): 35 tables still unmentioned in
`data-models.md` despite its "every table" claim — mostly ontology (`object_instances`, `link_types`, …),
wiki/faq/media, and `dataset_columns` / `dataset_edits` / `dataset_ingests` / `dataset_joins` /
`dataset_profiles` / `metric_runs` / `quality_runs` / `schema_snapshots` / `semantic_model_fields` from
the data layer. And the 97 undocumented routes above.

A drift **check** is possible and cheap — `app.routes` against the reference table, with a baseline that
only shrinks — but it would have to be baselined at 97 today, so it is offered rather than smuggled in.

### The skill's description outgrew the loader (2026-10)

pi refused the skill: `description exceeds 1024 characters (1270)`. The manifest had grown a line per
reference file until it passed the limit, and because the loader **skips** a skill that fails, the whole
CLI workflow disappeared without a single failing command.

Trimmed to 1006 characters with every trigger kept (the description is what makes the skill load at the
right moment, so cutting coverage to save characters would be the wrong trade). It also still pointed at
`references/dashboards.md`, which the story rename had moved — so a second, quieter break was waiting
behind the first.

Both are tests now (`tests/test_skill_manifest.py`): the description fits, **every** `references/*.md`
named in `SKILL.md` exists, and every reference file is linked. That last one is a mirror check — a
reference nobody links is a reference the agent will never read.

### Dashboard → Story, Report → Finding (2026-10)

The object is a **narrative with evidence**, not a screen: it does not refresh itself, its centre is what
was written, and it is exported and sent to people. "Dashboard" promised monitoring, and calling its
tiles "reports" put the two words one level off from every BI tool (`report` names the deliverable; no
product in the comparison table uses it for a tile). Renamed end to end:

| was | now |
|---|---|
| `dashboards` table · `/api/dashboards` · `dashboards` skill group | `stories` · `/api/stories` · `stories` |
| `reports` JSONB column | `findings` |
| each finding's `insight` | `takeaway` (a finding's insight was a finding inside a finding) |
| `ReportResponse` / `ReportChart` / `reportView.ts` / `dashboardsApi.ts` … | `Finding*` / `findingView.ts` / `storiesApi.ts` … |
| `--report-series-*` chart palette | `--finding-series-*` |

One migration does the table, the column, the JSONB key and a **re-apply of the `insights` patterns**
(the routes moved), and `alembic downgrade` reverses all four. Ids, ACL rows and permission keys are
untouched — the app is still Data Insights, so `insights:read` / `insights:write` do not move — which is
why grants carry over with no backfill. `/api/dashboards` answers 404: no legacy alias.

Two casualties of the mechanical pass, both worth remembering:

- **`LayoutDashboard` is a lucide icon**, and the replace turned it into `LayoutStory` — a library's
  export is not our vocabulary. Exclude external names.
- Several files had their *contents* renamed but not their *names* (`ReportBarList.tsx` importing
  `FindingBarList`): the compiler catches that, which is the point — but it only catches two of the three
  axes. **Names, identifiers and prose** all have to move, and only the first two are type-checked; the
  docs and the skill references were checked by reading them.

`reportAge.ts` became `relativeAge.ts` rather than `findingAge.ts`, because the quality inbox uses it too
— a shared helper must not be named after one caller.

### Finding one of a hundred: facets, not channels (2026-10)

Asked how a catalog stays usable at 100+ datasets and 100+ dashboards, and whether to copy the documents
app's channels.

**No channels.** A channel is a single-parent editorial hierarchy: it answers "which home does this
document have", and a document has one. A dataset has several **true** parents — its source, its domain,
its tags, the model that reads it, the dashboard that reports on it — so a tree would force a choice that
reality does not make, then hide duplicates in different branches. Copying the documents app's *shape*
without its *reason* is the failure mode to avoid.

What shipped instead, in the order that pays:

1. **Search where it was missing** — Data Insights had none. It searches name, question and narrative.
2. **Facets with counts** — `GET /api/datasets/facets` returns `{domains, tags, sources}` with counts,
   ACL-filtered; the list filters by `domain` and `tag` (JSONB containment) and searches tags too. The
   tag/domain selects only appear when there is something to filter.
3. **Reverse lookup** — `GET /api/dashboards?dataset_id=…` answers "which dashboards read this table?",
   which no amount of grouping would.

Not done, and honest about why: **usage ranking** ("last used", "nothing reads this") needs access
tracking that does not exist; **saved views** (the *useful* half of channels — a named filter) come after
that. And the sharp part: at a hundred, the problem is not navigation but **duplication and naming drift**
— which a tree makes worse, and which needs signals (owner, last used, same table registered twice) that
facets can carry later.

### Run history pages, and says so (2026-10)

A reader asked whether the run history pages. It did not — and worse, it *looked* like it did: the API
accepted a `limit` (an ordinary page size) and the UI rendered whatever came back as "the history". A
rule run daily for a year would have shown fifty runs and silently called them all.

- The API takes a **keyset cursor**: `?before=&before_id=` — the `created_at` **and** id of the last row,
  because two runs can share an instant and a timestamp alone would skip or repeat. Half a cursor is a
  `400`, not a guess. Ordering is `(created_at, id)` descending, which is what the row comparison uses.
- The page loads **ten**, then "load older runs" appends. Running the rule returns to the first page,
  because the run just made is the newest and the list has to agree with the reading above it.
- The response shape is unchanged — a list — so `datasets quality runs` and its `--limit` keep working;
  "is there more" is `len(page) == limit`, decided by the caller.

Verified live on the rule with eight runs: four pages of two, a fifth empty, no duplicate ids, and the
union equal to the full set.

### Buttons grouped by meaning, not by space (2026-10)

The rule page had one action row holding four buttons of three kinds: Run (an action on the saved rule),
Cancel/Save (committing the draft), Delete (destroying the rule). A reader said the layout was still off,
and it was: the first fix moved them *together* without asking what they had in common, which was nothing.

Grouped by subject now, following the app's own grammar: **Run** sits with the rule's identity in the
header; **Cancel/Save** are one act, side by side, hard against the right edge of the form's footer; and
**Delete** gets the popup's own danger zone, the same one the dataset's settings page uses for deleting a
dataset. Each row has one job, which is a better rule than any amount of spacing.

### A passed run that says "no date to compare" (2026-10)

The freshness rule reported **passed** and, in the same panel, *"No date to compare"*. Two parts of one
answer disagreeing is the tell: the verdict came from the new unified runner, and the sentence came from
a field that runner no longer recorded. Turning the five rule types into generators kept `latest` in the
run's `detail` and dropped `max_age_days` — so the reader had a date and a threshold, saw only one, and
fell back to "nothing to compare".

Two fixes, because there were two mistakes:

- **the threshold travels with the query** (`RuleQuery.detail`), so a run records what it was judged
  against. A date alone cannot explain why it passed.
- **the reader degrades instead of lying**: a run recorded while the threshold was missing still shows
  *"Latest 2026-10-09"*, and only a genuinely empty result says "no date to compare".

The refactor's own verification compared numbers — verdicts and counts — and passed. It could not see a
field that had been *removed* from the record, because nothing asserted the shape of `detail`. The lesson
is the narrow one: a verification that checks the verdicts of a refactor must also check the **payload**
it hands to the UI.

### A count is not always a count of problems (2026-10)

A reader pointed out that a `sql` rule's number is usually a count, but the *direction* is not fixed:
`> 0` is a problem for "rows with a PE above 100", while `0` is the problem for "are there rows for
today?" — a **coverage** check has no violating row to count, because the absence *is* the violation. The
contract only had the first direction, so the second could only be written as a `CASE` that inverted it —
easy to get backwards and unreadable once it is.

`config.expect` is that direction, and the UI asks the domain question rather than naming it: **"what
counts as a problem?"** — *rows that break it (> 0 fails)* or *nothing found (= 0 fails)*. `zero` is the
default and is not stored, so existing rules and old runs are untouched; `detail.value` keeps the number
the query actually returned, and `failed_count` stays the verdict (0 or 1) for a coverage rule.

Verified by asking the same query both ways on `tushare.daily_basic`: `count(*) WHERE trade_date =
CURRENT_DATE` gives `failed_count 0` as a violations check and `1` as a coverage check — opposite
verdicts from one number. As a real rule it caught something: the table's latest date is 2026-10-09, so
"今天有交易数据" fails.

### Several ways to configure a rule, one way to execute one (2026-10)

The five declarative types each had their own branch of Python — assembling a string, running it, reading
its rows — and `sql` had a sixth. Six ways to execute, which is five too many: the branches could (and
did) drift on nulls, on whether a column was quoted, on how a result was read.

They are **generators** now (`rule_sql.py`, pure and tested): a `not_null` rule *is*
`count(*) FILTER (WHERE col IS NULL)`, a `range` rule *is* a `BETWEEN`, a `referential` rule *is* a
`NOT EXISTS` against the target table. Execution is a single path — read-only transaction, statement
timeout, one result contract (“how many rows break this rule”, `> 0` fails) — and **every** run records
the SQL it used in `detail.sql`, so a declarative rule stops being a black box that reports a number.

The declarative types are **not** downgraded: a form with a column and a threshold is the normal way to
configure a rule, and it now sits on top of the same truth as the hand-written one. Configuring and
executing were the same thing before, which is why adding a style meant adding a runner.

Two things fell out of the consolidation:

- **the bounds are parameters now.** `range` pasted `min`/`max` into the SQL text with an f-string; they
  are bound (`:min`, `:max`), like the identifiers they sit beside.
- **`detail.sql` is inspectable by the UI** — it reads that field for any rule type, so the rule page's
  “The SQL that ran” is not a feature of `sql` rules only.

Verified by re-running all five live rules and comparing: 1,007,340/0, 725,192/51,425, 1/0 with
`latest = 2026-10-09`, and 178,222 — the same numbers as before the refactor.

### A JSON body without its content type (2026-10)

A reader pressed **Try** on a `sql` rule and got `The query failed: Input should be a valid dictionary or
object to extract fields from`. That is Pydantic's way of saying the request body arrived as a **string**:
two functions I had written — `validateQualityRule` and `updateQualityRule` — passed `body: JSON.stringify(…)`
but no `Content-Type`, and `fetch` does not default to JSON. Reproduced by sending the same body as
`text/plain` (the exact message) and as `application/json` (200).

Two consequences worth recording:

- **The UI's save was broken too.** My earlier "editing works, verified live" ran through the **CLI**,
  which sets the header — so it exercised a different layer than the one the reader used. That is the
  same shape as the earlier quality bugs (the 500 that only happened with a real payload, the two-column
  check that a dict collapsed): *verify through the layer the user touches.*
- **The class is now a check.** `check-request-bodies.py` (section 18 of `check-shared-styles.sh`) fails
  a call with `body: JSON.stringify(…)` and no `headers:` at all. It found four more suspects that were
  legitimate (`headers: JSON_HEADERS`), so the rule was narrowed to the shape the bug actually had —
  no false positives, and it says what it does not cover. A positive control (removing one header) fails
  it, and it caught a header I lost myself while probing.

### Editing a rule: list ↔ detail, not a dialog and not a panel (2026-10)

A reader pushed back on the modal editor, and was right: a rule is not a short form. With `sql` it is a
query you **iterate** on — write, try, read the failure, fix it — and a dialog traps that loop.

The first fix replaced the dialog with an **inline panel above the rules list**. A second look, also
right: that is *both views at once* — the list is what you scan, the rule is what you work on, and
stacking them means neither gets the room. So the rule has **its own page**:

- `/datasets/{id}/quality` — the list: what do I have, what is broken, run it, delete it, open it;
- `/datasets/{id}/quality/new` and `/datasets/{id}/quality/{ruleId}` — the rule: name, type, column,
  thresholds, and for `sql` the query at full width with Try; plus its **run history**.

`GET /api/datasets/{id}/quality-rules/{rule_id}` exists because a detail page addresses a rule, not a
list. One component serves both routes; the absence of an id is "create". This is the app's own grammar
(the dashboard and its reports work the same way), which is the argument that decided it.

What the dialog gave for free had to be rebuilt rather than dropped: saving returns you to the rule's
page, and the Cancel/back link leaves the draft behind deliberately — there is a page to come back to.

### Quality rules that fit real business needs: `sql` (2026-10)

The five declarative kinds cover the standard checks and nothing else. "The high price can never be below
the low", "the share of null P/E is under 30%", "this column is not in the allowed set" are all
**business** constraints, and every one of them is a query. So a sixth type, `sql`, carries one.

The contract is the smallest one that works, and the same one dbt tests and Soda use: **one read-only
query returning one number — the count of violating rows**, `>0` fails. It must read `{{table}}` (so it
is a rule *about this dataset*, not an arbitrary query with a misleading home), `{{column}}` is optional
and gets quoted, and it runs through the read-only-transaction + statement-timeout path. `checked_count`
is `null`: an arbitrary query does not tell us how many rows it looked at, and saying 0 would be a lie.

`POST …/quality-rules/validate` dry-runs it through the **same code path** (an unsaved rule object), so
"it validated" and "it runs" cannot mean different things; a bad query is a `200 {ok: false}` so the
author reads the message instead of a toast. The editor has a monospace textarea, five starting points,
and that Try button.

Two bugs found while verifying it live:

- **A database error was a 500.** The SQL branch returned before the branch-wide `except`, so a missing
  column produced a traceback that quoted the SQL instead of a 400 and a recorded `error` run. Fixed and
  covered by a test, because it is exactly the kind of placement bug a comment does not prevent.
- **`SELECT count(*), count(*)` passed.** `run_readonly` returns dicts, and a dict collapses duplicate
  column names — so a two-column query looked like a one-column one. The rule path now reads the shape
  through `run_readonly_scalar` (same envelope) and the verdict takes the column count separately; the
  case is a test.

### Quality rules: editable, and runnable from the inbox (2026-10)

Three things a reader found by using the product:

- **The inbox can run them.** A **Run all rules** button (`data:write`, hidden when there are no rules)
  loops the per-rule endpoint sequentially with progress and a summary. There is no cross-dataset "run
  all" endpoint on purpose: a rule is one query against one table, and a page that already holds the list
  can do the fan-out without the server gaining a job runner. One dataset that cannot be written does not
  stop the others — the failure is counted and reported. It runs **every enabled rule**, not the filtered
  view: the filter is a view.
- **A rule could not be edited in the UI**, only created and deleted — while the skill had
  `datasets quality update` all along. The dataset's Quality tab now has an edit dialog for name, column
  and thresholds. The rule **type** is fixed while editing: a new type would make the existing config
  meaningless.
- **The built-key class of i18n bug** (below) got a guard: `check-i18n-keys.py` now requires the static
  prefix of every built key (`` t(`shared.age_${bucket}`) ``) to match at least one locale key, and a test
  pins every age bucket by name — a prefix check cannot see a *partial* mismatch (one plural form
  renamed). Both were verified with probes: deleting the family fails the check, renaming one variant
  fails the test.

### Fix: the relative-time labels were showing raw keys (2026-10)

A reader asked what "Last run" meant and why Data Insights came into it — and the answer was that the
column was not showing words at all. The code looked up `age_minutes` / `age_days`; the locale had
`ageMinutes` / `ageDays`. i18next renders a missing key as itself, so the tiles said "as of
dataInsights.age_days" and the quality inbox said the same.

Two things were wrong, and both are fixed:

- the **names did not match** (underscores vs camelCase), so those labels never resolved;
- the labels were owned by the **Data Insights** namespace while a quality page used them — a shared
  concept living inside one app. They are now `shared.age_*` (the block these pages already use for
  Cancel/Save/…), matching the bucket `ageOf` returns.

The assertion that "covered" the tile said only that the text starts with "as of", so a raw key passed
it. It now asserts the *shape of the sentence* and that no `namespace.key` appears in it — the check
that would have caught this.

### Quality rules, used for the first time (2026-10)

They shipped in Phase 2 and had never been created — 13 datasets, zero rules — so this was the first
time anyone ran one. Three real ones now guard `daily_basic` (`not_null ts_code` **passed**,
`freshness trade_date ≤30d` **passed** with `detail: {latest: 2026-10-09}`, `range pe_ttm [0.1, 300]`
**failed**: 51,425 of 725,192 non-null rows — 7.1% — fall outside the credible range).

Two things came out of it:

- **`unique` counted nulls as duplicates.** `COUNT(*) - COUNT(DISTINCT col)` made every nullable column
  fail, with a number that was mostly missing data (491,919 = 282,148 nulls + 209,771 real duplicates
  on `pe_ttm`). SQL's UNIQUE allows many nulls, and the neighbouring `range` rule already reads
  `checked` as the non-null rows. Fixed and verified live: the same rule now reports 725,192 checked /
  209,771 failed — the same `checked` as `range`, which is how you can tell they agree about what a row
  *is*.
- **The skill could not see the numbers.** Running a rule answers with the *rule* (`last_status` only),
  and there was no history command — so an agent learned "failed" and nothing else. `datasets quality
  runs` now lists the history, and `datasets quality run` prints the run it produced.

- **A Quality Issues tab**, last in the bar (the content tabs keep the front): every enabled rule that is not passing, across datasets,
  with the numbers, worst first. It needed a **cross-dataset** read (`GET /api/quality-issues`, one
  query joining each rule's latest run) rather than N per-dataset calls — and it filters by **dataset
  ACL**, since an issue is a fact about its dataset. A rule with no run reports `never`, which is not
  `passed`. Its rows link into the dataset's Quality tab, so noticing and fixing stay separate jobs.
  Built from existing primitives (table, chips, empty state) — no new CSS.

Still open: rules run **only when asked** (no schedule, no run-after-ingest). The inbox now shows what
the Data Model tile's "data-quality alerts" line promised — which is the one thing that line was
missing.

### Register datasets in bulk, from the source (2026-10) — done

- **Registering from a source** lives at `/datasets/sources`, reachable as an action on the Catalog ("From a data source") rather than a tab — it adds datasets to the Catalog, it is not a peer of it. There: pick a source, see its tables
  with what is already registered, tick the rest and add them in one go. It reads with `data:read` and
  writes with `data:write` — the checkboxes are disabled without it — and only lists sources this layer
  can register from (a graph store is not one, and used to answer 400).
- **The confirm is the guard**: the app's own database has 103 tables, 100 of them unregistered
  (`alembic_version`, a jobs queue, …), so "select all" is a footgun unless the count and the source are
  on screen first.
- Using it turned up a permission mismatch: `GET /api/datasets/from-source/{id}` required `data:write`
  while the permission patterns granted it to `data:read` — and it only lists **names**, so it is a read.
  Fixed on the endpoint (the pattern was right).

### Data Explorer → **Data Insights** (2026-10) — renamed end to end

- The old name described nothing it did: exploring data happens in the Catalog, the app holds **saved
  analyses**, and **Object Explorer** already meant something else. It now reads **Data Insights** —
  the app, its route (`/data-insights`), its permission keys (`insights:read` / `insights:write`, with
  the grants carried over so nobody lost access), its API path (`/api/dashboards`), the skill's command
  group (`openkms dashboards list|get|create|update|run|delete`, named after the resource like
  `datasets` / `metrics`), the i18n namespace and the docs.
- Two stale names went with it: the error codes (`EXPLORER_SOURCE_*` → `REPORT_SOURCE_*`, and
  `EXPLORER_BLOCK_METRIC_MISSING` → `REPORT_METRIC_MISSING`, a leftover from the block→report rename),
  and the table (`explorer_dashboards` → `dashboards`).
- **A migration trap worth remembering**: two *historical* migrations imported `PERM_EXPLORER_READ`
  from the catalog, so renaming the constant broke the whole chain (Alembic imports every version file
  to build the graph). They now declare the literals as they were — a migration records the past, and
  must not depend on a name that can change.

### The app launcher in the header is gone (2026-10)

- It listed exactly the apps the App Rail already lists — every module with `showInLauncher: true` also
  had `showInMainSidebar: true`, which is what made deleting it safe rather than a bet — so the header
  lost a grid, its styles, two labels and the panel's open/close plumbing.
- The check that asserted "AppLauncher must use `useVisibleLauncherModules`" now asserts the invariant
  that mattered all along: **a module marked `showInLauncher` must also be in the rail**, or it is
  reachable from nowhere. Probed: flipping one module fails with its id named.
- `AppCatalogGrid` and the flag stay: the **Home** page still renders the grid, so `showInLauncher` now
  means "show on Home" — worth renaming when someone next touches that config.

### The Datasets app's tabs, and all metrics in one place (2026-10) — done

- The app's tab bar reads **Catalog · Semantic Model · Metrics**: the middle one was called "Model",
  which read as a *model instance* rather than the semantic layer; the word now matches what the layer
  is called everywhere else (the skill's `semantic-models`, the Ossie documents, the API).
- The tab bar is now **app chrome** (`src/components/ontology/DatasetAppTabs.tsx`, its own sheet): the
  Metrics page was written without it, so the switch it was supposed to enable did not exist — and
  moving it into `components/` is what the shared-styles rule asks for anyway, since two routes render
  it (it fired on the first run).
- **Metrics** is new and read-only on purpose: it lists every metric with the model that defines it,
  its type/datatype, its base dataset and its SQL, and links into that model for any change. A metric is
  authored next to its fields and base dataset, so a second editing surface here would only be a second
  place to get a definition wrong. It needed one frontend fix: `MetricResponse` never declared
  `semantic_model_id`, which the API has always sent.

### The model's dataset tab reconciles columns and fields (2026-10) — done

- A dataset's panel now **re-reads its columns** (and reports what moved) and reconciles them with the
  model's fields: columns without a field get a one-click "add them as fields" (typed from the column),
  and fields pointing at a dropped column are named — otherwise silent breakage.
- `fieldCoverage` is pure and tested (5): computed fields are ignored on both sides, a column-backed
  field covers its column whatever else it carries, and several fields on one column count once.
- Kept the **Add field** button: this panel is the only place a model field is created (the model has
  no Fields tab), so the objection that prompted this ("is Add field realistic?") turned out to be
  about the *missing* reconciliation, not the button. The refresh re-reads **columns only**; the
  profile and schema-history snapshot stay in the Catalog's Columns tab.

### Picking columns by typing, not scrolling (2026-10) — done

- **A dataset's Keys** rendered every column as a checkbox row — for the primary key, and again for
  each unique key: nineteen columns and two keys made ~57 rows to pick a handful of names. It is now
  a chip row plus a **type-ahead** (the pattern the Playground already used for group-by fields),
  extracted as `ChipPicker` (`src/components/ontology/`, its own sheet) and used by both.
- The chips stay the callers': a Playground chip carries a granularity selector, a key's chip does not.
  What is shared is the search input, the menu that only appears while it is used, and the keyboard
  habits (↑↓ move, Enter adds, Backspace drops the last).
- The extraction dropped two things the guardrails then caught: the `ds-control-exempt` note on the
  picker's input (so it was reported as an unstyled control) and an i18n key that never existed.
- **A third thing, caught by checking the build instead**: `ChipPicker.scss` was written and never
  imported, so every rule in it lived in a file no bundle loaded — and *no check saw it*, because the
  undefined-classes rule compares JSX against SCSS, not against what shipped. There is now a check for
  that too (`check-component-sheets.py`, probed both ways): a component sheet must be imported by a
  component beside it. Fourth member of the same family — rename, move, delete, create.

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

### Data Insights aligned with the app's pages (2026-10) — done

- Audited against a sibling detail page, a sibling list page and the design system
  ([table](features/data-layer-insights.md#how-it-looks-next-to-the-rest-of-the-app)). The dashboard
  page was the only detail page **not** using `EntityViewShell`; it does now (identity rail with
  **Run** as its action, the answer and every report as `.account-card` sections), so the tiles read
  like every other section in the app.
- `<EntityViewPanel>` gained an `actions` slot (revealed on hover/focus-within); `<StatusChip>` and
  `EntityViewLoading` replace the page's own pill and spinner.
- From Tremor's *styling* (not its dependencies): the chart palette became theme tokens
  (`--report-series-1…8`, lifted in dark mode) and number formatting moved into one module.

### Data Insights UI pass (2026-10) — done

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
  `explorer_reports`/`blocks` renamed to `dashboards`/`reports`, API included.
- Per-report source ACLs: a report out of reach answers `REPORT_SOURCE_FORBIDDEN`, never its rows.
- **Save to a dashboard** closes the round trip the design promised: a Playground query (model) or a
  Data-tab slice (dataset) becomes a report, with the chart offered as a default the person can change
  and previewed with the same component the dashboard draws.

### Data Insights charts (2026-10) — done

- A block's `chart` spec draws its result (line/bar, optional grouping series); the table stays one
  click away, and a spec the result cannot satisfy falls back to it.
- recharts (MIT) — [selection note](research/chart-library-selection.md); the shared
  `<QueryFailureNotice>` moved from a page sheet into the design system.
- Dataset summaries (`POST /api/datasets/{id}/aggregate`) give the Catalog half "by month" without a
  semantic model.

### Data Insights permissions (2026-10) — done

- Reports moved off `data:read` / `data:write` onto their own `insights:read` / `insights:write`; a
  refresh is a **read**. The migration re-applies the two old keys' patterns and backfills grants, so
  nobody loses access.
- Viewing/running a dataset-backed report is now checked against **that dataset's ACL** (it used to
  be a way around it, since the results are stored).

## Conventions

- **Before commit**: Update the matching `docs/features/*.md` page, [API reference](features/api-reference.md) / Data models when needed; add or remove rows in [Functionalities](./functionalities.md) only when a feature page is added or removed. See `AGENTS.md` (docs before commit).

## Open Questions

1. **All documents view** – Show documents from all channels when no channel selected?
2. **Default channel** – Auto-select first channel or require explicit selection?
3. **Global in-app agent** – Single maintenance chat shell vs contextual assistant per surface (wiki, documents, articles)? *(KB Q&A delivery stays per-KB `qa-agent` — out of scope.)*
4. **Connector vs pipeline** – Is every external sync a **connector job**, or some as generic `openkms-cli` pipelines only?
