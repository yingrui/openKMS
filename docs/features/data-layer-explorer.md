# Data layer — Data Explorer (design)

Status: **P0 shipped** (source binding · live blocks · server-side run · provenance · skill) — **charts are the next slice** · Surface: `/data-explorer` · Owner: data layer

Part of the data-layer family: [feature reference](data-layer.md) · [interaction design](data-layer-interaction.md) · [implementation design](data-layer-implementation.md) · [semantic model](data-layer-semantic-model.md) · [Playground (design)](data-layer-playground.md) · [grid filter (design)](data-layer-grid-filter.md).

The Explorer is the **consumption** half of the data layer: where a question becomes a saved, dressed-up
answer — narrative, tables, charts, exports — while the Playground and the Data tab stay builders that
never persist (decision #23). It is also the one surface that must read **both** halves of the layer.

---

## 1. What it does today, and why it is a shell

| # | What exists | Why it is not an Explorer yet |
|---|-------------|------------------------------|
| 1 | `explorer_reports` CRUD (list/create/get/update/delete) + a list page + a detail page | It stores a report; nothing can **run** one |
| 2 | `charts: [{title, insight, columns, rows}]` | The rows are **pre-computed by whoever wrote the report** (in practice the agent, via the skill). The app can show a table and call it a chart |
| 3 | `dataset_id` on a report | A report can point at a **dataset** only; a **semantic model** — the governed layer of fields and metrics, the thing most questions are actually about — cannot be the source |
| 4 | `narrative` + `question` | Correct shape, nothing fills them |

So the Explorer is currently an artifact store. What it needs is a **source** and an **execution**.

## 2. Both sources, one artifact

A report binds to **one source**, and the two sources answer different questions:

| Source | What it is | Query it runs | Typical question |
|--------|-----------|---------------|------------------|
| **Dataset** (Catalog) | A physical table (+ its columns, keys, AI context) | `POST /api/datasets/{id}/rows/query` (browse) or `POST /api/datasets/{id}/aggregate` (group + aggregates) | "what is in this table" — a slice, or *turnover by month* |
| **Semantic model** | A named scope: fields + metrics + relationships over datasets | `POST /api/semantic-models/{id}/query` | "the metric, by these fields" — the **governed** answer |

A dataset source is the substrate: raw columns, ad-hoc filters, rows. A model source is the lens: a
metric's definition, declared fields, the grain on the query. A question like *"P/E by industry last
quarter"* belongs to the **model** (the metric exists there, and its definition is what makes the number
trustworthy); *"rows where close > 100"* belongs to the **dataset**.

**The Explorer must not become a third query engine.** Both sources are already implemented
(`query_dataset_rows`, `run_query`), both are read-only with a timeout and a row cap, both classify
their failures (`{code, message, kind}`). The Explorer reuses them verbatim — that is the whole reason
it can cover both layers in one place.

## 3. The report document

```jsonc
{
  "name": "Stock valuation",
  "question": "Which stocks look cheap against their industry?",
  "source": { "kind": "semantic_model", "id": "…" },
  "status": "draft | ready",
  "narrative": "…",                       // the written answer
  "blocks": [                             // what the report is made of
    {
      "title": "P/E by industry",
      "insight": "…",                     // what the chart shows / anomalies / next question
      "query": { …the source's query spec… },
      "columns": ["industry", "value"],   // result, written by a run
      "rows": [["银行", 4.89]],
      "error": null,                      // classified failure of the last run, if any
      "ran_at": "2026-02-14T09:00:00Z"
    }
  ]
}
```

- **A dataset block is a summary when it carries `aggregates`** (`group_by` + `aggregates` + filters), otherwise it is a page of rows; both answer in the model query's shape, so the app treats them alike.
- **`query` is the source's own spec** — the same object the Data tab or the Playground sends, so a
  person can ask it in place and paste the result here, and an agent can produce either.
- **`columns`/`rows`/`error`/`ran_at` are results**, not inputs: `POST /api/explorer-reports/{id}/run`
  runs every block against its source and persists them. A report is therefore **live**: re-running it
  after the data changed is one call, and the app never shows a number it cannot reproduce.
- **Provenance is part of the document** (the source, plus the metric/fields inside each query), so
  every number on screen can say where it came from — the interaction doc's "provenance always visible".
- **`blocks` replaces `charts`** (renamed in the same change, no alias): the old shape was a block
  without its query, which is exactly the thing that made the app a store instead of an Explorer.

## 4. Contract

