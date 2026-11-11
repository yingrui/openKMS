# Package layout: how `services/` and `pages/` are split

**Status:** done (2026-11). Nine commits, one per area, each gated. This page is the record: the shape that came out, the
two layer inversions the move exposed, and the tooling traps worth remembering for the next one.

## The problem it solved

Both packages were large in the same way: a **name that described a layer**, holding the code of several areas. `services/`
was half the backend behind 38 top-level names, and `pages/ontology-manager/` held four apps under a name that described one
of them. "Where does this live" answered itself for neither.

## Result

```
backend/app/services/           38 top-level names → 7 areas
  platform/    16  boundaries, storage, audit, credentials, openai_compat, feature_toggles, internal_service_auth,
                   dataset_label, project_fs, chunked_upload, openkms_cli_subprocess, heartbeat, …
  identity/     3  users, acl, permissions
  ontology/     2  ontology, knowledge_map
  data/        27  rows, entity_scope, model_sql, sql_scan, quality, metrics, … + connectors/
  content/      9  documents, articles, wiki, knowledge_bases, glossary, comments, media, channels, models
  workspace/    3  evaluations, global_search, schedules
  runtime/      6  jobs, agent, deep_agents, kubernetes, chamber, projects
```

```
frontend/src/pages/
  ontology-manager/  17  object types, link types, groups, actions, functions, external services
  catalog/           30  datasets, quality rules, versions, file data, sources, sharing
  catalog/model/     27  semantic model: fields, metrics, relationships, playground, YAML, data resources
  insights/          29  stories, reports, findings, charts, CSV
  shared/             7  EntityViewShell, QuickRangeSelect, ResourceRowEditor, relativeAge, …
  console/               permissions/ · data/ · kubernetes/ · operations/
```

**Routes, permissions and skill commands were never touched.** Files moved; the contract with the outside did not.

### The levels that justify the grouping

The seven areas are not a naming preference — they are the measured dependency order. Nothing imports upward, and no level
needed to move to make the others possible:

```
0  platform   boundaries storage credentials openai_compat project_fs feature_toggles
              internal_service_auth dataset_label heartbeat
1  identity   acl permissions users
2  ontology   ontology knowledge_map
3  data       rows entity_scope model_sql sql_scan … connectors
4  content    documents articles wiki knowledge_bases glossary comments media channels models
5  workspace  evaluations global_search schedules
6  runtime    jobs agent deep_agents kubernetes chamber projects
```

`check_import_cycles.py` reads **0** at every commit. The granule is the **area**, which turned out to be the right question:
a cycle between two subpackages of one area is usually a caller and its helper; the same edge between two areas is a design
error, and the check is calibrated to ask it.

## Two inversions the move exposed

Neither was visible before, and neither was introduced by the split — both had been there, hidden by granularity.

**`app/schemas` imported a service.** `schemas/document.py` and `article.py` called into
`services/content/.../lifecycle` for "is this row searchable today" — a **response field** computed from service code. The
predicate is pure, so it moved below both into `app/lifecycle.py`; the service keeps a three-line wrapper and the schema
calls the rule directly. Writing it once also collapsed two functions that were byte-identical apart from their receiver.

**`projects` was in the wrong area.** It sat in `workspace` while `deep_agents` imported it and it imported `deep_agents`
back — a genuine cycle the moment those two names shared an area. `projects` is the agent's own workspace (conversations,
skills, secrets), so it lives in `runtime` with the runtime it serves.

## What stays as it is

- **`platform/` stays flat** (16 modules). They are small independent leaves; grouping them again would be a directory tree
  describing a list — the thing the area split was meant to undo.
- `data_layer` survives only as prose. `app.services.data.data_layer.rows` said "data" three times and named a layer inside
  an area; the modules are `app.services.data.rows` now.
- **Not in scope, on purpose:** `api/` (80 modules, one per resource), `models/`, `schemas/`, and the frontend's
  `components/` / `data/` / `styles/`. Their shape already answers "where does this live", and a page-level split of shared
  components would push each one into whichever app needed it first.

## How the moves were made

One area per commit, bottom-up, so each diff's direction is provably downward: `pages/console` → `services/platform` →
`identity` → `ontology` → `data` → `content` → `workspace` → `runtime` → the `data_layer` rename. Every commit ran the full
gate.

The rewrites were scripted, and the script is where the cost was. Every trap below was found by running it, not by reading
a plan:

| Trap | What it looked like |
|---|---|
| A specifier has **four** forms | static `from '…'`, dynamic `import('…')`, `vi.mock('…')`, and a **bare argument** (`vi.importActual('…')`). Matching two rewrote a mock without the module it mocked. |
| Python has a **fifth** | `from app.services import audit as m` — a dotted rewrite misses it, and only the test suite noticed. |
| **Sass is not TypeScript** | A moved `.scss`'s `@use '../../styles/…'` breaks exactly like an import. Typecheck passed; the **build** failed. |
| `Path('X.modals').with_suffix('.tsx')` | yields **`X.tsx`** — `.modals` looks like an extension. Appending is the only safe form. |
| `str(Path('./x.tsx').with_suffix(''))` | drops the leading `./`, turning a relative specifier into a bare one. |
| Two passes | double-applied. Resolve every specifier from the file's **old** location and re-relativise — one pass, no category to forget. |

**Path-keyed allowlists are the recurring tax.** Five had to follow the moves: `check.sh`'s single `noqa` allowlist, the
700-line allowlist in `check-shared-styles.sh`, `ds-controls-baseline.txt`, `undefined-classes-baseline.txt`, and the
cycle baseline. In every case the **count** stayed identical — a rename must not cost a waiver, and must not earn one.

## Verification

- `cd backend && ./check.sh` — ruff, no suppressions, `check_api_doc.py`, `check_import_cycles.py`, pytest.
- `cd frontend && npm run check` — typecheck, app-layout, app-modules, styles (i18n keys, undefined classes, panel tables,
  request bodies, page chrome, button sizes), lint, vitest, build.
- `mkdocs build --strict` where a doc names a moved path.
