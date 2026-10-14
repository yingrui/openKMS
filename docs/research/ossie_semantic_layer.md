# Apache Ossie (semantic layer) — research

Research note on **Apache Ossie (incubating)** — the vendor-neutral semantic-data standard previously known as **Open Semantic Interchange (OSI)** — and how it maps to openKMS's data layer. Fetched from `ossie.apache.org` and `github.com/apache/ossie` (`core-spec/spec.md`).

**Why it matters:** Ossie standardizes exactly what our Data layer is building (datasets, relationships, metrics, dimensions) plus an explicit **AI context** for agent grounding — and it is the interchange format BI/AI tools are converging on.

**Status:** research only — no code chosen. Informs [Data layer plan](../features/data-layer.md) and the eventual metrics/semantic design.

---

## What Ossie is

| | |
|---|---|
| Project | **Apache Ossie (incubating)** — formerly **Open Semantic Interchange (OSI)** |
| License | **Apache 2.0** (vendor-neutral, ASF) |
| Format | Declarative **YAML** semantic model |
| Spec | `github.com/apache/ossie` → `core-spec/spec.md`; site `ossie.apache.org` |
| Goal | One vendor-neutral source of truth for **metrics, dimensions, and relationships**, exchanged across analytics/AI/BI platforms |

Positioning: *"Stop redefining Revenue in every dashboard… write once, query anywhere"* — declarative YAML; AI-ready context; no vendor lock-in.

---

## Core classes

| Class | Purpose |
|-------|---------|
| **Semantic Model** | Top-level container: datasets, relationships, metrics |
| **Datasets** | Logical business entities (fact/dimension); fields, structure |
| **Fields** | Row-level attributes for grouping, filtering, metric expressions |
| **Dimensions** | Categorical attributes (where/when/who) |
| **Metrics** | Aggregate calculations spanning multiple datasets |
| **Relationships** | Foreign-key constraints connecting datasets (simple + composite keys) |
| **`ai_context`** | Per-entity LLM context: `instructions`, `synonyms`, `examples` |

---

## Authoritative shapes (spec `0.2.0.dev0`)

Read from `github.com/apache/ossie` → `core-spec/{spec.md,spec.yaml,ossie-schema.json}` (Apache-2.0).

- **The document is flat** (exactly one model per document); required `version` + `name` + `datasets`:
  `version, name, description?, ai_context?, datasets[], relationships[], metrics[], custom_extensions?`.
  The `semantic_model:` array wrapper is the **old** shape — `0.2.0.dev0` **rejects** it.
- **Dataset** — required `name`, `source`; optional `primary_key[]`, `unique_keys[[]]`, `description`, `ai_context`, `fields[]`, `custom_extensions`.
- **Field** — required `name`, `expression` (`{dialects:[{dialect, expression}]}`, **scalar**); optional `dimension`, `label`, `description`, `datatype`, `ai_context`, `custom_extensions`. **No `column`, no `entity`.**
- **Dimension** — **`{is_time: boolean}`** only. It is a *role* flag (independent of `datatype`); it defaults to `true` when `datatype ∈ {Date, Time, DateTime, DateTimeTz}`. **No `type` / `granularity` / `timezone`.**
- **Relationship** — required `name`, `from` (many), `to` (one), `from_columns[]`, `to_columns[]`; optional `ai_context`, `custom_extensions`. **No `required`.** Order-aligned, composite OK.
- **Metric** — required `name`, `expression` (**aggregate** fragment); optional `description`, `datatype`, `ai_context`, `custom_extensions`. **No `type` / `base_dataset` / `filters` / `joins`.**
- **Expression** — `{dialects: [{dialect, expression}]}`; `dialect ∈ {ANSI_SQL, SNOWFLAKE, MDX, TABLEAU, DATABRICKS, MAQL, BIGQUERY, SIGMA, THOUGHTSPOT, DAX, HOLISTICS_AQL, OSSIE_SQL_2026}` (`OSSIE_SQL_2026` is the only dialect whose semantics the spec defines).
- **DataType** (logical enum) — `String, Integer, Decimal, Float, Boolean, Date, Time, DateTime, DateTimeTz, Opaque`.
- **AIContext** — `string` **or** `{instructions, synonyms[], examples[]}`.
- **CustomExtension** — `{vendor_name, data}` (`data` is a **JSON string**); the spec's only extension mechanism.

## Where openKMS deviates (✅ fixed — core shapes now spec-exact)

