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
| Tauri desktop; icon rail switches Wiki / Sources / Search / **Graph** / Lint / Review / Deep Research | Web SPA: `/wikis`, `/wikis/:id` → graph, **`/wikis/:id/settings`**, `/wikis/:id/pages/graph`, **Wiki Copilot** in workspace |
| Three-pane: knowledge tree + center view + preview | **`/wikis/:id/settings`** (space admin) + graph/page **workspace** (editing + optional Copilot rail) |
| Graph: Type / Community / Insights toolbar, sigma.js + ForceAtlas2 | Graph view: force-directed 2D + Default / Type / Clusters + insights drawer |

---

## Data & runtime

| Topic | llm_wiki | openKMS |
|-------|----------|---------|
| Wiki storage | Markdown files on disk (Obsidian vault) | PostgreSQL `wiki_pages` |
| purpose / schema | `purpose.md`, `schema.md` files | Optional **`copilot_purpose`** / **`copilot_schema_notes`** on `wiki_spaces` (Wiki Copilot prompt injection) |
| Channel docs | Local `raw/sources/` | Linked `documents` via `wiki_space_documents` |
| Graph edges | Weighted undirected + Louvain + cohesion | Directed wikilinks from markdown; server adds Louvain + heuristic **insights** on each graph response |
| Vector search | Optional LanceDB embeddings | Not wired for wiki pages (KB uses pgvector elsewhere; optional future) |
| Ingest queue | Persistent disk queue, SHA cache | Outline only: [Wiki ingest jobs (outline)](../features/wiki-ingest-jobs.md) |
| Deep Research / clipper | Tavily + Chrome extension | Out of scope unless product asks |

---

## Algorithms (ideas only)

- **Graph relevance weights** (direct link, source overlap, Adamic-Adar, type affinity): llm_wiki encodes in TypeScript; openKMS may add weights later on the server graph JSON.
- **Louvain communities**: implemented server-side for visualization (NetworkX); not identical to graphology’s Louvain package.
- **Insights** (cross-community edges, isolated nodes): heuristic cards aligned with the *ideas* in upstream graph-insights—not ported code.

---

## Retrieval & Copilot

| Capability | llm_wiki | openKMS |
|------------|----------|---------|
| Query pipeline | Token search → optional vectors → graph expansion → budgeted context | **`search_wiki_pages`** (PostgreSQL FTS per space) + `list_wiki_pages` / `get_wiki_page` + optional maintainer context in system prompt |
| Embeddings | Optional LanceDB | Optional future: wiki page embeddings in Postgres |
| Chat persistence | Per-project chat files on disk | **`/api/agent`** conversations + messages (DB-backed) |

---

## Feature parity snapshot (high level)

| llm_wiki area | In openKMS today (approx.) |
|---------------|----------------------------|
| purpose / schema as Copilot context | **Yes** — DB fields + injection |
| FTS / keyword discovery in wiki | **Yes** — `search_wiki_pages` tool |
| Graph communities + insights UI | **Partial** — Louvain + simple insights; no weighted edges, no cohesion warnings, no dismiss-store |
| Weighted relevance graph | **No** |
| Context budget assembly | **No** (single system prompt + tools; no proportional packing) |
| Two-step ingest + queue + SHA cache | **No** — see ingest jobs outline |
| Review queue / Deep Research / clipper | **No** |
| Desktop three-pane + sigma graph | **No** — web routes + react-force-graph-2d |

---

## Roadmap (implemented / planned in openKMS code & docs)

1. **Copilot context fields** on wiki spaces + prompt injection.
2. **`search_wiki_pages`** agent tool.
3. **Graph analysis** on `GET …/graph` + graph UI (stats, coloring modes, insights panel).
4. **Pipeline outline** for LLM-assisted drafts from linked documents (not yet a committed doc in this branch).

See [features/wiki-spaces.md](../features/wiki-spaces.md) and [wiki_agent_prototype.md](../wiki_agent_prototype.md) for shipped behavior.

---

## Database schema: drift after a reverted experiment

A short-lived change added optional columns on **`wiki_spaces`** for Wiki Copilot maintainer text (`copilot_purpose`, `copilot_schema_notes`) via an Alembic revision that is **no longer in this repository** after the wiki feature work was reverted.

| Situation | What to know |
|-----------|----------------|
| You **never** ran that migration | Your DB matches the current ORM: `wiki_spaces` has `id`, `name`, `description`, `created_at`, `updated_at` (see [`w7x8y9z0a1b2_add_wiki_spaces_tables.py`](../../backend/alembic/versions/w7x8y9z0a1b2_add_wiki_spaces_tables.py)). |
| You **did** run `alembic upgrade` when that revision existed | PostgreSQL may still have `copilot_purpose` and/or `copilot_schema_notes` even though [WikiSpace](../../backend/app/models/wiki_models.py) no longer maps them. SQLAlchemy usually **ignores** extra columns on load, but the DB is **ahead** of the migration history in git. The `alembic_version` table may still point at the **removed** revision id `h8i9j0k1l2m3`, which makes every `alembic` command fail with *Can't locate revision*. |

**Fix the broken revision pointer first** (current repo head is `p9q0r1s2t3u4` — run `alembic heads` in `backend/` to confirm). Connect with the same database URL your app uses, then:

```sql
UPDATE alembic_version SET version_num = 'p9q0r1s2t3u4' WHERE version_num = 'h8i9j0k1l2m3';
```

If your table uses a different layout (multiple heads), inspect `SELECT * FROM alembic_version;` and set the row that references `h8i9j0k1l2m3` to `p9q0r1s2t3u4`. After that, `alembic current` should succeed.

**Optional schema cleanup** (only if those columns exist and you want the physical table to match the current ORM):

```sql
ALTER TABLE wiki_spaces DROP COLUMN IF EXISTS copilot_schema_notes;
ALTER TABLE wiki_spaces DROP COLUMN IF EXISTS copilot_purpose;
```

Then run `cd backend && alembic current` — it should report `p9q0r1s2t3u4 (head)`.

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
