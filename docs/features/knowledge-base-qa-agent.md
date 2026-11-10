# Knowledge-base QA agent

**Status:** design note, partly implemented. The "Today" sections describe the code as it is; § "Proposal 1" carries a
shipped/not-shipped table per mechanism. Nothing in Proposal 2 or 3 is wired to behaviour yet.

How the KB Q&A agent answers, what it can be configured with today, and the open design decisions for making its
answers checkable — kept deliberately separate: **what must exist in code** versus **what a deployment should be allowed to
tune**.

The concrete failure that prompted this: asked *"贵州茅台 2026 年上半年的营业收入是多少？"* the agent queried
`SELECT ts_code, name, industry FROM tushare.stock_basic WHERE ts_code = '600519.SH'`, attached it as a source, and wrote
1,386 characters about a company's name and industry. The semantic model has no revenue field at all.

## Positioning: an external service, not an internal agent

Two agent products, two postures. This is the frame every capability decision below hangs on.

| | **KB Q&A agent** (`qa-agent`) | **Project agent** (`deep_agents`) |
|---|---|---|
| Who calls it | **outside** — any user holding a KB read grant, through the KB's public `/ask` | the operator, inside a workspace they own |
| Trust in the caller | **low**: input is attacker-controlled by definition | medium: a workspace they chose |
| Trust in content | **low**: retrieved text can contain injected instructions | low, but the blast radius is one project |
| Data scope | one KB, read-only, multi-tenant | one project workspace, read-write |
| Consequence of failure | a wrong or leaked answer served to the outside | a bad edit in one workspace |
| Therefore | **execution only inside a real isolation boundary** (§ Executing code) · per-session filesystem · strict tool allowlist · data reads stay read-only | may execute, may write, may delegate, on the host |

Everything below follows from that row. A capability that is fine for the project agent is not automatically fine here — and
conversely, a capability this service needs is not automatically fine *without a boundary*.

### Terminology

Two different things, and the rest of this page keeps them apart:

- **Session workspace** — a directory per conversation: files the agent reads and writes. The project runtime's per-project
  directory, one level finer.
- **Execution boundary** — what happens when code actually runs. A workspace does not provide it.

One more word used throughout: a **session** (here) is one `/ask` conversation — the request carries or receives a
`session_id`, and everything scoped "per session" is scoped to that id. It is not a login session and not a KB-wide scope;
it is the unit that gets a workspace directory.

## Tenancy and abuse

The positioning row says "multi-tenant" and "low trust in the caller". The consequences are not yet designed, and they are
the difference between an external service and an internal one.

**Tenant isolation.** Two tenants share the same agent process, the same model, and the same backend. The design must make
"one tenant's data appears in another's answer" impossible, not unlikely:

- Every `/ask` is stateless: retrieval context, tool results and the session directory are keyed by `kb_id` + `session_id`
  and never cross it.
- The agent process must not hold a KB-wide cache of another KB's chunks, model config or agent config in a way a prompt can
  read. Whatever is cached for speed is keyed per KB and never concatenated into a system prompt.
- The Catalog tools already enforce the KB<->semantic-model link (`_ensure_model_in_kb`); that is the shape every new tool must
  follow — a tool call can only reach what the *current* KB owns.

**Cost and rate abuse.** Low trust means a caller may spend the tenant's money or the deployment's capacity. Open:

- a per-KB request rate and a per-session step budget, so one conversation cannot hold the agent loop;
- a per-KB cost ceiling (token spend), because a public endpoint with unbounded spend is a bill, not a feature;
- sandbox quotas already bound compute; the *agent* budget (rounds, tokens) is the part that is not designed.

**Artifacts are data.** `out/` is copied to object storage before a session directory is reclaimed. A chart or CSV produced
from a KB's data is as sensitive as the data itself: it needs a per-KB bucket or prefix, the same ACL as the KB, and the
same retention/cleanup question as the workspace. "Copied to storage" is a location, not an access decision — this page does
not decide it, and it must not ship without it.

