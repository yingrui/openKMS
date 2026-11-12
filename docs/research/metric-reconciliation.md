# Metric reconciliation (指标勾稽) — market research

Research note on **metric reconciliation**: the identities that must hold *between* metrics — `毛利 = 收入 − 成本`,
`资产 = 负债 + 所有者权益`, `期末余额 = 期初余额 + 本期净增`, `毛利率 = 毛利 / 收入` — and whether treating them as
edges in a graph (rather than prose in a definition) is something the market does, what it is called there, and what an
implementation in our Catalog **Metrics** would have to carry that the existing products do not.

**Why it matters:** the metric layer we ship ([data layer](../features/data-layer.md)) stores each metric as an
independent aggregate expression. Two metrics that must agree are related **only by convention in someone's head** — so an
agent (or a dashboard) can produce two numbers that contradict each other and nothing notices. Reconciliation edges would
turn "these must add up" into something a query engine can **check** and an LLM can **read**.

**Status:** research only — no model, no schema, no code chosen. Companion to
[Apache Ossie semantic layer](ossie_semantic_layer.md), [data layer](../features/data-layer.md) and
[data-query evaluation](../features/data-query-evaluation.md).

---

## 1. Terminology: what is actually being modelled

The Chinese term **勾稽** covers several distinct relations that the English literature splits. Naming them separately is
the first design decision, because they have different validation semantics:

| # | Relation | Example | What must hold | Needs |
|---|----------|---------|----------------|-------|
| R1 | **Total ↔ components** (decompose) | 总资产 = 流动资产 + 非流动资产 | Σ parts = whole, **at one grain** | signed weights, grain |
| R2 | **Difference / derived** | 毛利 = 收入 − 成本 | linear identity | weights |
| R3 | **Stock ↔ flow** (期初/期末) | 期末库存 = 期初 + 入库 − 出库 | integral over a period | **period semantics**, not just weights |
| R4 | **Ratio** | 毛利率 = 毛利 / 收入 | numerator ÷ denominator, and *never* an average of ratios | ratio role (not a weighted sum) |
| R5 | **Cross-source agreement** | 数仓 `revenue` vs 财务系统 `revenue` | equality within tolerance | tolerance, two sources |
| R6 | **Same-as / mapping** | `GMV(新口径)` ≈ `GMV(旧口径)` | equivalence, declared, often one-way | direction, deprecation |

R1–R2 are what a **calculation graph** (XBRL, derived metrics) already does well. R3 is where most real reconciliation
lives and where simple "sum of children" models break. R4 is the one everybody gets wrong: an average of per-day ratios is
not the period ratio, which is why metric layers model ratio metrics with an explicit numerator and denominator rather
than as a formula over results. R5–R6 are the ones **no semantic layer models at all** — they are the gap.

---

## 2. Where reconciliation is already formal and machine-checked: financial reporting

This is the oldest and most rigorous practice, and it is a **graph with weights**.

### 2.1 XBRL calculation linkbase

An XBRL taxonomy carries a `calculationLinkbase` whose `calculationArc`s state, per statement: `Assets =
LiabilitiesAndEquity` (weight `1`), `GrossProfit = Revenues − CostOfRevenue` (weights `1` and `−1`), `NetIncome =
...` — i.e. **edges between reported facts with signed weights**, plus `order` for presentation and `role` for the
statement. Validators (Arelle, and the checks inside every national filing gateway) recompute the identity and raise a
**calculation inconsistency** when submitted figures disagree, typically reported per item with the difference.

Three properties are worth copying:

1. **Weight, not prose** — `+1 / −1` makes the check mechanical.
2. **Context scoping** — an arc applies in a reporting *context* (entity, period, dimension). Our equivalent is metric
   **grain** and **period mode**: `期末 = 期初 + 净增` is true per account per month, not across accounts or years.
3. **Tolerance is a filing-gateway setting**, not a fact of the identity: gateways accept `≤ ε` (often a rounding unit)
   before refusing, because rounding makes exact equality wrong.