| openKMS (was) | Spec | Resolution |
|---------|------|-----|
| document wrapped in `semantic_model: […]` | **flat** document (`version`/`name`/`datasets`/**) | ✅ export is flat |
| `dimension: {type: time\|categorical, granularity, timezone}` | `dimension: {is_time}` | ✅ `{is_time}` (granularity is a **query-time** choice) |
| field `entity: {type, name}` | *(not in the spec)* | ✅ dropped |
| metric `base_dataset` / `type` / `filters` / `joins` | *(not in the spec)* | ✅ in `custom_extensions` |
| relationship `required` | *(not in the spec)* | ✅ in `custom_extensions` |
| field `column` (physical column ref) | *(not in the spec)* | ✅ in `custom_extensions` |
| `datatype` = ontology types (`string`/`number`/…) | `DataType` enum | ✅ mapped to the enum |
| field `expression` nullable | **required** | ✅ always emitted |

### Datasets

`name`, `source` (physical `db.schema.table` or query), **`primary_key`** (simple/composite), **`unique_keys`** (array of arrays), `description`, `ai_context`, `fields`, `custom_extensions`.

### Relationships (foreign keys)

`name`, **`from`** (the **many** side), **`to`** (the **one** side), `from_columns` (FK columns), `to_columns` (PK/unique columns), `ai_context`. Simple + **composite** keys; column order must correspond.

```yaml
- name: order_lines_to_products      # order_lines.product_id = products.id AND variant
  from: order_lines                 # many
  to: products                      # one
  from_columns: [product_id, variant_id]
  to_columns: [id, variant_id]
```

**No explicit cardinality field** — a relationship is inherently **many → one** (FK). 1:1 = FK on a `unique_key`; **M:N = two FK relationships through a junction Dataset** (the junction *is* a dataset). This matches the earlier openKMS conclusion: M:N is not a primitive.

### Metrics

Defined at the **semantic-model level** (not per-dataset) and **may span multiple datasets**. `name`, **`expression.dialects`**, `description`, `datatype`, `ai_context`.

```yaml
- name: avg_orders
  expression:
    dialects:
      - dialect: ANSI_SQL
        expression: SUM(orders.amount) / COUNT(DISTINCT customers.id)
  ai_context: { synonyms: ["Order Average by customer"] }
```

**Expressions are SQL strings per dialect** (ANSI_SQL default). Dialects: ANSI_SQL, SNOWFLAKE, BIGQUERY, DATABRICKS, MDX, DAX, TABLEAU, THOUGHTSPOT, MAQL, SIGMA, HOLISTICS_AQL, **OSSIE_SQL_2026** (the only dialect whose semantics the spec defines).

---

## Mapping to the openKMS data layer

| Ossie | openKMS today | Gap |
|-------|---------------|-----|
| Semantic Model | `GET /api/semantic-models/{id}/export` (Ossie document) | **resolved** — named container (list + scope) + JSON/YAML export + import |
| Datasets (`source`, `primary_key`, `unique_keys`, `fields`, `ai_context`) | `datasets` (`schema_name.table_name`, `primary_key_columns`, metadata) | missing **`unique_keys`**, **`ai_context`** |
| Relationships (`from` many / `to` one / columns, composite) | `dataset_joins` (`from`/`to`/`from_columns`/`to_columns`/`required`) | **resolved (Stage 1)** — FK direction + composite columns |
| Metrics (`expression.dialects`, model-level, cross-dataset) | `metric_definitions` (aggregation + column + filters + joins + dimensions, **per dataset**) | **decided** — adopt Ossie `expression.dialects` (decision #13); per-dataset DSL replaced in Stage 4 |
| Dimensions | `dimensions` field on metrics | no first-class dimension objects |
| `ai_context` | — | **missing** |

---

## Tensions and decisions to make

1. **Metrics: restricted DSL vs Ossie SQL expressions.** **Resolved — decision #13 now adopts Ossie SQL expressions** (`expression.dialects`), dropping the custom DSL: expressions are pre-configured aggregate **fragments** (not full statements), executed **read-only with timeout + row cap**; the data-source credential is the privilege boundary. (Earlier options — DSL+export / Ossie expressions / hybrid — **B** chosen.)
2. **Relationships semantics.** **Resolved — Stage 1 shipped:** `from` = many (FK holder), `to` = one, `from_columns`/`to_columns` (composite), `required`; `cardinality` dropped. Fixed the direction-UX problem and confirms **M:N = two FKs via a junction dataset**.
3. **Cross-dataset metrics imply join traversal.** Ossie metrics span datasets via relationships → our metric engine inherently needs to traverse join chains (the earlier "multi-hop" question), not just single-hop.
4. **AI context is a first-class field.** `instructions` / `synonyms` / `examples` on model/datasets/metrics is precisely "data as knowledge for agents" — high value, low cost.

---

## Recommendation

**Align to Ossie as the interchange target.**

1. **Add `ai_context`** (instructions/synonyms/examples) to datasets and metrics — directly serves agent grounding.
2. **Add `unique_keys`** to datasets; keep `primary_key_columns`.
3. **Re-model relationships as FK edges** — ✅ shipped (Stage 1).
4. **Emit Ossie YAML** for the data layer (read/export) — ✅ shipped (`GET /api/semantic-models/{id}/export`, JSON/YAML); import via `POST /api/semantic-models/import`.
5. **Decide the metrics strategy** — ✅ decided: Ossie SQL expressions (Stage 4).

**Supply chain:** Apache Ossie is **Apache 2.0, ASF-incubating, vendor-neutral** → fits the project's "mainstream + supply-chain-safe / China-friendly" criteria (see [Data grid selection](data_grid_selection.md)).

## Impact on the existing plan

| Plan item | Change |
|-----------|--------|
| Decision #2 (joins → ER) | re-model as **FK edges** (from/to + columns), not cardinality — ✅ Stage 1 |
| Decision #13 (declarative DSL, no arbitrary SQL) | **changed** — metrics are Ossie SQL expressions |
| Data model | add `unique_keys`, `ai_context`; consider a semantic-model container for export |

## Open questions

- ~~Metrics: DSL-only, Ossie-expression, or hybrid?~~ (decided: Ossie SQL expressions)
- ~~Do we **export-only** Ossie YAML, or also **import** someone else's Ossie model into our datasets/relationships?~~ (both shipped: export + import)
- Adopt `OSSIE_SQL_2026` (the fully-specified dialect) for portability, or ANSI_SQL?
- Is `ai_context` authored by users, generated by agents, or both?
