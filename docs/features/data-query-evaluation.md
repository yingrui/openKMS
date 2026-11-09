# Data-query evaluation — judging the *query*, not the numbers

**Status:** design, not started. Extends the Evaluation app to judge **智能问数** answers — specifically, whether the
answer's Sources cited the right semantic model and the right SQL. It deliberately does **not** judge the returned numbers:
data changes over time, so "is the value correct" is a question nobody can answer twice.

## The correction this page records

The first draft judged the **result** — an expected number, range or result set. That was wrong for the domain. A stock
price, a row count, a "PE > 100" tally are all functions of *when* the question was asked, so a ground-truth number is
stale the day after it is written. What is stable is the **question → query** step: given "semiconductor industry revenue by
month", the answer should cite the semantic model that has that grain, and SQL whose FROM/JOIN/WHERE/GROUP BY match that
intent. If those are right, the data is right by construction — and if they are wrong, the data being wrong is a symptom,
not the thing to measure.

So the unit of truth is the **query**, and the answer's Sources are where the query is exposed.

## What is judged: the `data_query` evidence

A KB Q&A answer carries one or more `data_query` sources (the Catalog / SQL Lab evidence). Each has:

```
mode        "metric" | "sql"
model_id    which semantic model answered it
metric      the saved metric id, when mode == "metric"
expression  the one-shot aggregate fragment, when mode == "expression"
sql         the executed SQL — FROM, JOIN, WHERE (the filters), GROUP BY
columns     the result columns (not judged — see above)
rows        a preview (not judged)
row_count   not judged
```

The evaluation checks the **top half** — `model_id`, `metric`/`expression`, and `sql` — against ground truth. The bottom
half is deliberately ignored.

## Ground truth: what a correct *query* looks like

An item needs a new shape, because `expected_answer` (prose) does not describe a query — and one question rarely
corresponds to one query. New `expected_query` (JSONB) is an **array**; every entry is one query the answer should have made:

```json
[
  {
    "model_id": "745a2fbc-…",              // exact — the model that should have answered
    "metric": "revenue_by_month",          // optional, mode == "metric"
    "sql": {
      "tables":   ["tushare.daily_basic"], // relations the SQL must touch (exact, unqualified ok)
      "columns":  ["industry", "trade_date"], // fields it must reference
      "filters":  [{"column": "industry", "op": "=", "value": "半导体"}],
      "group_by": ["industry", "month"],   // the grain
      "forbid":   ["pe_ttm"]               // optional: a field it must NOT use (the trap dimension)
    }
  }
]
```

The array is the honest shape: "industry revenue by month" might need a revenue query *and* a universe query, and one item
should be able to expect both. Matching is **set-based** — each expected query must be covered by at least one source; extra
sources neither cover more nor fail anything (see D5).

Three levels, cheapest first:

| check | deterministic? | what it catches |
|---|---|---|
| `model_id` exact match | yes | the answer cited the wrong model entirely |
| `sql` **features** (tables / columns / filters / group_by / forbid) | yes — extracted from the SQL with the same scanner `sql_scan.py` already ships | a query that is *shaped* wrong: wrong table, missing filter, wrong grain |
| `sql` **semantic equivalence** | no — LLM judge | two SQLs that say the same thing differently (a `BETWEEN` vs two `>=`, a join order) |

The deterministic layer is the workhorse and has no model cost; the LLM layer is the escape hatch for "not the same string,
but the same meaning". Both are about the query, never about the rows.

## Data model

- `evaluations` gains nullable `semantic_model_id` (FK, index) and, for restricted models, `data_resource_id`. A
  data-query evaluation has a model; a RAG evaluation has a KB. Mutually exclusive, enforced in the API.
- `evaluation_items` gains `expected_query` (JSONB). `expected_answer` stays for RAG; a data-query item may carry the prose
  question and the structured `expected_query`.
- New `evaluation_type`: **`data_query`**. Run history, run items, compare — all reused; `evaluation_run_items.detail` can
  hold `{sql, model_id, feature_diffs, judge_reasoning}`.

## Execution

```
run the evaluation's QA path over item.query        (the answer, with its data_query sources)
   →  for each source: judge against item.expected_query
        model_id: exact compare
        sql:      extract features (sql_scan) → diff against expected
                  → deterministic pass/fail, or fall to the LLM judge for equivalence
   →  {passed, score, reasoning, detail}
```

One item may produce several sources; the item passes when the **best** source matches (a good answer that also cited a
wrong secondary source should fail on the one that matters, not on the one that does not — decision D5).

## Decisions

**D1 — judge the agent's sources, not a re-run.** The thing being evaluated is what the answer *claimed* — the
`data_query` the agent put in its Sources. The evaluator reads that evidence and judges it; it does not re-execute the SQL
to see what today's data says. Re-running adds a data question back into a query question.

**D2 — feature extraction is exact, not fuzzy.** `tables` / `columns` / `filters` / `group_by` compare structurally. "The
right table" does not need an LLM. Only *equivalence of two differently-shaped SQLs* needs one.

**D3 — permission.** Reading an answer and its sources needs the KB's read ACL; nothing new. If the evaluation also
*fetches* the answer at run time through the QA agent, that uses the agent's existing key — the evaluator never needs
`data:read` itself, because it never queries the model. This is a real simplification over the first draft: judging claims
about a query is cheaper and safer than running it.

**D4 — how precise the check can be depends on the tool.** A `metric`/`expression` query has a *structured*
shape the backend compiled, so its SQL features (tables, WHERE, GROUP BY) are deterministically comparable. A **SQL Lab**
source is a hand-written SQL string — it has no separate filters field and no guaranteed shape, so its accuracy is judged by
**semantic equivalence** (the LLM), not by feature diffing. The rule: compare features where the tool gives you features;
fall to the judge where the tool gives you only SQL.

**D5 — several sources, and the extras count as completeness.** An item passes when every expected query is
covered by at least one source. Extra sources — the agent querying more than the ground truth — are **not** an error; a
supplementary query is often the thing that makes an answer complete. They feed a **completeness bonus** on the score
(relevant extra sources raise it, irrelevant ones do not), never the pass/fail line, and every source is listed in
`detail` so a spurious citation is visible without failing the item.

## Stages

| # | Stage | Ships |
|---|---|---|
| 1 | Model + migration (`semantic_model_id`, `data_resource_id`, `expected_query` JSONB, `data_query` type) | schema |
| 2 | `model_id` exact match + SQL feature extraction/diff (reuses `sql_scan.relation_refs`) | the deterministic judge |
| 3 | SQL semantic-equivalence judge (LLM, reuse `search_judge` client wiring) | the escape hatch |
| 4 | Run wiring: fetch an answer through the QA agent, read its `data_query` sources, judge, persist `detail` | end to end |
| 5 | UI: model selector in evaluation settings, expected-query editor, run detail shows the SQL and the diffs | usable |

Stages 1–3 do not touch the RAG types. Every stage is one commit and runs the existing gates.

## Out of scope

- Judging the returned **numbers** (`rows`, `row_count`) — data moves; the query does not.
- Evaluating the chat *style* of the answer, the prose, or the citations' formatting — that is `qa_answer`.
- A "query was cheap" metric — an SLO, not a correctness question.
