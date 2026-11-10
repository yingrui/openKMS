# Knowledge-base QA agent

**Status:** design note for discussion. Nothing here is implemented beyond what the "Today" sections describe.

How the KB Q&A agent answers, what it can be configured with today, and three proposals for making its answers checkable —
kept deliberately separate: **what must exist in code** versus **what a deployment should be allowed to tune**.

The concrete failure that prompted this: asked *"贵州茅台 2026 年上半年的营业收入是多少？"* the agent queried
`SELECT ts_code, name, industry FROM tushare.stock_basic WHERE ts_code = '600519.SH'`, attached it as a source, and wrote
1,386 characters about a company's name and industry. The semantic model has no revenue field at all.

## How an answer is produced today

```
POST /knowledge-bases/{kb_id}/ask
  retrieve   → hybrid search over chunks/FAQs (dense + BM25 + optional rerank)
  generate   → system prompt + RAG context + bound tools → LLM
  tools      → catalog / ontology / page-index skills, then back to generate
  sources    → select_display_sources()
```

| Piece | Where | What it decides |
|---|---|---|
| Graph | `qa_agent/agent.py:160` | `retrieve → generate →(loop) tools` — three nodes, no refusal path |
| System prompt | `qa_agent/agent.py:78` (`_build_system_prompt`) | RAG context + skill prompt fragments + *"If the context or skills don't provide enough information, say so honestly."* |
| Skill prompts | `qa_agent/skills/*.py` (`CATALOG_PROMPT` at `catalog.py:257`) | per-skill instructions, e.g. *"5. Cite the metric name, expression, or SQL + a short row preview."* |
| Tools | `qa_agent/skills/{catalog,ontology,page_index}.py` | `list_semantic_models_tool`, `get_semantic_model_tool` (metrics + fields + tables), `query_semantic_model_tool`, `sql_semantic_model_tool` |
| Evidence | `qa_agent/kb_answer_sources.py:459` (`select_display_sources`) | Page Index → Catalog → ontology → RAG chunks, **first non-empty wins**; a catalog entry is created from **any successful** query tool call |
| LLM config | `qa_agent/backend_defaults.py` | resolved from the backend's model registry unless env overrides it |

### What that means

- The prompt asks the model to be honest *in general*. It never says **"a numeric claim must come from the query you cite"**,
  and never says **"do not answer a different question than the one asked"**.
- The catalog skill says **cite what you ran**, not **cite what answered**.
- Evidence is attached by *success*, not by *use*: an irrelevant query becomes a citation, and a refusal-with-irrelevant-query
  looks like a sourced answer to a reader.

## The configuration surface today

Three places, and they are not the same kind of thing:

| Surface | Where | Scope | Examples |
|---|---|---|---|
| **Agent process env** | `qa_agent/config.py` (`.env`) | whole deployment | backend URL, OIDC client, LLM overrides, rerank/BM25/hybrid knobs, port, Langfuse |
| **Per-KB columns** | `knowledge_bases` | one KB | `agent_url`, `agent_skills` (JSONB list of enabled skills), `judge_model_id`, `embedding_model_id`, `faq_prompt` |
| **Per-KB skill set** | `agent_skills` → `normalize_skill_ids()` | one KB | `core = ontology, catalog, page_index`; optional `insurance_calculator`, `premium_estimator`, `product_comparator` |

Notable gaps:

- **The system prompt is not configurable at all** — it is assembled in `agent.py` from fixed strings plus skill fragments.
- `faq_prompt` is a per-KB prompt, but it is **FAQ style guidance** (`faq_generation.py:123`), not the QA agent's prompt.
  It is the one precedent in the system for "prompt text stored per KB".
- Nothing records **which prompt produced an answer**, so a behaviour change cannot be attributed to a text change.

## Proposal 1 — mechanisms that must exist in code

These are capabilities, not policy. Each is useful whatever the deployment decides; none of them is a judgement about what
an acceptable answer is.

### 1a. The tool can say what the model measures

`get_semantic_model_tool` already returns metrics, fields and tables as JSON. What is missing is a **compact, explicit**
statement of what can be answered, e.g.

```json
{"available_measures": ["pe_ttm", "total_mv", "close", "industry", "list_status"],
 "available_metrics": ["市盈率", "TTM市盈率", "平均市盈率"]}
```

