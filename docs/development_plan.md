# openKMS Development Plan

Business **why** and long-form narrative: [Goals (vision)](goals.md). This page tracks **what is shipped**, **strategic priorities**, and **backlog**.

## Current State (as of 2026-06) {#current-state-as-of-2026-06}

**License:** [Apache License 2.0](../LICENSE).

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

Product direction (not a commitment order). Shipped basics live under **Current State**; gaps below are intentional next investments. Mapped to [Goals](goals.md):

| Priority | Goals pillar |
|----------|----------------|
| 1. Connectors | [打破信息孤岛](goals.md#goals-unified-source) · [从检索到决策](goals.md#goals-decision)（业务数据入本体） |
| 2. In-product agents | [为智能体提供精准的知识服务](goals.md#goals-agent-service) · [隐性经验萃取](goals.md#goals-tacit) |
| 3. Multimodal knowledge | [海量非标文档的理解](goals.md#goals-documents)（延伸至图像/音视频证据） |
| 4. Evaluation for quality | [隐性经验萃取](goals.md#goals-tacit) · [智能体知识服务](goals.md#goals-agent-service)（可衡量的语料质量） |

1. **Connectors** — Finish the loop: external sources → **reliable sync jobs** → ontology **datasets** (and downstream KB/wiki), not only credential storage and output wiring.
2. **In-product agents** — Users should get capable assistants **inside openKMS** (curate, search, Q&A, maintenance), not depend on installing [OpenCode skill](features/opencode-openkms-skill.md) in an external agent IDE.
3. **Multimodal knowledge** — **Image and video** (and related assets) as managed evidence: model registry support, ingestion/derivatives, search/RAG — see [knowledge-types](features/knowledge-types.md#rich-media-and-3d).
4. **Evaluation for quality** — Turn evaluations from pass/fail runs into **actionable improvement** for KBs, wiki, and corpora (gaps, suggested edits, regression tracking).

## Backlog {#backlog}

### Connectors (high) {#connectors-high}

| Item | Notes |
|------|--------|
| Sync execution | Procrastinate (or pipeline) jobs per connector kind; write into configured **dataset** outputs; run history and failures in UI |
| Operator UX | Manual **Run sync**, schedule/cron, last-success timestamp, row counts, retry |
| Kind expansion | Beyond Tushare: additional catalogs and mapping docs per kind |
| Downstream | Optional hooks: refresh datasets → re-index linked KBs or notify operators |

API/UI today: [Connectors](features/console-and-auth.md#console-admin), [API reference — Connectors](features/api-reference.md).

### In-product agents (high) {#in-product-agents-high}

| Item | Notes |
|------|--------|
| Unified assistant entry | One discoverable “ask the knowledge base” pattern across documents, wiki, KB, ontology — not only per-surface Copilot panels |
| Broader tool coverage | Read/write paths agents can call safely (with ACL): documents, articles, glossary, global search, ontology (within explore limits) |
| Maintenance workflows | Suggest wiki/KB fixes from evaluation failures; gap lists operators can accept or reject |
| Parity with external skill | Capabilities in [openkms-skill](features/opencode-openkms-skill.md) should be reachable from in-app agents where permissions allow |

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
| Failure drill-down | Per-item: which chunks/pages failed, expected vs retrieved, judge rationale export |
| Improvement loop | From a run: suggested new FAQs, chunk edits, wiki gaps, re-index prompts |
| Dashboards | Trends across runs (pass rate, score), compare after corpus changes |
| Coverage | Stronger wiki checklist runs + KB retrieval baselines; optional export for CI |
| Product default | Consider enabling evaluations toggle by default once workflows are clearer |

Today: [Evaluation](features/evaluation.md) (`search_retrieval`, `qa_answer`, `wiki_content_coverage`).

### Policy & lifecycle (medium) {#policy--lifecycle-medium}

Aligns with [Goals — 规则的动态保鲜与溯源](goals.md#goals-lifecycle) (e.g. regulatory change rippling to SOPs and training material).

| Item | Notes |
|------|--------|
| Change impact | When a document is superseded or leaves its effective window: surface **dependents** (relationships, KB chunks, wiki links, map resources) |
| Review queue | Operator list: materials **needs review**; optional bulk actions |
| Visibility | Home hub or channel dashboards: stale / affected counts after a known change |
| Notifications | Optional hooks (email/webhook) when `lifecycle_status` or `effective_to` changes — org-specific |

Today: [Documents](features/documents.md) lifecycle + relationships; `is_current_for_rag` on KB search — **no** automated impact workflow.

### Other

| Area | Item | Feature doc |
|------|------|-------------|
| Documents | Advanced filter in channel document list | [Documents](features/documents.md) |
| Articles | Editor / detail UX polish | [Articles](features/articles.md) |
| Jobs | Job logs / stdout capture; configurable worker concurrency | [Pipelines, jobs & models](features/pipelines-and-jobs.md) |
| Data security | Default-closed system mode when `OPENKMS_ENFORCE_RESOURCE_ACL` semantics are defined | [Data security](features/data-security.md) |

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
