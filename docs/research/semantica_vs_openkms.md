# Semantica vs openKMS

Comparative research for product and architecture decisions, written 2026-11-23. **Semantica** is described
from its public repository: `semantica-agi/semantica` (README, `ARCHITECTURE.md`, `GROWTH.md`, the full file tree
via the GitHub tree API, and PyPI metadata for 0.7.0). **openKMS** is described from this repository's code and
docs. Nothing here is from a paid evaluation or a vendor conversation.

**Related:** [Architecture](../developer/architecture.md) · [Semantic model](../features/data-layer-semantic-model.md) ·
[Rules & events](../features/rules-and-events.md) · [Ontology](../features/ontology.md) ·
[Apache Ossie semantic layer](ossie_semantic_layer.md) · [Foundry Rules](foundry-rules.md)

---

## Executive summary

| | **Semantica** | **openKMS** |
|---|---|---|
| **Identity** | Graph-native semantic/context infrastructure: ontology, deterministic reasoning, provenance, decision records | Knowledge platform: content (documents/articles/wiki/KB), Catalog (datasets · semantic models · metrics · rules & events), ontology (object/link types), governance |
| **Unit of structure** | Fact / triple with bitemporal coordinates, inference with justification, decision as an object | Dataset column · metric · rule run · object instance |
| **Strength** | Standards-shaped semantics (OWL · SHACL · SKOS · RDF · PROV-O · SPARQL) and a rule layer with entailment, retraction and derivation records | Governed content + queryable data layer + reconciliation rules, with one implementation per surface |
| **Maturity** | 0.7.0, first release 2025-06, MIT, 122 pip requirements | In production use for this deployment |
| **Verdict** | **Not adopted.** No capability gap in its solver that openKMS needs; what it uniquely owns assumes an external consumer openKMS does not have | — |

The interesting finding is not "Semantica is worse". It is that **the gap between a graph database and a
knowledge-representation layer is not a capability gap but an ownership question**: which semantics does the
engine guarantee, and which does the application re-implement per query.

---

## What Semantica is

A Python package (`pip install semantica`) plus a REST server, a browser workbench (`explorer/`) and an MCP
server. It turns enterprise sources into a knowledge graph and then runs four things over it:

| Layer | Modules | What it does |
|---|---|---|
| Acquisition | `ingest` (42 files) → `parse` (23) → `normalize` (14) → `split` (12) → `semantic_extract` (22) | read files/DBs/streams/Git/email, parse, chunk, extract entities–relations–events |
| Graph hygiene | `conflicts` (11) · `deduplication` (11) | flag contradictory facts instead of overwriting; merge duplicate entities with a merge trail |
| Graph | `kg` (30) | build the graph, bitemporal facts (`valid time` vs `record time`), graph analytics |
| Semantics | `ontology` (28) · `reasoning` (19) · `provenance` (7) · `context` (31) | OWL/SHACL/SKOS artifacts; Rete / Datalog / SPARQL / abductive / temporal reasoning with truth maintenance and explanations; W3C PROV-O; decisions, policies, exceptions, precedents, approval chains |
| Storage & exit | `graph_store` · `triplet_store` · `vector_store` · `export` · `evals` · `benchmarks` | RDF stores (Oxigraph, Blazegraph, Jena, RDF4J) **and** LPG stores (Neo4j, FalkorDB, AGE, Neptune) behind one interface; JSON/CSV/RDF export |

Its object model is what to remember:

- **Fact** — bitemporal: when it was true in the world, and when the system learned it.
- **Inference** — a derived fact that knows its justification (which rule, which premises).
- **Provenance** — PROV-O triples per fact (entity / activity / agent).
- **Decision** — `Decision`, `DecisionContext`, `Policy`, `Exception`, `Precedent`, `ApprovalChain`: a decision
  is an object with grounds, alternatives, confidence and an approval trail, not a log line.
- **Ontology** — OWL classes, SHACL shapes, SKOS vocabularies: meaning as data, checkable by third parties.

Maturity facts, stated plainly because they matter more than the feature list: version **0.7.0** with 25
releases (latest 2026-09-22), **14.7k stars / 1.75k forks / 138 open issues**, 454 package files and 541 test
files, MIT. `pip install semantica` resolves **122 requirements** (numpy, pandas, scipy, scikit-learn, rdflib,
networkx, grpcio, openai, google-genai, pillow …). The repository carries a `GROWTH.md` — the author's own
distribution playbook (stars → site → installs → weekly active → deployments), which is why the star count is
not evidence of production use.

---

## What a Neo4j-based solution cannot do

Three different claims get mixed under this heading. Separating them is most of the answer.

### Layer 1 — Neo4j does not ship it (build it yourself)

