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

Domain market-analysis schemas and Functions are **not** openKMS product deliverables. Learn concepts in [Understanding the ontology](../tutorials/understanding-ontology.md); operators follow the [Tushare case study](../tutorials/tushare-market-ontology.md); agents use [openkms-skill](../features/openkms-skill.md) Workflow G.

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
| **Action `object_id` for dataset / Neo4j synthetic ids** | Explorer rows for dataset/Neo4j-backed objects use synthetic ids (e.g. key property). Triggering an Action with that id **404**s | Action execute resolves hand-created / Explorer instance ids only |
| **Action link create/delete apply** | Object instance CRUD via edits ships; link-edge edits are not yet an edit-batch op | `edit_apply_service` (objects only) |
| **Action “Rules” ≈ Function binder** | Not full submission criteria / parameter forms / multi-step edit rules | Manager Action Rules UI |

**DIY without waiting on blockers:** schema + FoO reads + **Action object write-back** (`create` / `modify` / `delete`) on Explorer-created instances (e.g. Kanban WorkItem).  
**Still blocked:** Object Explorer row Actions that **persist** against dataset-backed masters (synthetic `object_id`).

### Soft gaps (P1–P2 UX) — deferred, decoupled from domain DIY

| Item | Priority | Notes |
|------|----------|-------|
| Explorer Home by group | P1 | Adopt list above; not required for Stock + Functions |
| Manager Discover cards | P2 | Overview List/Graph first |
| Manager top bar ⌘K / Discard·Save draft | P2 | Needs draft infra |
| Global ontology Draft | Skipped | Function-level publish is enough |
| OT wizard Action stubs without auto-bind | Soft | Bind Functions manually on Action types |
| Kanban / board UI in Suite Apps | Follow-on | Presentation belongs to **App Builder** (+ A2UI), not Object Explorer |

Do **not** schedule soft UX with market-analysis work.

---

## Product decision: Action write-back (B1)

**Decision (2026-08-17): ship object-instance `create` / `modify` / `delete` apply; keep synthetic `object_id` deferred.**

| Choice | Meaning |
|--------|---------|
| **Shipped** | After a successful Action OFS run, `output.edits` with `op` in `create` / `modify` / `delete` apply onto resolvable object instances (instance id as `primary_key`; `create` may omit `primary_key` and receive a generated UUID). Response includes `applied` (`created_ids` / `modified_ids` / `deleted_ids`). |
| **Still deferred** | Dataset / Neo4j synthetic Action `object_id`; link create/delete as edit ops; ofs `Client` write methods. |

Rationale: Kanban DIY and App Builder boards need full card CRUD (not only column moves) on Explorer-created objects. Dataset-backed masters remain read/compute until a separate plan resolves synthetic ids.

Earlier (2026-08-16) `modify`-only shipping is superseded for object-instance edits.

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
| Groups / Functions / Action types | ✅ Registry + execute + **create/modify/delete apply** |
| Edit link create/delete + synthetic Action object_id | ⏸ Deferred (see product decision) |
| Discover / group Home / global draft chrome | ⏸ P1–P2 / skip |

---

## Implementation checklist

- [x] Three App Rail icons; `check:app-modules` passes
- [x] Old routes redirect
- [x] Permission patterns include new and legacy paths
- [x] Cypher page height (`check:app-layout`)
- [x] No "Code Repository" user-facing copy
- [x] Capability audit + DIY blockers documented (this page)
- [x] Action `modify` apply on resolvable object instances (2026-08-16)
- [x] Action `create` / `delete` apply on resolvable object instances (2026-08-17)
- [ ] Link create/delete edit ops + dataset/Neo4j synthetic `object_id` — separate plan when needed
- [ ] App Builder Kanban (A2UI) — presentation follow-on, not Object Explorer
