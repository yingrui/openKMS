# App Builder & Apps

**App Builder** is the openKMS **platform** authoring surface for ontology-backed apps. An **App** is a product identity + **resource allowlist** + a runnable **artifact**. **A2UI** is the first-class AI-fast lane (`artifact_kind` / `template_id`: `a2ui`); a **`module`** lane is reserved for hosted custom frontends (not implemented yet).

**Apps** is the published gallery and Run host.

**New app** asks only for a display **name**. Design is chat-first: the designer sees a live **ontology snapshot** (including Action `input_schema` summaries), calls **`set_resources`**, then **`set_a2ui_messages`** to compose platform primitives. Builder does **not** create ontology assets.

**Related:** [Ontology Functions](ontology-functions.md) · [Ontology](ontology.md) · [Understanding the ontology](../tutorials/understanding-ontology.md) · [Knowledge Map](knowledge-map.md) (Overview A2UI designer)

## Suite Apps

| App | Route | Layout | Role |
|-----|-------|--------|------|
| **App Builder** | `/app-builder` | Ontology-style left rail; full-bleed Design | Author: name shell → AI design → publish |
| **Apps** | `/apps` | No ontology rail | End user: published gallery + Run |

| Route | Role |
|-------|------|
| `/app-builder` | Draft + published apps; **New app** |
| `/app-builder/new` | Name only → create stub draft → Design |
| `/app-builder/:appId/design` | Chat \| Preview / Source \| publish |
| `/apps` | Published gallery only |
| `/apps/:appId` | Run **published** a2ui artifact (404 if draft) |

Permissions reuse `ontology:read` / `ontology:write`.

## Resources (capability boundary)

Designer tool `set_resources` stores allowlisted api names; server resolves ids and `bindings_hash`. Example:

```json
{
  "objectTypes": ["WorkItem"],
  "actions": ["createWorkItem", "updateWorkItem"],
  "functions": ["suggestWorkItemPriority"]
}
```

UI wiring lives in the **A2UI Source** (component props), not in a board-shaped bindings table. Legacy kanban binding keys are rejected.

**Publish** requires non-empty, resolvable resources and a valid A2UI draft (no removed components). Stale hash → gallery **Stale** badge and Run banner.

**Writes** go through Action execute only.

## A2UI catalog (a2ui lane)

Catalog id: `https://openkms.local/a2ui/catalogs/ontology-app/v1.json`.

| Component | Behavior |
|-----------|----------|
| `OntoObjectList` | List instances; optional `filterProperty` / `filterValue`; Refresh |
| `OntoActionButton` | One-shot Action by api_name (no form) |
| `OntoFunctionButton` | Published FoO; result panel |
| `OntoObjectLink` | Navigate to Object Explorer |

Layout uses A2UI basic (`Column`, `Row`, `Text`, `Button`, `Modal`, `TextField`, …). Create stores a **stub** until the designer composes a layout. NDJSON (`surface=ontology_app_designer`): `set_resources` + `set_a2ui_messages`.

**Create dialog pattern (Source):** `Modal` (`trigger` = `Button` with `Text` child; `content` = `Column` of `TextField`s bound to DataModel paths + Submit `Button`). Submit uses `action.event` with `name: executeAction` and context `{ actionApiName, inputPath }`. The app host reads the DataModel at `inputPath` and runs Action execute. Action **input shape** comes from the Action (built-in writable fields / Function `input_schema`) — there is no `OntoActionForm` component.

Multi-column “kanban-like” UIs are **composed** from several filtered lists + a Modal form — there is no `OntoKanbanBoard`.

## Artifact kinds

| Kind | Status |
|------|--------|
| `a2ui` | Supported — AI designer + platform primitives |
| `module` | Reserved — hosted custom module (future) |

## API

`/api/ontology/apps` (`ontology:read` / `ontology:write`):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ontology/apps` | List (`?status=published`) |
| POST | `/api/ontology/apps` | Create (name + api_name; resources optional) |
| GET | `/api/ontology/apps/{id}` | Published run (404 if draft) |
| GET | `/api/ontology/apps/{id}/design` | Draft for Builder |
| PATCH | `/api/ontology/apps/{id}` | Update metadata / resources / draft |
| DELETE | `/api/ontology/apps/{id}` | Delete app |
| POST | `/api/ontology/apps/{id}/synthesize` | Reset draft to stub layout |
| POST | `/api/ontology/apps/{id}/publish` | Publish (requires resolved resources + valid A2UI) |
| POST | `/api/ontology/apps/{id}/unpublish` | Clear published |
| POST | `/api/ontology/apps/{id}/designer/chat` | NDJSON designer stream |

## Data model

Table `ontology_apps`: `id`, `name`, `api_name` (unique), `description`, `template_id` (artifact kind: `a2ui` \| `module`), `bindings` JSONB (resources), `draft_a2ui` / `published_a2ui` JSONB (`format: a2ui_v0_9`, `messages`), `bindings_hash`, `status` (`draft` \| `published`), `created_by`, timestamps. API also returns `artifact_kind` (from `template_id`).

## Out of scope (this release)

- Creating OT / FoO / Actions inside Builder
- Module host / loading custom app bundles
- Per-app App Rail icons; Run-by-`api_name` URLs
- Drag-and-drop status boards as a platform widget
