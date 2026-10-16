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
      "chart": { "type": "bar", "x": "industry", "y": "value" }
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

## Drawing a report (`chart`)

A report may say how to draw its result. The spec names **columns of that report's result**, never
expressions:

```json
{ "title": "月度平均市盈率", "insight": "…",
  "semantic_model_id": "…",
  "query": { "metric": "平均市盈率", "group_by": [{"field": "trade_date", "granularity": "month"}] },
  "chart": { "type": "line", "x": "trade_date", "y": "value" } }
```

- `type`: `line` for a series over time, `bar` to compare categories.
- `x` / `y`: result columns to draw (`y` may be a list, e.g. `["count", "avg_pe"]`).
- `series`: optional — one line/bar per distinct value of that column (`y` must then be one column);
  the app keeps the first 8 and says when it truncated.
- The chart is **presentation only**: it never changes what is queried, and a spec the result cannot
  satisfy falls back to the table. So author the report, **run it**, read `columns` from the response,
  and add `chart` only then — a guessed column name gets the reader a table.
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

# 3. run it, then read what came back (rows + per-report errors)
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

- **In-app report authoring**: a person can create a dashboard and run it, but reports are authored
  through this skill (or an agent) today.
- **The app does not turn a question into a query** — you author the report spec; the app runs it.
- **A dashboard never defines metrics or fields.** If the metric you need does not exist, that is model
  authoring (`semantic-models`, `metrics`) or the Playground — say so instead of computing it in a
  dataset report.
