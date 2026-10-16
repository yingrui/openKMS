# Data Explorer dashboard authoring (one document, reports with their own sources)

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**.

**Read this before** `explorer dashboards-create|update|run`, or when a user asks to "save this
analysis", "make a dashboard", "re-run last month's numbers".

**A dashboard is the document; each report in it is a tile.** Every *report* owns **its own source**
and the query it came from, so one dashboard can put a governed model metric beside a raw-dataset
health check — that is the point of a dashboard, not an exotic case.

| Source per report | What it is | Use it when |
|-------------------|-----------|-------------|
| **Semantic model** (`semantic_model_id`) | a named scope: metrics + declared fields over datasets | the question is *"the metric, by these fields"* — the number is **governed** (its definition is the metric) |
| **Dataset** (`dataset_id`) | a physical table in the Catalog | the question is *"what is in this table"* — raw rows, columns, filters, group-by summaries |

The two engines have different query specs, so a report written for one will not run on the other.
Dashboards have **no source of their own** — never put one there.

## Permissions

- `explorer:read` — list/read a dashboard, and **re-run** it (a refresh recomputes; it is a read).
- `explorer:write` — create, update, delete.
- **Plus each report's dataset ACL**: a report whose dataset the caller cannot read comes back as
  `EXPLORER_SOURCE_FORBIDDEN` **instead of its rows**, and a dashboard is listed only while at least
  one of its reports is readable. Model-backed reports have no per-resource ACL.

## The dashboard document

```jsonc
{
  "name": "Stock valuation",
  "question": "Which stocks look cheap against their industry?",
  "status": "draft",                        // draft | ready — "ready" when the answer holds
  "narrative": "…",                          // the written answer
  "reports": [
    {
      "title": "P/E by industry",
      "insight": "Banks sit below the market median; two outliers need a look.",
      "source_kind": "semantic_model",       // per report: inferred from which id you give
      "semantic_model_id": "…",              // or "dataset_id": "…"
      "query": { … },                        // that source's own spec, see below
      "view": { "kind": "bar_list", "column": "value" }
    },
    {
      "title": "Null share of pe_ttm",
      "source_kind": "dataset",
      "dataset_id": "…",
      "query": { "group_by": [{ "column": "trade_date", "granularity": "month" }],
                 "aggregates": [{ "fn": "count" }],
                 "filters": [{ "field": "pe_ttm", "op": "is_null" }] }
    }
  ]
}
```

- **`narrative` is the answer**; **`insight` is the one-paragraph reading of one report** (what it
  shows, the anomaly, the next question). They are the difference between a dashboard and a data dump.
- **A run writes the results back** into each report: `columns`, `rows`, `capped`, `duration_ms`,
  `sql`, `total` (a dataset report: rows the filters match, may exceed the page), `ran_at`. Those are
  *not* part of what you author.

## Report queries — the exact shapes

### Semantic-model report

```json
{
  "metric": "市盈率",
  "group_by": [{ "field": "industry" }],
  "filters": [{ "field": "trade_date", "op": "between", "value": ["2026-01-01", "2026-01-31"] }],
  "order_by": [{ "field": "value", "direction": "desc" }],
  "limit": 20
}
```

- `metric` is **required** (a report without one fails with `EXPLORER_BLOCK_METRIC_MISSING`), addressed
  by id **or** name.
- `group_by[].field` is a field id or name — of the metric's **base dataset or one it joins** (`industry`
  lives on `stock_basic` while the metric lives on `daily_basic`; the relationship the metric declares is
  what makes it addressable). Add `"granularity": "month"` for a time dimension (grain is a query-time
  choice, never stored on the field). A name shared with the base means the base's field; two joined
  datasets sharing one is a 400 — address those by id.
- `filters` address **fields** (joined ones included, e.g. `industry`); operators: `= != > >= < <= like in between is_null is_not_null`
  (`in` = a list, `between` = two values).
- `order_by[].field` is `"value"` or a grouped field. `limit` is capped at **1000**.

### Dataset report — a page of rows

```json
{
  "filters": [{ "field": "close", "op": ">", "value": 100 }],
  "sort": "trade_date",
  "order": "desc",
  "limit": 50
}
```

