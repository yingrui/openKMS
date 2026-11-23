# Palantir's LLM functions (AIP Logic)

**What Palantir means by "LLM function" is not a decorator.** There is no `@llm` in their Functions SDK and no
`llm` runtime: the LLM-powered function is a **first-class resource type** — an AIP Logic function, built in a
no-code editor out of blocks, then published so that everything else in the platform calls it like any other
function. `@foundry/functions-api` gives you external API calls and ontology access, not a model handle.

That distinction is the interesting part for openKMS: we already have code-defined Functions with versions and an
executor (`docs/features/ontology-functions.md`). What Palantir adds is a **second authoring surface whose output is
the same artifact**, plus the governance that makes a non-deterministic function safe to call from a decision.

Sources: [AIP Logic overview](https://www.palantir.com/docs/foundry/logic/overview) ·
[core concepts](https://www.palantir.com/docs/foundry/logic/core-concepts) ·
[blocks](https://www.palantir.com/docs/foundry/logic/blocks) ·
[use functions](https://www.palantir.com/docs/foundry/functions/use-functions) ·
[metrics](https://www.palantir.com/docs/foundry/logic/logic-metrics) ·
[execution modes](https://www.palantir.com/docs/foundry/logic/execution-mode-settings) ·
[staged writes](https://www.palantir.com/docs/foundry/logic/staged-writes) ·
[branching](https://www.palantir.com/docs/foundry/logic/branching-logic) ·
[chatbots as functions](https://www.palantir.com/docs/foundry/chatbot-studio/chatbots-as-functions) · all fetched 2026-11-23.

## The artifact

| Property | AIP Logic function |
|---|---|
Shape | inputs (ontology objects, object sets, primitives, `model`) → one output: a value, an object, **or the set of ontology edits it made** |
Authoring | boards on a canvas: inputs · blocks · outputs, with a debugger and a run panel beside them |
Storage | a resource in a **project folder** (not a home folder), versioned, branchable |
Callable as | a Workshop variable/derived property/aggregation, the body of an **Action**, another Logic function, a TypeScript or Python function, an OSDK call, Automate; the Uses tab hands you a `curl` for external calls (not for functions that return edits) |
Edits | **only applied when the function is called from an Action** — "The Ontology will not be edited unless the Logic function is executed from an action, even if the function contains an Apply action block" |

That last line is the whole governance model in one sentence: **an LLM function can *propose* ontology changes, but
the write path is still an Action.** Non-determinism is confined to the body of a step whose inputs and permissions
are already modelled.

## The block model

Six block types cover the whole language: `Use LLM`, `Apply action`, `Execute function`, `Conditionals`, `Loops`,
`Create variable`. Two consequences worth copying:

1. **Deterministic work stays deterministic.** The docs tell authors outright to prefer `transform`/`execute`/`apply
   action` blocks over asking the model, because deterministic blocks "do not use any tokens". An LLM function is not
   a prompt with a parser — it is a program where some steps happen to be model calls.
2. **The `Use LLM` block is a prompt + tools + an output schema**, and the tools are the ontology:
   | Tool | What the model may ask for |
   |---|---|
   | `Query objects` | read object types, with only the properties you granted (token efficiency is the stated reason) |
   | `Call function` | call code-defined functions or other Logic functions |
   | `Apply actions` | edit the ontology through an Action |
   | `Calculator` | arithmetic the model would otherwise get wrong |

   "LLMs do not have direct access to tools; LLMs can only ask to use tools, and these tool calls are then executed
   by AIP Logic **within the invoking user's permissions**." Tool calling is *prompted* or *native*, upgraded
   automatically when every model in the block supports native calls.

## Governance (the part that is easy to under-build)

| Concern | Palantir's answer |
|---|---|
Whose permissions | **execution mode**: `user-scoped` (default — runs as the caller, caller sees only their own execution logs, logs kept 24 h) or `project-scoped` (runs as the project, logs visible to everyone with project access, every resource must be imported into that project, and a **run-history dataset** can keep the last 10 000 runs) |
Data access | read-time enforcement: row/column controls, restricted views, object and property security policies filter what the model can read — **and explicitly do not extend to what the model outputs or to the edits it composes**. Pairs with Markings / classification-based access control for the write path |
Change management | Global Branching: a Logic function is a resource on a branch; rebase and approval follow the platform's normal flow |
Tracing | Debugger shows the chain of thought per block, prompt as sent, tool calls, and token usage per block ("if the bar is red, reduce tokens") |
Quality | Evaluations (AIP Evals) attach to the **published** function: test cases, model comparison (GPT-4 vs GPT-3.5 on *your* function), run-to-run variance, parameter sweeps, failure diagnosis. Test cases can be generated from real runs ("Add as test case" in run history) |
Ops | Logic is "backed by functions", so success/failure counts and P95 duration over 30 days come from the function telemetry; failure categories are the function ones |
Model choice | k-LLM philosophy: any registered model; bulk model replacement across functions via Workflow Lineage |

## What is *not* in the artifact

- No prompt versioning separate from the function version: publishing the function publishes the prompt.
- No free-form "agent" loop: loops and conditionals are explicit blocks, and loop iterations without actions run in
  parallel.
- No silent write: edits are staged and applied at the end of the execution, and only from an Action. Staged writes
  (beta) extend this to nested calls — a Logic function calling an action backed by another Logic function — which
  previously was not allowed.

## Where openKMS stands

| Concern | Palantir | openKMS today |
|---|---|---|
Artifact | Logic function ≈ same call surface as a code function | `ontology_functions` + `ontology_function_versions` (`source`, `runtime`, `entrypoint`, `input_schema`), executed by ofs; called via `openkms_functions.Client` |
Authoring | canvas of blocks, no code | source code only (`--source-code-file`), Python/TS runtime |
LLM inside a function | the point of the feature | **nothing**: a function would have to call an external model itself, and there is no tool registry, no token accounting, no chain-of-thought |
Edits | staged, applied at end, only from an Action | `create_edit_batch()` returned from an Action execute; applied by the action path |
Execution identity | user-scoped vs project-scoped, with log visibility tied to it | executions recorded with `caller_user_id`; no scoped-login concept |
Quality | Evals attached to the published function, variance across runs | `evaluations` exist for datasets/runs (data queries), not for functions |
Observability | success/failure, P95, CoT | `ontology_function_executions` (duration, status) — but nothing to trace *inside* a run because nothing is multi-step yet |

## What I would take, and what I would not

**Take:**

1. **The LLM function is a function, not a new runtime.** If openKMS ever supports model-backed logic, the artifact
   should be another `ontology_function_versions` row (a new `runtime`, e.g. `llm`), so Actions, permissions,
   versioning and the OSDK client keep working unchanged. A separate object would fragment the call surface.
2. **A tool registry that is the ontology itself** — query objects / call function / apply action / calculator — with
   per-tool property grants, executed by us under the caller's permissions rather than by the model. This is the
   difference between "an LLM with database access" and "an LLM that files requests we execute".
3. **Edits stay behind Actions.** We already do this; the lesson is to keep it as an invariant rather than an
   implementation detail, because it is what makes the non-determinism reviewable.
4. **Execution mode as a first-class setting** (caller's permissions vs the project's), because it decides both the
   blast radius and who may read the trace.
5. **Evals attached to the published version**, with "promote a real run to a test case" — cheap to design in, very
   expensive to retrofit once functions have been edited in place.

**Not yet:**

- A block canvas. The valuable half is the *semantics* (blocks, tools, staged edits, CoT), and our authors already
  write Python. A visual editor is a product of its own; a JSON block spec + the same executor would capture most of
  the value.
- A k-LLM model registry. openKMS has one provider path (`openai_compat`) and no model catalog; adding "any model" is
  a separate decision that only pays off after a second provider exists.

**Not verifiable from the public docs:** how Palantir versions a prompt inside a published Logic function (whether a
model swap is a new version), and how Evals treat ontology edits (whether an edit set can be asserted). Both matter
for us; both would need an evaluation tenant to answer.
