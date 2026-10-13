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

Today `dataset_joins` stores `source` / `target` / **`cardinality`** / `join_columns`. **Ossie relationships are foreign keys**, so we re-model to match:

| Field | Meaning | Replaces |
|-------|---------|----------|
| `name` | unique relationship id | `name` |
| `from` | dataset on the **many** side — **holds the FK** | `source_dataset_id` |
| `to` | dataset on the **one** side — referenced key | `target_dataset_id` |
| `from_columns` | FK columns (ordered) | `join_columns[].source` |
| `to_columns` | referenced key columns (same order) | `join_columns[].target` |
| **`join_type`** | SQL join type the metric engine uses: `left` (default) / `inner` / `right` / `full` | **our extension** |
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
- **Join type is our extension.** Ossie's relationship is a bare FK (there the SQL join type is a *query-time* choice); we store a **default `join_type`** per relationship (the metric engine uses it; a metric may override) and export it under Ossie `custom_extensions`. This is exactly what distinguishes a **data relationship** from an ontology **LinkType** — a LinkType is a *semantic* link with **no** join type.

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

The Model tab is the **authoring + governance surface of the semantic model**. Sections (top-level tabs within it):

### 1. Overview
- **ER graph**: datasets as nodes, **relationships as directed FK edges (many → one)**; click a node → open the dataset.
- **Model health**: counts of datasets, relationships, metrics; quality failing; **datasets without a primary key** (a relationship/`to` problem); **orphans** (no relationships).

### 2. Relationships
- List + create/edit a relationship: **from (many)** dataset, **to (one)** dataset, **column pairs** (ordered, add/remove for composite), **join type** (`left` default / `inner` / `right` / `full`), name, `ai_context`.
- **Validation inline**: `to_columns` must be a PK/unique key; column existence; composite lengths.
- Direction is a simple choice: *"this dataset holds the FK (from)"* vs *"this dataset is referenced (to)"*.
- Not a **LinkType**: a data relationship carries a **join type** and targets physical tables; a LinkType is a semantic object-type link with none.

### 3. Metrics
- **Model-level** aggregate **expressions** (metrics span datasets via relationships; not per-dataset).
- Author: name, **definition/description**, `expression` (an aggregate over fields/measures — e.g. `SUM(orders.amount)`), `datatype`, `ai_context`.
- **No dimensions here**: in Ossie a *dimension* is a **field role on a dataset**; “group by” is a **query** concern (see §5). See the metrics-strategy decision below (DSL vs Ossie SQL expression).

### 4. Datasets (Ossie `datasets`)
- The Ossie **`datasets`** section: each physical dataset's **semantic entry** — `source` (the table), `primary_key`, `unique_keys`, **`fields`** (column refs **+ computed expressions**, each with `datatype`, `dimension.is_time`, `ai_context`), `ai_context`.
- **Fields ≠ columns:** the Catalog's Columns tab is the *physical* column list; a **field** adds an expression (e.g. `first_name || ' ' || last_name`) and roles — a **dimension** is a field with `dimension.is_time` (categorical / time). Fields are edited here.
- These are the *same* datasets the **Catalog** holds; the Model tab edits the **semantic** layer, the Catalog edits the **physical** layer (register/ingest/profile/preview/row editing/quality).

### 5. Queries (saved queries)
- A **query** picks metrics + **`group_by` dimensions** + `where` (Ossie `saved_queries`) — **this** is where dimensions are chosen, *not* on the metric.
- Saved as a named artifact; may export as a view/table (manifest `exports`). v1: Data Explorer reports play this role.

### 6. Export / Import (Ossie)
- **Export** the semantic model as **Ossie YAML** (`semantic_model: {datasets, relationships, metrics}`) — interoperability + governance artifact; no runtime dependency.
- **Import** an Ossie document to seed datasets/relationships/metrics.

---

## Data model changes

Authoritative, staged list: [refactoring plan](data-layer.md#refactoring-plan) (Stages 1–6). At spec level: `datasets` gains `unique_keys` + `ai_context`; new **`dataset_fields`**; `dataset_joins` → **`relationships`** (FK + `join_type`); `metric_definitions` becomes model-level with no `dimensions`; new **`saved_queries`**.

---

## Metrics strategy — still open

Ossie metrics are **SQL expression strings per dialect** (`expression.dialects`), while openKMS decision #13 chose a **restricted DSL (no arbitrary SQL)** for safety. Options:

| Option | Meaning |
|--------|---------|
| **A. DSL + export** | Author via our restricted DSL; **render** to Ossie SQL on export |
| **B. Ossie expressions** | Adopt Ossie `expression.dialects` as the source of truth (guarded/sandboxed execution) |
| **C. Hybrid** | DSL for the common path; an "advanced" Ossie-expression mode gated by permission |

This decision **blocks** `build_metric_sql` work (currently paused) and shapes section 3 above.

---

## Open questions

- Metrics A/B/C (above).
- `ai_context`: authored by users, generated by agents, or both?
- Do we **import** external Ossie models, or export-only for v1?
- Where do **saved queries** live — Model tab, or Data Explorer?
