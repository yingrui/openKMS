# Playground design (semantic model)

Status: **P0 complete** (query engine · builder · picker · classified errors · answer context) · Surface: `/data-model/{id}/playground` · Owner: data layer

The Playground is where a person *asks a question of a semantic model* and sees the answer, the
generated SQL and the definition it came from. It is the human twin of the query API an agent
calls, so the two must share one query specification.

---

## 1. What it does today, and why it feels thin

Current surface: pick a metric → tick fields of the metric's base dataset → pick a granularity →
Run → a table + the SQL + *Recent runs*.

| # | Defect | Why it matters |
|---|--------|----------------|
| 1 | **One shape only**: metric × group-by. No filter, no time range, no order, no limit, no row cap control | "P/E by industry for last quarter, top 10" — the most ordinary question — is unanswerable |
| 2 | **A checkbox wall** of raw field names, no search, no label/description/type | Ticking `ts_code` among 40 rows; you cannot tell a time dimension from a measure |
| 3 | **Nothing about the definition** — no expression, base dataset, joins, filters, `type`, AI context | An author cannot answer "is this the metric I think it is?" without leaving the page |
| 4 | **Raw SQL errors** (e.g. a `GroupingError` from a non-aggregate expression) | The failure mode we actually hit; the user cannot tell a definition bug from a data bug |
| 5 | **Result has no context**: no row count, no "capped at 1000", no timing, no units/formatting, no chart | Two of the three numbers on screen are uninterpretable |
| 6 | **No way to keep or share** an answer | A good answer dies with the tab (the spec's own story: it belongs in Data Explorer) |
| 7 | **Disconnected from authoring** | Testing a metric means leaving the Metrics tab; the old per-row Run we deleted left a hole |

The server already does more than the UI asks for: `POST /semantic-models/{id}/preview` accepts
`filters` (`{column, op, value}`) and `granularity`, runs read-only with a statement timeout and a
row cap, and audits each run. **Defects 1 and 3 are mostly UI.**

---

## 2. Reference products — what to borrow

| Product | The idea worth taking |
|---------|----------------------|
| **Cube (Playground)** | The canonical shape: a **query builder** (measure · dimensions · time dimension + granularity · filters · order · limit) beside a result pane with **chart/table switch**, generated SQL, and the **query as copyable JSON/URL** |
| **dbt Semantic Layer / MetricFlow** | A **structured query spec** (`--metrics --group-by --where --order-by --limit --start-time/--end-time --granularity`), saved queries, and `validate`/`list` for governance — the query object is the product, the UI is a view of it |
| **Looker (Explore)** | **Field search + grouping into dimensions/measures**, quick filters, row limit, sort, pivot, **SQL tab**, "Explore from here", save as Look — the closest daily-use UX |
| **Snowflake Semantic Views** | `SEMANTIC_VIEW(…) {metrics, dimensions, where, order by, limit}` — nearly our engine, and it puts **grain on the query**, not on the field (matches our decision #25/#26) |
| **Lightdash / Holistics / Metabase / Superset** | Field browser with search and descriptions; filter chips; one-click **CSV**; save → dashboard/report as the consumption artifact |
| **AtScale / GoodData (MAQL)** | Metric governance: one definition, validation, lineage, and "why did this number change" — the trust layer |
| **Databricks Genie / Tableau Pulse** | The agent-era direction: an **NL question drafts a structured spec**, the person confirms the spec, not the SQL |

**Common denominator of the good ones:** field browser → query spec → result with viz + SQL → a
saved artifact. We already have the query spec server-side; we are missing the browser, the
controls, the result context and the hand-off.

---

## 3. What the information architecture must show

Four user jobs, and the information each needs:

| Job | Must be visible |
|-----|-----------------|
| **Sanity-check a definition** (author) | The metric's **expression**, base dataset, joins it uses, its own `filters`, `type`, description, `ai_context`/synonyms — and the **no-group-by single value** |
| **Explore** (analyst) | A **searchable field browser** (time dimensions first, other fields folded, label/description/type shown), **filters incl. a time range**, **order + limit**, **row cap indicator**, units/formatting, table ⇄ chart |
| **Trust the number** | Generated SQL, run time, row count and whether the cap was hit, empty-result explanation (the run *audit* stays in the API/skill — no history panel here) |
| **Keep / hand off** | **Copy CSV**, **Copy query JSON**, permalink of the spec, **Save to Data Explorer**, and an actionable *Recent runs* list |

### Proposed layout (two panes, definition strip)

```
┌ Playground ────────────────────────────────────── [Copy query] [Save to Explorer] ┐
│ ┌ Query ───────────────────┐ ┌ Result ────────────────────────────────────────┐  │
│ │ Metric  [市盈率 ▾]  ⓘ     │ │  4.89  (no grouping → single value)            │  │
│ │ Time dimension           │ │   or  Table ／ Line                            │  │
│ │   trade_date  [month ▾]  │ │   rows 1000 · capped · 42 ms · [Copy CSV]      │  │
│ │   range: [2026-01-01 … ] │ │  ┌───────────────────────────────────────────┐  │  │
│ │ Dimensions [ts_code… ▾]  │ │  │ ts_code │ trade_date │ value              │  │  │
│ │   ✓ ts_code · area       │ │  └───────────────────────────────────────────┘  │  │
│ │ Filters                  │ │  ▸ SQL (generated)                             │  │
│ │   + add · metric filters │ │  ▸ Recent runs (click to restore)              │  │
│ │ Order by        Rows     │ │                                                │  │
│ │ [value ▾][↓ desc ▾][100] │ │                                                │  │
│ │ [ Run ]                  │ │                                                │  │
│ └──────────────────────────┘ └────────────────────────────────────────────────┘  │
│ ▸ Definition · expression · base dataset · joins · type · ai_context             │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Two panes (not a wizard) because expressing and inspecting are interleaved; the definition strip
is collapsed by default so an author can verify without leaving for the Metrics tab.

---

## 4. Completeness — what we have vs what's missing

**P0 — makes it usable (all UI; the server already supports most of it)**

1. **Query-spec model**: `{metric, group_by[], granularity?, filters[], order_by?, limit?}` as one
   object, used by the UI, encoded in the URL, and posted to the API.
2. **Filters**: ad-hoc filter chips on the base dataset's columns (+ **time range** for a time
   dimension), with the metric's own `filters` listed read-only so the user knows what is already
   applied. *(API: exists; UI: none.)*
3. **Order + limit + row-cap indicator**: "showing 1000 of ≥1000 rows" instead of a silent truncation.
4. **Field picker** (✅): a **type-ahead multi-select** (a `combobox` input whose menu appears only
   while it is in use) — the always-open checkbox wall wasted the pane. Typing filters; **↑/↓** move,
   **Enter** adds, **Backspace** on an empty input drops the last, **Esc** closes; the menu keeps the
   *Time dimensions* / *Fields* grouping with counts and shows name + muted label + data type pushed
   right, a check on what is already grouped and *nothing matches* when the search misses. Selections
   live as **chips** above (with the query-time grain selector); the section label carries the count.
5. **Definition strip**: expression, base dataset, joins, `type`, description, `ai_context`.
6. **Single-value mode**: no group-by → the metric's value (the fastest sanity check).
7. **Errors with a cause** (✅): the query API classifies by SQLSTATE into `definition` /
   `data` / `request` (`app/services/data_layer/query_errors.py`), localizes the explanation
   (`app/i18n/catalog.py`) and sends `{code, message, kind, detail}`; the answer pane names which
   side failed, states the cause and folds the source's own text into a details line. No toast.
8. **Result context** (✅): row count, cap flag and duration under the answer; **null share per
   column** in the header (over the rows shown); an empty result says whether **filters** removed
   every row or the dataset answered nothing.

**Belongs elsewhere (decided 2026-06)**

The Playground is a *builder + inspector*: express a query, read the answer and the SQL, verify the
definition. Everything that **keeps, dresses or spans** an answer lives on another surface:

| Item | Where it goes | Why not here |
|------|---------------|--------------|
| A run-history panel | **nowhere** (keep the audit in the API/skill) |
| Save the query/report, "Open in Explorer" | **Data Explorer** (`explorer_reports`) | a saved artifact is consumption (decision #23) |
| Bar / line charts | **Data Explorer** | the Playground is a table; dressing an answer is the Explorer's job |
| Pivot / cross-tab (industry × month) | **Data Explorer** | a separate feature, not a query-builder control |
| CSV / file export | **Data Explorer** | consumption |
| NL → query spec | **Agent** (skill/CLI), later | the Playground stays explicit |
| Period-over-period, freshness warnings | **Agent / Explorer** | analysis over time, not query building |
| "Test in Playground" on a metric row | **Metrics tab** (a link *into* here) | the affordance lives with the metric list |

That leaves exactly two P0 groups: the **query builder** (fields, filters, order, limit) and the
**answer + definition** (result table with context, generated SQL, the metric's definition).

---

## 5. Query specification (the shared contract)

```jsonc
{
  "metric": "市盈率",
  "group_by": [{ "field": "ts_code" }, { "field": "trade_date", "granularity": "month" }],
  "filters": [
    { "field": "trade_date", "op": "between", "value": ["2026-01-01", "2026-01-31"] },
    { "field": "industry", "op": "in", "value": ["银行", "证券"] }
  ],
  "order_by": [{ "field": "value", "direction": "desc" }],
  "limit": 100
}
```

- Filters/order address **fields** (resolved to their SQL, qualified by dataset) rather than raw
  columns, so a renamed column or a computed field keeps working; the server can still accept a
  bare column for hand-written API calls.
- Granularity is **per time dimension, at query time** — never stored on the field (spec: grain is a
  query concern).
- The same object should be accepted by the skill/CLI, so an agent and a person produce identical
  results from identical input.

**API**: replace `POST /semantic-models/{id}/preview` with `POST /semantic-models/{id}/query`
returning `{sql, columns, rows, row_count, capped, duration_ms}`; drop the old endpoint in the same
change (no alias). `/metrics/{id}/compute` folds into "query with no grouping".

---

## 6. Scope guards (what this is *not*)

- **Not a BI tool**: no pivots, no dashboards, no drag-and-drop chart authoring. The Playground
  answers and hands off; the Data Explorer owns saved, dressed-up artifacts.
- **No model-scoped saved-query library** (decision #23) — "save" means *to the Explorer*.
- **No invented spec concepts**: grain/timezone stay query-time; nothing new is stored on a field.
- **No write path**: read-only, timeout + row cap, audited (unchanged).

## 7. Acceptance criteria

- A person can go from "which metric?" to "P/E by industry for January, top 10" **without leaving
  the page** and **without typing SQL**.
- Every result states its **row count, cap status and duration**, and shows the SQL that produced it.
- A misplaced metric expression produces a **definition error explaining why** (not raw SQL) — the
  pane says "definition problem", the message says which aggregate/column to fix, the details line
  holds Postgres' words.
- A run can be **reproduced from its URL** and **copied as JSON** (`Copy query`) into an agent/skill
  call — the same spec object, verbatim.
- An author can verify a metric's definition **inline** (including the **relationships the metric
  uses**, named `from → to`), and jump into the Playground from a metric row (`Test in Playground`).

## 8. Decisions

1. **No save.** The Playground never persists anything; saved answers/charts/pivots/exports are Data
   Explorer features (see the table in §4).
2. **Filters address declared `fields` only** (the schema-of-record) — not raw dataset columns. A
   column that is not a field is not addressable from a question.
3. **Table only.** No chart types here.
4. **No pivot.** Cross-tabs, if wanted, are a Data Explorer feature.
5. `POST /semantic-models/{id}/query` replaces `/preview`; `POST /metrics/{id}/compute` stays as the
   metric-addressed single value and is defined as `run_query` with no grouping (one engine, two
   addresses).
6. **The field list is a menu, not a pane** — a field picker that is always on screen costs the same
   space as the answer it exists to produce; it opens on focus, filters as you type and closes when
   you leave. Chips (not the menu) are the record of what is selected.
7. **A failed query is classified, not just reported** — SQLSTATE → `kind` (`definition` / `data` /
   `request`) + a stable code, localized server-side so the pane shows the cause in the caller's
   language (a wrong definition is the common case and is *not* the user's fault). Raw source text is
   a details line, never the message.
