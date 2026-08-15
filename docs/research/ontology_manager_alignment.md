# Ontology Manager prototype alignment

How the [`ontology-manager`](../../prototypes/ontology-manager) prototype informs openKMS **three Suite Apps** — adopt / adapt / skip decisions with rationale.

**Related:** [ontology_functions_and_actions.md](ontology_functions_and_actions.md) · [Ontology](../features/ontology.md) · [Ontology Functions](../features/ontology-functions.md) · [Ontology SDK](../features/ontology-sdk.md)

---

## Decision framework

Each UI or IA choice must answer:

1. Does it map to a **distinct user task** (schema / instances / code)?
2. Does it reduce **registry vs implementation** confusion?
3. Would it **remove** a shipped openKMS capability?
4. Does it require **infrastructure we lack** (Git repos, multi-ontology, global draft)?
5. Does it **conflict** with Header + App Rail + design-system?
6. If the prototype omits it but **Palantir ships it**, follow Palantir.

**Acceptance:** § canonical scope in the implementation plan — not pixel parity with the prototype.

---

## Platform vs domain content

| Category | Owner | Examples |
|----------|-------|----------|
| **Platform** (Ontology Manager / Logic) | Product engineering | OT/LT CRUD, dataset bind, Neo4j index, Function author→publish→run, Action **type** registry |
| **Domain ontology** (tenant content) | Operators / domain owners (DIY) | Stock / Watchlist types, `screenStocks` source, Tushare mapping choices, analysis notes |

Domain market-analysis schemas and Functions are **not** openKMS product deliverables. Agents use [openkms-skill](../features/openkms-skill.md) Workflow G; humans use Manager / Function Editor.

---

## Capability audit (shipped vs DIY blockers)

### Shipped — enough for DIY read/compute ontology

| Capability | Status |
|------------|--------|
| Three Suite Apps (Manager / Object Explorer / Function Editor) | ✅ |
| Groups CRUD + assign object types | ✅ |
| Object types: create, properties, dataset bind, master, sharing, **Index Neo4j** | ✅ |
| Link types + junction/FK + Index | ✅ |
| Datasets CRUD (+ Console data sources; Connectors incl. Tushare) | ✅ |
| Functions: Editor author / validate / Live Preview; Manager Publish / Observability / execute | ✅ |
| Action **types**: create, bind published Function, activate, execute + audit log | ✅ (see blockers) |
| openkms-skill: data-sources, datasets, connectors, jobs, functions, action-types | ✅ |

**Verdict:** Building a **dataset-backed master type** (e.g. Stock), indexing it, and publishing **read-only Functions** needs **no further Manager feature work**.

### DIY blockers (platform hard gaps)

| Gap | Impact | Evidence |
|-----|--------|----------|
| **Action does not apply object writes** | `execute` runs the bound Function and logs; `create_edit_batch` is inspect-only. Palantir-style “add to watchlist” durable writes are missing | [Ontology SDK](../features/ontology-sdk.md); [Functions research](ontology_functions_and_actions.md) phasing; ofs `Client` is read/compose |
| **Action `object_id` resolves PG `ObjectInstance` only** | Explorer rows for dataset/Neo4j-backed objects use synthetic ids (e.g. key property). Triggering an Action with that id **404**s | Action execute vs object list id synthesis |
| **Action “Rules” ≈ Function binder** | Not full submission criteria / parameter forms / multi-step edit rules | Manager Action Rules UI |

**DIY without waiting on blockers:** read-only Functions + Manager schema + Explorer browse / Cypher.  
**DIY that needs blockers fixed:** Object Explorer row Actions that **persist** Watchlist / ScreenRun-style objects against dataset-backed masters.

### Soft gaps (P1–P2 UX) — deferred, decoupled from domain DIY

| Item | Priority | Notes |
|------|----------|-------|
| Explorer Home by group | P1 | Adopt list above; not required for Stock + Functions |
| Manager Discover cards | P2 | Overview List/Graph first |
| Manager top bar ⌘K / Discard·Save draft | P2 | Needs draft infra |
| Global ontology Draft | Skipped | Function-level publish is enough |
| OT wizard Action stubs without auto-bind | Soft | Bind Functions manually on Action types |