- `filters` address the table's **columns** (physical names, ≤ 10 conditions), same operator
  vocabulary.
- `sort` is one column; `after` is a keyset cursor and **requires `sort`**.
- `limit` is capped at **500**.

### Dataset report — a summary (`aggregates` makes it one)

```json
{
  "group_by": [{ "column": "trade_date", "granularity": "month" }],
  "aggregates": [
    { "fn": "count" },
    { "fn": "avg", "column": "pe_ttm", "name": "avg_pe" }
  ],
  "filters": [{ "field": "pe_ttm", "op": "between", "value": [0.1, 300] }],
  "order_by": [{ "field": "trade_date", "direction": "asc" }],
  "limit": 12
}
```

- `fn` ∈ `count` (no column = `COUNT(*)`) / `sum` / `avg` / `min` / `max`; give several aggregates distinct `name`s.
- A `granularity` (`day`…`year`) truncates that group column to a grain — query-time, and only on a date column.
- `order_by.field` is a group-by column or an aggregate `name`.
- This is how a **dataset** answers "turnover by month" without a model; the same number from a model metric should agree (a good cross-check to mention in the insight).

## Presenting a report (`view`)

A report may say how its result is read. The view names **columns of that report's result**, never
expressions — and it is the difference between a dashboard and a wall of tables. Pick the shape that
matches the question:

| `view.kind` | Shape | Reach for it when |
|-------------|-------|-------------------|
| *(absent)* | the table | the reader needs the rows themselves (an audit, a list of names to act on) |
| **`metric`** | one number, big, with its label | the query reduced to a single row — a total, a share, an average over everything |
| **`metric` + `trend`** | a **KPI**: the series' last value, the change, and the shape | "the number matters, the shape is context" (a latest average with its direction). Order the query so the row you want on top is **last**; `trend.compare` says how many rows back the change is measured against (`1` previous, `12` the same month last year on monthly data) |
| **`bar_list`** | a ranking: label, bar, value, share | "top N by X" — 8 industries read far better as a list than as 8 bars, and labels never clip |
| **`tracker`** | a strip of blocks, intensity = value / largest | coverage, missingness, streaks **over many periods** (a year of months, a month of days) — one line instead of a screen |
| **`chart`** | `line`, `bar` or **`combo`** | a **trend** over time (line), a **comparison** across a few categories (bar), or **`combo`** for both at once: bars on the left axis with a line on the right (rows vs a rate — two scales, two axes) |

```jsonc
{ "title": "行业平均市盈率（前 8）", "insight": "…",
  "semantic_model_id": "…",
  "query": { "metric": "平均市盈率", "group_by": [{"field": "industry"}],
             "order_by": [{"field": "value", "direction": "asc"}], "limit": 8 },
  "view": { "kind": "bar_list", "column": "value" } }        // labels from the other column
```

```jsonc
{ "title": "最新月平均 pe_ttm（含环比）",
  "query": { "group_by": [{"column": "trade_date", "granularity": "month"}],
             "aggregates": [{"fn": "avg", "column": "pe_ttm", "name": "avg_pe"}],
             "order_by": [{"field": "trade_date", "direction": "asc"}] },
  "view": { "kind": "metric", "column": "avg_pe", "label": "平均 pe_ttm",
            "trend": { "x": "trade_date", "compare": 12 } } }   // KPI: last value, vs a year ago

{ "title": "每月缺失覆盖",
  "query": { "group_by": [{"column": "trade_date", "granularity": "month"}],
             "aggregates": [{"fn": "count"}], "filters": [{"field": "pe_ttm", "op": "is_null"}] },
  "view": { "kind": "tracker", "column": "count", "x": "trade_date" } }
```

- `metric` and `bar_list` name their **value column**; a `bar_list` labels each row with the first
  column that is not the value (or give `label_column`), keeps the top 10 and shows each one's share.
- `metric` shows the **first row** — so give it a query that returns one (a dataset summary with no
  `group_by`, or a model query whose group-by is a single value). Add `trend: {x}` and it shows the
  **last** row instead, plus the change against the previous non-null value (skip the trend if the
  query returns a single row — there would be nothing to compare).
- `tracker` orders its blocks by `x` and keeps the last 60.
- A bar list **always ranks by value, descending** (that is what a ranking is). If your query selected
  the *lowest* N, say so in the title — the reader sees the biggest of that selection first.