## The session workspace (files)

Two things are being conflated when the word "sandbox" is used, and they should be separate: **where the agent's files
live** (this section) and **what a process may touch when code runs** (next section). The file layer is the one the product
needs first.

The project runtime gives every **project** one directory (`project_fs.project_root(project_id)`,
`settings.projects_root`). The KB agent needs the same thing at **session** granularity: one directory per conversation,
because a conversation is the unit a user works in, and two users (or the same user twice) must not see each other's files.

### Shape

```
{OPENKMS_SESSIONS_ROOT}/{kb_id}/{session_id}/
  AGENTS.md          copied from the KB's agent_config at session creation
  .openkms/skills/   the KB's installed instructional skills, mounted read-only
  uploads/           data the user attached to this conversation
  out/               artifacts the agent produced: charts, CSV, notebooks, reports
  tmp/
```

- **Keyed by session, nested under the KB** — nesting keeps quota and cleanup per KB honest without making the path depend
  on the user.
- **Created lazily** on the first file or code use, not on every `/ask`.
- **Reclaimed** after an idle TTL and destroyed with the conversation; `out/` is copied to object storage first so the
  artifacts survive the directory.
- **Bounded** by a disk quota per session, and by a per-sample limit on what a single tool call may read or write.

### Implementation: the same backend, a different root

`deep_agents/project_backend.py` already builds the thing needed:

```python
ProjectWorkspaceBackend(root_dir=…, virtual_mode=True, timeout=…, env=…)
```

It is a `deepagents` `LocalShellBackend` — `ls`, `read`, `write`, `edit`, `glob`, `grep`, `execute` — scoped to one root,
with normalized paths, no inherited environment and a denied-command policy. For the KB it becomes
`SessionWorkspaceBackend` with `root_dir = session dir`; the file tools then come from `FilesystemMiddleware` for free, and the
rest of the design does not change.

`project_fs.resolve_project_path` is the pattern to mirror for any path that does not go through the backend (upload, delete,
artifact export): resolve under the root and **reject `..` and anything that escapes** — it already does exactly that.

### What the workspace does **not** do

**A directory is not a boundary.** `virtual_mode` normalizes paths for the *file tools*; it does not constrain a shell.
`ProjectWorkspaceBackend.execute` runs `subprocess.run(..., cwd=root)` as the backend's OS user, so a child process can read
`../../backend/.env` and every environment variable the API server holds. Verified. Inside a trusted project folder that is a
conscious trade; in an external service it is remote code execution.

So the session workspace gives: a place for files, isolation *between sessions for the file tools*, quota, and cleanup. It
does **not** give isolation from the host. That is the next section, and it is only needed because 问策 needs computation.

## Executing code

The product direction is **问数 → 问策**: from answering with a number to proposing an approach. That needs computation the
Catalog cannot express — indicators, rolling windows, cross-dataset comparisons, a chart, a file the user keeps. Answering
"what should we do" without being able to compute is answering from rhetoric.

So `execute` is in scope, and *that* is what requires a boundary — not the files. The requirement is about the **process**:

| Requirement | Detail |
|---|---|
| **Isolation** | container or microVM; read-only rootfs; the session directory is the only writable mount; never the Docker socket (a compromised backend would own the host) |
| **No credentials** | zero `OPENKMS_*` variables in the sandbox. The Catalog is reached through **tool calls the agent makes**, not a key available to arbitrary code. `build_project_shell_env` injects `OPENKMS_API_KEY` today — that must not happen here |
| **Network** | denied by default; anything a skill needs is baked into the image (no `pip install` at run time) |
| **Quotas** | cpu, memory, disk, wall-clock, executions per turn; a kill is a **tool error** the model can react to, never a 500 |
| **Lifecycle** | the sandbox is created with the session and destroyed with it; the directory outlives individual executions |
| **Audit** | every execution recorded: code, exit status, duration, artifact sizes |
| **No git** | explicitly out. Skills arrive as installed packages, not cloned repositories |

