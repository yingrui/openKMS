# Model tab — semantic model design (Apache Ossie)

Design for the Catalog app's **Model** tab and for how **dataset relationships** feed the semantic model, based on the **Apache Ossie** semantic-model spec (`semantic_model` → `datasets` + `relationships` + `metrics`) and the dbt Semantic Layer OSI document (`semantic_models[]` / `metrics[]` / `saved_queries[]`).

Companions: [Ossie research](../research/ossie_semantic_layer.md) · [Data layer plan](data-layer.md) · [Design notes](data-layer-design-notes.md)

---

## Ossie in one line

An Ossie **semantic model** is a YAML document: **`datasets`** (physical source + keys + fields) + **`relationships`** (foreign keys) + **`metrics`** (aggregations) — with an **`ai_context`** on every entity. The **Model tab authors exactly this document**.

| Ossie class | Model tab concept |
|-------------|-------------------|
| Semantic Model | the whole data layer (one model) |
| Datasets (`source`, `primary_key`, `unique_keys`, `fields`, `ai_context`) | our `datasets` (physical) + semantic annotations |
| Relationships (`from` many → `to` one, `from_columns`/`to_columns`, composite) | our dataset relationships (replaces `dataset_joins`) |
| Metrics (model-level; `expression.dialects`; `datatype`; `ai_context`) | our metrics (model-level, cross-dataset) |
| Dimensions / Fields | field dimension role (`dimension.is_time`) |
| `ai_context` | LLM grounding (instructions / synonyms / examples) |

---

## Relationship model (the core change)

`dataset_joins` is re-modelled as Ossie foreign keys (**✅ Stage 1 shipped**; the table keeps its historical name). Old `source` / `target` / **`cardinality`** / `join_columns` are replaced:

| Field | Meaning | Replaces |
|-------|---------|----------|
| `name` | unique relationship id | `name` |
| `from` | dataset on the **many** side — **holds the FK** | `source_dataset_id` |
| `to` | dataset on the **one** side — referenced key | `target_dataset_id` |
| `from_columns` | FK columns (ordered) | `join_columns[].source` |
| `to_columns` | referenced key columns (same order) | `join_columns[].target` |
| **`required`** | optionality: `false` = LEFT (keep unmatched anchor rows, default) / `true` = INNER (only matched rows) | **our extension** |
| `ai_context` | optional | — |
| ~~`cardinality`~~ | **removed** — a FK is many→one | `cardinality` |

Rules (from the spec):
- `from_columns` / `to_columns` are **order-aligned** and the **same length**; multiple pairs = **composite** FK.
- `to_columns` should be the `to` dataset's `primary_key` (or a `unique_key`).
- **Cardinality is derived, not stored:**
  - **1:N** — the default (FK on the many side).
  - **1:1** — the `from_columns` also form a unique key on the `from` dataset.
  - **M:N** — **two relationships through a junction dataset** (the junction is itself a dataset): `A → J` and `B → J`. No `many-to-many` type.
- **Direction is deterministic**: the **FK holder is `from`**. The UI asks "does *this* dataset hold the FK (from) or is it referenced (to)?" — replacing the current cardinality/position juggling.
- **Uniqueness of the `to` columns is checked, not assumed.** A relationship is only many-to-one if the `to` columns are unique: otherwise joining it multiplies rows, and every metric built on it is silently larger. When the target declares a primary key or a unique key, the `to_columns` must be one of them. When it declares nothing, the check runs against the dataset's profile (`distinct_count` vs `row_count − null_count`) and a dataset with no profile is refused (`refresh the dataset's statistics first`) — the save is a refusal, not a warning, because a wrong join is invisible afterwards.
- **Optionality is our extension — not left/right/full.** Ossie's relationship is a bare FK (there the SQL join type is a *query-time* choice). We store one boolean, **`required`**: `false` → LEFT (keep unmatched anchor rows, default), `true` → INNER (only matched rows). We deliberately dropped `right`/`full` — `right` ≡ a swapped `left`, and the query anchor fixes which side is the anchor, so an edge-level `right` was a footgun. This still distinguishes a **data relationship** from an ontology **LinkType** (a purely semantic link).

### How relationships drive the semantic model

```
datasets  ──(primary_key / unique_keys)──►  relationship.to
   │  (fk columns)                            ▲
   └─────────────► relationship.from ─────────┘
                        │
              the join graph the semantic layer walks
              to resolve **cross-dataset metrics**
