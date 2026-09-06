# App Builder: Kanban-style board (worked example)

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**.

**First read the mechanism:** [app-builder.md](app-builder.md) (Resources → Loaders → Layout → Preview → Publish, host events, CLI). This page is only the **Kanban teaching composition**.

**Do not invent** `OntoKanbanBoard` or board-shaped bindings. Columns = filtered `OntoObjectList` + basic `List` + Modals.

**In this skill:** sample messages [`assets/kanban-a2ui-messages.json`](../assets/kanban-a2ui-messages.json); Function source [functions-authoring.md](functions-authoring.md).

**Monorepo only (not in skill installs):** `docs/features/app-builder.md` and `docs/tutorials/understanding-ontology.md` (Step F) exist only inside an openKMS git checkout. Prefer this file + the asset when running from `~/.claude/skills` / OpenCode / Agents.

## Map journey → Kanban (matches the sample asset)

| Journey step | In [`kanban-a2ui-messages.json`](../assets/kanban-a2ui-messages.json) |
|--------------|----------------------------------------------------------------------|
| 1 Resources | `WorkItem`; Actions `createWorkItem`, `updateWorkItem`; Function `suggestWorkItemPriority` |
| 2 Loaders | `OntoObjectList` → `/lists/todo`, `/lists/inProgress`, `/lists/done` with `filterProperty`=`status` and values `To Do` / `In Progress` / `done` |
| 3 Layout | `boardRow` of three Cards; each = title + loader + `List` (`componentId` `workItemCard`); create Modal + edit Modal (Suggest + Save) |
| 4 Preview | Column lists fill from loaders; forms use `/createWorkItem` and `/editWorkItem` |
| 5 Publish | Opens under **Apps** |

**Persist vs suggest:** Suggest button uses `executeFunction` with `applyPath` `/editWorkItem/priority` + `applyKey` `priority`; Save uses **`executeAction`** `updateWorkItem`.

**Status filters must match instance property values exactly** (sample Done column uses lowercase `done`).

## One column (as in the sample)

1. `OntoObjectList` — `objectType`=`WorkItem`, `filterProperty`/`filterValue`, `dataPath` (e.g. `/lists/todo`).
2. Sibling `List` with `children.path` = same path and `componentId`=`workItemCard`.
3. Row edit Button → `loadObjectForEdit` → shared `editModal` (`inputPath` `/editWorkItem`).

Toolbar: Modal + TextFields + Button → `executeAction` `createWorkItem`. Edit Modal: fields + Suggest (`executeFunction`) + Save (`executeAction` `updateWorkItem`).

List row fields use **relative** paths (`title`, `status`, …), never `/title`.

## CLI sketch

```bash
# After WorkItem + Actions (+ FoO) exist — see app-builder.md for full journey
python scripts/cli.py apps create \
  --name "Kanban" --api-name kanban \
  --bindings-json '{"objectTypes":["WorkItem"],"actions":["createWorkItem","updateWorkItem"],"functions":["suggestWorkItemPriority"]}' \
  --yes
# From skill root (standalone). Project agent: .openkms/skills/openkms/assets/kanban-a2ui-messages.json
python scripts/cli.py apps patch <app_id> --a2ui-messages-file ./assets/kanban-a2ui-messages.json --yes
python scripts/cli.py apps get <app_id> --design
python scripts/cli.py apps publish <app_id> --yes
```

## Prerequisites

1. Object type with a column property (e.g. `WorkItem.status`) whose values match the sample filters (or edit the JSON filters).
2. Action types `createWorkItem` / `updateWorkItem` whose Functions return `create_edit_batch()` edits.
3. Optional FoO `suggestWorkItemPriority` accepting `work_item_id` / `object_id`, returning `priority` (and optional `hint`).
4. A few Explorer instances so columns are non-empty.

## What not to do

- Platform Kanban widget / board bindings / app-specific SCSS.
- Rely on `executeFunction` alone to persist.
- Absolute paths in List row templates.
- Ad-hoc HTTP instead of `apps` CLI.
- Casual `apps synthesize` (wipes draft layout).
- Invent different DataModel paths than the sample without updating both loaders and Lists together.