`ProjectWorkspaceBackend.execute` is the model for *how to run it safely from an async server* (off the event loop, kill the
process group on timeout, stream partial output) — that part is reusable; the isolation around it is not, because there is
none.

### Runtime choice

| Option | Isolation | Start latency | Verdict |
|---|---|---|---|
| k8s Pod per session | clean | 1–3 s cold | **start here** — explicit boundary, the cluster already exists |
| Warm pool of sandboxes | clean | low | later optimization, real maintenance cost |
| Local Docker socket | weak | fast | **no** — a backend compromise becomes a host compromise |
| In-process subprocess (today) | **none** | fastest | acceptable for the internal project agent only |

### Skills, now that execution exists

| Skill kind | What it is | Where it runs |
|---|---|---|
| **Instructional** | a `SKILL.md`: which tool, in what order, with what checks | anywhere — it is text |
| **Executable** | ships a CLI or script that must run | **only inside the execution boundary**, with the table above in force |

## Optional tool: web search

A read tool, optional per KB, and **explicitly outside the evaluation**. The project runtime already has the shape:

```
deep_agents/factory.py:111
  connector_id = project_settings.get("search_connector_id")
  if project_settings.get("web_search") and connector_id:
      tools += await make_web_search_tools(db, connector_id)
```

`tools/web_search.py` turns any enabled connector of category `search_tool` (e.g. Zhipu) into a `web_search` tool. The KB
agent has no search capability at all today.

Design:

- Bound per KB: `agent_config.tool_bindings.search_connector_id`. Off unless a KB asks for it.
- **Evidence gets a type.** A web result is not a `data_query`; it becomes a `web` source, labelled wherever it is shown. The
  data-query judge must never treat it as one.
- **Not evaluated.** We do not judge whether a web answer is accurate — not the search provider's ranking, not the
  summarisation of the snippet. openKMS Evaluation covers the **query** a data answer cited and the **RAG** retrieval; 问策's artifact is judged in
  Langfuse, not here. A web answer is reported as *unverified by evaluation*; grading the open web would measure the search
  vendor, not this product.
- **Injection surface grows.** Retrieved text is already untrusted; the open web is worse. A web source must never be
  allowed to justify a number the Catalog could have produced.

MCP servers were raised as a further external-tool surface and are deliberately **not designed here**: each one is a
credential, a trust boundary and an injection surface of its own, and it deserves the same treatment as web search — a
reference to a vetted connector, read-only, with labelled evidence — rather than a free-form server list. Left out of the
config table until that argument is made.

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

## Proposed configuration: one `agent_config` JSONB per KB

One grouped object with a strict schema validated on write — `chunk_config` is the existing precedent, and it beats a dozen
new columns.

| Group | Fields |
|---|---|
| **Prompts** | `system_prompt` (versioned text), `prompt_version_id`, `agents_md` (KB-wide rules: terminology, definitions, what must be refused) |
| **Tools and skills** | `tools_enabled` (`catalog` / `ontology` / `page_index` — the meaning `agent_skills` has today), `skills_installed` (instructional `SKILL.md` packages), `tool_bindings.search_connector_id` (optional web search) |
| **Retrieval** | `top_k`, `rerank`, `hybrid_weights`, `min_score` — today `top_k=5` is hard-coded in `agent.py` |
| **Answer policy** | `unknown_measure`, `require_grounded_numbers`, `evidence_labels`, `require_schema_lookup` (see "policies" below) |
| **Orchestration** | `profile` (`rag_only` / `rag_tools` / `agent_loop` — an enum, not a graph), `max_tool_rounds`, `recursion_limit`, `retrieve` (`always` / `never` / `on_miss`) |
| **Workspace (files)** | `workspace.enabled`, `.disk_mb`, `.session_ttl_minutes`, `.artifact_max_mb`, `.upload_max_mb`, `.skills_read_only` (default true) |
| **Execution (process)** | `sandbox.enabled`, `.profile` (`container` / `microvm`), `.image`, `.cpu`, `.mem_mb`, `.wall_seconds`, `.max_exec_per_turn`, `.network` (`deny` / allowlist) |
| **Observability** | `langfuse_credential_id` (a **reference**, never the secret), `langfuse_tags`, `sample_rate` |
| **Model** | `agent_llm_model_id` |