**`POST /api/explorer-reports/{id}/run`** (`data:read` + the source's ACL) → the report with every
block's result filled in:

- each block is executed against **its report's source** (dataset → the rows query; model → the model
  query), read-only, with the engine's own timeout and row cap;
- one block failing **does not fail the report**: the block carries `error` = `{code, message, kind}`
  (the classified shape) and the rest still run — a broken metric definition should not hide the other
  three charts;
- the run is a **write to the report** (results are persisted, `data:write` for the run endpoint —
  saving is what a run does).

**Where the analysis comes from.** Two paths, one document:

| Path | Who | How |
|------|-----|-----|
| **Agent** (primary, decision #4) | ask a question in chat → the agent queries the source (skill) → writes narrative + blocks | `explorer reports-create/update --blocks-file`, then `reports-run` |
| **Person** | pick a source, add a block, hit **Run**, write the insight | the report page |

The app does **not** do NL→spec (the agent's job, like the Playground) and does not pretend to.

**Presentation.** A block may carry a **`chart` spec** — `{type: "line"|"bar", x, y, series?}`,
naming columns of the block's *result*. It is presentation only: the block still owns its query, a
run still writes the rows, and the spec survives a re-run. Without a spec (or when the result cannot
satisfy one) the table is the answer, and the table is always one click away.

- `line` for a series over time, `bar` to compare categories; `x` is the category axis, `y` the
  measure(s).
- `series` pivots one column into one line/bar per distinct value (capped at 8, and the block says
  when it truncated), so "pe by industry over months" is a single block.
- A measure arrives from the database as a number *or* a numeric string (`AVG(numeric)`) — both are
  plotted; a non-numeric cell is a gap, never a zero.
- A spec the result cannot satisfy (unknown column; a grouping column with several measures) falls
  back to the table rather than drawing something misleading.

The library is **recharts** (MIT, React 19) — [selection note](../research/chart-library-selection.md).
Failures render through the shared `<QueryFailureNotice>` (`.query-failure*`), promoted from a page
sheet into the design system when this slice landed, because the Playground and the Explorer both
need it.

## 5. Scope guards (what this is not)

- **Not a BI builder**: no drag-and-drop chart authoring, no pivot designer (a cross-tab is a *query*
  — group-by two columns — not a grid interaction).
- **Not a second query engine**: both sources are the existing readers; a new source means a new
  *source kind*, not new SQL.
- **Not the Playground**: nothing here is a definition editor, and a report never owns a metric.
- **Not the Data tab**: no inline row editing — the Explorer reads.
- **No export in P0**: the artifact is the report document; CSV/static-HTML export is its own slice
  (the sibling `research-report` skill already proves the static-HTML path).

## 6. P0 — what "usable" means

1. **Source binding**: a report points at a dataset **or** a semantic model (`source_kind` +
   `semantic_model_id`, chosen when the report is created).
2. **Blocks**: `blocks` (title, insight, query) replaces `charts`; CRUD keeps working through the API
   and the skill.
3. **Run**: `POST /api/explorer-reports/{id}/run` executes every block against the source and persists
   `columns`/`rows`/`error`/`ran_at`, per-block classified errors.
4. **Provenance**: the report page states its source (and each model block its metric), with links into
   the Datasets / Model pages.
5. **Skill**: `explorer reports-create/update --source-kind/--source-id/--blocks-file` + `reports-run`.
6. **Empty/error states** that say what happened: no source chosen, a block that has never run, a block
   whose last run failed (with the classified reason).

## 7. Acceptance criteria

- A **model** report ("P/E by industry") and a **dataset** report ("rows where close > 100") are the
  same document shape and both render, with their source named on screen.
- Editing rows in the underlying table, then `reports-run`, changes the numbers — no stale artifacts.
- A block with a broken query shows the classified reason while the other blocks still show data.
- An agent can build a whole report through the skill without the UI: create (source + blocks), run,
  read back.

## 8. Decisions

1. **Two sources, one document** — a report binds to a dataset *or* a semantic model; the source kind
   decides which existing query spec its blocks carry.
2. **A block owns its query** (`blocks`, not `charts`) — otherwise a report is a picture of a past
   answer, not an analysis that can be re-run.
3. **The run lives server-side** and reuses the two engines, per-block error isolation, results
   persisted (`data:write`, since a run writes the report).
4. **No NL→spec in the app**; the agent produces the analysis, the app renders and re-runs it.
5. **Charts are presentation only** and belong to the block: the spec names columns of the result,
   the query stays the source's, and a spec the result cannot satisfy degrades to the table.
6. **recharts** draws them (MIT, React 19; [selection note](../research/chart-library-selection.md)) —
   swapping it changes one component, not the document or the API.
