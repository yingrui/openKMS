# App Builder mechanism (agent guide)

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**.

**Required by `SKILL.md`:** open this file **before** any `apps …` command or App / A2UI / board work. Do not invent layout or host wiring from memory.

**Source of truth in this skill:** [app-builder-kanban.md](app-builder-kanban.md) (worked example) · [`assets/kanban-a2ui-messages.json`](../assets/kanban-a2ui-messages.json) (messages sample) · [actions-authoring.md](actions-authoring.md) (CRUD Actions) · [functions-authoring.md](functions-authoring.md) (optional suggest FoO).

**Monorepo only (not shipped in skill installs):** openKMS checkout paths such as `docs/features/app-builder.md` and `docs/tutorials/…` are **unavailable** under `~/.claude/skills`, OpenCode, or Agents zip. Do not rely on them; use this file and the links above.

Agents must use **`python scripts/cli.py apps …` only** — never ad-hoc HTTP to `/api/app-builder/…`.

## What an App is

An **App** is:

1. Product identity (`name`, `api_name`)
2. **Resources** — allowlist of Object Type / Action / Function **api names** (`bindings`)
3. One or more **artifacts** — each an A2UI surface (draft messages → published messages)

App Builder **does not** create ontology types, Actions, or Functions. Those already exist (Manager / Explorer / Function Editor / skill `ontology …`). The App only **wires** them.

There is **no designer chat**. Compose via Settings + Design Source in the SPA, or via this skill’s `apps` CLI.

## Platform vs tenant (hard rule)

| Owns | Examples |
|------|----------|
| **Platform** | Catalog + host events (`OntoObjectList`, `executeAction`, `executeFunction`, `loadObjectForEdit`), validation, publish gates, shared A2UI polish |
| **Tenant Source** | Layout, copy, filters, which Button fires which event, Modal ↔ form paths |

**Never invent** platform domain widgets (`OntoKanbanBoard`, board-shaped bindings, app-named SCSS). Multi-column boards = **compose** filtered loaders + `List` + Modals in Source.

## Authoring journey (same as Design right rail)

Order matters. Mirror the SPA checklist:

| # | Step | What it means | Where / CLI |
|---|------|---------------|-------------|
| 1 | **Resources** | Allowlist which OT / Action / Function api names this App may call | Settings → Resources · `apps create\|patch --bindings-json` |
| 2 | **Loaders** | Each `OntoObjectList` writes instances into a DataModel `dataPath` (+ optional filter) | Settings → Loaders · or put loader nodes in A2UI Source |
| 3 | **Layout** | Compose `List` / `Modal` / `TextField` / `Button` + host events; optional `updateDataModel` seeds | Design → Source · `apps patch --a2ui-messages-file` |
| 4 | **Preview** | Live surface + Data model tab (`get('/')` snapshot) | SPA Preview · `apps get <id> --design` to inspect draft |
| 5 | **Publish** | Ship draft → **Apps** gallery/run | SPA Publish · `apps publish <id> --yes` |

### Step details agents get wrong

**Resources** — capability boundary. Host refuses OT/Action/Function not on the allowlist. Publish needs non-empty, resolvable resources + valid Source. Match api names to the tenant (sample uses `updateWorkItem`, not `modifyWorkItem`):

```json
{
  "objectTypes": ["WorkItem"],
  "actions": ["createWorkItem", "updateWorkItem"],
  "functions": ["suggestWorkItemPriority"]
}
```

**Loaders** — `OntoObjectList` is a **loader**, not the visible list. Pair every loader with a basic `List` on the **same** `dataPath`. Filters (e.g. `status` = `To Do`) create one column’s dataset. Sample paths: `/lists/todo`, `/lists/inProgress`, `/lists/done`.

**Layout** — Button actions use host events (below). Form defaults / create seeds = `updateDataModel` in the messages JSON (no separate “form defaults” product surface).

**Preview** — DataModel paths are **surface runtime keys**, not HTTP routes. Design → Data model shows live Preview state only.

**Publish** — `apps synthesize` **resets** draft layout to stub; not a casual refresh.

## How the App talks to the ontology

Runtime glue is the A2UI **DataModel** path tree (e.g. `/lists/todo`, `/editWorkItem/priority`, `/createWorkItem`).

| Host piece | Role | Agent pitfalls |
|------------|------|----------------|
| `OntoObjectList` | Fetch allowlisted OT instances → write `dataPath` | Not a UI list; needs sibling `List` |
| basic `List` | Render rows from DataModel | Row fields = **relative** paths (`title`), never `/title` |
| `executeAction` | Action execute + apply create/modify/delete | Bind form path to Action input; this **persists** |
| `executeFunction` | Run published FoO | Fills DataModel (`outputPath` / `applyPath`+`applyKey`); does **not** persist alone |
| `loadObjectForEdit` | Seed edit form + open Modal | Needs object id; host fills edit bucket |

```text
Resources ──► OntoObjectList ──► DataModel[dataPath] ──► List (display)
TextField / updateDataModel ──► DataModel[formPath]
Button executeAction ──► Action ──► instance create/modify/delete
Button executeFunction ──► FoO ──► DataModel (suggest) ──► later executeAction to save
```

## CLI map

```bash
python scripts/cli.py apps --help
python scripts/cli.py apps list
python scripts/cli.py apps get <app_id>              # published/run doc
python scripts/cli.py apps get <app_id> --design     # draft components + messages
python scripts/cli.py apps create --name "…" --api-name … --bindings-json '{…}' --yes
python scripts/cli.py apps patch <id> --bindings-json '{…}' --a2ui-messages-file ./assets/kanban-a2ui-messages.json --yes
python scripts/cli.py apps synthesize <id> --yes     # wipe draft → stub
python scripts/cli.py apps publish <id> --yes
python scripts/cli.py apps delete <id> --yes
```

`--a2ui-messages-file`: JSON **array** of A2UI v0.9 messages (`createSurface`, `updateDataModel`, `updateComponents`). Reinstall/update the skill if an old install still expects obsolete field names.

## Recommended agent workflow

1. Ensure ontology assets exist (`ontology objects|action-types|functions …`).
2. `apps create` with Resources `--bindings-json` (or patch bindings later).
3. Author messages offline → `apps patch --a2ui-messages-file` (Resources + loaders + layout together is fine). Prefer the shipped sample under `assets/` when building a Kanban-style board.
4. `apps get --design` — confirm components/messages look right.
5. Ask user to check SPA Preview, or reason from design payload + known host rules.
6. `apps publish --yes`.

If validation fails: fix Source; do **not** silent-heal or invent platform components.

## Related

- Kanban composition recipe: [app-builder-kanban.md](app-builder-kanban.md)
- Sample messages: [`assets/kanban-a2ui-messages.json`](../assets/kanban-a2ui-messages.json)
- CLI ↔ HTTP: [REFERENCE.md](REFERENCE.md) § App Builder
