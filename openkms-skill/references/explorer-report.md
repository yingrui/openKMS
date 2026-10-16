# Data Explorer report authoring (one question, one source)

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**.

**Read this before** `explorer reports-create|update|run`, or when a user asks to "save this analysis",
"make a dashboard/report", "re-run last month's numbers".

A report answers **one question over one source**. There are two sources and they are not
interchangeable:

| Source | What it is | Use it when |
|--------|-----------|-------------|
| **Semantic model** (`--semantic-model-id`) | a named scope: metrics + declared fields over datasets | the question is *"the metric, by these fields"* — the number is **governed** (its definition is the metric) |
| **Dataset** (`--dataset-id`) | a physical table in the Catalog | the question is *"what is in this table"* — raw rows, columns, ad-hoc filters |

A report binds to exactly one. The two engines have different query specs, so a block written for one
will not run on the other.

## The report document

```jsonc
{
  "name": "Stock valuation",
  "question": "Which stocks look cheap against their industry?",
  "source_kind": "semantic_model",          // inferred from which id you pass
  "semantic_model_id": "…",                 // or dataset_id
  "status": "draft",                        // draft | ready — "ready" when the answer holds
  "narrative": "…",                          // the written answer
  "blocks": [
    {
      "title": "P/E by industry",
      "insight": "Banks sit below the market median; two outliers need a look.",
      "query": { … }                          // the source's own spec, see below
    }
  ]
}
```

- **`narrative` is the answer**; **`insight` is the one-paragraph reading of a block** (what it shows,
  the anomaly, the next question). They are the difference between a dashboard and a data dump.
- **A run writes the results back** into each block: `columns`, `rows`, `capped`, `duration_ms`, `sql`, `total` (a dataset block: rows the filters match, may exceed the page), `ran_at`. Those are *not* part of what you author.

## Block queries — the exact shapes

### Semantic-model block

```json
{
  "metric": "市盈率",
  "group_by": [{ "field": "industry" }],
  "filters": [{ "field": "trade_date", "op": "between", "value": ["2026-01-01", "2026-01-31"] }],
  "order_by": [{ "field": "value", "direction": "desc" }],
  "limit": 20
}
```

- `metric` is **required** (a block without one fails with `EXPLORER_BLOCK_METRIC_MISSING`), addressed
  by id **or** name.
- `group_by[].field` is a field id or name — of the metric's **base dataset or one it joins** (`industry`
  lives on `stock_basic` while the metric lives on `daily_basic`; the relationship the metric declares is
  what makes it addressable). Add `"granularity": "month"` for a time dimension (grain is a query-time
  choice, never stored on the field). A name shared with the base means the base's field; two joined
  datasets sharing one is a 400 — address those by id.
- `filters` address **fields** (joined ones included, e.g. `industry`); operators: `= != > >= < <= like in between is_null is_not_null`
  (`in` = a list, `between` = two values).
- `order_by[].field` is `"value"` or a grouped field. `limit` is capped at **1000**.

### Dataset block — a page of rows

```json
{
  "filters": [{ "field": "close", "op": ">", "value": 100 }],
  "sort": "trade_date",
  "order": "desc",
  "limit": 50
}
```

### Dataset block — a summary (`aggregates` makes it one)

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

- `filters` address the table's **columns** (physical names, ≤ 10 conditions), same operator
  vocabulary.
- `sort` is one column; `after` is a keyset cursor and **requires `sort`**.
- `limit` is capped at **500**.

## Drawing a block (`chart`)

A block may say how to draw its result. The spec names **columns of the result**, never expressions:

```json
{ "title": "月度平均市盈率", "insight": "…",
  "query": { "metric": "平均市盈率", "group_by": [{"field": "trade_date", "granularity": "month"}] },
  "chart": { "type": "line", "x": "trade_date", "y": "value" } }
```

- `type`: `line` for a series over time, `bar` to compare categories.
- `x` / `y`: result columns to draw (`y` may be a list, e.g. `["count", "avg_pe"]`).
- `series`: optional — one line/bar per distinct value of that column (`y` must then be one column);
  the app keeps the first 8 and says when it truncated.
- The chart is **presentation only**: it never changes what is queried, and a spec the result cannot
  satisfy falls back to the table. So author the block, **run it**, read `columns` from the response,
  and add `chart` only then — a guessed column name gets the reader a table.
- Numbers arrive as numbers *or* numeric strings (`AVG(numeric)`); both plot, and a null is a gap, not
  a zero.

## The loop

```bash
# 1. pick the source (and, for a model, its metric/fields)
python scripts/cli.py semantic-models list
python scripts/cli.py semantic-models fields list --id MODEL_ID
python scripts/cli.py metrics list --model-id MODEL_ID          # or: datasets list --search stock

# 2. create the report from a blocks file (see the shapes above)
python scripts/cli.py explorer reports-create \
  --name "Stock valuation" --question "Which stocks look cheap vs their industry?" \
  --semantic-model-id MODEL_ID --blocks-file blocks.json --yes

# 3. run it, then read what came back (rows + per-block errors)
python scripts/cli.py explorer reports-run --id REPORT_ID --yes
python scripts/cli.py explorer reports-get --id REPORT_ID

# 4. fix a failing block / write the narrative + insights, then run again
python scripts/cli.py explorer reports-update --id REPORT_ID \
  --narrative-file narrative.md --blocks-file blocks.json --yes
python scripts/cli.py explorer reports-run --id REPORT_ID --yes

# 5. mark the answer as holding
python scripts/cli.py explorer reports-update --id REPORT_ID --status ready --yes
```

## How a run behaves

- Read-only, through the source's own engine (statement timeout + row cap). Nothing is computed on the
  client, and no new SQL is generated for you.
- **One block failing does not fail the report.** The block stores
  `error: {code, message, kind}` (its classified reason) and the other blocks still run — read the
  reason, fix that block's query, re-run. Do not paper over it by deleting the block.
- Results are **persisted**, so a report is live: after the data changed, `reports-run` again instead of
  trusting numbers you fetched before.

## Provenance (non-negotiable)

The report's source — and each model block's metric — is what makes a number traceable. Keep it, and say
it in the narrative ("`daily_basic`, P/E by industry, January 2026"). A business reader must be able to
ask "where did this come from?" and get an answer from the report itself.

## Not yet

- **Charts**: the app renders every block as a table (visual charts are the next slice). Do not promise a
  chart in the narrative.
- **The app does not turn a question into a query** — you author the block spec; the app runs it.
- **A report never defines metrics or fields.** If the metric you need does not exist, that is model
  authoring (`semantic-models`, `metrics`) or the Playground — say so instead of computing it in a
  dataset block.