Two rules on what may live here:

- **References, not secrets.** A Langfuse project or a search connector is stored as an id pointing at the credential store;
  a key never goes into the KB row.
- **`MEMORY.md` is not on this list.** AGENTS.md is KB-wide and admin-curated; memory is per conversation and per user. A
  shared KB-level memory would let one user's session leak into another's answers — the project runtime can have one workspace
  per person, this service cannot.

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

### Shipped: 1a, 1b, 1c

| Piece | Where | What it does |
|---|---|---|
| 1a | `qa_agent/skills/catalog.py` | `get_semantic_model_tool` returns `available_measures` / `available_metrics` beside the full catalogue |
| 1b | `qa_agent/grounding.py` | `traceable_numbers(answer, results)` → `{traceable, total, ratio, untraced}` |
| 1c | `qa_agent/evidence.py` | each Catalog source gets `usage` (`used` / `consulted`) and `traceable_numbers`; the answer carries `grounding` |

Both the ratio and the labels travel on `/ask` (JSON) and on the `done` event (NDJSON); the backend proxy forwards them.

**What 1a changed, measured.** Asked for a company's revenue — the question that motivated this page — the agent now refuses
the figure, says the model has no income-statement field, lists what the three tables do cover, offers one clearly-caveated
TTM approximation, and names the table that would answer it. The mechanism did not change a prompt: it made "this model
cannot answer that" a fact in the tool's output instead of something the model had to infer from a field list.

**What 1b/1c changed.** A real answer reports `grounding 2/2` with both sources `used`; a lookup-only answer reports its
ratio and leaves the queries it ran as `consulted` — kept, not hidden, which is the point.

### 1d. The tool loop has a budget, and reaching it still answers

`should_continue` routed to tools whenever the model asked, unbounded except by `recursion_limit` (200 supersteps).
`orchestration.max_tool_rounds` caps the rounds, counted from the transcript so the count survives the fallback path that
rebuilds graph state; unset keeps the old behaviour.

**Ending the loop at the cap was wrong, and the first run showed it**: the model had just requested a tool, never spoke
again, and the answer came back empty — worse than an incomplete one. Reaching the cap now routes to a `finalize` node, one
model turn with no tools bound, told to answer from what it already has and to say what it could not check.

That turn needs a transcript the model API accepts — an assistant message with `tool_calls` must be followed by tool results —
so every unanswered call gets a result saying it was not executed because the budget ran out. More honest than dropping the
message, and it tells the model why the data is missing.

Measured at `max_tool_rounds: 1` on a question that needs several: **835 characters** naming what was not retrieved and which
tables would answer it, against **0 characters** before.

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

## Shipped since this note was written

| Piece | Where | Note |
|---|---|---|
| Session workspace + file tools | `qa_agent/session_fs.py`, `skills/workspace.py` | one directory per conversation; `AGENTS.md` from the KB, `.openkms/` read-only, quota, TTL reaping |
| Workspace reachable by the user | `qa_agent/main.py`, backend proxy, `KbQaFilesPanel` | list + download, scoped to the conversation's session id |
| `agent_config` + Agent tab | `app/schemas/kb_agent_config.py`, `KbAgentSettings` | validated JSONB; every default equals the old behaviour |
| `retrieve` modes, tool-round budget + `finalize` | `qa_agent/agent.py` | see 1d above; wrapping up beats an empty answer |
| Answer policies | `_policy_fragments`, `evidence.py` | `unknown_measure`, `require_schema_lookup`, `require_grounded_numbers` |
| Trace id and scores | `langfuse_client.py`, `evaluations/scores.py` | `/ask` names its trace; an evaluation posts `data_query_pass` / `data_query_coverage` onto it |
| **Tenancy ceilings** | `qa_agent/limits.py`, `agent_config.limits` | requests/minute, in-flight, daily tokens — per KB, all off by default; a 429 carries its reason and `Retry-After` |
| **Prompt store** | `models/agent_prompt.py`, `prompt_store.py`, `/agent-prompts` | versioned rows, **publish gated by an evaluation run made after the draft**, one live version per KB, rollback by republishing; each answer reports `prompt_version` |