```

- A relationship is the **only** way the semantic layer can combine two datasets → **no cross-dataset metric without it**.
- The `to` side being a **key** makes the join unambiguous (cardinality is implied).
- Composite relationships let a metric join on composite keys (e.g. `ts_code, trade_date`).
- M:N analysis = two relationships through the junction; the metric engine walks the chain (`base → J → B`) — the "multi-hop" question is now *inherent* to the Ossie model, not optional.

---

## Model tab functionality

The **shared base** (datasets, their physical columns, relationships) lives in **Catalog**. The **Model** tab holds **semantic models** — **named scopes** over that base, each owning its **fields** and **metrics** (plus dataset membership and `ai_context`). The tab is a **list → model detail**; a model shows its **metrics** (primary) and its **fields**. Sections:

### 1. Overview
- **Model health**: counts of datasets, relationships, metrics; quality failing; **datasets without a primary key** (a relationship/`to` problem); **orphans** (no relationships).
- **ER graph** lives under **Catalog** (the datasets' home): the Catalog list has a **List / Map** toggle; Map shows datasets as nodes and **relationships as directed FK edges (many → one)**; click a node → open the dataset.

### 2. Relationships
- Create/edit a relationship in the **Catalog** — dataset detail → **Relationships** (one side fixed to the current dataset), or the whole graph in the Catalog **Map** view: **from (many)** dataset, **to (one)** dataset, **column pairs** (ordered, add/remove for composite), **required** (optional vs required match), name, `ai_context`.
- **Validation inline**: column existence; composite lengths; `to_columns` must be the target's primary key or a declared unique key (when declared).
- Direction is a simple choice: *"this dataset holds the FK (from)"* vs *"this dataset is referenced (to)"*.
- Not a **LinkType**: a data relationship carries **optionality** (`required`) and targets physical tables; a LinkType is a semantic object-type link with none.

### 3. Metrics
- **Model-level** aggregate **expressions** (metrics span datasets via relationships; not per-dataset). ✅ Stage 4.
- Author: name, **definition/description**, `expression` (an aggregate over fields/measures — e.g. `SUM(orders.amount)`), `datatype`, **`additivity`**, `ai_context`. The list is **definition-only** (edit/delete) — running happens in the **Playground**; each run is read-only (timeout + row cap) and audited (`metric_runs` — the audit is served by the API/skill, the Playground does not surface it).
- **No dimensions here**: in Ossie a *dimension* is a **field role**; grouping is a **consumption** concern. The metric itself is a **SQL expression** (§Metrics below).
- **`additivity` replaces a metric "type".** The old `simple | ratio | derived | cumulative | conversion` label was exported and never read — it could not change a single thing the system did. `additive | non_additive` does: a ratio, a rate or a per-unit number must be **recomputed at the target grain**, never summed. The value reaches agents (`get_semantic_model_tool` → `additivity`) and the prompt says so in words, because "sum of monthly fulfilment rates" is a correct-looking wrong answer that no schema can catch afterwards.
- **An average is never additive.** `AVG(wos_after)` per scenario cannot be summed into a total, so a mean declared `additive` is refused at save (`An average cannot be added across groups`). This is the one contradiction a machine can see, and it is a lint rather than a proof: a mean written as `SUM(a) / COUNT(b)` passes. Verified on real metrics — 平均分货后 WOS and 分货后平均合理率 were both declared additive and are now non-additive.
- **A derived metric is a shape, not a kind.** The expression names other metrics — `{{分货额度}} / NULLIF({{预测需求}}, 0)` — and the engine **inlines** them (`SUM(allocated_qty) / NULLIF(SUM(forecast_qty), 0)`), so a denominator is defined once. The dependency is read off the expression (`depends_on` in the API), never stored beside it; a component must sit on the same base dataset and its relationships must be a subset, or the save is a 400 (`Circular metric reference` / `another dataset` / `relationship(s) this metric does not join`). Deleting the concept of "metric type" is what makes this safe: there is one expression, one graph, one place to be wrong.
- **Dialect:** every expression is labelled `ANSI_SQL` (decision #25) — our datasets are PostgreSQL-only, so fragments may use PostgreSQL syntax and are then not portable.
- **Anchor:** the core spec has no `base_dataset` (its engine derives the `FROM`/joins from the expression). Ours keeps an explicit anchor in the `OPENKMS` `custom_extensions`; deriving it is deferred to the agent auto-query phase (decision #24).

### 4. Fields (model-scoped) & Datasets (shared)

**A metric's field scope = its base dataset + the datasets it joins.** A relationship a metric declares is not only SQL: it makes the joined dataset's fields addressable by `group_by`/`filters`, which is what "P/E by industry" needs (the metric lives on `daily_basic`, `industry` on `stock_basic`). Resolution: by id first; by name with the **base dataset winning** a shared name (`ts_code`), and a 400 (`QUERY_AMBIGUOUS_FIELD`) when two joined datasets share one — those are addressed by id.
- **Where they live:** in the UI, fields sit **under their dataset** (Model → **Datasets** → a dataset → its fields), mirroring the spec's `datasets[].fields[]`; **Datasets** and **Relationships** are shown as the *referenced* catalog facts (read-only, with links), since the model owns fields/metrics and merely references datasets/relationships.
- **Fields** (✅ Stage 3): a field belongs to **one model** and references a dataset in its scope — a **column reference** or a **computed expression**, plus `datatype` (the `DataType` enum), `label`, `description` and `ai_context`. A field may carry the Ossie **`dimension`** (`{"is_time": boolean}` **only**) — a time-dimension *role*, independent of `datatype`; omitted it follows `datatype`. Added **explicitly** (a field marks a time dimension / adds AI context — it is not a mirror of every column); a field's dimension/`ai_context` can **differ per model**. Narrowing the model's dataset scope **drops the removed datasets' fields** (and is **blocked** while a metric still uses one).
- **The only dimension property is the time role.** The spec models `dimension.is_time` and nothing else — no `is_dimension`/`measure`. A field is a *row-level attribute* (grouping, filtering, metric expressions); the UI therefore reports **Time dimension** (yes/auto/–) rather than calling every non-time field a dimension. The flag is **tri-state** — omitted follows `datatype` (temporal ⇒ time dimension), `true` forces it (e.g. an `Integer` year grain), `false` opts a temporal column out (e.g. an audit `created_at`). The core spec has **no `categorical` flag, no `granularity`/`timezone`, no `entity`** on a field; `datatype` (type) and `is_time` (role) are independent axes.
- **Columns** live with the dataset (**Catalog → dataset → Columns**): the physical columns (from `information_schema`) + a maintained **`description`** per column (`dataset_columns`). A **field** is the model-scoped semantic projection of a column (or a computed expression).
- The **Ossie `datasets`** section of a model's document: `source` (a dotted string), `primary_key`, `unique_keys`, **`columns`** (with descriptions), **`fields`** (the model's), `ai_context`.

### 5. Playground
**Time is a field role, never a metric property.** The spec's metric has six fields — `name`, `expression`,
`description`, `datatype`, `ai_context`, `custom_extensions` — and none of them is a period, a grain or a
calendar. What it does define is a **time dimension**: a field with `dimension: {is_time: true}`, defaulting
from a temporal `datatype` and overridable (an `Integer` year or a `"Q1"` string can be a time dimension; an
audit `created_at` opts out). Grain is a *consumption-time* choice — `GROUP BY` is "controlled by grain
specification", and `expression_language.md` calls grain calculations a future proposal. Whole-model grain is
expressed as a field with a `DATE_TRUNC(...)` expression plus `is_time`.

So "this run covers 2026-W46" is not a metric fact at all: it is a **filter on the time dimension** at query
time. A metric therefore carries only `time_dimension` — the *field* it is measured along, and the default a
rule's period argument points at — which travels in `custom_extensions` on export, because the spec has no
place for it. Whether a run filters by it, and which period it filters, is the rule's decision.

**A time dimension declares a calendar.** `dimension.is_time` says *that* a field is a time dimension; it does
not say what one period is. The field now also carries `period_kind` — `day` / `week` / `month` / `quarter` /
`year` / `custom` — and, for `custom`, a `period_format` (the label's shape). A **period** is one instance of
that calendar, and a run's filter is compiled in the field's own vocabulary:

| field | calendar | a run for 2026-W46 filters |
|---|---|---|
| `trade_date` (Date) | `week` | `trade_date >= 2026-11-09 AND <= 2026-11-15` (ISO week, Monday) |
| `cycle` (String) | `custom` | `cycle = '2026-W46'` — the label *is* the period; converting it to dates would compare incomparable values |
| `month_id` (Integer) | `month` | `month_id = 202611` |

Labels are validated against the calendar before they reach SQL, so `2026-11-09` against a week dimension is
a 422 naming the expected format, not an empty result. `custom` is explicit about what we do not know: no
derived previous period, no arithmetic — a fiscal or allocation cycle needs a calendar table, which we do not
have yet.

Since the spec's `dimension` allows only `is_time`, `period_kind`/`period_format` travel in the field's
`custom_extensions` and are read back on import.

**Worked example (分货, 2026-W46).** Three metrics on one base dataset (`allocation_lines`) say more than a paragraph:

| metric | expression | additivity | value |
|---|---|---|---|
| 分货额度 | `SUM(allocated_qty)` | additive | 128,273 |
| 预测需求 | `SUM(forecast_qty)` | additive | 201,912 |
| 分货满足率 | `{{分货额度}} * 1.0 / NULLIF({{预测需求}}, 0)` | **non-additive** | 0.635292 |
| 分货缺口 | `{{预测需求}} - {{分货额度}}` | additive | 73,639 |
| 分货缺口率 | `{{分货缺口}} * 1.0 / NULLIF({{预测需求}}, 0)` | **non-additive** | 0.364708 |

Two facts hold by construction, not by convention: `满足率 = 额度 / 需求`, and `缺口率 = 1 − 满足率` (grouped by `scenario_id`: 0.692301 + 0.307699 = 1, 0.578793 + 0.421207 = 1). The denominator is defined once — edit 预测需求 and all four derived numbers move together, because the expression *is* the dependency, and the API reports it (`depends_on: 分货缺口, 预测需求`).

Two traps the example exposed, both now recorded: `(SUM(forecast_qty) - SUM(allocated_qty)) / SUM(forecast_qty)` with integer columns returns **0** (Postgres truncates), so a ratio needs `* 1.0`; and the demo rules layer reads the same definitions — `分货额度错配` evaluates six scenario groups and fails all six, which is what a reconcile check looks like once the metric is a definition rather than a sentence in a spreadsheet.

- **Playground** is its own route (`/data-model/{id}/playground`) and a **nav item** of the model's entity shell. Three modes: **Builder** (metric + group-by + structured filters), **Advanced** (`expression` / `where` / `having` on `/query`), **SQL Lab** (free SELECT on `/sql`). Ad-hoc and read-only: it saves nothing (a kept answer belongs in Data Insights), it draws no charts (the Explorer does) and it has no pivot. Builder/Advanced specs travel in `?q=` (+ `?mode=`); SQL stays in the editor. The metric's **definition** is one disclosure away in Builder. Time dimensions aggregate with `date_trunc('<granularity>', …)`, the **granularity chosen at query time**.
- It returns the rows **and the generated SQL**. Saving a query is a **consumption** concern → **Data Insights** (`saved_queries` was removed).

### 6. Export / Import (Ossie) ✅
- **Export / Import are per model**, on the model's **Settings** tab — an interchange *output*, not the primary action; the model is built by configuration above.
- **Export** one semantic model as a **flat Ossie document** (core spec `0.2.0.dev0`): `version`, `name`, `description?`, `ai_context?`, `datasets[]`, `relationships[]`, `metrics[]` — plus a tiny `OPENKMS` `custom_extensions` **on the few entities that need one** (never a document-level blob). A dataset's `source` is a dotted string; a field's `expression` is `{dialects:[{dialect, expression}]}` (scalar) with `dimension: {is_time}`; a metric's is an aggregate fragment. A relationship is `from`(many) → `to`(one) with ordered `from_columns`/`to_columns`. JSON or YAML via `GET /api/semantic-models/{id}/export`.
- **Import** (`POST /api/semantic-models/import`) **upserts** the flat document + its fields/metrics over datasets matched by id/source/name; datasets are not created.

**openKMS extension** — the spec allows `custom_extensions` on each Dataset/Relationship/Metric/Field, so whatever the core shape cannot carry sits **next to the thing it describes** rather than in one opaque blob. We emit only:

| On | `data` | Why |
|----|--------|-----|
| Dataset | `{"columns": {"<col>": "<description>"}}` | physical-column notes are Catalog-owned; the spec's `fields` are model-scoped |
| Relationship | `{"required": true}` | INNER vs LEFT — the spec has no such field (false is our default, so it is omitted) |
| Metric | `{"base_dataset": "…", "joins": ["…"], "additivity": "non_additive"?, "depends_on": ["…"]?}` | the FROM/join anchor — the spec derives it from the expression (decision #24) |

No stable ids: everything is referenced **by name** (`source` for datasets), so a round-trip matches by name and an import into another instance creates the entities. The exported document is validated against the vendored [`ossie-schema.json`](../research/ossie/spec.md).

---

## A dataset's tab reconciles the table with the model

The model has **no Fields tab** of its own: a field belongs to a dataset (its columns, its AI context),
so it is authored — created and edited — in that dataset's panel under **Datasets**. That panel now
also does what only it can:

- **re-reads the table's columns** on demand and says what moved (`＋2 / −1`), because a source table
  gains and loses columns without telling us. **Columns only**: the profile — row counts, per-column
  statistics, the schema-history snapshot — is heavier and has its own home in the Catalog's Columns
  tab (reading this table's 19 columns is instant; profiling its million rows took seven seconds,
  measured);
- **reconciles columns against fields** (`fieldCoverage`, pure): columns no field references — with a
  one-click "add them as fields", typed from the column's own type and time role — and fields pointing
  at a column the table no longer has, which is otherwise silent breakage.

The block appears only when there is something to reconcile. On the Stock model today it is invisible
(4 + 17 + 19 columns, 40 fields, no drift) — which is the state it exists to keep.

## Data model changes

Authoritative, staged list: [refactoring plan](data-layer.md#refactoring-plan). At spec level: `datasets` gains `unique_keys` + `ai_context` (✅ Stage 2); **`dataset_joins`** re-modelled as an FK (✅ Stage 1); **`semantic_model_fields`** are model-scoped (✅ Stage 3, revised) + **`dataset_columns`** (column descriptions); `metric_definitions` is model-level with no `dimensions` (✅ Stage 4) + **`metric_runs`** audit; **`semantic_models`** + membership are first-class; **Ossie export/import** per model (✅ Stage 6); **`saved_queries`** removed (decision #23).

---

## Metrics — Ossie SQL expressions (✅ decided + shipped)

Metrics use **Ossie `expression.dialects`**: an **aggregate SQL fragment** per dialect, authored by data engineers (AI-assist may draft it). Ossie expressions are **not full statements** — the engine wraps them into a generated query:

```sql
SELECT <metric expression> AS value
FROM <base dataset> <relationships…>
WHERE <filters> LIMIT <row cap>
```

- **No custom DSL** (decision #13) — a smaller system, and the same expressions an agent can later generate.
- **Guardrails:** execute in a **read-only transaction** with a **statement timeout** and a **row cap**; audit each run. The data-source credential is the privilege boundary.
- **Fields** likewise use `expression.dialects` (scalar, no aggregation).

---

## Open questions

- `ai_context`: authored by users, generated by agents, or both?
- Do we **import** external Ossie models, or export-only for v1?
- Where do **saved queries** live — Model tab, or Data Insights?
