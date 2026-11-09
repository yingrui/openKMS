# Package layout: splitting `services/` and `pages/`

**Status:** **stage 1 and 2 done** (2026-11). Stage 3 is the decision point; stage 4 (Option B) not started. Written after a
layout review and the split of `pages/ontology-manager/` into four apps.

The two large packages are large in the same way: a **name that describes a layer**, holding the code of several areas.
`services/` is half the backend and `pages/` is two thirds of the frontend, so "where does this live" answers itself for
neither. This page is the plan to fix that — in stages that each ship on their own.

## What is there now

| Package | Files | Lines | Shape |
|---|---|---|---|
| `backend/app/services/` | 251 | 35,845 | **14 subpackages + 16 loose root modules**, all under one name |
| `backend/app/api/` | 80 | 25,639 | one module per resource — already fine, not in scope |
| `frontend/src/pages/` | ~330 | ~89,000 | **22 directories**; `catalog/` 62 (just split), **`console/` 39**, `insights/` 29, the rest ≤ 20 |

### The services dependency graph, measured

`check_import_cycles.py` reports **0 cycles**, and the edges fall into seven natural levels — nothing above imports
anything below it, and no level needs to move to make the others possible:

```
0  foundation   boundaries  storage  credentials  openai_compat  project_fs  feature_toggles
                internal_service_auth  dataset_label  users  heartbeat
1  identity     acl  permissions
2  ontology     ontology  knowledge_map
3  data         data_layer  connectors
4  content      documents  articles  wiki  knowledge_bases  glossary  comments  media  channels  models
5  workspace    projects  evaluations  global_search  schedules
6  runtime      jobs  agent  deep_agents  kubernetes
```

That order is the design. It is also the reason a split is *possible* without touching behaviour: every move below keeps
a file inside its level or moves it down, never up.

## Backend: two options, in this order

### Option A — `services/platform/` for the loose modules *(recommended first)*

Move the loose root modules — `storage`, `audit`, `boundaries`, `project_fs`, `feature_toggles`, `internal_service_auth`,
`dataset_label`, `chunked_upload`, `openkms_cli_subprocess` — into `services/platform/`. Every one of them is imported by
two or more areas and depends on almost nothing; they sat beside `data_layer/` and `ontology/` as if they were peers.

- **Done:** 9 modules moved (the plan estimated 16 — the rest of the loose names are directories already), **68 files**
  rewritten, top-level names in `services/` **38 → 30**. Import churn was ~90 references, not ~60.
- Risk: low. Every moved module is a leaf; nothing imports *from* them in a way that changes shape.
- Value: the remaining 14 directories become readable at a glance, because "is this an area or a utility" stops being a
  question.

### Option B — seven areas *(after A, if it earned its keep)*

```
services/platform/   foundation level (A's result)
services/identity/   acl, permissions
services/ontology/   ontology, knowledge_map
services/data/       data_layer, connectors
services/content/    documents, articles, wiki, knowledge_bases, glossary, comments, media, channels, models
services/workspace/  projects, evaluations, global_search, schedules
services/runtime/    jobs, agent, deep_agents, kubernetes
```

- Files moved: **~251** (every import path changes). Import churn: the whole `app/` tree plus tests.
- Risk: medium — mechanical, and the gates catch what the script misses, but the diff is unreviewable by eye.
- Value: `services/` stops being a list of 15 names and becomes a map of the system.

**The honest comparison.** A buys most of the navigability for a tenth of the churn; B makes the map explicit but is a
commit nobody can read. Do A, live with it for a week, and only then decide whether the seven names are worth the move.

## Frontend: `console/` is the last grab bag

`pages/ontology-manager/` is done (110 modules → `ontology-manager/` 17, `catalog/` 30, `catalog/model/` 27,
`insights/` 29, `shared/` 7). Of what remains, only `console/` mixes areas:

```
pages/console/permissions/   ConsolePermissionManagement*  ConsoleAccessGroups  useConsolePermissionManagement
pages/console/data/          ConsoleDataSources  ConsoleDataSecurityIssues  ConsoleStorage
pages/console/kubernetes/    ConsoleKubernetes*  Kubernetes*Dialog  KubernetesRowActions  KubernetesResourceYamlPanel
pages/console/operations/    AuditLogPage  auditFormat  ConsoleHealth  ConsoleFeatureToggles  ConsoleOverview  ConsoleSettings
```