Adoption: US SEC EDGAR and EU ESEF require XBRL; 财政部《企业会计准则通用分类标准》 ships the same linkbases for Chinese
filings, and 证监会/交易所 gateways run the same inconsistency checks before accepting a report.

### 2.2 Financial consolidation / EPM (enterprise performance management)

| Product | Mechanism | Checkable | Notes |
|---------|-----------|-----------|-------|
| **Oracle EPM Cloud** (FCCS/EPBCS) | <br>“check rules”, tie-out and validation reports in Data Integration / consolidation | yes — blocks or flags a consolidation | reconciliation is a **process step** with a report, not a query-time assertion |
| **SAP Analytics Cloud** | validation rules on planning models; data actions with post-conditions | yes, at save/submit time | rules live with the model, run on write |
| **Anaplan** | **boolean “check” line items** as model-integrity assertions (documented practice: a module of checks that must be all-true) | yes, recomputed on every recalculation | closest thing to “the model asserts its own identities” |
| **Jedox** | integrity checks on the model/cube | yes | same family |
| **Wolters Kluwer Tagetik** | reconciliation/“controllo” reports for statutory and management figures | report-oriented | strong in 财务报表勾稽 reporting |

Shared pattern: **the identity is a rule owned by the model, evaluated when data is written or consolidated**, and it
produces a *finding* (pass/fail + difference) — never a silent correction. Nobody computes it at query time, because the
authoritative moment is the close.

### 2.3 Reconciliation *workflow* products (a different problem)

**BlackLine**, **Trintech Cadency**, **FloQast**, **Oracle Account Reconciliation** run the *human* process: balance-sheet
accounts get a preparer, a reviewer, supporting evidence and a sign-off, with automatic matching of transactions. This is
worth knowing as a boundary: those products reconcile **accounts over time**, not **metrics in a semantic layer**, and
they do not expose anything an LLM could reason over. Referenced here so the term “reconciliation” is not confused.

---

## 3. Semantic / metric layers: derivation is modelled, validation is not

| Product | Metric-to-metric expression | Weighted sum | Ratio role | Identity check | Exposed to AI |
|---------|------------------------------|--------------|-----------|----------------|---------------|
| **dbt Semantic Layer (MetricFlow)** | ✅ `type: derived` — `expr` references other metrics (`1 - ${expenses} / ${revenue}`); the layer builds a **metric DAG** and validates references | ⚠️ via expression, no explicit weight | ✅ `type: ratio` with numerator/denominator | ❌ | ✅ (dbt MCP / partner integrations) |
| **Cube** | ✅ calculated measures referencing other measures (`{measure}`) | ⚠️ via expression | ✅ ratio measures | ❌ | ✅ Cube AI / MCP |
| **Looker (LookML)** | ✅ measure `sql` may reference other measures | ⚠️ expression | ⚠️ manual | ❌ | ⚠️ Conversational Analytics |
| **Power BI / Fabric** | ✅ DAX measures reference measures; model dependency view | ⚠️ expression | ⚠️ manual | ❌ | ✅ Copilot |
| **Databricks Unity Catalog metric views** | ✅ derived measures referencing other measures, plus joins | ⚠️ expression | ⚠️ | ❌ | ✅ Genie |
| **Snowflake semantic views (Cortex Analyst)** | ✅ metrics + verified queries | ⚠️ expression | ⚠️ | ❌ | ✅ Cortex Analyst |
| **AtScale** | ✅ calculated metrics | ⚠️ | ✅ | ❌ | ✅ MCP |
| **Malloy** | ✅ measures/dimensions graph with `refinements` | ⚠️ | ⚠️ | ❌ | — |

Two conclusions from this table:

1. **A metric DAG already exists** in most modern layers — but it is a *dependency* graph (what to compute first), never
   an *assertion* graph (what must come out equal). dbt's `derived` metric says “compute this from those”, not “these must
   reconcile”.
2. **Ratio handling is the one place the industry agreed on semantics** — numerator/denominator beats “formula over
   results” for aggregations. Any reconciliation model we build must keep that distinction, or it will accept
   `AVG(daily_ratio)` as a valid `period_ratio`.