Do **not** schedule these with market-analysis or Action-write work.

---

## Product decision: Action write-back (B1)

**Decision (2026-08-15): defer** edit-batch **apply** and dataset/Neo4j Action `object_id` resolution.

| Choice | Meaning |
|--------|---------|
| **Defer (current)** | Domain DIY stays on **read-only Functions** + manual/CLI instance creates for non-dataset workbench types. No Action-write epic opened for market analysis. |
| **Later (separate plan)** | If operators need Explorer “write Actions” on dataset-backed objects, open a dedicated short plan: edit-batch apply + resolve `object_id` by OT key / Neo4j id — **decoupled** from any domain Stock/Watchlist content. |

Rationale: Manager skeleton is already sufficient for schema + published compute; Action apply is the only material platform gap, and it is not required for read/compute DIY.

---

## Adopt

| Item | Prototype | Rationale | openKMS |
|------|-----------|-----------|---------|
| Three apps | Platform sidebar: Manager / Code Repos / Explorer | Semantic vs instance vs logic separation | `ontology-manager`, `object-explorer`, `function-editor` |
| entity-view | Function detail left nav + tabs | Complex entities need stable detail shell | Manager OT / LT / Dataset / Function / Action type detail (`EntityViewShell`) |
| Function dual surface | Manager registry + Code Repo IDE | Governance ≠ authoring | Manager + Function Editor; single PG store |
| IDE bottom preview | `FunctionsHelper` Live Preview | Short feedback loop for authors | `function-editor-bottom-panel` |
| Group browsing | OE Home by group | Business users start from type collections | Explorer Home P1 (**deferred**) |
| Manager resource nav | OT / LT / Functions / Action types | Palantir Resources pattern | ManagerNavRail (`/action-types`) |

---

## Adapt

| Item | Prototype | Why not copy | openKMS |
|------|-----------|--------------|---------|
| Platform shell | `PlatformShell` + Foundry rail | Header + App Rail already exist | Suite apps in App Rail only |
| Explorer nav | OE top bar only | Prototype incomplete; we have Cypher investment | NavRail: Objects / Links / Explore |
| Manager home | Discover cards | P0 = schema publish; engineers need overview | Overview List/Graph; Discover P2 (**deferred**) |
| Manager top bar | ⌘K, Discard/Save P0 | Overlaps global search; draft needs P2 infra | P0 list `+ New`; top bar P2 (**deferred**) |
| Function workspace | Code Repositories + Git | No VCS backend | Function Editor; PG versions |
| List pages | `ResourceListPage` | `ontology-admin` already wired to APIs | Reuse pages; unify tokens |
| Styling | 4k-line standalone CSS | design-system consistency | `ontology-admin.scss` + exceptions |

---

## Skip

| Item | Rationale |
|------|-----------|
| FoundryHome | openKMS Home + Header |
| Multi-ontology selector | Single-tenant product boundary |
| Shared properties | No domain model yet |
| Fake Git branch/tag | Versions = `ontology_function_versions` + Publish |
| Published run in Editor | Published runs via Manager / API |
| localStorage split stores | Backend is source of truth |
| Global ontology Draft P0 | Function-level publish first |
| Shipping domain ontologies (e.g. market/Tushare Stock) | Tenant DIY content — not product |

---

## Current openKMS vs plan

| Area | Status |
|------|--------|
| Three apps + redirects | ✅ Shipped |
| Cypher Explore in Object Explorer | ✅ |
| OT/LT/datasets in Manager | ✅ |
| Groups / Functions / Action types | ✅ Registry + execute |
| Edit-batch apply + dataset Action object_id | ⏸ Deferred (see product decision) |
| Discover / group Home / global draft chrome | ⏸ P1–P2 / skip |

---

## Implementation checklist

- [x] Three App Rail icons; `check:app-modules` passes
- [x] Old routes redirect
- [x] Permission patterns include new and legacy paths
- [x] Cypher page height (`check:app-layout`)
- [x] No "Code Repository" user-facing copy
- [x] Capability audit + DIY blockers documented (this page)
- [x] Action write-back deferred as product decision
- [ ] Action edit-batch apply + dataset/Neo4j `object_id` — **only if** operators reopen that decision
