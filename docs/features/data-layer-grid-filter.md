# Data layer — data grid filter (design)

Status: **design, not implemented** · Surface: `/datasets/{id}/data` (Data tab) + the rows read API · Owner: data layer

Part of the data-layer family: [feature reference](data-layer.md) · [interaction design](data-layer-interaction.md) · [implementation design](data-layer-implementation.md) · [semantic model](data-layer-semantic-model.md) · [semantic model Playground (design)](data-layer-playground.md).

The Data tab answers *"what is actually in this table"*. Today it sorts and pages, and finding rows by
value over a large table is still manual. This designs exactly that one job — a **server-side filter bar
over the browsed table** — and nothing else.

---

## 1. What it does today, and why it feels thin

| # | Defect | Why it matters |
|---|--------|----------------|
| 1 | **No filter.** A 5M-row table can only be sorted and paged | "Show me `close > 100` on 2026-01-31" — the most ordinary browsing question — is unanswerable without reading the table out |
| 2 | Sort is **single-column** and the paging controls are offset-based, while the API already speaks keyset | Browsing very large tables is slower than the API allows |
| 3 | The header count is `COUNT(*)` over the **whole table** | Once filtering exists, a total that ignores the filter is a lie |
| 4 | Columns are derived from `rows[0]` | A query that matches **nothing** renders an empty grid with no header — and a filtered view will match nothing routinely |
| 5 | No way to keep or share a view | A useful slice dies with the tab (URL is stateless) |

The API's rows read is `SELECT * FROM "schema"."table" [WHERE …] ORDER BY … LIMIT … OFFSET …` — the SQL
shape already supports a `WHERE`; what is missing is the contract, the operator vocabulary and the UI.

## 2. Reference products — what to borrow

| Product | The idea worth taking |
|---------|----------------------|
| **Metabase / Superset / Lightdash** | A compact **filter bar** above the grid: `column · operator · value`, add/remove rows, a "result count" in the header, clear-all |
| **Looker (Explore) / Hex** | **Type-aware operators** (text → contains; number → between; date → range) instead of one raw SQL list |
| **Kibana Discover** | Filters as **pinned chips**, the count updating live, and the whole view reproducible from the URL |
| **Airtable / Notion** | Filter conditions read like a sentence; the grid never explains SQL |
| **pgAdmin / DataGrip / TablePlus** | The pragmatic floor: column picker + operator + value, AND-ed, with the row count reflecting the filter |

**Common denominator:** pick a **column**, get the operators that column's type supports, type a value,
see the count change, share the URL. Nobody types SQL to browse a table.

## 3. Information architecture

**Placement.** One **filter bar** directly above the grid (inside the Data panel), one row per condition,
wrapping on narrow widths. The panel header reads `N rows · M filters` (and `· capped` when the page is
full). Row-editing's save bar stays where it is.

**What you can filter on.** The table's **physical columns** — from `GET /api/datasets/{id}/metadata`,
which already carries each column's maintained `description` (Catalog → Columns). *Not* model fields:
this surface browses the substrate, the Playground is the model's lens (decision 1). The picker shows
`name · type · description` so a column is recognizable without leaving the page.

**Type-aware operators** (UI label → API op):