**Standardisation:** [Ossie](ossie_semantic_layer.md) (formerly OSI) defines datasets, relationships and metrics with
expressions and AI context — metric **relationships** of the R1–R6 kind are not in the spec as of the version we vendored,
so anything we add there is an extension, and should be shaped so it can be exported as one.

---

## 4. Catalog / observability: they monitor values, not identities

| Product | What it does with metrics | Reconciliation? |
|---------|---------------------------|-----------------|
| **DataHub** | metric/glossary entities, column-level lineage, **assertions** (freshness, volume, schema, custom SQL) | assertions are per-dataset; no metric-vs-metric identity |
| **Atlan** | metric assets with lineage, certification, “metric governance” | lineage, not identity |
| **Collibra / Select Star / Castor / Secoda** | metric definitions in the catalog, lineage to source columns | definition governance only |
| **Monte Carlo / Metaplane / Anomalo** | monitors on metric values (freshness, volume, distribution, drift) | per-metric anomaly, not cross-metric equality |
| **Datafold** | **value-level data diffing** between systems after a migration | closest commercial analogue to R5, but batch/one-off, not a standing relation |
| **LinkedIn ThirdEye** | anomaly detection over time-series metrics (open sourced) | no reconciliation |

The market splits cleanly: **catalogs know where a metric comes from** (upstream lineage), **observability knows whether a
metric moved** (statistics), and **nobody knows whether two metrics still agree** (identities). That is the hole.

---

## 5. Knowledge graph / ontology vendors: expressive, but nothing packaged

| Product / standard | Fit for metric reconciliation |
|--------------------|-------------------------------|
| **Palantir Foundry Ontology + AIP** | object types + **link types** + functions; a metric is a function/object and its dependency is a link. Fully expressive; the reconciliation *semantics* (weights, tolerance, period mode) are yours to encode. |
| **Stardog** | RDF/OWL + virtual graphs over warehouses, SHACL for constraints, Voicebox for NL→SPARQL. SHACL is a real constraint language — a reconciliation edge becomes a shape. |
| **FIBO** (financial industry ontology) | accounting/industry concepts for 财务报表勾稽, OWL; a vocabulary, not a metric model |
| **ISDA CDM + Rosetta DSL** | financial contracts as a formal model where **validation is code** (eligible-collateral, day-count rules); the strongest precedent that “financial relationships as executable rules” works at scale |
| **Neo4j / Neptune Analytics + GraphRAG** | graph retrieval for LLM context; no metric semantics |

Lesson: knowledge-graph tooling can *represent* 勾稽 in a dozen ways, which is exactly why a product needs to **choose one
shape** and make it executable. Expressiveness without a validator produces a diagram, not a check.

---

## 6. The Chinese enterprise practice: 指标体系 and 报送校验

Two practice streams are more mature in China than the “semantic layer” framing:

1. **指标体系 / OneData-style modelling** (Alibaba's 原子指标 → 派生指标 → 复合指标; widely copied in banks and consumer
   internet): 原子指标 = 业务过程 + 度量 + 聚合逻辑; 派生指标 = 原子指标 + 修饰词 + 时间周期; 复合指标 = 指标运算.
   The derivation chain is documented and governed as **口径** (definition/scope), and the hard problem is named
   **口径一致性** — the same metric name meaning different grain/filter combinations in different departments. Note what
   this gives us: the industry already thinks of metrics as a **graph with weights and period modifiers**, just without a
   machine-checkable identity.
2. **监管报送勾稽校验** (EAST/1104 and similar bank reporting regimes, 交易所 XBRL filings): the regulator publishes
   cross-item and cross-table check rules — 表内校验, 表间校验, 总分校验 — and a submission is rejected when they fail.
   This is 勾稽 as a **rule library with severities**, owned by the receiving authority, versioned, and reported as a list
   of violations. It is the closest existing thing to what an agent needs at query time.

---

## 7. Classic methodology worth borrowing

