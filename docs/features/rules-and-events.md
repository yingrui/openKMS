# Rules and events

The ontology-layer app that turns "these numbers must be consistent" into something the platform
checks. A **Rule** is a condition plus a one-line conclusion; running it produces an **Event** when
the condition holds, and closes that event when it stops holding.

**Positioning:** *A rule is an opinion the platform can execute; an event is that opinion becoming a
thing you can link, triage and cite.* Metrics are the first people to write rules — quality rules,
schema changes and pipeline failures are meant to use the same objects.

**Where it lives:** Ontology (`/ontology-manager/rules`), next to object types, link types, functions
and action types — **not** in Catalog. The dependency runs one way: the ontology layer reads the data
layer (`run_query`, dataset summaries); the data layer never calls into rules.

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

## Rules are not snapshots

A condition must not hard-code one row's id. "This period's allocation is over-allocated" is a statement
about *whichever* scenario you are looking at, so the id belongs to the **run**:

```json
{"metric": "…", "scope_field": "scenario_id"}
```

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