- Files moved: **39** (28 + pages + `ConsoleLayout` stays at the root of `console/`).
- Risk: low — the same scripted move used for `pages/`, and the route-based checks do not care about file paths.

Everything else in `pages/` is already one directory per app: `documents/`, `wiki/`, `knowledge-bases/`, `connectors/`,
`agents/`, … Splitting those further would be splitting an app into the pages it has, which is what a `pages/` directory is.

## The move itself: what the last split taught

The `pages/ontology-manager` split was scripted, and the script got it wrong twice. Both lessons apply to every stage
here.

1. **A module specifier has four forms.** Static `from '…'`, side-effect `import '…'`, dynamic `import('…')`, and a
   **bare argument** — `vi.mock('…')`, `vi.importActual('…')`. Matching two of the four rewrote a mock without the module
   it mocked. In Python the same lesson is `import x` / `from x import y` / a string in `importlib` / a `mock.patch`
   **target string** — the last one is the one that breaks quietly, and it appears in tests more than anywhere else.
2. **Resolve from the file's *old* location, then re-relativise, once.** Two passes over the same specifier double-applied.
   And `str(Path('./x.tsx').with_suffix(''))` drops the leading `./`, turning a relative specifier into a bare one.

So the tool for the backend is an `ast` walk (like `fix_imports.py`, but for `app.*`), and for the frontend the existing
one. Both must be **reset-and-run-once** — start from a clean index, never re-run on a half-rewritten tree.

Three more traps, all found by running it rather than by reading the plan:

- **Sass needs the same treatment as TypeScript.** `@use '../../styles/…'` in a moved `.scss` is as broken as an import, and
  the first attempt at stage 1 did not touch it — the typecheck passed and the **build** failed.
- **`Path('X.modals').with_suffix('.tsx')` is `X.tsx`.** `.modals` looks like an extension, so appending is the only safe
  form: `Path(f'{stem}.tsx')`.
- **Python has a fifth form:** `from app.services import audit as m`. The dotted rewrite (`app.services.audit`) misses it, and
  so does everything that looks like an import at a glance; stage 2 only failed once the suite ran.

Path-keyed allowlists are the recurring cost. Three of them had to follow stage 1 and one had to follow stage 2
(`check.sh`'s single `noqa` allowlist, `ds-controls-baseline.txt`, `undefined-classes-baseline.txt`, and the 700-line
allowlist in `check-shared-styles.sh`). In every case the **count** was unchanged: a rename must not cost a waiver or earn
one.

## Stages

Each stage is one commit, ships alone, and is verified the same way.

| # | Stage | Moves | Gate | Est. |
|---|---|---|---|---|
| 1 | `pages/console/` → four areas | **38 files ✅** | `npm run check` + re-point `ds-controls-baseline.txt`, `undefined-classes-baseline.txt`, and the line-count allowlist | ~1 h |
| 2 | `services/platform/` (Option A) | **9 modules ✅** (68 files rewritten) | `./check.sh` (pytest 1003, ruff, `check_import_cycles.py` empty) | ~1 h |
| 3 | *decision point:* re-measure `services/` top-level names and ask whether A was enough | — | — | — |
| 4 | Option B, one area per commit (identity → ontology → data → content → workspace → runtime), never two at once | ~251 total | same, plus `mkdocs build --strict` | 1–2 h per area |

Stage 4's order is the DAG above, bottom first: moving `identity` before `content` means each commit's import diff is
small and its direction is provably downward.

## Verification, per stage

- **Backend:** `cd backend && ./check.sh` — ruff, no suppressions, `check_api_doc.py`, `check_import_cycles.py`, pytest.
  Plus a **before/after** run of `relation_refs`-style smoke queries if the stage touched the data layer (it should not).
- **Frontend:** `cd frontend && npm run check` — typecheck, app-layout, app-modules, styles (i18n keys, undefined classes,
  panel tables, request bodies), lint, vitest, build.
- **Both:** `mkdocs build --strict` if any page under `docs/` names a moved path.
- **The cycle check is the architecture gate.** It stays at zero known cycles; a stage that introduces one fails and is
  reverted, not baselined.

## What is explicitly not in scope

- `api/` (80 modules, one per resource) and `models/` / `schemas/` — their shape is already the answer to "where does this
  live", and splitting them would be rearranging furniture.
- `frontend/src/components/`, `data/`, `styles/` — used across apps by design; a page-level split would push shared
  components into whichever app happened to need them first.
- Any rename of a **route**, a **permission**, or a **skill command**. File locations move; the contract with the outside
  does not.
