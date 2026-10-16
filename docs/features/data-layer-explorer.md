# Data layer — Data Explorer (design)

Status: **shipped** (dashboards of reports · per-report source · server-side run · charts · provenance · skill) · Surface: `/data-explorer` · Owner: data layer

Part of the data-layer family: [feature reference](data-layer.md) · [interaction design](data-layer-interaction.md) · [implementation design](data-layer-implementation.md) · [semantic model](data-layer-semantic-model.md) · [Playground (design)](data-layer-playground.md) · [grid filter (design)](data-layer-grid-filter.md).

The Explorer is the **consumption** half of the data layer: where a question becomes a saved, dressed-up
answer — narrative, tables, charts, exports — while the Playground and the Data tab stay builders that
never persist (decision #23). It is also the one surface that must read **both** halves of the layer.

---

## 1. The model: a dashboard of reports

The vocabulary matters, because getting it backwards is what made "one source per document" look
reasonable:

- A **dashboard** is the **document** — a question, a written answer, and the reports in it. It has
  **no source of its own**.
- A **report** is a **tile** — it owns **its own source**, the query it came from, and the result of
  its last run. Reports are what get re-run, charted and tabulated.

A dashboard therefore mixes sources by construction: a governed model metric next to a raw-dataset
health check is the normal case, not an exotic one. (The first version of this feature had it
inverted — the document was called a `report` and the tiles `block`s, with the source on the document,
so a report *about* a model could not also show a dataset's null share. Renamed in
`c9a1b2c3d4e5`; no aliases kept.)

## 2. Two kinds of report source

Each report reads **one source**, and the two sources answer different questions:

| Report source | What it is | Query it runs | Typical question |
|---------------|-----------|---------------|------------------|
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

## 3. The dashboard document

```jsonc
{
  "name": "Stock valuation",
  "question": "Which stocks look cheap against their industry?",
  "status": "draft | ready",
  "narrative": "…",                       // the written answer
  "reports": [                            // the tiles — each owns its source
    {
      "title": "P/E by industry",
      "insight": "…",                     // what the chart shows / anomalies / next question
      "source_kind": "semantic_model",    // or "dataset"
      "semantic_model_id": "…",           // or "dataset_id": "…"
      "query": { …that source's spec… },
      "chart": { "type": "bar", "x": "industry", "y": "value" },
      "columns": ["industry", "value"],   // result, written by a run
      "rows": [["银行", 4.89]],
      "error": null,                      // classified failure of the last run, if any
      "ran_at": "2026-02-14T09:00:00Z"
    }
  ]
}
```

- **A dataset report is a summary when it carries `aggregates`** (`group_by` + `aggregates` + filters), otherwise it is a page of rows; both answer in the model query's shape, so the app treats them alike.
- **`query` is that source's own spec** — the same object the Data tab or the Playground sends, so a
  person can ask it in place and paste the result here, and an agent can produce either.
- **`source_kind` + the id live on the report**, not on the dashboard: two tiles may read two
  different sources, and each is checked against its own ACL.
- **A list is a summary, a `get` is the document.** `GET /api/explorer-dashboards` returns what a
  reader needs to choose one (name, status, `report_count`, the sources it reads — named) and never
  every report's rows; the rows live in the document you get by id.
- **`columns`/`rows`/`error`/`ran_at` are results**, not inputs: `POST /api/explorer-dashboards/{id}/run`
  runs every report against **its** source and persists them. A dashboard is therefore **live**:
  re-running is one call, and the app never shows a number it cannot reproduce.
- **Provenance is part of every tile** (its source, plus the metric/fields inside its query, and it is
  labelled in the UI with a link to that source), so every number on screen answers "where did this
  come from?" — the interaction doc's "provenance always visible".

## 4. Contract

**`POST /api/explorer-dashboards/{id}/run`** (`explorer:read`, plus each report's source ACL) → the
dashboard with every report's result filled in:

- each report is executed against **its own source** (dataset → the rows query, or the summary query
  when its query carries `aggregates`; model → the model query), read-only, with the engine's own
  timeout and row cap;
- one report failing **does not fail the dashboard**: it carries `error` = `{code, message, kind}`
  (the classified shape) and the rest still run — a broken metric definition should not hide the other
  three tiles. A report whose source the caller may not read stores `EXPLORER_SOURCE_FORBIDDEN` and
  **never** carries rows (viewing one hides them too) — a report is not a way around a dataset's ACL;
- the run is a **write to our own document** (results are persisted); the permission it needs is
  `explorer:read`, because a refresh recomputes and cannot edit anything but that cache.

**Where the analysis comes from.** Two paths, one document:

| Path | Who | How |
|------|-----|-----|
| **Agent** (primary, decision #4) | ask a question in chat → the agent queries each source (skill) → writes narrative + reports | `explorer dashboards-create/update --reports-file`, then `dashboards-run` |
| **Person** | build the query where it belongs — the **Playground** (a model metric) or the **Data tab** (a dataset slice) — then **Save to a dashboard**, and hit **Run** there | those two pages, plus the dashboard page |

The app does **not** do NL→spec (the agent's job, like the Playground) and does not pretend to.

**Presentation.** A report may carry a **`view`**, naming columns of that report's *result* (absent =
the table). A dashboard is not four line charts — half of it is single numbers and shapes — so the
five shapes are the vocabulary taken from [Tremor](../research/tremor-evaluation.md), drawn on recharts
and our own tokens:

| `view.kind` | shape | for |
|---|---|---|
| `chart` | `{type: "line"\|"bar", x, y, series?}` | a trend over time, a comparison across categories |
| `metric` | `{column, label?, trend?: {x}}` | the answer is a number. **With `trend`** it is a KPI: the series' **last** value, its change against the previous one, and the shape (bars, no chart runtime) |
| `bar_list` | `{column, label_column?}` | a ranking — labels never clip, the share is explicit |
| `tracker` | `{column, x, label?}` | coverage/missingness/streaks over many periods, in one line |
| *(absent)* | the table | the reader needs the rows |

A metric's number is the **first** row without a trend (the query already reduced to one row) and the
**last** row with one (a KPI is the current value) — so a KPI's query orders its series, and the tile
says which value it is showing rather than guessing. It is presentation only: the report still owns its query, a
run still writes the rows, and the spec survives a re-run. Without a spec (or when the result cannot
satisfy one) the table is the answer, and the table is always one click away.

- `line` for a series over time, `bar` to compare categories; `x` is the category axis, `y` the
  measure(s).
- `series` pivots one column into one line/bar per distinct value (capped at 8, and the report says
  when it truncated), so "pe by industry over months" is a single report.
- A measure arrives from the database as a number *or* a numeric string (`AVG(numeric)`) — both are
  plotted; a non-numeric cell is a gap, never a zero.
- A spec the result cannot satisfy (unknown column; a grouping column with several measures) falls
  back to the table rather than drawing something misleading.

The library is **recharts** (MIT, React 19) — [selection note](../research/chart-library-selection.md),
re-checked against [Tremor](../research/tremor-evaluation.md) (a Tailwind-styled dashboard grammar on
recharts 2.x, peer React 18 → not adopted; its vocabulary was).
Failures render through the shared `<QueryFailureNotice>` (`.query-failure*`), promoted from a page
sheet into the design system when this slice landed, because the Playground and the Explorer both
need it.

## Permissions

The Data Explorer is a **suite app with its own keys** — `explorer:read` (open it, read reports, and
re-run one) and `explorer:write` (create/update/delete). Reading data does not hand out saved
analyses, and sharing analyses does not hand out dataset management:

- **A refresh is a read.** Re-running recomputes the report from its source and writes only our own
  cached results, so it needs `explorer:read`; create/update/delete need `explorer:write`.
- **The bound source's ACL still applies.** A report's results are stored, so viewing or running one
  is viewing the data behind it: a dataset-backed report (and its rows in a list) is visible only
  while that dataset is — the same check browsing it makes. A semantic model carries no
  per-resource ACL, so model-backed reports are gated by the data-layer keys alone.
- The app's rail/launcher tile follows the same permission (it is derived from the route patterns),
  so a member without `explorer:read` simply does not see the Explorer.

## 5. Scope guards (what this is not)

- **Not a BI builder**: no drag-and-drop chart authoring, no pivot designer (a cross-tab is a *query*
  — group-by two columns — not a grid interaction).
- **Reports are not authored inside the dashboard page** (yet): a person builds the query where it
  already lives — the Playground for a model metric, the Data tab for a dataset slice — and saves it
  into a dashboard; an agent writes the whole document through the skill. What the dialog asks for is
  the presentation (title, insight, how to draw it), not the query.
- **Not a second query engine**: both sources are the existing readers; a new source means a new
  *source kind*, not new SQL.
- **Not the Playground**: nothing here is a definition editor, and a report never owns a metric.
- **Not the Data tab**: no inline row editing — the Explorer reads.
- **Every result says when it is from.** A tile shows `as of <relative>` with the exact instant on
  hover (`ran_at`). It never claims "the data has not changed": a source table is written outside this
  system, so knowing that needs a **declared watermark** (a time field to compare against) — listed as
  a follow-up rather than guessed at, which is exactly the lineage lesson from this layer's history.
- **Export is CSV, client-side.** A reader exports the rows a report is showing — its columns, its
  filters, the page it returned — with RFC-4180 quoting and a UTF-8 BOM (Excel on Windows reads a
  UTF-8 CSV without one as Latin-1, which would mangle every Chinese label). A *document* export
  (static HTML/PDF, a shareable artifact) stays the skill's `research-report` path, not the app's.

## 6. P0 — what "usable" means

1. **The document**: a dashboard holds `reports[]`; each report carries its own `source_kind` + id.
2. **Reports own their queries** so the dashboard can be re-run, not merely displayed.
3. **Run**: `POST /api/explorer-dashboards/{id}/run` executes every report against its own source and
   persists `columns`/`rows`/`error`/`ran_at`, with per-report classified errors.
4. **Provenance**: each tile states its source (and a model tile its metric), with links into the
   Datasets / Model pages.
5. **Skill**: `explorer dashboards-create/update --reports-file` + `dashboards-run`.
6. **Empty/error states** that say what happened: a report that has never run, one whose last run
   failed (with the classified reason), and one whose source the reader may not see.

## 7. Acceptance criteria

- A **model** report ("P/E by industry") and a **dataset** report ("rows where close > 100") are the
  same shape and both render, **in one dashboard**, each with its own source named on screen.
- Editing rows in the underlying table, then `dashboards-run`, changes the numbers — no stale artifacts.
- A report with a broken query shows the classified reason while the others still show data; one whose
  source the reader may not see shows `EXPLORER_SOURCE_FORBIDDEN` and no rows.
- An agent can build a whole dashboard through the skill without the UI: create (reports with sources),
  run, read back.

## 8. Decisions

1. **A dashboard holds reports; a report owns its source and query** — the document has no source of
   its own, so one dashboard can show a governed metric beside a raw table.
2. **A report owns the query it came from** (`reports`, not `charts`) — otherwise a tile is a picture
   of a past answer, not something that can be re-run.
3. **The run lives server-side** and reuses the two engines per report, with per-report error
   isolation and persisted results.
4. **No NL→spec in the app**; the agent produces the analysis, the app renders and re-runs it.
5. **Charts are presentation only** and belong to the report: the spec names columns of the result,
   the query stays the source's, and a spec the result cannot satisfy degrades to the table.
6. **recharts** draws them (MIT, React 19; [selection note](../research/chart-library-selection.md)) —
   swapping it changes one component, not the document or the API.
7. **Each report's source ACL applies** — a report is not a way around a dataset grant, and a
   dashboard survives one unreadable tile (it is marked, not silently dropped).