| Source | Contribution |
|--------|--------------|
| **Kimball** — conformed dimensions, fact-table consistency | reconciliation presupposes a shared grain and conformed dimensions; drill-across only reconciles when the grain matches — the reason a relation needs a **grain constraint** |
| **Kaplan & Norton** — strategy maps / cause chains; the KPI-tree consulting practice | metrics as a **directed graph with directional claims** (driver → outcome); distinguished from arithmetic identities, which is a distinction our model should keep |
| **Dimensional analysis** | a cheap, deterministic subset of reconciliation: units/currencies/percent-vs-ratio mismatches are checkable without any data |
| **ISA 520 analytical procedures** (audit) | practitioners check *plausibility* (ratios, expectations, trend breaks, cross-statement consistency) rather than exact identities — a reminder that some reconciliation must be tolerance- or expectation-based, not exact |

---

## 8. Capability matrix of the reference products

Legend: ✅ documented · ⚠️ possible but manual/indirect · ❌ not offered.

| Capability | XBRL toolchain | EPM (Anaplan/Oracle/SAP) | dbt/Cube/Databricks/Snowflake SL | Catalog (DataHub/Atlan) | Observability | KG (Palantir/Stardog) |
|---|---|---|---|---|---|---|
| Metric-to-metric edges | ✅ | ✅ (model formulas) | ✅ (derived) | ❌ | ❌ | ✅ |
| **Signed weights** | ✅ `weight` | ⚠️ in formulas | ⚠️ in expressions | ❌ | ❌ | ⚠️ |
| **Period / grain scoping of the identity** | ✅ contexts | ✅ (dimensions) | ❌ | ❌ | ❌ | ⚠️ |
| **Ratio semantics** | ⚠️ (facts, not ratios) | ✅ | ✅ | ❌ | ❌ | ⚠️ |
| **Tolerance** | ✅ gateway setting | ✅ rounding tolerances | ❌ | ❌ | ⚠️ thresholds | ⚠️ |
| **Executable check at query time** | ✅ (validator) | ✅ (at consolidation) | ❌ | ❌ | ⚠️ (per-metric) | ⚠️ (SHACL) |
| **LLM-consumable** | ⚠️ (via validators) | ❌ | ✅ | ⚠️ | ❌ | ✅ |

The empty column is the point: **no product combines “LLM-consumable metric semantics” with “machine-checked identities”.**

---

## 9. What this suggests for Catalog → Metrics

Our current metric is an **Ossie aggregate expression anchored on a dataset** (`metric_definitions`: `type`, `expression`,
`filters`, `joins`, `ai_context`) with no reference to another metric. Adding reconciliation means adding edges; the
research says what those edges must carry.

### 9.1 Edge shape (minimum that survives real use)

| Field | Why the market says so |
|-------|------------------------|
| `kind` — `decompose` · `derived` · `stock_flow` · `ratio` · `cross_source` · `same_as` | the six relations have different check algorithms (§1) |
| `weight` (+1/−1) on each member | XBRL `calculationArc`; makes R1/R2 a linear check, not a formula parser |
| `numerator` / `denominator` roles for `ratio` | dbt `type: ratio`, Cube ratio measures |
| `period_mode` — `point_in_time` vs `over_period`, and the bucket (`day`/`month`) | R3 only holds for stock/flow pairs over a declared period; Anaplan/Oracle scope rules by dimension |
| `grain` — the dimensions the identity holds at (e.g. per account, per month, **not** across accounts) | Kimball conformed grain; XBRL contexts |
| `tolerance` — absolute and/or relative | XBRL gateways, EPM rounding tolerances |
| `severity` — what a violation means (`P0` blocks a decision / `P1` look / `P2` knowing) | 报送校验 severity lists; our quality rules already use P0–P2 |

### 9.2 Where it plugs in

1. **Check, not just store.** A relation is only worth having if something runs it: both sides' SQL (they already exist
   through the metric engine), plus the tolerance/grain/period, produce a **finding** — `pass | fail | unknown(diff)`.
   Unknown matters: a metric that cannot be computed at the requested grain is not a failure (`unknown` is also how our
   data-query judge already treats undecidable checks).
