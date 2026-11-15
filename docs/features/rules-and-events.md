# Rules and events

The ontology-layer app that turns "these numbers must be consistent" into something the platform
checks. A **Rule** is a condition plus a one-line conclusion; running it produces an **Event** when
the condition holds, and closes that event when it stops holding.

**Positioning:** *A rule is an opinion the platform can execute; an event is that opinion becoming a
thing you can link, triage and cite.* Metrics are the first people to write rules — quality rules,
schema changes and pipeline failures are meant to use the same objects.

**Where it lives:** **Catalog** (`/data-rules`) — the app's tab bar lists it beside Datasets · Semantic
Model · Metrics · Quality Issues. The *objects* still live in the ontology (`Rule` / `Event`, so they
inherit ACLs, search, the graph and Actions) but the *work* — writing a rule, reading what it found —
happens where the analyst already is. Ontology Manager shows the two object types as schema and nothing
else; its Rules rail item is gone.

Entry points follow the thing being checked: a metric row carries its open-event badge, a table dataset
offers a 规则 entry beside Quality, and both link into `/data-rules` pre-filtered by that subject.
Writes need `data:write` (analysts) or `ontology:write` (admins) — the old `ontology:write`-only gate was
wrong for the audience.

---

## Why objects, not tables

`Rule` and `Event` are **object types with no dataset** (instances live in `object_instances`, projected
into the graph like any hand-created type). That buys, with no new store:

| Need | Already provided by the ontology |
|------|----------------------------------|
| Permissions | `RT_OBJECT_TYPE` sharing on the two types |
| Find them | Object Explorer, search, graph |
| Attach to business data | link types (`about`) to `AllocationScenario`, `Stock`, … |
| Audit and history | object updates + `audit_events` |

Both types are created on startup if missing (`ensure_builtin_ontology`, idempotent, keyed by
`api_name`); an existing type is never modified.

## Object identity (read this before querying by id)

Both types are **hand-created** (no dataset). For such a type the platform's identity is `__rid` — the
`object_instances.id`, exposed as `object_id` in the API and as `__rid` in the graph. `key_properties` is
display metadata there, not identity; `object_key_properties()` returns `[__rid]` whenever `dataset_id`
is null.

A rule therefore carries two identifiers, and they answer different questions:

| | what it is | stable across |
|---|---|---|
| `rule_id` (on `Rule`) | the business identifier — a slug such as `allocation-overcheck`; unique, generated from the name when left empty | delete + recreate, export/import |
| `object_id` (`__rid`) | the platform identity used by links, actions, ACL and every path parameter | this deployment only |

Events record both: `rule_id` (the slug, what a human reads in an inbox, a log line or an export) and
`rule_object_id` (the pointer used to join back to the object). `event_id` = `rule_id|scope|period` is the
event's own business identifier — it is what dedupe keys on and what evidence cites.

Renaming a rule's display name does not touch `rule_id`: the slug is the contract. Changing the slug itself
is allowed but re-points future events, so treat it like renaming a published API.

## Rule

| Property | Meaning |
|----------|---------|
| `subject` | `{kind: metric\|dataset, ref}` — what the rule watches, and therefore which evaluator and permissions apply |
| `condition` | One comparison `{left, op, right: {value}}`, or `{all: [comparison, …]}` where every comparison must hold. Operands: `{metric}`, `{dataset_agg}`, `{diff:[a,b]}`, `{ratio:[a,b]}`; metric and dataset operands may carry the data layer's own `filters` (`{"field", "op", "value"}`). **No `any`, no nesting** — the editor is a flat list of comparisons and validation accepts exactly that, so the editor cannot express something the server refuses; a condition stored with nesting still *reads* but is rejected on the next write. The read view spells it out in one line — `(分货额度 ÷ 分货明细.sum(gap)) > 1 且 仍缺货明细数 > 0` |
| `severity` | `P0` / `P1` / `P2`, the same scale as quality rules |
| `conclusion` / `suggestion` | One sentence each. **A hit with no suggestion does not become an event** |
| `owner` / `status` / `version` | Who owns the opinion, whether it runs, and which revision fired |
| `last_run_at` / `last_status` / `last_values` | Written back by the engine; there is no separate run table. `last_status` is `pass` (the condition held), `fail` (it did not — the rule **fired**), `unknown` (an operand could not be computed) or `skipped`; the UI says **triggered** for `fail`, because "failed" reads like an error |

## Event

