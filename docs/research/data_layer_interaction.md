# Data layer interaction design

UX for the three Data-layer apps — **Datasets · Data Model · Data Explorer**. Goal: a data engineer, a data BA, and a business user each reach their task with **zero training**. Phase 2–3 surfaces (quality, metrics, AI dashboards) are sketched, not specced.

**Companion docs:** [Data layer plan](data_layer_plan.md) · [Implementation design](data_layer_implementation.md) · [Design system](../design-system.md)

---

## Intuitive = four rules

1. **Reuse the mental models users already have.** Every new surface reuses openKMS patterns — `EntityViewShell`, rail layouts (`ManagerNavRail` / `ExplorerNavRail`), `<Dialog>`, `<MetricGrid>`, `<EmptyState>`, `useConfirm`. No new interaction language.
2. **Progressive disclosure.** Catalog → detail → action. A list never shows columns/config that only a detail page needs; a detail page never shows a form until the user asks to edit.
3. **The picture is the primary artifact.** ER and lineage are *drawn*, not tabulated. Tables are the fallback, not the default.
4. **The empty state is the next action.** Every new surface's empty state is a single button that does the obvious thing: *Upload data* / *Create relationship* / *Ask a question*.

---

## Layer grouping in the App Rail

Three visual groups, separated by a subtle divider, collapsible per group:

```
 ┌── DATA ──────────
 │  🗂 Datasets
 │  🕸 Data Model
 │  🔎 Data Explorer
 ├── ONTOLOGY ──────
 │  🕸 Ontology Manager
 │  🧭 Object Explorer
 │  ⌘ Function Editor
 ├── APPLICATION ───
 │  … (Agents, Documents, …)
```

- **Collapsed (56 px rail):** icons only; a thin divider between groups; the active icon carries the group's accent.
- **App Launcher (full-width):** three titled sections (Data / Ontology / Application) — this is the primary discovery surface, so the section titles are the first thing a new user reads.
- **Console stays separate** (shared platform) — it is *not* a fourth layer, so it stays where it is today.

Why it's intuitive: users already think "I need data → data section; I need business meaning → ontology section." The grouping names the thing, instead of a flat 15-icon list.

---

## Datasets — catalog, detail, upload

### Landing (list)

A catalog grid/list, not a database admin table:

- **Search + filters:** domain, tag, sensitivity, data source. Filters are chips, not a form.
- **Card shows:** display name, domain tag, sensitivity badge, row count, freshness ("synced 2h ago"), a mini quality dot (Phase 2).
- **Primary action (always visible):** **「Upload data」** — the one thing a first-time user should try.

### Detail (reuses `EntityViewShell`)

Tabs, in reading order:

| Tab | What the user sees | First impression |
|-----|--------------------|------------------|
| **Overview** | `MetricGrid`: row count, columns, freshness, last sync; catalog fields (owner/domain/tags/definition/sensitivity) | "what is this and is it fresh" |
| **Data** | paged table preview, column type chips in the header | "what's actually in it" |
| **Schema** | column list + type + ontology-type mapping; change history timeline | "what changed" |
| **Relationships** | list of joins (Phase 1); "Add relationship" button | "what does it connect to" |
| **Lineage** | read-only graph (source ← this → object types / linked datasets) | "where did it come from, where does it go" |
| **Quality** | rule list + pass/fail (Phase 2) | "can I trust it" |
| **Sharing** | existing `ResourceSharePanel` | "who else can see it" |

### Add tables from a data source

