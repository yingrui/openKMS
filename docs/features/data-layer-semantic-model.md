# Model tab — semantic model design (Apache Ossie)

Design for the Datasets app's **Model** tab and for how **dataset relationships** feed the semantic model, based on the **Apache Ossie** semantic-model spec (`semantic_model` → `datasets` + `relationships` + `metrics`) and the dbt Semantic Layer OSI document (`semantic_models[]` / `metrics[]` / `saved_queries[]`).

Companions: [Ossie research](../research/ossie_semantic_layer.md) · [Data layer plan](data-layer.md) · [Interaction design](data-layer-interaction.md) · [Implementation design](data-layer-implementation.md)

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
- Author: name, **definition/description**, `expression` (an aggregate over fields/measures — e.g. `SUM(orders.amount)`), `datatype`, `ai_context`. Run read-only (timeout + row cap), audited.
- **No dimensions here**: in Ossie a *dimension* is a **field role**; grouping is a **consumption** concern. The metric itself is a **SQL expression** (§Metrics below).
- **Dialect:** every expression is labelled `ANSI_SQL` (decision #25) — our datasets are PostgreSQL-only, so fragments may use PostgreSQL syntax and are then not portable.
- **Anchor:** the core spec has no `base_dataset` (its engine derives the `FROM`/joins from the expression). Ours keeps an explicit anchor in the `OPENKMS` `custom_extensions`; deriving it is deferred to the agent auto-query phase (decision #24).

### 4. Fields (model-scoped) & Datasets (shared)
- **Fields** (✅ Stage 3): a field belongs to **one model** and references a dataset in its scope — a **column reference** or a **computed expression**, plus `datatype` (the `DataType` enum), `label`, `description` and `ai_context`. A field may carry the Ossie **`dimension`** (`{"is_time": boolean}` **only**) — a time-dimension *role*, independent of `datatype`; omitted it follows `datatype`. Added **explicitly** (a field marks a time dimension / adds AI context — it is not a mirror of every column); a field's dimension/`ai_context` can **differ per model**. Narrowing the model's dataset scope **drops the removed datasets' fields** (and is **blocked** while a metric still uses one).
- **The only dimension property is the time role.** The spec models `dimension.is_time` and nothing else — no `is_dimension`/`measure`. A field is a *row-level attribute* (grouping, filtering, metric expressions); the UI therefore reports **Time dimension** (yes/auto/–) rather than calling every non-time field a dimension. The flag is **tri-state** — omitted follows `datatype` (temporal ⇒ time dimension), `true` forces it (e.g. an `Integer` year grain), `false` opts a temporal column out (e.g. an audit `created_at`). The core spec has **no `categorical` flag, no `granularity`/`timezone`, no `entity`** on a field; `datatype` (type) and `is_time` (role) are independent axes.
- **Columns** live with the dataset (**Catalog → dataset → Columns**): the physical columns (from `information_schema`) + a maintained **`description`** per column (`dataset_columns`). A **field** is the model-scoped semantic projection of a column (or a computed expression).
- The **Ossie `datasets`** section of a model's document: `source` (a dotted string), `primary_key`, `unique_keys`, **`columns`** (with descriptions), **`fields`** (the model's), `ai_context`.

### 5. Try (preview)
- **Try it** is its **own page** (`/data-model/{id}/try`), opened from the model header's **Try it** button — it runs a metric **grouped by fields** (dimensions), ad-hoc and read-only, nothing saved. Time dimensions aggregate with `date_trunc('<granularity>', …)`, the **granularity chosen at query time**; so “P/E per day per stock” = the metric + `group_by` `trade_date` (time) and `ts_code`.
- It returns the rows **and the generated SQL**. Saving a query is a **consumption** concern → **Data Explorer** (`saved_queries` was removed).

### 6. Export / Import (Ossie) ✅
- **Export / Import are per model**, in the model's header overflow menu — an interchange *output*, not the primary action; the model is built by configuration above.
- **Export** one semantic model as a **flat Ossie document** (core spec `0.2.0.dev0`): `version`, `name`, `description?`, `ai_context?`, `datasets[]`, `relationships[]`, `metrics[]`, and an `OPENKMS` `custom_extensions` entry for our internals. A dataset's `source` is a dotted string; a field's `expression` is `{dialects:[{dialect, expression}]}` (scalar) with `dimension: {is_time}`; a metric's is an aggregate fragment. A relationship is `from`(many) → `to`(one) with ordered `from_columns`/`to_columns`. JSON or YAML via `GET /api/semantic-models/{id}/export`.
- **Import** (`POST /api/semantic-models/import`) **upserts** the flat document + its fields/metrics over datasets matched by id/source/name; datasets are not created.

**openKMS extension** (`custom_extensions`, vendor `OPENKMS`) — so the **core shape stays exactly as the spec defines it**, our internals round-trip here instead: stable entity `id`s (Ossie references by name), a metric's `base_dataset` anchor + `filters`/`joins`/`type`, a relationship's `required`, a field's source `column`, and per-column descriptions. The exported document is validated against the vendored [`ossie-schema.json`](../research/ossie/spec.md).

---

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
- Where do **saved queries** live — Model tab, or Data Explorer?
