# App Builder & Apps

**App Builder** is the openKMS **platform** authoring surface for ontology-backed apps. An **App** is a product identity + **resource allowlist** + a set of **artifacts** (each one an A2UI surface). **A2UI** is the first-class AI-fast lane (`app_kind` from `template_id`: `a2ui`); a **`module`** lane is reserved for hosted custom frontends (not implemented yet).

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
| `/app-builder/:appId/design` | Chat \| artifacts tabs \| Preview / Source \| publish |
| `/app-builder/:appId/settings` | General (name / description) \| versions + rollback |
| `/apps` | Published gallery only |
| `/apps/:appId` | Run **published** a2ui app (404 if draft) |

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

UI wiring lives in the **A2UI Source** (component props), not in a board-shaped bindings table. Old board-shaped binding keys are rejected at save time.

**Publish** requires non-empty, resolvable resources and valid A2UI Source (no removed components). Stale hash → gallery **Stale** badge and Run banner.

**Writes** go through Action execute only.

## Platform vs published app

| Platform (openKMS code) | Published app (tenant A2UI Source in DB) |
|---------------------------|------------------------------------------|
| Catalog + host hooks (`executeAction`, `loadObjectForEdit`, `OntoObjectList` loader) | Layout, copy, filters, which Action opens which Modal |
| Shared A2UI styling (`_a2ui-platform.scss`) | Resource allowlist + draft artifacts (`app_components`) + published version snapshot |
| Validation, Designer NDJSON, publish gates | Domain UX (e.g. column boards composed from filtered lists) |

The platform must **not** ship domain UI (no Kanban widget, no app-named buttons, no board-shaped binding keys, no synthesizers that emit a named product layout). Kanban-style boards are **tenant content** composed in Source — see [Understanding the ontology](../tutorials/understanding-ontology.md).

**Validation:** invalid Source or removed catalog components **fail** at save/publish and surface in Design — the server does **not** silently replace draft JSON on load. Use **Reset layout** (`POST …/synthesize`) to return to a generic stub, then re-compose with the Designer.

**Removed catalog components** (reject at validation): `OntoKanbanBoard`, `OntoActionForm`. Use basic `Modal` + `TextField` + `executeAction` instead.

## Artifacts & protocol direction

An App renders a set of **artifacts**; each artifact is one A2UI **surface** (`surfaceId`), shown as a tab in Run (single active). The designer chat is the seed of this generative-UI flow: the agent produces or updates an artifact through a tool (`set_a2ui_messages` today, generalized later), and the host renders it in the artifact area rather than the message body.

**Protocol.** Long-term, align the agent ↔ frontend **event** layer to **AG-UI** (Agent–User Interaction), which standardizes lifecycle, text/tool streaming, state, HITL interrupts, and **generative UI** events. A2UI is the generative-UI **spec** (payload); AG-UI is the **event** transport. We do **not** add AG-UI as a dependency yet — today's designer NDJSON (`delta` / `tool_*` / `done`) stays, and artifacts travel as A2UI surfaces over those events. No home-grown protocol fields are added.

## A2UI catalog (a2ui lane)

Catalog id: `https://openkms.local/a2ui/catalogs/ontology-app/v1.json`.

| Component | Behavior |
|-----------|----------|
| `OntoObjectList` | **Data loader** — fetches instances into DataModel at `dataPath`; compose with basic `List` + row template |
| `OntoActionButton` | One-shot Action by api_name (no form) |
| `OntoFunctionButton` | Published FoO; result panel |
| `OntoObjectLink` | Navigate to Object Explorer |

Layout uses A2UI basic (`Column`, `Row`, `Text`, `Button`, `Modal`, `TextField`, …). Create stores a **stub** until the designer composes a layout. NDJSON (`surface=ontology_app_designer`): `set_resources` + `set_a2ui_messages`.