Still open: **executable skills inside a real boundary** — deferred by decision, with the evidence in `tech_debt.md`.

## Where each kind of answer is judged

Not everything belongs in the Evaluation app. Splitting it keeps each place honest about what it can actually decide.

| Answer kind | Judged in | What is decided | Why there |
|---|---|---|---|
| **问数** (a number from the Catalog) | **openKMS Evaluation** — `data_query` | whether the answer cited the right query: model, tables, filters, grain | deterministic, reproducible, stored next to the model it judges |
| **RAG** (prose from chunks) | **openKMS Evaluation** — `search_retrieval` / `qa_answer` / `wiki_content_coverage` | whether retrieval supported the answer | already shipped |
| **问策** (an approach, usually with an artifact) | **Langfuse** — scores on the trace, plus human review | whether the artifact exists and what its code read (automatable); whether the strategy is sound (not automatable) | the judgement is mostly human, and it is per-conversation rather than a fixed item set — Langfuse already holds the trace, the timings and the cost |
| **web answer** (optional tool) | **nowhere** | — | grading the open web measures the search vendor, not this product |

So the Evaluation app keeps its two families and gains a third only if 问策 ever becomes a fixed item set. Until then it is
a Langfuse question: a score per conversation, a comment from the reviewer, and the trace to look at.

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
6. **Executable skills and the boundary are one decision.** The body says executable skills run only inside the execution
   boundary; that makes them contingent on question 7 — the workspace can ship without execution, executable skills cannot.
   The question is the isolation mechanism, not whether execution is wanted.
7. **Execution boundary**: k8s Pod per session (clean, 1–3 s cold start) versus a warm pool (fast, more maintenance). The
   Docker-socket option is rejected: it makes a backend compromise a host compromise. The *workspace* does not depend on this
   answer — files can ship before code execution does.
8. **问策 scoring in Langfuse**: which scores to push automatically (artifact produced? code read the right tables?) and which
   to leave to a reviewer, so the two are not confused on the same trace.
9. **Tenancy limits**: per-KB request rate and per-KB token ceiling — the abuse surface an external endpoint opens. The
   per-request step budget now exists (`max_tool_rounds`); the rate and spend ceilings do not.
10. **Artifact access**: the bucket/prefix and ACL for `out/` artifacts, and their retention. "Copied to storage" is a
   location, not an access decision.

Deliberately not decided here: **memory** — whether a session directory or its context outlives the conversation. That is a
memory design question, and it changes what a conversation *is*; out of scope for this page.

## Not proposed

- Hiding intermediate queries. They stay; the labels in 1c are additive.
- A free-text prompt field that changes behaviour with no test and no attribution.
- Narrowing `agent_skills` for the quant KB — it genuinely needs the catalog skill; that was a wrong idea in an earlier draft.
- Treating "replace the framework" and "move KB Q&A into the project runtime" as the same question. They are not: the first
  keeps the product and swaps the graph builder (§ above), the second changes what the service is for.
- Judging the returned numbers anywhere in this design. Data moves; the query does not.
- **Evaluating web search accuracy.** Web search is an optional read tool; grading the open web would measure the search
  vendor, not this product. A web answer is reported as unverified rather than scored.
- Reusing `deep_agents/sandbox.py` for the KB path — it runs as the backend's OS user and injects the caller's bearer token,
  which is acceptable inside a trusted workspace and is remote code execution in an external service.