No behaviour change on its own. It makes "this model cannot answer that" a fact the loop can act on, instead of something
the model has to infer from a field list.

### 1b. Numbers in the answer can be traced to the cited result

A pure function: given an answer text and the rows of each cited query, report how many of the answer's numbers appear in
some cited result (normalised for thousands separators and 万/亿), as **`traceable / total`**, not a boolean — derived
figures ("同比增长 12%") legitimately do not trace, and a boolean would flag every good answer.

Useful even with no policy attached: it is the raw material for a badge ("3/7 numbers traced"), for an evaluation metric,
and for any later rule.

### 1c. Evidence can be labelled instead of filtered

Today `select_display_sources` returns one flat list. Keep **every** source — the intermediate queries are the audit trail,
and hiding them would make the process *less* transparent, not more — and label what each one is:

```json
{"mode": "sql", "purpose": "consulted" | "used", "traceable_numbers": 2, "sql": "..."}
```

"Consulted but unused" is exactly the thing a reader cannot see today, and it is the honest evidence for the failure above:
the query exists, the answer did not use it.

## Proposal 2 — policies that should be configuration

Mechanisms above are useless without defaults, and the defaults are a product decision that **varies by domain**: the
insurance KB's calculator produces answers by construction, while the quant KB's answers come from queries. Hard-coding one
stance for both is the mistake in the first draft of this note.

| Switch | Values | Default (= today) | What it changes |
|---|---|---|---|
| `unknown_measure` | `refuse` / `try_anyway` | `try_anyway` | when the asked measure is not in `available_measures` |
| `require_grounded_numbers` | `off` / `mark` / `enforce` | `off` | what 1b's ratio does: nothing, label the answer, or drop the answer's unsourced evidence |
| `evidence_labels` | `flat` / `used+consulted` | `flat` | whether 1c's labels are exposed |
| `require_schema_lookup` | `on` / `off` | `off` | force `get_semantic_model_tool` before any query |

Each is measurable on the same test set: run both values, compare. That is the only honest way to pick a default — see
"Open questions".

## Should the KB agent be built on `create_deep_agent`?

A different question from "should KB Q&A move into the project agent runtime": the **product stays** — a KB-scoped,
read-only Q&A service — and only its internal graph changes. `deepagents` 0.7.21 is itself a prebuilt LangGraph
(`deepagents/graph.py`), so this is "which graph builder", not "which product".

### What it would give

| Need | Parameter |
|---|---|
| configurable system prompt | `system_prompt=` |
| **skills as files** (`.openkms/skills/<id>/SKILL.md`) | **`skills=`** — same format the project runtime uses |
| **AGENTS.md / MEMORY.md** | **`memory=`** — `MemoryMiddleware` is built in |
| tools | `tools=` — existing LangChain `@tool`s work unchanged |
| conversation memory | `checkpointer=` |
| escalation for hard questions | `subagents=` |
| read-only posture | `permissions=` + replacing `FilesystemMiddleware` in `middleware=` |
| **the mechanisms proposed above** | `middleware=` — a grounding check, an unknown-measure refusal and evidence labelling become first-class middleware instead of code wedged into `generate_node` |

That last row is the strongest technical argument: today there is exactly one place to put a behaviour check, and it is
inside the generate node.

### What it costs — measured, not estimated

The first draft of this page called streaming "the biggest cost". It is not. The two protocols are the same where it
matters:

| Event | qa-agent | `deepagents` | Frontend |
|---|---|---|---|
| `delta` `{t}` | ✓ | ✓ | ✓ |
| `tool_start` `{run_id,name,input}` | ✓ | ✓ | ✓ |
| `tool_end` `{run_id,name,output}` | ✓ | ✓ | ✓ |
| `tool_error` `{run_id,name,error}` | ✓ | ✓ | ✓ |
| `done` | `{answer, sources}` | `{assistant}` — **different payload** | — |
| `error` | `{detail, answer?}` | **`fatal`** — different name | — |
| `todo` / `interrupt` / `subagent_*` | — | ✓ | **ignored: the parser returns `null` for unknown types** |

So the streaming delta is two things: assemble `done.sources` ourselves (already implemented in `kb_answer_sources.py`,
and both sides carry LangChain messages), and map `fatal` → `error`. Extra event types cost nothing on the client.

What actually costs:

1. **Evidence assembly.** `select_display_sources` reads LangGraph messages; the shapes are compatible, but the
   evaluation depends on this and it must be re-verified against a real run, not assumed.
2. **Where retrieval sits — a real design fork.** Today retrieval is a node that always runs before generation. In a
   prebuilt agent the natural shape is retrieval as a *tool* the model calls, which changes behaviour: the model decides
   whether to search, and some answers will skip it. This needs a decision and a measurement, not a port.
3. **Default middleware includes filesystem tools.** They must be excluded or restricted via `permissions`; the project
   runtime already solved this (its `factory.py` replaces `FilesystemMiddleware` for plan mode, with a comment about
   `NotImplementedError` in 0.7).

Note on cost, corrected: `write_todos` is a **tool**, not a mandatory node, so the framework does not add a planning
round-trip per question. The recurring overhead is per-turn middleware, plus planning only when the model chooses it.

### How to decide

Same `/ask` contract, two implementations, one comparison:

```
A: today's three-node graph      B: create_deep_agent (skills + memory + the same tools)
run the same suites on both:  17-item data-query set  +  the existing RAG evaluations
compare three numbers:  pass rate  ·  p50/p90 latency  ·  tool rounds per item
```

Adopt B if pass rate holds, latency stays inside what the product accepts, and tool rounds show the extra capability
being used. Today's baseline to beat: **p50 15.9 s, p90 32.3 s, max 74.1 s** over 228 `/ask` calls.

## Proposal 3 — if prompt text must change without a deploy

The operational objection is fair: when behaviour *is* text, a pull request per wording change is too slow. The objection
to "prompt in a database" is not the database; it is that such text is usually untested, unattributed and irreversible. Those
are designable:

| Requirement | Shape |
|---|---|
| Default in code | the repo holds the default text; the database **overrides** it, never replaces the only copy |
| Versioned, not editable | `(key, version, body, notes, author, published_at, retired_at)` — a new row, never an in-place edit |
| Publish is gated | publishing runs the evaluation suite; a regression blocks it (this is what the 17-item test set is for) |
| Attributable | every answer records `prompt_version`; an evaluation run names the version it measured |
| Reversible | roll back by pointing at the previous version |

Cost: one table, a publish endpoint, the qa-agent reading it, and the gate. Roughly 1–2 days, and **not worth building
before the evaluation suite exists** — by then it is the thing that makes publishing safe.

**What should not go in such a store:** the answer contract itself ("a number must come from a cited query", "do not answer
a different question"). Those must not vary per knowledge base; they belong in code with tests.

## What the test set already measures

`backend/scripts/seed_quant_data_query_set.py` — 17 questions on the quant KB, ground truth = the query an answer must cite:
12 answerable, 3 traps, 2 that must be refused. It judges the **query**, never the numbers.

Last run: **15/17**. The two failures were the revenue question (answered with company basics instead of refusing) and one
item where the agent cited nothing at all — run-to-run variance in the agent, which is why a single run is a signal and a
series is the measurement.

## Open questions

1. **Would `unknown_measure=refuse` block legitimate questions?** Some questions are answerable by a proxy measure; refusing
   is honest, answering the proxy is helpful, and only the domain owner can say which.
2. **What is a healthy grounding ratio?** Answers legitimately contain derived numbers, so a 100% requirement may be wrong.
   Needs measurement on real answers, not on the 17-item set alone.
3. **Do the two KBs want different defaults?** Likely yes; that is the argument for policies being configuration.
4. **Is a prompt store wanted at all**, or is the deploy cadence acceptable once behaviour is enforced by mechanisms rather
   than by wording?
5. **Framework: keep the hand-written graph or move to `create_deep_agent`?** Not an opinion to settle — the A/B above has
   three numbers that decide it. The open part is the retrieval fork: a node that always runs versus a tool the model calls.

## Not proposed

- Hiding intermediate queries. They stay; the labels in 1c are additive.
- A free-text prompt field that changes behaviour with no test and no attribution.
- Narrowing `agent_skills` for the quant KB — it genuinely needs the catalog skill; that was a wrong idea in an earlier draft.
- Treating "replace the framework" and "move KB Q&A into the project runtime" as the same question. They are not: the first
  keeps the product and swaps the graph builder (§ above), the second changes what the service is for.
- Judging the returned numbers anywhere in this design. Data moves; the query does not.
