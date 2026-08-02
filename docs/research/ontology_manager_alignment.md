# Ontology Manager prototype alignment

How the [`ontology-manager`](../../prototypes/ontology-manager) prototype informs openKMS **three Suite Apps** — adopt / adapt / skip decisions with rationale.

**Related:** [ontology_functions_and_actions.md](ontology_functions_and_actions.md) · [Ontology](../features/ontology.md)

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

## Adopt

| Item | Prototype | Rationale | openKMS |
|------|-----------|-----------|---------|
| Three apps | Platform sidebar: Manager / Code Repos / Explorer | Semantic vs instance vs logic separation | `ontology-manager`, `object-explorer`, `function-editor` |
| entity-view | Function detail left nav + tabs | Complex entities need stable detail shell | Manager OT / LT / Dataset / Function / Action type detail (`EntityViewShell`) |
| Function dual surface | Manager registry + Code Repo IDE | Governance ≠ authoring | Manager + Function Editor; single PG store |
| IDE bottom preview | `FunctionsHelper` Live Preview | Short feedback loop for authors | `function-editor-bottom-panel` |
| Group browsing | OE Home by group | Business users start from type collections | Explorer Home P1 |
| Manager resource nav | OT / LT / Functions / Action types | Palantir Resources pattern | ManagerNavRail (`/action-types`) |

---

## Adapt

| Item | Prototype | Why not copy | openKMS |
|------|-----------|--------------|---------|
| Platform shell | `PlatformShell` + Foundry rail | Header + App Rail already exist | Suite apps in App Rail only |
| Explorer nav | OE top bar only | Prototype incomplete; we have Cypher investment | NavRail: Objects / Links / Explore |
| Manager home | Discover cards | P0 = schema publish; engineers need overview | Overview List/Graph; Discover P2 |
| Manager top bar | ⌘K, Discard/Save P0 | Overlaps global search; draft needs P2 infra | P0 list `+ New`; top bar P2 |
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

---

## Current openKMS vs plan

| Shipped | Plan | Verdict |
|---------|------|---------|
| Single `ontology` app + mixed NavRail | Three apps + three rails | **Migrate** (redirects) |
| `/ontology`, `/objects`, `/object-explorer` | New prefixes | **Migrate** (parallel perms) |
| Cypher Explore | `/object-explorer/explore` | **Keep** |
| OT/LT/datasets pages | Manager | **Reuse** |
| No Functions/Groups/Actions | New | **Add** |

---

## Implementation checklist

- [ ] Three App Rail icons; `check:app-modules` passes
- [ ] Old routes redirect one release
- [ ] Permission patterns include new and legacy paths
- [ ] Cypher page height regression test (`check:app-layout`)
- [ ] No "Code Repository" user-facing copy