A Vertex-style event object: `event_start_time`, `event_end_time` (**empty = still open**),
`intent` (`danger`/`warning`/`primary`/`success`, the colour) and `severity` (the triage level, kept
separate). Plus `period_start`/`period_end` — the **data** period checked, which is not the same thing
as when the event was raised. The run is given **one period label** (`2026-W46`, `2026-11`, `2026-11-15`)
and the label is parsed into these dates, so the same week cannot be spelled two ways and split its history.
Also `scope`, `evidence` (the values that produced it), `rule_id`,
`rule_version`, `subject_type`/`subject_id` and `status`.

## The inbox groups by rule

Six scenarios of one broken check are one problem, not six rows: the events tab lists a header per rule
(name, how many events, which scopes) with the events under it, so "分货额度错配 — 6 个事件 — 064895a1 · 73ec880b
· …" is one line instead of six. A rule's own page turns the grouping off — everything there already belongs
to the same rule.

Folding is display only: each row still carries its own title, severity, state and the three moves, because
acknowledging is per occurrence (`方案 73ec880b` may be the one being fixed today).

## Where you see it

| Surface | What it answers |
|---------|-----------------|
| **Ontology Manager → Rules** (`/ontology-manager/rules`) | Two tabs: **规则** (author, run, pause) and **事件** (the inbox: acknowledge / resolve / dismiss, filtered by state and severity) |
| **Run parameters** | The period belongs to the *run*, not to the rule (`2026-W46`, `2026-11` or `2026-11-15`; anything else is a 422). Both entry points — "run all" and a metric's own play button — use the same dialog, so the two cannot drift |
| **One rule** (`/ontology-manager/rules/:id`, `/rules/new`) | A page with two modes: **read** (definition, last run with its computed values, events raised) and **edit** (rule / condition / meaning panels, Save and Cancel in the header). The condition needs a page — a summary of what is stored, a form view for one comparison, and a 16-row JSON view for everything else. Creating a rule is the same page in edit mode, so the two cannot drift |
| **A metric** (model → Metrics) | A badge with its open-event count, linking to that metric's events |
| **A dataset** (Catalog → dataset → Overview) | "Rules and events": how many rules watch it, and the three most recent events |

Events themselves remain ordinary objects: the same rows are in Object Explorer, and each is linked to
the business object it is about.

## Reading a number: the check status on the metric row

The relationship canvas was removed (it restated what the row already says — see the Catalog plan's deletion
list). What a reader needs is one line next to the number: **是否一致**.

| what the row shows | meaning |
|---|---|
| 一致 / inconsistent? → **一致** | every rule referencing the metric passed for its last run |
| **不一致** | at least one failed |
| **无法判定** | none could decide (missing grant, too many groups, a missing operand) — hover for the reason |
| **未运行** | rules exist but none has been run |
| **未覆盖** | no rule references this metric — deliberately neutral, so it never looks like a pass |

The badge aggregates the rules that reference the metric (`rule_metric_refs`), worst-first, with the period,
the run time and any reason in the tooltip. The play button on the row runs exactly those rules for one
period label; the same coverage information filters both metric lists (全部 / 已覆盖 / 未覆盖).

## What "scope" actually is

For 分货额度, `scenario` is **not an object the metric belongs to** — it is a *dimension of the rows*:
`分货明细` holds five candidate allocation plans side by side, distinguished by `scenario_id`. Summing
`allocated_qty` across all five plans adds plans that were never intended to coexist, so the metric is
only meaningful **per scenario**.

That is why the value is a **run parameter**, not part of the rule and not a property of the metric: the
rule says *which column* the value goes into (`scope_field`) and what to call the thing (`scope_label`),
and each run supplies one value. A run that supplies nothing returns `unknown` with
`missing run value for scenario_id` — deliberately not a number, because "all five plans at once" is not
a bigger answer, it is a different question.

### Why a group-by and not a run parameter

Palantir's Foundry Rules shape a rule as a row pipeline (inputs → filter / expression / aggregate / join →
output rows), so a dimension like `scenario_id` is either a filter or a group-by **inside** the rule. Our
rules produce one verdict per subject, so the same need is met by a group-by: "for each scenario, does
this hold?" — one run, every scenario, and the failing ones become events. A run parameter (an earlier
draft) would have made the platform ask a question the rule could answer itself.

## A rule can be an identity, not a threshold

A condition answers "is this number in range?". A relation answers a different question: **do these two
numbers agree?** — `分货额度 (明细) = 方案累计额度 (方案表)`, each side computed from its own source, within a
tolerance. That is a reconciliation; an alert would not catch it, because neither number is wrong on its own.

