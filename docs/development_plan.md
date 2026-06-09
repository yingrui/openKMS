# openKMS Development Plan

Business **why** and long-form narrative: [Goals (vision)](goals.md) — [user vs organization](goals.md) framing (same knowledge network; personal **retrieve / contribute** vs enterprise **governance / AI-ready**). This page tracks **what is shipped**, **strategic priorities**, and **backlog**.

## How priorities map to Goals {#goals-mapping}

| [Goals](goals.md) lens | What “done” looks like in product | Where tracked here |
|------------------------|-----------------------------------|--------------------|
| **User** — [pains](goals.md#goals-user-value) (e.g. can’t find, can’t trust) | Shorter paths to **find, trust, learn, contribute** | [Backlog](#backlog) rows tagged **user** below |
| **User** — [retrieve / contribute](goals.md#goals-user-value) | Retrieve with provenance; deposit without heavy authoring | Shipped: search, KB Q&A, wiki, parse+edit; gaps: unified agent, eval→fix loop |
| **User** — [enterprise roles](goals.md#goals-user-value) | Frontline staff and experts adopt daily; admins and compliance can govern | Console, ACL, eval, connectors (partial) in **Current State** |
| **Organization** — [organization pillar](goals.md#goals-organization) | Structure, lifecycle, multimodal ingest, unified layer for agents | **Strategic priorities** + org-tagged backlog |

If a release improves only org tooling but not **frontline staff / domain experts** daily paths, pains such as **keeping answers private** and **no time to contribute** will persist (see [Goals](goals.md)).

## Current State (as of 2026-06) {#current-state-as-of-2026-06}

Shipped product scope follows the same index as [Functionalities](./functionalities.md). **Covers** text is kept in sync with that page; each linked feature doc is the source of truth for APIs, UI, and behavior.

### Per feature

| Page | Covers |
|---|---|
| [Infrastructure & quality](features/infrastructure.md) | Compose, tests, error handling, code splitting, typecheck |
| [Documents](features/documents.md) | Document channels, upload, parsing pipeline (PaddleOCR-VL, Baidu Cloud), `openkms-cli` |
| [Articles](features/articles.md) | Article channels, CRUD, relationships, lifecycle, attachments, bulk import |
| [Knowledge bases](features/knowledge-bases.md) | KB CRUD, FAQs, chunks, semantic search, QA proxy, kb-index |
| [Wiki spaces](features/wiki-spaces.md) | Wiki content (path-addressed pages, files, vault), import, graph view, Wiki Copilot agent |
| [Evaluation](features/evaluation.md) | Evaluations, items, runs, compare (experimental toggle; quality-improvement workflows still evolving) |
| [Glossaries](features/glossaries.md) | Bilingual terms, AI suggestion, import/export |
| [Knowledge map & home](features/knowledge-map.md) | Knowledge Map terms, resource links, home hub graph |
| [Global search](features/global-search.md) | `/search` page: documents, articles, wiki spaces, knowledge bases (name, channel, updated filters) |
| [Ontology — objects, links, datasets](features/ontology.md) | Object/link types, instances, Object Explorer, data sources, datasets |
| [Pipelines, jobs & models](features/pipelines-and-jobs.md) | Pipeline templates, procrastinate jobs, provider/model registry (multimodal image/video models planned) |
| [Data security](features/data-security.md) | Two-layer model (operation RBAC + resource ACL), groups, sharing, inheritance, enforcement |
| [Console & authentication](features/console-and-auth.md) | Permission catalog, Console UX, OIDC/local auth, system settings, user Settings (API keys), feature toggles |
| [Connectors](features/console-and-auth.md#console-admin) | **Partial:** `/connectors` CRUD, kinds, secrets, dataset output slots — sync jobs **not shipped** ([backlog](#connectors-high)) |
| [Agents in openKMS](features/wiki-spaces.md) | **Partial:** Wiki Copilot, KB Q&A, map designer, eval assist — broader in-app assistant planned ([backlog](#in-product-agents-high)) |
| [OpenCode skill (openkms)](features/opencode-openkms-skill.md) | **External:** agent skill + CLI for third-party tools (`openkms-skill/`); complements but does not replace in-app agents |

### Cross-cutting reference

| Page | Covers |
|---|---|
| [Knowledge types](features/knowledge-types.md) | Taxonomy (artifacts, indexes, dimensions); **insect-research** workflow table; **when to add a Recordings/Video functionality** ([anchor](features/knowledge-types.md#video-as-functionality)) |
| [API reference](features/api-reference.md) | One table of every HTTP endpoint, grouped by area |
| [Data models](features/data-models.md) | Schema for every persisted table |
| [Configuration](features/configuration.md) | Backend deps, pgvector, S3/MinIO, cursor rules |

Also published: [Architecture](./architecture.md), [Security](./security.md), [Tech debt](./tech_debt.md), MkDocs site (see [index](./index.md)).

## Strategic priorities {#strategic-priorities}

Product direction (not a commitment order). Shipped basics live under **Current State**; gaps below are intentional next investments.

| Priority | Organization ([Goals — organization](goals.md#goals-organization)) | User outcomes ([Goals — user value](goals.md#goals-user-value)) |
|----------|---------------------------------------------------------------------|------------------------------------------------------------------|
| 1. Connectors | [Breaking silos](goals.md#goals-unified-source) · [Retrieval to decisions](goals.md#goals-decision) | Less **search friction**; operational data and documents in one trusted layer |
| 2. In-product agents | [Agent knowledge service](goals.md#goals-agent-service) · [Tacit knowledge externalized](goals.md#goals-tacit) | Less **answers kept private**; ask and draft in one application |
| 3. Multimodal knowledge | [Non-standard documents](goals.md#goals-documents) | Image/audio/video findable and auditable, not attachments only |
| 4. Evaluation for quality | [Tacit knowledge externalized](goals.md#goals-tacit) · measurable corpus | Feedback after contribution: what is wrong and what to fix |
| 5. Policy impact (medium) | [Lifecycle and provenance](goals.md#goals-lifecycle) | Less **obsolete unnoticed**; compliance and standards roles can drive review |

1. **Connectors** — Finish the loop: external sources → **reliable sync jobs** → ontology **datasets** (and downstream KB/wiki), not only credential storage and output wiring.
2. **In-product agents** — **Frontline staff and domain experts** get capable assistants **inside openKMS** (curate, search, Q&A, maintenance), not only [OpenCode skill](features/opencode-openkms-skill.md) in an external IDE.
3. **Multimodal knowledge** — **Image and video** (and related assets) as managed evidence: model registry support, ingestion/derivatives, search/RAG — see [knowledge-types](features/knowledge-types.md#rich-media-and-3d).
4. **Evaluation for quality** — Turn evaluations from pass/fail runs into **actionable improvement** for KBs, wiki, and corpora (gaps, suggested edits, regression tracking).
5. **Policy & lifecycle impact** — When rules change, surface dependents and review queues for **knowledge administrators** and **legal/compliance / standards** roles (see [Policy & lifecycle](#policy--lifecycle-medium)).

## Backlog {#backlog}

Tag: **user** = primarily improves daily paths for **frontline staff / domain experts**; **org** = governance, integration, or specialist roles (knowledge admin, legal/compliance, internal control, standards).

### User experience (high) {#user-experience-high}

Aligns with [Goals — retrieve and contribute](goals.md#goals-user-value) and [user pains](goals.md#goals-user-value).

| Item | Tags | Addresses (Goals pains / actions) |
|------|------|-----------------------------------|
| Source citations everywhere | user | **Can’t trust without evidence** — KB Q&A, search, agent replies consistently show version + link |
| Ask → contribute shortcut | user | **Answers kept private**, **no time to contribute** — e.g. promote Q&A hit to FAQ / wiki paragraph in one flow |
| Onboarding paths | user | **Don’t know where to start** — role- or map-guided “start here” for new hires / role changes |
| Trust indicators in UI | user | **Can’t trust**, **obsolete unnoticed** — “current for RAG”, effective dates visible in consumer surfaces |

### Connectors (high) {#connectors-high}

| Item | Notes |
|------|--------|
| Sync execution | org — Procrastinate (or pipeline) jobs per connector kind; write into configured **dataset** outputs; run history and failures in UI |
| **search_tool** (Zhipu web search) | ✅ kind + `POST /api/connectors/{id}/search`; Agents project **`search_connector_id`** + `web_search` tool |
| Operator UX | Manual **Run sync**, schedule/cron, last-success timestamp, row counts, retry |
| Kind expansion | Beyond Tushare: additional catalogs and mapping docs per kind |
| Downstream | Optional hooks: refresh datasets → re-index linked KBs or notify operators |

API/UI today: [Connectors](features/console-and-auth.md#console-admin), [API reference — Connectors](features/api-reference.md).

### In-product agents (high) {#in-product-agents-high}

| Item | Notes |
|------|--------|
| Unified assistant entry | user — One discoverable pattern across documents, wiki, KB, ontology (search friction, answers kept private) |
| Broader tool coverage | user · org — Read/write with ACL: documents, articles, glossary, search, ontology (within explore limits) |
| Maintenance workflows | user · org — From eval failures → suggested wiki/KB fixes (quality loop, contribution feedback) |
| Parity with external skill | user — [openkms-skill](features/opencode-openkms-skill.md) capabilities reachable in-app where permissions allow |

Existing surfaces: [Wiki spaces](features/wiki-spaces.md), [Knowledge bases](features/knowledge-bases.md), [Knowledge map](features/knowledge-map.md).

### Multimodal models & media (high) {#multimodal-models--media-high}

| Item | Notes |
|------|--------|
| Model registry | Categories/playgrounds for **image** and **video** understanding models (not only `vl` / `ocr` / `embedding` / `llm` for documents) |
| Media functionality | Library UX, derivatives, transcripts/segments, links to specimens/taxa — [when to add Recordings/Video](features/knowledge-types.md#video-as-functionality) |
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

Today: [Documents](features/documents.md) lifecycle + relationships; `is_current_for_rag` on KB search — **no** automated impact workflow.

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
- Mobile/responsive polish
- Domain depth (specimen/event, Darwin Core, interactive keys) — see [knowledge-types](features/knowledge-types.md) entomology workflow **future** column

## Conventions

- **Before commit**: Update the matching `docs/features/*.md` page, [API reference](features/api-reference.md) / [Data models](features/data-models.md) when needed, then keep [Functionalities](./functionalities.md) and this plan’s **Current State** tables aligned (same rows and **Covers** text). See `.cursor/rules/docs-before-commit.mdc`.

## Open Questions

1. **All documents view** – Show documents from all channels when no channel selected?
2. **Default channel** – Auto-select first channel or require explicit selection?
3. **Global in-app agent** – Single chat shell vs contextual Copilot per surface (wiki, KB, documents)?
4. **Media vs documents** – New **Recordings/Media** functionality vs extend [Documents](features/documents.md) + model registry — [knowledge-types](./features/knowledge-types.md#rich-media-and-3d)
5. **Connector vs pipeline** – Is every external sync a **connector job**, or some as generic `openkms-cli` pipelines only?
