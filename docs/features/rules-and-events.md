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
| `condition` | One comparison, or `all`/`any` of comparisons. Operands: `{metric}`, `{dataset_agg}`, `{diff:[a,b]}`, `{ratio:[a,b]}`; each may carry the data layer's own `filters` (dataset operands use `{"field": …, "op": …, "value": …}` — the same shape the dataset grid's API takes; the engine also tolerates `column`, but `field` is the documented one). A filter may also carry **`"label": "推荐方案 · 2026-W46"`**, which is what the condition text shows instead of the UUID — the engine ignores the key, the reader needs it. Better still: an operand can declare **`"scope_field": "scenario_id"`**, meaning "the run says which scenario" — the value then comes from `scope` at run time, and the rule is not pinned to one object's id |. The editor always shows the stored condition verbatim. Conditions are authored **as the tree they are**: an `all`/`any` group is a heading with an indented, guide-lined list of children (groups nest), and a comparison is one line — a value (metric, dataset aggregate, or a ratio/difference, itself nestable), an operator and a constant. That drawing maps one-to-one onto the stored JSON, so nothing is lost in either direction — including operand
filters, which stay on the operand (shown as `分货额度（scenario_id = …）`) and survive an edit through the form. The read view
draws the same tree without controls, and the one-line summary spells the structure out —
`(分货额度 ÷ 分货明细.sum(gap)) > 1 且 仍缺货明细数 > 0` — so "is this the formula I meant?" is answered by looking, not by trusting. **Condition JSON** is an advanced view for shapes the builder does not draw (nested groups, an aggregate of an aggregate) — leaving it adopts the JSON back into the builder, and refuses if the builder cannot represent it, so an edit is never silently dropped |
| `severity` | `P0` / `P1` / `P2`, the same scale as quality rules |
| `conclusion` / `suggestion` | One sentence each. **A hit with no suggestion does not become an event** |
| `owner` / `status` / `version` | Who owns the opinion, whether it runs, and which revision fired |
| `last_run_at` / `last_status` / `last_values` | Written back by the engine; there is no separate run table. `last_status` is `pass` (the condition held), `fail` (it did not — the rule **fired**), `unknown` (an operand could not be computed) or `skipped`; the UI says **triggered** for `fail`, because "failed" reads like an error |

## Event

A Vertex-style event object: `event_start_time`, `event_end_time` (**empty = still open**),
`intent` (`danger`/`warning`/`primary`/`success`, the colour) and `severity` (the triage level, kept
separate). Plus `period_start`/`period_end` — the **data** period checked, which is not the same thing
as when the event was raised — `scope`, `evidence` (the values that produced it), `rule_id`,
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
| **Run parameters** | The period and scope belong to the *run*, not to the rule: both entry points ("run all" and a rule's own Run button) open the same dialog, so the two cannot drift |
| **One rule** (`/ontology-manager/rules/:id`, `/rules/new`) | A page with two modes: **read** (definition, last run with its computed values, events raised) and **edit** (rule / condition / meaning panels, Save and Cancel in the header). The condition needs a page — a summary of what is stored, a form view for one comparison, and a 16-row JSON view for everything else. Creating a rule is the same page in edit mode, so the two cannot drift |
| **A metric** (model → Metrics) | A badge with its open-event count, linking to that metric's events |
| **A dataset** (Catalog → dataset → Overview) | "Rules and events": how many rules watch it, and the three most recent events |

Events themselves remain ordinary objects: the same rows are in Object Explorer, and each is linked to
the business object it is about.

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

Moving an event (acknowledge / resolve / dismiss) is a plain audited `PATCH` on the object instance:
closing writes `event_end_time`, reopening clears it. An **Ontology Action type** would be the reusable
form of the same move — a declared, permission-checked write with submission criteria, webhook and
action log, shareable across pages and agents. It is worth doing when there are *effects* to attach
(notify a channel, assign from a queue, call an external system) or a second consumer of the move;
until then an Action type would be an extra declaration around one `status` field.

## Not in this version

Time-axis and event badges, notifications, action types, rule proposals, inference, cross-model
subjects. See `tmp/plan/metric-reconciliation-plan.md` for the current scope and
`tmp/plan/rules-events-vision.md` for why these are deliberately deferred.