A rule therefore carries **exactly one** of `condition` and `relation`:

| | condition | relation |
|---|---|---|
| shape | a comparison tree over operands | `target = Σ weight × member` |
| verdict | a hit is a failure | deviating beyond the tolerance is a failure |
| group_by | one verdict per group | one verdict per group |
| tolerance | expressed by the threshold | `{abs: 1}` (rows/units) or `{rel: 0.001}` (share of the target) |

Weights are the definition, not decoration: a decomposition is a member with weight 1, an additive check is
a member with weight −1. A member may carry its own `group_field` when the two sides name the same key
differently (明细 groups by `scenario_id`, 方案 by `id`).

Live example (分货, 2026-W46), **per scenario**, two sources:

| | side A | side B |
|---|---|---|
| metric | 分货额度 — `SUM(allocated_qty)` over `allocation_lines` | 方案累计额度 — `SUM((kpis->>'allocated_qty')::numeric)` over `allocation_scenarios` |
| group key | `scenario_id` | `scenario_key` (the scenario table's `id`, declared as a model field to make it addressable) |
| tolerance | `{abs: 1}` | |

```
分货额度 = 方案累计额度 × 1（±1）      group_by scenario_id, member.group_field scenario_key
→ 6 groups, all pass, residual 0.00 in each
```

The two sides name the same object differently and are still aligned, because a member may carry its own
`group_field`. Whole-set first: the same identity without grouping passed at 128,273 = 128,273. A deliberate
1% drift (member weight 1.01) failed with residual −1,282.73 and opened an event; restoring the weight
closed it on the next run. That is the point — the check is cheap once the identity is declared, and the
identity is written once, next to the rule that runs it.

Why the relation lives on a `Rule` rather than in a type of its own: a relation nobody runs is a comment.
The rule already owns severity, advice, the publish gate, the period argument, grouping and the event
lifecycle. Promote relations to their own asset when they gain a second consumer (inference, drill-down).

A run that decided at least one group now closes events whose group no longer fails — **including
ungrouped rules**, which previously never closed. A run where every operand was uncomputable decides
nothing and closes nothing.

## Trying a rule before it exists

Writing a condition is iterative: the first attempts are wrong, and none of them belong in the inbox. A
rule's own page therefore offers **试算 (dry run)** next to **运行**:

- the same numbers, the same guards, the same guardrails (no second query engine);
- **nothing is published** — no event is opened, none is closed;
- **nothing is written back** — `last_run_at` / `last_status` / `last_values` stay as they were, so the rule
  keeps showing its last *real* run;
- each verdict says whether it *would* have opened an event (`would_publish`), which is the question a
  publisher-with-no-suggestion needs answered;
- the response carries per-group values, so a grouped rule shows six numbers and six verdicts instead of
  six events.

`POST /api/rules/{id}/evaluate` takes `dry_run: true`. The list-level "run all" has no trial: a trial has
one subject by definition.

## What reaches the agent (the point of the whole layer)

The reason relations exist is not a prettier diagram — it is that an agent answering "how much did we
allocate, and why?" needs three things the metric's name and SQL do not carry:

| the agent needs | where it comes from | reaches the agent? |
|---|---|---|
| which metric the user means | `ai_context`: synonyms, examples, `not_for` | ✅ in the metric payload; the skill prompt says to use it |
| may the number be summed? | `additivity` | ✅ field + an explicit prompt rule ("never add up a ratio") |
| how is it built, so "why" can be answered | `depends_on` (the expression's `{{references}}`) | ✅ field; prompt: decompose and compare components instead of guessing |
| **is the number trustworthy right now?** | the metric's `assertions` (identity, tolerance, last verdict, rule) | ✅ since this change — previously invisible to the agent |
| which objects does it describe | `about_*` link types from events | ⛔ not needed for answering |

`GET /api/metrics` now returns `assertions` per metric — both directions, with the counterpart's *name*, the
tolerance and the last `health`. The skill prints it next to the metric and the prompt draws the line that
matters: **a failing assertion means the number is not verified**, so it may be quoted only together with
that fact and the rule's name; a passing or absent assertion is not worth mentioning.

The distinction the layer keeps: a *definition* edge is structure (the expression already says it, and
checking it would be tautological); an *assertion* edge is a claim about the world, which is what makes an
answer either trustworthy or not.

## Grouping by a field that exists

`group_by.field` is checked against the subject at save time: a metric rule against its model's fields, a
dataset rule against the dataset's columns. An unknown name used to surface at run time as "条件无法判断"
(a `None` operand), which reads like a data problem rather than a typo — now it is a 400 that lists the
fields that do exist:

```
group_by.field 'scenario' is not a field of this subject (known: above_max, allocated_qty, …)
```

## Rules are not snapshots

A condition must not hard-code one row's id. "This period's allocation is over-allocated" is a statement
about *whichever* scenario you are looking at, so the id belongs to the **run**:

The rule is **evaluated per group**, declared once on the rule — the field is a column both the metric and
the dataset can be filtered by, so the choice belongs to whoever writes the rule:

```json
{"group_by": {"field": "scenario_id", "label": "方案"}}
```

One run then covers **every** group and reports which ones fail, with one event per failing group
(`方案 5 · 本期分货额度错配…`). `label` is the author's word for it (a 方案, a stock, a region) and only
affects the sentence. There is no run parameter: nothing has to be supplied before the rule can be
judged, and a missing group is `undetermined` rather than a number computed over everything.

`evaluate(rule, scope=…)` appends `scenario_id = <scope>` to that operand's filters. Without a scope the
rule runs over everything (a different, usually meaningless, number: for the demo rule, 1.29 across all
five plans instead of 1.18 for the selected one), and the condition text says so — `范围：运行时指定（scenario_id）`.

## Running

```text
operands → metric engine (run_query) | dataset summary (/datasets/{id}/aggregate)
         → compare in memory (diff/ratio arithmetic, never composed SQL)
         → pass  : close the open event for this rule+scope+period
           fail  : publish (or refresh) the event when severity ≥ P1 and a suggestion exists
           unknown: an operand could not be computed — recorded, never treated as a failure
```

Three rules that keep it honest:

1. `event_end_time` empty means still open; "which events were live at time t" is
   `start <= t AND (end IS NULL OR end > t)` — not a `status` lookup;
2. a condition that stops holding **closes** the event (end time + `resolved`) instead of waiting for
   someone to click;
3. **no advice, no event**: a rule that cannot tell you what to do only records its last status.

`about` links are best-effort: a missing target type, a composite key or a missing instance means "no
link", never a failed run — the event already carries `subject_type` / `subject_id`.

## Worked example (live data, 2026-W46)

> Rule: `额度错配` — `ratio(分货额度, Σ gap) > 1` **and** `仍缺货明细数 > 0`, scoped to the selected
> scenario. Recommendation scheme: ratio **1.1776**, **58** rows still below the minimum, **4,991**
> units over-allocated.

Running it publishes `Event(P1, warning)` titled *"本期分货额度错配：分到超配额，仍有渠道缺货"*, linked via
`about` to the `AllocationScenario` instance, with the three numbers in `evidence`. Re-running while
the condition still holds refreshes the evidence and leaves `event_start_time` alone; when the
scenario is re-planned and the condition stops holding, the event gets an end time and `resolved`.

## Status transitions, and why not Action types yet

Moving an event (resolve / dismiss) is a plain audited `PATCH` on the object instance:
closing writes `event_end_time`, reopening clears it. An **Ontology Action type** would be the reusable
form of the same move — a declared, permission-checked write with submission criteria, webhook and
action log, shareable across pages and agents. It is worth doing when there are *effects* to attach
(notify a channel, assign from a queue, call an external system) or a second consumer of the move;
until then an Action type would be an extra declaration around one `status` field.

## Not in this version

Time-axis and event badges, notifications, action types, rule proposals, cross-model subjects,
record-level reconciliation (two datasets by key), period offsets (`stock_flow`), variance decomposition,
metric definition versions. Each has a trigger in the Catalog plan's "after this" list.

**Removed rather than deferred**: the dependency canvas, the nested condition editor with its JSON view,
the `infer` endpoint, `acknowledged` as an event state, and the unused rule fields (`ai_context`,
`about_object_type`, `group_by.label`, `domain`). Reasons in the Catalog plan's deletion list.

**Inference** was removed: a solver and an endpoint, with no consumer (the agent work does not exist yet).
The equation is ~50 lines to re-add when something calls it.

What *is* shipped for reading a number: a metric row shows **一致 / 不一致 / 无法判定 / 未运行 / 未覆盖** from
the rules that reference it, with the period and the reason in the tooltip, and a play button runs exactly
those rules for one period label. A metric with no rule says so (`未覆盖`) instead of looking clean.

**Periods are labels, not objects**: `2026-W46`, `2026-11`, `2026-11-15` are parsed to start/end dates (ISO
weeks, Monday), anything else is a 422. There is no per-period result history yet — `last_*` on the rule is
the latest run, and the run's period is shown next to it.