The non-file path (the data engineer's most frequent action):

1. In the Datasets landing, **「Add tables」** → pick a **data source** → the backend lists its tables (`GET …/from-source/{id}`).
2. **Select tables** (multi-select); each shows `schema.table` and a preview affordance.
3. **Register** → creates `Dataset` rows (one per table), then land on the first dataset's detail.

Why it's intuitive: it mirrors "connect a folder of files" — pick a source, check tables, done. No schema knowledge required.

### Upload flow — a three-step wizard

Complexity is hidden behind a wizard, one question per screen:

1. **Drop / choose file** — a large drop zone (reuses the document-upload pattern). After choosing, the file uploads with a progress bar. One field: the target **data source** (pre-filled with the default data-layer source).
2. **Preview & confirm** — the *only* screen that needs care:
   - Inferred table shown as a grid: column name, detected type (editable via a type dropdown per column), and the first 5 sample rows.
   - Editable: table name, schema, **header row on/off**, **overwrite vs append**.
   - A "looks right?" footer: **「Load」** / **「Back」**.
3. **Loading → done** — a job runs (status pill); on completion, a success card with a single button: **「View dataset」**.

Why it's intuitive: the user only ever answers one question at a time (which file → is the inference right → done), and the preview screen makes the machine's guess *visible and correctable* instead of a black box.

---

## Data Model — ER canvas

The model **is** the picture. Three regions:

```
 ┌ datasets list ────┬──── ER canvas ──────────┬─ inspector ─┐
 │ search            │  (nodes = tables,       │  (selected   │
 │ ▸ stock_basic     │   edges = joins)        │   node/edge  │
 │ ▸ stock_trade_daily│                          │   details)  │
 │ ▸ daily_basic     │                          │              │
 │ ▸ …               │                          │              │
 └───────────────────┴──────────────────────────┴──────────────┘
```

- **Left rail** = datasets (searchable), grouped by data source. Clicking one selects/focuses it on the canvas.
- **Canvas** reuses the ontology schema-graph layout engine (`OntologySchemaGraph`), adapted to tables: node = dataset (row count as a stat), edge = join (label = cardinality + column pair).
- **Inspector** (right) shows the selected node's catalog + schema, or the selected edge's join columns + cardinality, with **Edit / Delete**.

### Creating a join — the one gesture to get right

Two gestures, both work:

1. **Canvas drag (the obvious one):** drag from a table's edge → drop on another table → a join dialog opens with the column mapping **pre-filled** when column names match (`ts_code = ts_code`); user picks cardinality and confirms.
2. **List select (the reliable one, v1):** select two datasets in the left rail → **「Connect」** → same dialog.

**v1 shipping order:** ship the **dialog + list-select** first (cheap, deterministic); add **drag-to-connect** as a fast-follow. The canvas is *read+select* in v1, *draw* in v1.5.

Why it's intuitive: the join dialog pre-fills the column mapping by name match, so the most common case is "confirm, done" — the machine proposes, the human approves (same philosophy as the upload preview).

---

## Data Explorer — ask, then see

The entry point is a **question**, not a chart builder. Mirrors the Agents surface users already know.

### Main screen

- **Top:** a single prompt box — "Ask your data a question" — with example chips underneath (*"why did this stock underperform its industry?"*, *"show monthly turnover"*).
- **Answer (streamed):** an analysis narrative, then a **dashboard grid** of charts. Each chart has an **「Insight」badge** that expands the AI-authored note: what the chart shows, anomalies, possible causes, suggested follow-up.
- **Provenance always visible:** every chart/number carries its source dataset + metric, so the answer is traceable.

### Saved reports

A left column (or a "Reports" tab) lists saved dashboards — named, dated, re-openable. A report is a first-class artifact **persisted in the Data Explorer app** (decision #9). Export reuses the Reveal + Plotly static-HTML path.

### Who uses which part

| User | Path |
|------|------|
| Business | type question → read narrative + charts → optionally open a saved report |
| BA | ask exploratory questions, then save the useful ones as reports |
| Data engineer | rarely here; they live in Datasets / Data Model |

Why it's intuitive: business users never see a query editor or a schema — they ask in words and read a sourced answer, exactly like the KB Q&A they already use.

---

## Mobile (≤ `$bp-md-min`)

- Layer grouping: App Rail hidden; **App Launcher** shows the three sections full-width (already the phone pattern).
- Datasets detail: tabs collapse to a top scroll + drawer (same as ontology second-rail drawer).
- Data Model ER: canvas goes full-screen with a bottom-sheet dataset picker; join dialog is a bottom sheet.
- Data Explorer: chat-primary (same phone IA as Agents).

---

## Intuitiveness checklist (applied to every screen)

Before shipping any Data-layer screen, it must pass:

1. In ≤3 seconds, can a new user name **what this screen is** and **what the next action is**?
2. Is the **primary action** a single visible button (not a menu)?
3. Does the screen **reuse** a pattern the user has already seen elsewhere in openKMS?
4. Is complexity behind a **wizard or dialog**, one question at a time?
5. Does every chart/table/number show its **source**?

---

## Build order for the UX

1. **Phase 0:** layer grouping in App Rail + Launcher; `Datasets` moved out (existing list/detail reused, re-labeled).
2. **Phase 1a:** Datasets — catalog fields + Data tab + upload wizard (steps 1–2–3).
3. **Phase 1b:** Data Model — ER canvas (read) + join dialog (list-select) + Relationships tab.
4. **Phase 1c:** Datasets — Lineage tab (read-only graph).
5. **Phase 2:** Data Model — Quality tab + metric editor (sidebar forms, not canvases).
6. **Phase 3:** Data Explorer — prompt → dashboard grid → Insight badges → saved reports.
