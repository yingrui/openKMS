# Playground design (semantic model)

Status: **plan** · Surface: `/data-model/{id}/playground` · Owner: data layer

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
| **Trust the number** | Generated SQL, run time, row count and whether the cap was hit, null share per column, last data date for the time dimension, empty-result explanation |
| **Keep / hand off** | **Copy CSV**, **Copy query JSON**, permalink of the spec, **Save to Data Explorer**, and an actionable *Recent runs* list |

### Proposed layout (two panes, definition strip)

```
┌ Playground ────────────────────────────────────── [Copy query] [Save to Explorer] ┐
│ ┌ Query ───────────────────┐ ┌ Result ────────────────────────────────────────┐  │
│ │ Metric  [市盈率 ▾]  ⓘ     │ │  4.89  (no grouping → single value)            │  │
│ │ Time dimension           │ │   or  Table ／ Line                            │  │
│ │   trade_date  [month ▾]  │ │   rows 1000 · capped · 42 ms · [Copy CSV]      │  │
│ │   range: [2026-01-01 … ] │ │  ┌───────────────────────────────────────────┐  │  │
│ │ Dimensions  [🔍 search]  │ │  │ ts_code │ trade_date │ value              │  │  │
│ │   ✓ ts_code   + area …   │ │  └───────────────────────────────────────────┘  │  │
│ │ Filters                  │ │  ▸ SQL (generated)                             │  │
│ │   + add · metric filters │ │  ▸ Recent runs (click to restore)              │  │
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
4. **Field browser**: search, label/description/datatype, time dimensions first, other fields
   behind a disclosure; add/remove as chips rather than a checkbox wall.
5. **Definition strip**: expression, base dataset, joins, `type`, description, `ai_context`.
6. **Single-value mode**: no group-by → the metric's value (the fastest sanity check).
7. **Errors with a cause**: distinguish *definition* errors (expression is not an aggregate, unknown
   column, unresolved join) from *data* errors (permission, timeout), and say which.
8. **Result context**: row count, cap flag, duration, null share per column, empty-state explanation.

**P1 — closes the loop**

9. **Save to Data Explorer** (a saved artifact is a consumption thing — decision #23) and a
   permalink that reproduces the run.
10. **Chart**: line for one time dimension + one metric, bar for one dimension; reuse the Explorer's
    chart rendering instead of inventing one.
11. **"Test in Playground"** on a metric row (Metrics tab) and on a field — prefills the spec.
12. **Actionable recent runs**: click to restore the spec; show status/duration/rows/error.
13. **Copy CSV / Copy query JSON** for hand-off to a notebook or an agent.

**P2 — agent era**

14. **NL → spec**: an agent drafts the structured spec; the person confirms/modifies it (never a
    black-box answer).
15. **Freshness & coverage**: last data date per time dimension, null share warnings ("this metric
    is empty for 26% of groups"), so trust is earned rather than assumed.
16. **Period-over-period** and saved comparisons (needs #2 and #3 first).

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
- A misplaced metric expression produces a **definition error explaining why** (not raw SQL).
- A run can be **reproduced from its URL** and **copied as JSON** into an agent/skill call.
- An author can verify a metric's definition **inline**, and jump to the Playground from a metric row.

## 8. Open questions

1. Does *Save* write an `explorer_report` (reuse `POST /explorer-reports`) or a dedicated saved
   query? (Current decision: the Explorer — confirm.)
2. Should the filter UI expose **every** column of the base dataset, or only the model's fields
   (schema-of-record)? Fields only is stricter and matches the model; every column is friendlier.
3. Chart: reuse the Explorer's chart component as-is, or keep the Playground table-only in P0 and
   add charts with the Explorer work?
4. Do we want **pivot** at all for "by industry × by month" cross-tabs, or is one row dimension the
   limit? (Lean: one row dimension, no pivot.)