| Column type | Operators offered |
|-------------|-------------------|
| text / enum | `=` · `≠` · **contains** · **starts with** · **ends with** · `in` · `is null` · `is not null` |
| number | `=` · `≠` · `>` · `≥` · `<` · `≤` · **between** · `is null` · `is not null` |
| date / timestamp | **on** (`=` one day → the API's `between` day-bounds) · **before** · **after** · **between** · `is null` · `is not null` |
| boolean | `is true` · `is false` · `is null` |

`contains` / `starts with` / `ends with` are **client-side sugar over the existing `like`** op — no new
server operator, no new vocabulary.

**Value input** follows the operator: one field; two for `between`; comma-separated for `in`; none for
`is null` / `is not null`. Numbers and dates use typed inputs so the API receives typed values.

**Reset semantics.** Any filter change → **page 0** and the keyset cursor cleared (a cursor belongs to
the previous result set); the **sort survives** (it is a view preference, not part of the question).

**Empty / broken states.** No matches → *"No rows match these filters"* + **Clear filters** (not an empty
table). A filter on a column that the schema no longer has is **dropped with a notice** rather than
failing the whole view.

**Shareable.** The filter set travels in the SPA URL (`?f=<encoded spec>`), the same idea as the
Playground's `?q=`: reopening the link reproduces the view.

## 4. Contract

**`POST /api/datasets/{id}/rows/query`** — replaces `GET /api/datasets/{id}/rows` in the same change
(no alias), the rule the Playground applied when it replaced `/preview`. A structured filter set is one
object; carrying it in a query string would mean encoding JSON into a URL.

```jsonc
{
  "filters": [{ "field": "close", "op": ">", "value": 100 }],
  "sort": "trade_date", "order": "desc",
  "limit": 100, "offset": 0, "after": null
}
```

```jsonc
{ "columns": ["ts_code", "trade_date", "close"], "rows": [ … ],
  "total": 1234, "limit": 100, "offset": 0, "next_after": "2026-01-31", "capped": false }
```

- **Vocabulary shared, address space different:** `filters` are `{field, op, value}` — the same object
  the Playground and metrics use, with the same operator whitelist (`= != > >= < <= like in not_in
  between is_null is_not_null`) — but `field` here is a **column name**, validated against the table.
- **`columns` joins the response** (defect 4): an empty result must still render its header.
- **`total` reflects the filters** (defect 3) — the number in the header is the number of matches.
- **Safety:** identifiers validated (`is_valid_identifier`) and checked against the table's columns,
  values parameterized, operators whitelisted, **≤ 10 conditions**, statement **timeout** on the read
  (the metrics path has one; the rows read does not), read-only, `data:read` + dataset ACL.
- **Errors are classified like the query API's:** `400 {code, message, kind}` where `kind` is `request`
  (unknown column, unsupported operator, malformed value) or `data` (the source refused/timed out) — the
  Data tab already renders that shape, so a bad filter explains itself instead of showing a toast.
- **Keyset + filters:** `after` still requires `sort`; filtering does not change that rule.
- **`COUNT(*) … WHERE <filters>`** is what `total` costs. On a very large table that count can be the
  slowest part of the request, so it shares the statement timeout; if it proves too slow in practice the
  follow-up is an estimate (`EXPLAIN`-based) or `total_estimate: true`, not a hung page.

## 5. Scope guards (what this is not)

- **No free-text `where`.** Operators only — a browsing grid is not a SQL console.
- **AND only** (decision 3): no OR groups, no nesting. If a real boolean tree is ever needed, it belongs
  to the Playground/metrics (the model's job), not to row browsing.
- **No distinct-value pickers / autocomplete on values** (v2 — needs its own `SELECT DISTINCT`-style
  endpoint with its own caps; listing values of a text column is a scan).
- **No saved views, charts, exports.** Consumption artifacts are the Data Explorer's job (decision #23).
- **No cross-dataset filters or joins** — that is the Playground (a model's relationships).
- **Not a second engine:** reuse `build_conditions` and the operator whitelist; the only new SQL is the
  qualified column expression.

## 6. P0 — what "usable" means

1. **Filter bar**: add/remove conditions; column picker with type + description; type-aware operators;
   value inputs per operator.
2. **Server-side filtering** with the count reflecting it.
3. **URL state** (`?f=`) + page/cursor reset on change.
4. **Truthful empty state** with Clear-all (and a dropped-column notice).
5. **`columns` in the response** so an empty result still has a header.
6. **Skill:** `datasets rows --filter "column op value"` (repeatable; `between` = `a..b`, `in` = comma
   list), next to the query command's `--filter-op/--filter-value` vocabulary.
7. **Statement timeout** on the rows read.

## 7. Acceptance criteria

- "`close > 100` and `industry = 银行`" over a multi-million-row table is **one interaction**, and the
  header states how many rows match.
- The URL reproduces the filtered view exactly after a reload or in another tab.
- A filter on a column that no longer exists **degrades with a notice** (no crash, no empty page).
- A malformed value (text in a number field) comes back as a classified `request` error naming the
  column — not a raw Postgres error, and not a toast.
- Browsing stays read-only and scoped: no writes, no table outside this dataset.

## 8. Decisions

1. **Filter the table's columns, not model fields.** This surface browses the physical substrate (with
   Catalog descriptions); the Playground is the model's lens over declared fields. Two address spaces,
   one operator vocabulary.
2. **`POST …/rows/query` replaces `GET …/rows`** — one contract, no alias.
3. **AND only** in v1; a boolean tree would be a model-level (Playground) feature.
4. **No new operators.** `contains` / `starts with` / `ends with` are UI sugar over `like`.
5. **`total` reflects the filters**, and shares the statement timeout; an estimate is the escape hatch if
   the count ever dominates.
6. **Filters live in the URL**, like the Playground's `?q=` — a filtered view is shareable.
7. **Editing re-runs the query**: a saved edit can make a row leave the filter, and the grid must show
   the truth rather than a stale row.
