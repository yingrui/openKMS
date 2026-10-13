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
| Dimensions / Fields | column annotations (categorical / time) |
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

The Model tab is the **authoring + governance surface of the semantic model** — where it is **configured** (not just imported) — with **Metrics** (and Queries) as the focus. Sections:

### 1. Overview
- **Model health**: counts of datasets, relationships, metrics; quality failing; **datasets without a primary key** (a relationship/`to` problem); **orphans** (no relationships).
- **ER graph** (secondary): datasets as nodes, **relationships as directed FK edges (many → one)**; click a node → open the dataset. **Hidden by default** behind a toggle — it is a *view* of the relationships, not the primary surface.

### 2. Relationships
- List + create/edit a relationship **globally in the Model tab** (both datasets picked here), and per-dataset from a dataset's **Relationships** tab: **from (many)** dataset, **to (one)** dataset, **column pairs** (ordered, add/remove for composite), **required** (optional vs required match), name, `ai_context`.
- **Validation inline**: column existence; composite lengths; `to_columns` must be the target's primary key or a declared unique key (when declared).
- Direction is a simple choice: *"this dataset holds the FK (from)"* vs *"this dataset is referenced (to)"*.
- Not a **LinkType**: a data relationship carries **optionality** (`required`) and targets physical tables; a LinkType is a semantic object-type link with none.

### 3. Metrics
- **Model-level** aggregate **expressions** (metrics span datasets via relationships; not per-dataset). ✅ Stage 4.
- Author: name, **definition/description**, `expression` (an aggregate over fields/measures — e.g. `SUM(orders.amount)`), `datatype`, `ai_context`. Run read-only (timeout + row cap), audited.
- **No dimensions here**: in Ossie a *dimension* is a **field role on a dataset**; “group by” is a **query** concern (see §5). The metric itself is a **SQL expression** (§Metrics below).

### 4. Datasets (Ossie `datasets`)
- The Ossie **`datasets`** section: each physical dataset's **semantic entry** — `source` (the table), `primary_key`, `unique_keys`, **`fields`** (column refs **+ computed expressions**, each with `datatype`, `dimension.is_time`, `ai_context`; ✅ Stage 3), `ai_context` (✅ Stage 2).
- **Fields ≠ columns:** the Catalog's **Fields** tab lists the *physical* columns (with profile); a **field** adds an expression (e.g. `first_name || ' ' || last_name`) and roles — a **dimension** is a field with `dimension.is_time` (categorical / time). Fields are edited here.
- These are the *same* datasets the **Catalog** holds; the Model tab edits the **semantic** layer, the Catalog edits the **physical** layer (register/ingest/profile/preview/row editing/quality).

### 5. Queries (saved queries)
- A **query** picks metrics + **`group_by` dimensions** (fields) + `filters` (Ossie `saved_queries`) — **this** is where dimensions are chosen, *not* on the metric. ✅ Stage 5.
- Saved as a named artifact; may export as a view/table (manifest `exports`).

### 6. Export / Import (Ossie) ✅
- **Export / Import live in the Model header overflow menu** — an interchange *output*, not the primary action; the model is built by configuration above.
- **Export** the semantic model as an **Ossie document** (`semantic_model: {datasets, relationships, metrics, queries}`, JSON or YAML via `GET /api/semantic-model`).
- **Import** (`POST /api/semantic-model/import`) **upserts** relationships/metrics/queries over datasets matched by id/source/name; datasets are not created.

---

## Data model changes

Authoritative, staged list: [refactoring plan](data-layer.md#refactoring-plan) (Stages 1–6). At spec level: `datasets` gains `unique_keys` + `ai_context` (✅ Stage 2); new **`dataset_fields`** (✅ Stage 3); **`dataset_joins`** re-modelled as an FK (✅ Stage 1); `metric_definitions` is model-level with no `dimensions` (✅ Stage 4) + **`metric_runs`** audit; new **`saved_queries`** (✅ Stage 5); **Ossie export/import** (✅ Stage 6).

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