| Capability | Reality |
|---|---|
| Forward-chaining rules | Application loop, or `apoc.periodic.iterate`; you own convergence |
| Entity resolution, conflict detection | Algorithms over GDS / vector indexes; Semantica's value here is a ready model, not a capability |
| Decision objects, precedent search, impact analysis | Decision nodes + vector index + edge traversal; again a model, not a capability |
| PROV-O records | Edges/properties; every query must carry them |
| Bitemporal queries | `valid_from` / `valid_to` / `recorded_at` columns plus filtering discipline |

None of these is structurally blocked. A worked example of the hard end of this list — distributor risk with
relationship closure, group aggregation, per-pair exemptions and retraction — is roughly a hundred lines of
Cypher: `gds.wcc` for components, `sum()` for group exposure, `shortestPath` through the shared-identifier
nodes to print *why* two customers ended up in one group, and one `EXEMPT` edge type with a validity date.

**"Every entity satisfying A and B belongs to risk class X" is a query, not inference** — `MATCH … WHERE …`. It
was initially misfiled in this research as an entailment requirement; it is not.

### Layer 2 — Cypher cannot express it declaratively (work around it)

| Not expressible | Workaround |
|---|---|
| Fixpoint over heterogeneous rules (R1 feeds R2 feeds R3) | GDS components / label propagation are fixpoints; anything more heterogeneous becomes an application loop |
| Recursive aggregation | Aggregate after the loop, or over GDS output |
| Stratified negation inside recursion | Decide the layer order yourself; that is implementing Datalog semantics |

### Layer 3 — Different semantics (cannot be patched)

| Gap | Why it cannot be fixed by query discipline |
|---|---|
| **Standard exchange** | A property graph serialised to RDF carries *your* reification convention. External consumers (a regulator, another graph store, a customer's ontology tool) do not read your dialect. Conformance exists only if the model becomes RDF. |
| **Open world vs closed world** | A property graph is closed-world: "not found" is stored as false. "Cannot prove it is risky" and "it is risky" collapse into one answer, and no query can separate them once the model has merged them. |

These two are the only capabilities Semantica owns outright — and both are about **proving correctness to
someone outside**, not about computing an answer inside.

---

## The real dividing line: who owns the semantics

The same rule can be implemented in the application or guaranteed by the engine. The difference is not
expressiveness; it is **where mistakes become silent**:

| Semantics | Owned by the application | Failure mode |
|---|---|---|
| Time filtering | every query carries its own as-of predicate | one omission → the right number at the wrong instant |
| Transitive reach | each rule decides how many hops | one hop short → a missing related party, and nothing fails |
| Retraction | "is this conclusion still supported?" written by hand | a conclusion with two grounds gets deleted when one is retracted |
| Aggregation scope | recompute when the group changes | a stale total, silently small |
| Single definition | the number is recomputed in N places | two answers, no error |

These are the same failure shapes openKMS already guards elsewhere — a metric silently inflated by a
non-unique join, a rule whose period was never bound — which is why the question "should we own a rule engine?"
reduces to "how much silent wrongness can this product tolerate?".

---

## Decision

**Semantica is not adopted.** Reasons, in order of weight:

1. **No solver-level gap.** Everything openKMS needs today — metric/identity rules, relationship cardinality,
   period-bound runs, row policies — is a query or an evaluation, not entailment. Neo4j covers it, as does the
   existing SQL engine.
2. **Its unique capabilities assume an external consumer.** OWL/SHACL/RDF/PROV-O and open-world semantics matter
   when a third party must machine-check the result. openKMS has no such consumer; the audit trail it needs is
   an internal, human-readable one.
3. **Integration would duplicate layers.** A second ontology (Ossie vs OWL), a second graph (Neo4j LPG vs RDF),
   a second policy layer, and 122 transitive requirements on an otherwise lean backend.

### What to borrow

One principle, not code: **store the grounds as data**. A conclusion should be able to say which rule, which
version, which facts, which instant. openKMS already stores `rule version`, `run_params`, `period` and event
dedupe keys; the missing piece is the operand values plus a pointer to the data watermark the run read.

### When to revisit

All three must hold — any one alone is satisfied by a query:

1. rules are maintained by the business, and rules consume each other's conclusions;
2. a decision must be defended to an external auditor with machine-readable evidence;
3. facts are corrected often enough that conclusions must be closed precisely, with a three-state history
   (open / resolved / dismissed already exists as a shape).

---

## Sources

- `semantica-agi/semantica`: README, `ARCHITECTURE.md`, `GROWTH.md`, `semantica/context/decision_models.py`,
  repository tree (1514 files), PyPI release metadata for 0.7.0.
- openKMS: `backend/app/services/ontology/rules/`, `backend/app/services/data/joins.py`,
  `backend/app/services/data/query.py`, [Rules & events](../features/rules-and-events.md).
