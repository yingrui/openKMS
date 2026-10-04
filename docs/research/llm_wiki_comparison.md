# llm_wiki vs openKMS wiki spaces

Reference: [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) (GPL-3.0), cloned under `third-party/llm_wiki` for study only.

## License

llm_wiki is **GPL-3.0**. Treat it as a **design reference**; reimplement behavior in openKMS under our stack—do not paste large chunks of its source into proprietary layers without compliance review.

---

## Functionalities in llm_wiki (inventory)

This section summarizes **what the upstream app actually does**, derived from its README and layout (`src/components/layout/icon-sidebar.tsx`, stores, and `src/lib/*`). It is not an endorsement to ship GPL code—only a functional checklist for comparison.

### Karpathy pattern (baseline)

Upstream stays aligned with [Karpathy’s llm-wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

- **Layers:** Raw sources (immutable) → Wiki (LLM-generated) → Schema / rules (`schema.md`, YAML frontmatter).
- **Operations:** **Ingest**, **Query**, **Lint** (plus app-specific **Review** and **Deep Research**).
- **Artifacts:** `index.md` as catalog, `log.md` as chronological record, **`[[wikilink]]`** syntax, YAML frontmatter on pages, Obsidian-compatible vault folder.

### Shell & navigation (desktop UX)

| Area | Behavior |
|------|----------|
| **Layout** | Three-column: knowledge tree / file tree (left) · main workspace (center) · preview or auxiliary panel (right); resizable panels. |
| **Icon sidebar** | Switches major modes: Wiki chat, **Sources**, **Search**, **Graph**, **Lint**, **Review**, **Deep Research**, Settings (exact labels vary by build). |
| **Activity panel** | Live ingest progress: queue state, cancel/retry, per-file progress. |
| **Scenario templates** | Research / Reading / Personal Growth / Business / General — seed `purpose.md` and `schema.md`. |

### Ingest & sources

| Capability | Notes |
|------------|--------|
| **Two-step ingest** | (1) Analysis pass on source → structured notes; (2) Generation pass → wiki pages, updated `index.md` / `log.md` / `overview.md`, cross-links. |
| **SHA / incremental cache** | Content-hash skip for unchanged sources before spending LLM tokens. |
| **Persistent ingest queue** | Serial processing, persisted queue, crash recovery, retry limits, cancel. |
| **Folder import** | Recursive import; folder path as hint for classification. |
| **Multi-format sources** | PDF, DOCX, PPTX, spreadsheets, images, media; web clips via extension path. |
| **Multimodal PDF images** | Extract embedded images; vision captions; surfaced in search/lightbox (per README feature list). |
| **Source traceability** | Frontmatter `sources[]` linking wiki pages back to raw files. |
| **Language-aware output** | User-configured language (e.g. English / Chinese). |
| **Auto-embedding** | When vector search is enabled, new pages embedded after ingest (LanceDB). |

### Knowledge graph & insights

| Capability | Notes |
|------------|--------|
| **4-signal relevance** | Weighted edges: direct wikilink, shared sources, Adamic-Adar–style common neighbors, type affinity (`src/lib/graph-relevance.ts` conceptually). |
| **Visualization** | sigma.js + graphology + ForceAtlas2; node color by **type** or **Louvain community**; edge styling by weight; hover/dim non-neighbors; zoom/fit; legend. |
| **Louvain communities** | Cluster discovery; cohesion scoring; low-cohesion warnings. |
| **Graph insights** | “Surprising” cross-cluster / cross-type / hub–periphery links; **knowledge gaps** (isolated, sparse communities, bridge nodes); dismiss reviewed items; **Deep Research** shortcut from some insights. |

### Query & chat

| Capability | Notes |
|------------|--------|
| **Multi-phase retrieval** | Token search (wiki + raw sources) → optional **vector** search (LanceDB) → **graph expansion** (seed nodes + 2-hop relevance) → **context budget** assembly (`src/lib/context-budget.ts` ideas). |
| **Budgeted context** | Large configurable window; proportional split among wiki pages, chat history, index, system prompt. |
| **Multi-conversation chat** | Persistent chats (e.g. under `.llm-wiki/chats/`); rename/delete; history depth limit; cited references panel; regenerate; “save answer to wiki” flow. |
| **Thinking/reasoning UI** | Collapsible streaming blocks for models that emit reasoning traces. |
| **Math** | KaTeX across preview/editor/chat. |

### Review, research, and clipping

| Capability | Notes |
|------------|--------|
| **Async review queue** | LLM-created review items with constrained actions (e.g. create page, deep research, skip); pre-generated web search queries; non-blocking for ingest. |
| **Deep Research** | Web search (e.g. Tavily), multi-query topics, confirmation dialog, synthesis into wiki pages, auto-ingest, concurrent task queue + dedicated panel. |
| **Chrome extension** | Clip web pages → local HTTP bridge → auto-ingest into chosen project. |

### Quality-of-life & maintenance

| Capability | Notes |
|------------|--------|
| **Lint** | Dedicated view for wiki health / consistency checks (`src/lib/lint.ts` etc.). |
| **Deletion cascade** | Removing sources triggers wiki page cleanup, index updates, dead wikilink repair (per README). |
| **Settings** | Providers, keys, models, context window, vector toggle, i18n (EN/ZH). |
| **Updates / persistence** | `dataVersion`-style refresh signals for graph/UI when wiki changes. |

---

## UI shell (compact comparison)

| llm_wiki | openKMS |
|----------|---------|
| Tauri desktop; icon rail switches Wiki / Sources / Search / **Graph** / Lint / Review / Deep Research | Web SPA: `/wikis`, **`/wikis/:id/settings`**, `/wikis/:id/pages/graph`, `/wikis/:id/pages/:pageId` |
| Three-pane: knowledge tree + center view + preview | **Space settings** (admin, import, linked documents) + **workspace** (page tree, tabbed edit/preview, comments rail) |
| Graph: Type / Community / Insights toolbar, sigma.js + ForceAtlas2 | Graph view: react-force-graph-2d, directed page graph, focus page + fit main cluster; no community coloring or insights |

---

## Data & runtime

| Topic | llm_wiki | openKMS |
|-------|----------|---------|
| Wiki storage | Markdown files on disk (Obsidian vault) | PostgreSQL `wiki_pages`; vault binaries (and mirrored markdown) in object storage |
| purpose / schema | `purpose.md`, `schema.md` files | No dedicated fields; maintainers keep conventions as ordinary pages |
| Channel docs | Local `raw/sources/` | Linked `documents` via `wiki_space_documents` |
| Graph edges | Weighted undirected + Louvain + cohesion | Directed edges from `[[wikilinks]]` and relative markdown links; JSON cached in object storage; no community detection |
| Vector search | Optional LanceDB embeddings | Optional page embeddings (pgvector) after **Build semantic index** in space settings; used by workspace tree search and by KB indexing of linked spaces |
| Ingest queue | Persistent disk queue, SHA cache | No; vault import (zip / folder) and `openkms-cli wiki put` / `wiki sync` |
| Deep Research / clipper | Tavily + Chrome extension | No wiki-specific equivalent; [project agents](../features/openkms-agents.md) have a research subagent with connector-backed `web_search` |

---

## Algorithms (ideas only)

None of these are implemented in openKMS today; they are candidates for the server graph response (`GET …/graph`):

- **Graph relevance weights** (direct link, source overlap, Adamic-Adar, type affinity).
- **Louvain communities** for visualization (e.g. NetworkX server-side; not identical to graphology’s package).
- **Insights** (cross-community edges, isolated nodes) as heuristic cards aligned with the *ideas* in upstream graph-insights—not ported code.

---

## Retrieval & agents

| Capability | llm_wiki | openKMS |
|------------|----------|---------|
| Query pipeline | Token search → optional vectors → graph expansion → budgeted context | Workspace tree search: title/path substring, then semantic matches when indexed (`GET …/pages/semantic-matches`); KB search / Q&A over linked, indexed wiki spaces |
| Embeddings | Optional LanceDB | Page vectors in Postgres after **Build semantic index** (default embedding model; offline, not refreshed on every save) |
| Chat about the wiki | Per-project chat files on disk | No wiki-specific chat. KB Q&A threads and project agent sessions are DB-backed (`agent_conversations`); agents read/write wiki pages through [openkms-skill](../features/openkms-skill.md) |

---

## Feature parity snapshot (high level)

| llm_wiki area | In openKMS today (approx.) |
|---------------|----------------------------|
| purpose / schema as assistant context | **No** |
| FTS / keyword discovery in wiki | **Partial** — tree search (substring, then semantic when indexed); KB search over indexed wiki pages |
| Graph communities + insights UI | **No** |
| Weighted relevance graph | **No** |
| Context budget assembly | **No** (no wiki-specific assistant) |
| Two-step ingest + queue + SHA cache | **No** — vault import and CLI sync only |
| Review queue / Deep Research / clipper | **No** (web research lives in project agents, not the wiki) |
| Desktop three-pane + sigma graph | **No** — web routes + react-force-graph-2d |

---

## Ideas worth borrowing (not scheduled)

1. **Space-level maintainer context** (purpose / schema) that any agent editing the space can load.
2. **Graph analysis** on `GET …/graph` (communities, insights, weighted edges) + graph UI coloring.
3. **LLM-assisted drafts** from linked documents (ingest with review before publish).

See [features/wiki-spaces.md](../features/wiki-spaces.md) for shipped behavior.

---

## Source tree pointers (reference-only)

| Topic | Typical path under `third-party/llm_wiki` |
|-------|-------------------------------------------|
| Ingest pipeline | `src/lib/ingest.ts`, `src/lib/ingest-queue.ts`, `src/lib/ingest-cache.ts`, `src/lib/dedup-queue.ts` |
| Graph relevance / wiki graph | `src/lib/graph-relevance.ts`, `src/lib/wiki-graph.ts`, graph views under `src/components/graph/` |
| Insights | `src/lib/graph-insights.ts` |
| Search / embedding | `src/lib/search.ts`, `src/lib/embedding.ts`; Rust vector store `src-tauri/src/commands/vectorstore.rs` |
| Context budget | `src/lib/context-budget.ts` |
| Review | `src/stores/review-store.ts`, `src/components/review/` |
| Deep Research | `src/stores/research-store.ts`, `src/lib/web-search.ts`, `src/components/layout/research-panel.tsx` |