**List pattern (Source):** `OntoObjectList` (`dataPath`, `objectType`, optional filters) + `List` with `children: { componentId, path }` row template. **Inside the row template**, bind fields with **relative** paths (`title`, `id`) — not `/title` (that resolves to the DataModel root, so text stays empty). Row edit: `Button` → `loadObjectForEdit`; shared edit `Modal` + `executeAction` (`updateWorkItem`).

**Create dialog pattern (Source):** `Modal` (`trigger` = `Button` with `Text` child; `content` = `Column` of `TextField`s bound to DataModel paths + Submit `Button`). Submit uses `action.event` with `name: executeAction` and context `{ actionApiName, inputPath }`. The app host reads the DataModel at `inputPath` and runs Action execute. Action **input shape** comes from the Action (built-in writable fields / Function `input_schema`) — there is no `OntoActionForm` component.

Multi-column “kanban-like” UIs are **composed** in Source from filtered lists + Modals — there is no `OntoKanbanBoard`. Invalid or removed-component Source fails validation; use **Reset layout** (`POST …/synthesize`) then the Designer to compose again.

## App kinds

| Kind | Status |
|------|--------|
| `a2ui` | Supported — AI designer + platform primitives |
| `module` | Reserved — hosted custom module (future) |

## Backend code

| Layer | Path |
|-------|------|
| HTTP | `backend/app/api/app_builder.py` |
| Services | `backend/app/services/app_builder/` — `a2ui.py`, `designer.py`, `service.py`, `session.py` |
| Model / schemas | `backend/app/models/app_builder.py`, `backend/app/schemas/app_builder.py` |

Frontend: `frontend/src/pages/app-builder/` (Design UI), `frontend/src/pages/app-builder/a2ui/` (Run/Preview surface + catalog), `frontend/src/data/appBuilderApi.ts`, `frontend/src/components/app-builder/` (`AppBuilderNavRail.tsx`, `routing.ts`). Apps gallery/run shells live under `frontend/src/pages/apps/`.

## API

`/api/app-builder/apps` (`ontology:read` / `ontology:write`):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/app-builder/apps` | List (`?status=published`) |
| POST | `/api/app-builder/apps` | Create (name + api_name; resources optional) |
| GET | `/api/app-builder/apps/{id}` | Published run (404 if draft) |
| GET | `/api/app-builder/apps/{id}/design` | Draft for Builder |
| PATCH | `/api/app-builder/apps/{id}` | Update metadata / resources / draft |
| DELETE | `/api/app-builder/apps/{id}` | Delete app |
| POST | `/api/app-builder/apps/{id}/synthesize` | Reset draft to stub layout |
| POST | `/api/app-builder/apps/{id}/publish` | Publish draft (requires resolved resources + valid components; snapshot → new version) |
| POST | `/api/app-builder/apps/{id}/unpublish` | Clear published |
| GET | `/api/app-builder/apps/{id}/versions` | List published versions |
| POST | `/api/app-builder/apps/{id}/versions/{version_id}/rollback` | Rollback published to a version |
| POST | `/api/app-builder/apps/{id}/designer/chat` | NDJSON designer stream |

## Data model

Tables:

- `ontology_apps`: `id`, `name`, `api_name` (unique), `description`, `template_id` (app kind: `a2ui` \| `module`), `bindings` JSONB (resources), `published_version_id`, `bindings_hash`, `status` (`draft` \| `published`), `created_by`, timestamps. API returns `app_kind` (from `template_id`) and `published_version`.
- `app_components`: `id`, `app_id` (FK → `ontology_apps`), `name`, `position`, `is_default`, `a2ui_messages` JSONB — the **draft artifacts**, each one an A2UI surface.
- `app_published_versions`: `id`, `app_id` (FK → `ontology_apps`), `version`, `components` JSONB snapshot, `bindings` JSONB snapshot, `created_by`, `created_at` — immutable publish snapshots for rollback.

## Out of scope (this release)

- Creating OT / FoO / Actions inside Builder
- Module host / loading custom app bundles
- Per-app App Rail icons; Run-by-`api_name` URLs
- Drag-and-drop status boards as a platform widget