2. **The graph as prompt context.** Reconciliation edges are exactly the “what must be true” the model otherwise has to
   infer from prose: an agent that plans a query can be told *these metrics are expected to add up*, and an agent that
   reports a number can be told to **check** it before asserting a conclusion.
3. **An evaluation dimension** — [data-query evaluation](../features/data-query-evaluation.md) judges `model`, `scope`,
   `measure`, `grain`, `joins`, `forbidden`. A `reconcile` check is the natural seventh: “the answer's number and the
   metric it decomposes into are consistent”. Deterministic (it is arithmetic), so it would be the first **non-LLM** check
   in that list — which is a feature: a cheap, unarguable signal next to semantic judgement.
4. **Export.** Keep the shape serialisable as an Ossie extension (e.g. `metric.links`), so a model export carries its
   identities; do not invent a DSL.

### 9.3 Known failure modes to design against

- **Grain drift** — an identity that holds per account fails when grouped across accounts; without `grain` the check
  produces noise and gets muted.
- **Period drift** — comparing a `point_in_time` metric with an `over_period` one as if both were the same bucket.
- **Ratio averaging** — the layer must refuse `AVG(ratio)` as a substitute for `ratio(Σnum, Σden)`.
- **Circular definitions** — A derived from B, B derived from A; needs a cycle check at write time (dbt's metric DAG has
  the same requirement).
- **Tolerance theatre** — a tolerance so wide it always passes. Better to report the **observed difference** and let the
  evaluation/report show it than to declare pass.
- **Semantic corruption by “fix”** — never auto-adjust a metric to satisfy an identity (the EPM lesson: flag, don't
  correct).

---

## 10. Open questions for the design phase

1. Is a relation **scoped to a semantic model** (like a metric) or cross-model? 勾稽 between a model and a legacy
   definition is the `same_as` case, which argues for cross-model edges.
2. Does a relation belong in **Catalog** (governance artifact) or **Ontology** (object/link types with Actions)? The
   research suggests Catalog — it is a property of the metric definition, evaluated by the metric engine — with an
   Ontology export if an agent needs to traverse it as objects.
3. Should the **check run on write** (metric definition changes) or **at query time**? Both, with different severities:
   write-time catches a broken definition before anyone reads a number; query-time catches a broken *period* (data not
   loaded yet).
4. How much do we need `same_as` before a metric-versioning story exists?

---

## References

- XBRL calculation linkbase & inconsistency checks — XBRL 2.1 specification (`calculationArc`, `weight`, contexts); Arelle
  validator; SEC EDGAR and EU ESEF filing rules; 财政部《企业会计准则通用分类标准》.
- dbt Semantic Layer / MetricFlow metric types (`simple`, `ratio`, `derived`, `cumulative`, `conversion`) and the metric
  DAG — dbt Labs documentation.
- Cube measure/ratio-measure reference; Looker LookML `measure`; Power BI DAX measure dependencies; Databricks Unity
  Catalog metric views; Snowflake semantic views / Cortex Analyst; AtScale metric catalog + MCP — vendor documentation.
- Anaplan “checks” as model-integrity assertions; Oracle EPM Cloud validation/tie-out; SAP Analytics Cloud validation
  rules; Jedox integrity checks; Tagetik reconciliation — vendor documentation and practitioner material.
- BlackLine, Trintech Cadency, FloQast — account-reconciliation workflows (process, not semantics).
- DataHub assertions & lineage; Atlan metric governance; Collibra/Select Star metric catalogs; Monte Carlo metric
  monitors; Datafold value-level diffing; LinkedIn ThirdEye — product documentation.
- Palantir Foundry Ontology; Stardog SHACL/Voicebox; FIBO; ISDA CDM + Rosetta DSL — vendor/spec documentation.
- Kimball & Ross, *The Data Warehouse Toolkit* (conformed dimensions, grain); Kaplan & Norton, strategy maps; ISA 520
  analytical procedures.
- [Apache Ossie semantic layer](ossie_semantic_layer.md) — the metric shape we already implement.
