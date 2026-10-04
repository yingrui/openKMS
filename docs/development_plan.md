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

1. **Connectors** — Finish the loop: external sources → **reliable sync jobs** → ontology **datasets** (and downstream KB/wiki), not only credential storage and output wiring.
2. **In-product agents** — **Domain experts and knowledge admins** get capable **maintenance** assistants inside openKMS (map designer, Deep Agents projects), not only [openkms-skill](features/openkms-skill.md) in an external IDE. **Per-KB Q&A** remains a separate [delivery lane](#agent-lanes) (`qa-agent`), not part of this unification.
3. **Multimodal knowledge** — **Image and video** (and related assets) as managed evidence: model registry support, ingestion/derivatives, search/RAG — see [knowledge-types](features/knowledge-types.md#rich-media-and-3d).
4. **Evaluation for quality** — Turn evaluations from pass/fail runs into **actionable improvement** for KBs, wiki, and corpora (gaps, suggested edits, regression tracking).
5. **Policy & lifecycle impact** — When rules change, surface dependents and review queues for **knowledge administrators** and **legal/compliance / standards** roles (see [Policy & lifecycle](#policy--lifecycle-medium)).
6. **Ontology logic** — **Shipped:** Suite Apps (Manager / Object Explorer / Function Editor / **App Builder** / **Apps**); function versions; ofs executor; `@function` + `openkms_functions.Client` (string api names; no generated ontology SDK package); Action **types** (bind Function, execute, audit); Action **`create` / `modify` / `delete` apply** on resolvable object instances from `output.edits`; object list `prop.<name>=` filters; link list `source_object_id`; **A2UI apps** via App Builder + Apps Run (resource allowlists are user-supplied; no platform domain templates or board widgets; multi-artifact A2UI surfaces + versioned publish/rollback + app settings). **Deferred:** dataset/Neo4j synthetic Action `object_id`; link create/delete as edit ops ([Manager alignment](research/ontology_manager_alignment.md#product-decision-action-write-back-b1)); Palantir-style generated ontology marker SDK; per-app Rail icons. Domain ontologies (e.g. market analysis, Kanban DIY types) are tenant content, not product seeds. See [Ontology Functions](features/ontology-functions.md) · [App Builder & Apps](features/app-builder.md) · [Ontology Function Client](features/ontology-sdk.md) · [Understanding ontology](tutorials/understanding-ontology.md) · [Tushare DIY](tutorials/tushare-market-ontology.md).

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
| K8s deploy from Agents | ✅ Console registration + Namespace/Deployment/Pod browse ([Kubernetes clusters](features/kubernetes-clusters.md)); next: agent tools + project binding to apply/deploy |

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
| Domain ontologies (Stock, screens, watchlists, …) | **Not backlog** — tenant DIY: [understanding ontology](tutorials/understanding-ontology.md) · [Tushare case](tutorials/tushare-market-ontology.md) · [openkms-skill](features/openkms-skill.md) Workflow G; visual Kanban App = Workflow H + `references/app-builder-kanban.md` |

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

## Conventions

- **Before commit**: Update the matching `docs/features/*.md` page, [API reference](features/api-reference.md) / [Data models](features/data-models.md) when needed; add or remove rows in [Functionalities](./functionalities.md) only when a feature page is added or removed. See `AGENTS.md` (docs before commit).

## Open Questions

1. **All documents view** – Show documents from all channels when no channel selected?
2. **Default channel** – Auto-select first channel or require explicit selection?
3. **Global in-app agent** – Single maintenance chat shell vs contextual assistant per surface (wiki, documents, articles)? *(KB Q&A delivery stays per-KB `qa-agent` — out of scope.)*
4. **Connector vs pipeline** – Is every external sync a **connector job**, or some as generic `openkms-cli` pipelines only?
