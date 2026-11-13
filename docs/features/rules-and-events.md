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
| `condition` | One comparison, or `all`/`any` of comparisons. Operands: `{metric}`, `{dataset_agg}`, `{diff:[a,b]}`, `{ratio:[a,b]}`; each may carry the data layer's own `filters` |
| `severity` | `P0` / `P1` / `P2`, the same scale as quality rules |
| `conclusion` / `suggestion` | One sentence each. **A hit with no suggestion does not become an event** |
| `owner` / `status` / `version` | Who owns the opinion, whether it runs, and which revision fired |
| `last_run_at` / `last_status` / `last_values` | Written back by the engine; there is no separate run table |

## Event

A Vertex-style event object: `event_start_time`, `event_end_time` (**empty = still open**),
`intent` (`danger`/`warning`/`primary`/`success`, the colour) and `severity` (the triage level, kept
separate). Plus `period_start`/`period_end` — the **data** period checked, which is not the same thing
as when the event was raised — `scope`, `evidence` (the values that produced it), `rule_id`,
`rule_version`, `subject_type`/`subject_id` and `status`.

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

## Not in this version

Time-axis and event badges, notifications, acknowledge/dismiss as action types, rule proposals,
inference, cross-model subjects. See `tmp/plan/metric-reconciliation-plan.md` for the current scope and
`tmp/plan/rules-events-vision.md` for why these are deliberately deferred.
