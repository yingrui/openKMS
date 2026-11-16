# Metric rules and alerts

Catalog's check layer: it turns "these numbers must be consistent" into something the platform runs. A
**rule** watches one metric and states what must hold — an identity with other metrics, or a threshold —
plus a one-line conclusion; running it yields **pass / fail / undecidable** for a period, and a failure that
carries advice opens an **alert** (事件).

**Where it lives:** **Catalog** → **指标勾稽** (`/data-rules`), beside Datasets · Semantic Model · Metrics ·
数据质量. Two tabs: **指标规则** (the rules) and **告警事件** (what they raised). A rule's kind is either
**阈值条件** (a threshold) or **等式** (an identity between metrics) — the app is named for the capability,
so neither of its two kinds carries the same name. Writes need `data:write`
(analysts) or `ontology:write` (admins).

Entry points follow the metric: a metric row carries its check status and a run button; a dataset's own
checks are **quality rules** on the dataset page (a table's shape is not a reconciliation).

---

## The information architecture

A rule has two strings, not one: **name** is the label a rail, a table cell or a breadcrumb can hold
("分货方案与明细勾稽"), and **description** says what holds and why ("每个方案的额度、行数、超上限渠道数、
低于下限渠道数，都要与方案表记录的快照一致"). A single string long enough to explain the check never fits the
places a name has to fit.

The app answers three questions, and each has one page. They are ordered by what an operator does first:
*what is being checked and how is it?* → *which number is wrong?* → *what does this rule claim?*

| Question | Where | What it shows |
|---|---|---|
| What is checked, and how is it? | **指标勾稽 → 指标规则** (`/data-rules`) | One row per rule: name, the subject metric, the check summarised in one line with its kind (等式 / 阈值), severity, the last verdict **and the period it belongs to**, the number of open incidents, and run / pause. Three filters are the questions an operator actually asks: enabled? on fire? ever run? |
| Which number is wrong? | **→ 告警事件** (`?tab=events`) | Incidents, one per rule × scope, grouped by rule, with the evidence inline (each identity's residual, the tolerance, the rule version), filtered by state and severity, actionable (resolve / dismiss) |
| What does this rule claim, and why? | **A rule** (`/data-rules/:ruleId`) | An entity page: the rail carries identity (**name**, `rule_id`, owner, version, severity, enabled) and the four sections below; the **description is the page's subtitle**, and the page's actions (编辑 / 立即运行) sit in the page header — the rail is for who this is and where to go |

A rule is defined in steps, and the page is split the same way — one card per intent, so a reader can find the
field they came to change instead of scrolling one giant form:

| Section | Answers | Read / edit |
|---|---|---|
| **概览** | what does it watch, per what, and is it enabled | subject metric and last run as facts, then the **basic information form** (name, description, rule id, severity, status) |
| **检查内容** | what must hold (every identity, or the threshold) | sentence / editor |
| **运行参数** | which field carries the period, which slice a run may narrow | facts / form |
| **告警内容** | what a reader sees when it fires (conclusion, advice) | facts / form |
| **告警事件** | what actually happened (incidents, evidence, triage) | table, read-only |

"Last run" is not a section: it is part of the verdict's state, shown in the list row and on the event, not a
place to go.

The list page's 规则 / 事件 switch is a **panel-head toggle**, not the settings page's tab bar
(`.settings-page-tabs` is for a routed entity page) — which is what made this app's typography drift from its
siblings (数据集 · 语义模型 · 指标 · 数据质量 all share `page-header` + `.ontology-admin-content`).

Entry points follow the object, never a duplicate list: a metric row carries its check status and a run
button; a dataset's page links to the rules of its metrics. The period a verdict belongs to is part of the
verdict — "pass" without "for which period" is not an answer.

What is still missing from the IA is **run history**: the list shows one last run per rule, and the events
are occurrences, not runs. A rule that passed every week has no rows anywhere, so "why did last week say
one thing" cannot be answered yet — it needs a `rule_runs` table (one row per rule × scope × period, with
status, residual, data watermark and trigger) and the 运行与事件 section to read it.

## Why tables, not objects

Rules and alerts were ontology objects (`Rule` / `Event`, JSONB in `object_instances`, projected to Neo4j).
Nothing ever traversed them as a graph, while the costs were real:

| Cost | Consequence |
|---|---|
| No schema, no foreign keys | A deleted metric left rules pointing at nothing; a separate projection table (`rule_metric_refs`) was needed just to answer "which rules touch this metric" |
| JSON-only querying | Filtering by period or last status meant `data->>` expressions |
| Neo4j in the write path | Evaluation failed when the graph database was down |
| Generic names | `Rule` / `Event` / `/api/rules` would collide with quality rules, business events, audit events |

They are now `metric_rules` / `metric_events` (`app/models/metric_rule.py`), with `metric_id` foreign keys,
`dedupe_key` indexed, and alerts cascading from their rule. The API lives at `/api/metric-rules` and
`/api/metric-events`; the rule→metric reference set is the `metric_rule_metric_refs` table (a real
foreign key, so a referenced metric cannot be deleted — the API turns that into a 409 naming the rules).

A rule has two identifiers: `id` (row identity, used in URLs) and `rule_id` (the slug — `allocation-overcheck`
— unique, generated from the name, and what alerts, logs and exports cite). Changing the slug re-points
future alerts, so treat it like renaming a published API.

## Rule

| Property | Meaning |
|----------|---------|
| `subject` | `{kind: metric, ref}` — the metric the rule watches, and therefore which permissions apply. **A rule's subject is always a metric**: a dataset's shape (row counts, nulls, ranges) is a *quality rule* on the dataset's own page, not a reconciliation |
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
| **Catalog → 指标规则** (`/data-rules`) | Two tabs: **规则** (author, run, pause) and **告警事件** (the inbox: resolve / dismiss, filtered by state and severity) |
| **Run parameters** | Two layers: the rule declares its arguments (a period binding — source, dimension, offset — plus optional `filter` / `key` parameters), and the run supplies their values (`2026-W46`, `2026-11` or `2026-11-15`; anything else is a 422). Both entry points — "run all" and a metric's own play button — use the same dialog, which asks for exactly what the rule declares |
| **One rule** (`/data-rules/:ruleId`, `/data-rules/new`) | A page with two modes: **read** (definition, last run with its computed values, events raised) and **edit** (rule facts / run parameters / check / meaning panels, Save and Cancel in the header). The check needs a page: the stored content is a tree or a list of identities, and the editor is one comparison per line. Creating a rule is the same page in edit mode, so the two cannot drift |
| **A metric** (model → Metrics) | A badge with its open-event count, linking to that metric's events |
| **A dataset** (Catalog → dataset → Overview) | (removed — a rule watches a metric; a table's own checks are quality rules): how many rules watch it, and the three most recent events |

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

A condition answers "is this number in range?". An identity answers a different question: **do these two
numbers agree?** — `分货额度 (明细) = 方案累计额度 (方案表)`, each side computed from its own source, within a
tolerance. That is a reconciliation; an alert would not catch it, because neither number is wrong on its own.

A rule therefore carries **exactly one** of `condition` and `identities` — a threshold, or a list of
equalities (a rule about a snapshot has four of them):

| | condition | identities |
|---|---|---|
| shape | a comparison tree over operands | one or more `target = Σ weight × member` |
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

Why an identity lives on a `Rule` rather than in a type of its own: an identity nobody runs is a comment.
### Several identities in one rule

A snapshot's four numbers (amount, line count, over-max, below-min) belong to one check of one subject. As
four rules they drift apart — four severities, four suggestions, four alerts for one incident, four runs —
so `identities` is a **list**: every identity is judged in the same run, and a scope's verdict is decided
across all of them.

| per scope | verdict |
|---|---|
| any identity violated | `fail` — the event's evidence names which residual is off |
| nothing violated, but some identity could not be computed | `unknown` — "holds" would overstate the evidence |
| all hold | `pass` |

One severity for the whole rule (it is one incident), but each identity may carry its own `suggestion`: the
event's advice is the rule's own sentence plus the advice of the identities that were **violated** — "re-run
the scenario" and "check the over-max threshold" are not the same instruction.

Two identities may not explain the same target metric (`400`): the evidence keys each identity's residual
after its target (`residual:<metric>`), so a second one would overwrite the first number.

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

`POST /api/metric-rules/{id}/evaluate` takes `dry_run: true`. The list-level "run all" has no trial: a trial has
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
| which objects does it describe | — (alerts name their metric; business-object links were removed with the ontology storage) | ⛔ not needed for answering |

`GET /api/metrics` now returns `assertions` per metric — both directions, with the counterpart's *name*, the
tolerance and the last `health`. The skill prints it next to the metric and the prompt draws the line that
matters: **a failing assertion means the number is not verified**, so it may be quoted only together with
that fact and the rule's name; a passing or absent assertion is not worth mentioning.

The distinction the layer keeps: a *definition* edge is structure (the expression already says it, and
checking it would be tautological); an *assertion* edge is a claim about the world, which is what makes an
answer either trustworthy or not.

## What a period is — and what it is not

A period is **one of the run's arguments**, and nothing more: a filter whose `role` is `period`. Its value
(`2026-W46`) filters the run, names the period the verdict belongs to, and gives the event its **interval** —
`2026-11-09 … 2026-11-15` — which is what the alert records and what the dedupe key uses, so the same week
cannot be spelled two ways.

The interval is the only thing a period has beyond a filter, and it comes from the **field's calendar**:

| field | value | predicate | interval |
|---|---|---|---|
| `trade_date` (`Date`, `period_kind: week`) | `2026-W46` | `>= 2026-11-09 AND <= 2026-11-15` | derived by the calendar |
| `cycle` (`String`, `period_kind: week`) | `2026-W46` | `cycle = '2026-W46'` (a key, not a date) | derived by the calendar |
| a field with `period_kind: custom` | anything | equality only | **none** — so it cannot be the period (a 400 at save time) |

There is no metric-level time mode any more. `time_mode` used to say `period` / `snapshot` / `none`, but each
of those was already said by something else: `period` restated the field, `none` meant "no field", and
`snapshot` refused a past period only because the period column could not be filtered. A metric keeps
`time_dimension` — the field it is measured along, and the default a rule's period argument points at.

Ossie has no metric period: the spec's metric is name + expression + description + datatype + ai_context +
custom_extensions, and time exists as a **field role** (`dimension.is_time`), with grain decided at query time.
So the period is a *filter on that field*, and `time_dimension` is our metadata (exported in
`custom_extensions`).

An operand may override the column (`{metric: …, period_field: …}`), because two metrics in one identity can
carry time differently.

### The rule declares its run arguments (`run_params.arguments`)

A run needs a **slice** of data, and a period is only one dimension of it. A dimensional filter ("only
线上") and a narrowed scope set ("only these scenarios") are inputs too. Deriving everything from the metrics
made all of them inexpressible, so a rule declares a list:

```json
{"arguments": [
  {"key": "cycle",    "kind": "filter", "field": "cycle", "role": "period"},
  {"key": "channel",  "kind": "filter", "field": "channel"},
  {"key": "scenario", "kind": "key",    "field": "scenario_id"}
]}
```

| kind | what the run supplies | what it does |
|---|---|---|
| `filter` | a value (`线上`) | appends `field = value` to **every** operand. A check over one channel should not need a second copy of the rule |
| `filter` + `role: period` | a period value (`2026-W46`) | the same, plus: it names the run's period and records the interval its field's calendar derives. At most one argument may carry the role; a field with a `custom` calendar cannot (400) |
| `key` | one or more group values (`S1,S2`) | evaluates only those scopes. This is also how a run gets past the 500-group cap instead of reporting `unknown` for everything |

Validation is at save time, so a declared argument cannot be a lie: a `period` binding must name a real time
dimension (and an `offset` needs a dated one — a custom cycle has no derivable previous period), a `filter`
or `key` must name a field of the subject's model, and a `key` must name the rule's own `group_by.field`.
Arguments are optional unless declared `required`; a required one the run omits stops the run with `unknown`
*before any query* — the numbers are not wrong, they were never asked for.

Values that match nothing are `unknown` with a reason, never silence: a requested scope with no rows, or a
slice where no operand returned a row, is reported as undecidable. A narrowed run also closes alerts **only
within the scopes it examined** — it must not retire an alert it never looked at.

The **period value** stays a run argument: the definition says how the period is used, the run says which
period. The rule page and the run dialog both show the **effective** parameters (`describe_run_params`:
source, offset, which dimensions each operand binds to, the label formats, and warnings such as "the operands
use different calendars, so one label must fit all of them").

Not built, named so it is not rediscovered: `as_of` (evaluate as of an earlier data watermark — needs
versioned storage), metric-definition versions, `sample_size` for record-level checks, and an argument that
differs **per operand** (choosing which scenario is the reconciliation baseline is asymmetric: a uniform
`filter` cannot express it, so it needs operand-level binding).

There is no period table and no close calendar yet: periods are labels with derived dates. That covers offsets
within a calendar, but not 期初/期末 (`stock_flow`, opening vs closing balance) — that needs the calendar table,
together with the `stock_flow` identity.

## Grouping by a field that exists

`group_by.field` is checked against the subject's model fields at save time. An unknown name used to surface at run time as "条件无法判断"
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
`about_object_type`, `group_by.label`, `domain`, and the ontology storage itself). Reasons in the
Catalog plan's deletion list.

**Inference** was removed: a solver and an endpoint, with no consumer (the agent work does not exist yet).
The equation is ~50 lines to re-add when something calls it.

What *is* shipped for reading a number: a metric row shows **一致 / 不一致 / 无法判定 / 未运行 / 未覆盖** from
the rules that reference it, with the period and the reason in the tooltip, and a play button runs exactly
those rules for one period label. A metric with no rule says so (`未覆盖`) instead of looking clean.

**Periods are labels, not objects**: `2026-W46`, `2026-11`, `2026-11-15` are parsed to start/end dates (ISO
weeks, Monday), anything else is a 422. There is no per-period result history yet — `last_*` on the rule is
the latest run, and the run's period is shown next to it.