### Trend and comparison (`chart`)

```json
{ "title": "月度平均市盈率", "insight": "…",
  "semantic_model_id": "…",
  "query": { "metric": "平均市盈率", "group_by": [{"field": "trade_date", "granularity": "month"}] },
  "view": { "kind": "chart", "type": "line", "x": "trade_date", "y": "value" } }
```

- `type`: `line` for a series over time, `bar` to compare categories, `combo` for a bar + line
  pair (`lines` are drawn on the right axis — never mix two scales on one axis).
- `x` / `y`: result columns to draw (`y` may be a list, e.g. `["count", "avg_pe"]`).
- `series`: optional — one line/bar per distinct value of that column (`y` must then be one column);
  the app keeps the first 8 and says when it truncated.
- The view is **presentation only**: it never changes what is queried, and a view the result cannot
  satisfy falls back to the table. So author the report, **run it**, read `columns` from the response,
  and add `view` only then — a guessed column name gets the reader a table.
- Numbers arrive as numbers *or* numeric strings (`AVG(numeric)`); both plot, and a null is a gap, not
  a zero.

## The loop

```bash
# 1. pick the sources (and, for a model report, its metric/fields)
python scripts/cli.py semantic-models list
python scripts/cli.py semantic-models fields list --id MODEL_ID
python scripts/cli.py metrics list --model-id MODEL_ID          # or: datasets list --search stock

# 2. create the dashboard from a reports file (see the shapes above)
python scripts/cli.py explorer dashboards-create \
  --name "Stock valuation" --question "Which stocks look cheap vs their industry?" \
  --reports-file reports.json --yes

# 3. run it, then read what came back (rows + per-report errors) — `dashboards-get` is the document;
#    `dashboards-list` is only a summary (name, report count, sources)
python scripts/cli.py explorer dashboards-run --id DASHBOARD_ID --yes
python scripts/cli.py explorer dashboards-get --id DASHBOARD_ID

# 4. fix a failing report / write the narrative + insights, then run again
python scripts/cli.py explorer dashboards-update --id DASHBOARD_ID \
  --narrative-file narrative.md --reports-file reports.json --yes
python scripts/cli.py explorer dashboards-run --id DASHBOARD_ID --yes

# 5. mark the answer as holding
python scripts/cli.py explorer dashboards-update --id DASHBOARD_ID --status ready --yes
```

## How a run behaves

- Read-only, through each report's own engine (statement timeout + row cap). Nothing is computed on the
  client, and no new SQL is generated for you.
- **One report failing does not fail the dashboard.** The report stores
  `error: {code, message, kind}` (its classified reason) and the others still run — read the reason,
  fix that report's query, re-run. Do not paper over it by deleting the report. A report whose source
  you may not read stores `EXPLORER_SOURCE_FORBIDDEN` and **never** carries rows.
- Results are **persisted**, so a dashboard is live: after the data changed, `dashboards-run` again
  instead of trusting numbers you fetched before.

## Provenance (non-negotiable)

Each report's source — and each model report's metric — is what makes a number traceable. Keep it, and
say it in the narrative ("`daily_basic`, P/E by industry, January 2026"). A business reader must be
able to ask "where did this come from?" and get an answer from the dashboard itself.

## Not yet

- **Authoring a report inside the dashboard page**: a person can save a report from the Playground
  (a model query) or the Data tab (a dataset slice) into a dashboard, but writing a whole dashboard —
  narrative, several reports, insights — is still this skill's job (or an agent's).
- **Freshness is "as of", not "unchanged"**: each report shows when it was last run. If the answer
  depends on the data being fresh, say the period in the insight ("2026-01 → 2026-10") — and re-run
  rather than trusting numbers you fetched earlier.
- **A person can export CSV** from any report (what it is showing, client-side); a *shareable*
  document (static HTML, a PDF) is still this skill's `research-report` path.
- **The app does not turn a question into a query** — you author the report spec; the app runs it.
- **A dashboard never defines metrics or fields.** If the metric you need does not exist, that is model
  authoring (`semantic-models`, `metrics`) or the Playground — say so instead of computing it in a
  dataset report.
