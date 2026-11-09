# Data-query evaluation — evaluating "ask the data" answers

**Status:** design, not started. Extends the existing Evaluation app, which today evaluates RAG: a
`(query, expected_answer)` pair run against a **knowledge base**. This page plans how the same app evaluates **智能问数** —
a natural-language question answered by querying a **semantic model** — where the expected answer is *data*, not prose.

## Why the existing shape does not fit

`Evaluation` is RAG-shaped in three places, and each one is load-bearing:

| Field | What it assumes | What 智能问数 needs |
|---|---|---|
| `knowledge_base_id` (NOT NULL) | the answer comes from a KB | the answer comes from a **semantic model** |
| `EvaluationItem.expected_answer` (Text) | ground truth is a paragraph | ground truth is a **result** — a number, a range, a result set, or a fuzzy assertion |
| `evaluation_type` ∈ {search_retrieval, qa_answer, wiki_content_coverage} | judge passages against prose | judge **rows against a value** |

So this is not "add a fourth type and put the query in a field". The evaluation object and the ground-truth shape both
change.

## What is being evaluated

One item is one question. The question turns into a structured `QueryRequest` against a semantic model
(`POST /api/semantic-models/{id}/query`), the engine returns `{sql, columns, rows, row_count}`, and the evaluator judges
whether those rows answer the question.

There are two different abilities hidden in that sentence, and the design must not collapse them:

1. **The translation** — natural language → a correct `QueryRequest` (right metric/expression, right filters, right grain).
2. **The data** — the model and the engine return the number the question is after.

A wrong answer can mean either. A regression test of (2) is cheap and deterministic; a test of (1) is the actual "智能问数"
capability and needs a model to do the translation. The plan supports both, with (2) first.

## Ground truth: what a correct answer looks like

`EvaluationItem.expected_answer` stays for the RAG types. A new `expected_result` (JSONB, nullable) carries the data answer,
with a `kind`:

| kind | shape | judge |
|---|---|---|
| `scalar` | `{"kind":"scalar","value":178222}` | the query must return exactly one cell, equal within `tolerance` (abs or pct) |
| `range` | `{"kind":"range","min":170000,"max":185000}` | one cell within the bounds — for numbers nobody can pin exactly ("PE>100 的行数在 17 万左右") |
| `result_set` | `{"kind":"result_set","columns":["industry","n"],"rows":[["半导体",125430]],"tolerance":"pct"}` | same shape, values within tolerance — for "give me the top three" |
| `assertion` | `{"kind":"assertion","text":"半导体行业的行数应该明显少于全市场"}` | an LLM judge reads the rows and the assertion — the escape hatch for fuzzy truth |

`scalar`/`range`/`result_set` are judged **deterministically** — no model, reproducible, cheap. `assertion` reuses the LLM
judge pattern from `search_judge.py`. The point of having the first three is that a number should not need an LLM to be
checked.

## Data model

- `evaluations` gains `semantic_model_id` (nullable, FK, index) and, for restricted models, `data_resource_id` (nullable).
  A data-query evaluation has a model; a RAG evaluation has a KB. The two are mutually exclusive on the same row — enforced
  in the API, not by a DB constraint that would fight the existing KB rows.
- `evaluation_items.expected_result` (JSONB, nullable) carries the table above. `expected_answer` remains for RAG items; a
  data-query item may carry either the structured result, or both the structured result and the prose question.
- New `evaluation_type`: **`data_query`**.

## Execution

```
item.query (the question)
   →  a QueryRequest          ← the translation step (decision D1 below)
   →  POST /api/semantic-models/{id}/query
   →  {columns, rows}
   →  judge rows against item.expected_result
   →  {passed, score, reasoning, detail:{sql, row_count, expected}}
```

Runs, run items, history and compare all reuse the existing machinery — `evaluation_runs` /
`evaluation_run_items` already store `evaluation_type`, `score`, `reasoning` and a JSONB `detail`, which is exactly what
this needs. No new run tables.

## Decisions that need a call

**D1 — who does the translation?** This is the one that decides scope.

- **A (first): the item stores the QueryRequest.** `expected_result` plus an explicit `query_spec` (JSONB: the metric /
  expression / filters / group_by). The run executes it verbatim. This evaluates (2) — the model and engine — and is a
  regression suite for "did the definition or the query engine break".
- **B (the real thing): the item stores only the question**, and a translation step turns it into a QueryRequest with an
  LLM (the evaluation's judge model, or a model bound to the semantic model). This evaluates (1) — the 智能问数 capability —
  and is what the name promises.

Recommendation: ship **A**, then B on top. A needs no new model and pins the engine; B is one new prompt plus the A judge,
and A is the ground truth B is measured against.

**D2 — tolerance semantics.** "Within 5%" and "within 500 rows" are different for a percentage than for a count. Plan:
`tolerance` is a number, `tolerance_kind` is `abs` | `pct`; for `result_set`, pct applies per numeric cell, strings compare
exactly.

**D3 — permission model.** A run reads a semantic model's data. The evaluator needs `data:read` **and**, for a restricted
model, a read grant on the bound resource (the same `resolve_catalog_scope` gate the query itself uses). If the caller
cannot read the model, the run fails at the start with `RESOURCE_FORBIDDEN`, not per-item — a run that silently returns
empty rows for every item is worse than a refusal.

**D4 — one expected result per item, or several?** Multiple `result_set` variants (one per grouping) would let one question
check "top 3 by industry" *and* "grand total". Plan: an item has one `expected_result`; a second check is a second item.
Multiple results per item would turn the compare view into a matrix for no gain.

## Stages

| # | Stage | Ships |
|---|---|---|
| 1 | Model + migration (`semantic_model_id`, `data_resource_id`, `expected_result` JSONB, `data_query` in the type allowlist) | schema only |
| 2 | **D1-A** execution: run a stored `query_spec` through the query API, judge `scalar` / `range` / `result_set` deterministically | a regression suite for the engine |
| 3 | `assertion` kind via the LLM judge, reusing `search_judge`'s client wiring | fuzzy truths |
| 4 | **D1-B** translation step (question → QueryRequest), judged by the same machinery as A | the actual 智能问数 evaluation |
| 5 | UI: evaluation settings gain a model selector (vs KB), item editor gains the expected-result editor; run history shows `detail.sql` | usable without the API |

Each stage is one commit and runs the existing gates; stages 1–3 do not touch the RAG types.

## Explicitly out of scope

- Evaluating the **agent** that chats over a story or a dashboard (that is a conversation, judged differently).
- A metric of "the query was cheap" (duration, scanned rows). Interesting, but it is an SLO, not a correctness question.
- Reusing the **quality rules** inbox for this. A quality rule says "this data is broken"; an evaluation says "this
  question is answered correctly". Different questions, different pages.
