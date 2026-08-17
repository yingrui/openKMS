# App Builder & Apps

**App Builder** authors ontology-backed A2UI apps with an AI designer (Knowledge Map Overview pattern). **Apps** is the published gallery and full-bleed Run surface.

**New app** asks only for a display **name** (a unique internal id is generated). Design is chat-first: the designer sees a live **ontology snapshot**, calls **`set_bindings`** to link existing Object Types / Actions / Functions, then **`set_a2ui_messages`** to reshape A2UI. Builder does **not** create ontology assets.

**Related:** [Ontology Functions](ontology-functions.md) · [Ontology](ontology.md) · [Understanding the ontology (Kanban lab)](../tutorials/understanding-ontology.md) · [Knowledge Map](knowledge-map.md) (Overview A2UI designer)

## Suite Apps

| App | Route | Layout | Role |
|-----|-------|--------|------|
| **App Builder** | `/app-builder` | Ontology-style left rail; full-bleed Design | Author: name shell → AI design → publish |
| **Apps** | `/apps` | No ontology rail | End user: published gallery + Run |

| Route | Role |
|-------|------|
| `/app-builder` | Draft + published apps; **New app** |
| `/app-builder/new` | Name only → create stub draft → Design |
| `/app-builder/:appId/design` | Chat \| Preview / Source / Bindings \| publish |
| `/apps` | Published gallery only |
| `/apps/:appId` | Run **published** A2UI only (404 if draft) |

Permissions reuse `ontology:read` / `ontology:write`.

## Bindings (AI-linked)

Designer tool `set_bindings` stores author-chosen api names; server resolves ids and `bindings_hash`. Example:

```json
{
  "objectType": "YourObjectType",
  "columnProperty": "status",
  "columns": ["todo", "doing", "done"],
  "cardTitleProperty": "title",
  "createAction": "createYourObject",
  "updateAction": "updateYourObject",
  "setStatusAction": "setYourObjectStatus",
  "deleteAction": "deleteYourObject",
  "suggestFunction": null
}
```

**Publish** requires board-ready, resolvable bindings. Invented api names fail validation. Stale hash → gallery **Stale** badge and Run banner.

**Writes** go through Action execute only. Links are read/display only in v1.

## A2UI catalog

Catalog id: `https://openkms.local/a2ui/catalogs/ontology-app/v1.json`.

| Component | Behavior |
|-----------|----------|
| `OntoKanbanBoard` | Columns from bindings; drag → `setStatusAction`; add/edit/delete/FoO |
| `OntoActionButton` | Explicit Action by api_name |
| `OntoFunctionButton` | Published FoO; result panel |
| `OntoObjectLink` | Navigate to Object Explorer type |

Create stores a **stub** A2UI until bindings exist. Designer NDJSON (`surface=ontology_app_designer`): `set_bindings` + `set_a2ui_messages`.

## API

`/api/ontology/apps` (`ontology:read` / `ontology:write`):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ontology/apps` | List (`?status=published`) |
| POST | `/api/ontology/apps` | Create (name + api_name; bindings optional) |
| GET | `/api/ontology/apps/{id}` | Published run (404 if draft) |
| GET | `/api/ontology/apps/{id}/design` | Draft for Builder |
| PATCH | `/api/ontology/apps/{id}` | Update metadata / bindings / draft |
| DELETE | `/api/ontology/apps/{id}` | Delete app |
| POST | `/api/ontology/apps/{id}/synthesize` | Reset draft from bindings (or stub) |
| POST | `/api/ontology/apps/{id}/publish` | Publish (requires resolved bindings) |
| POST | `/api/ontology/apps/{id}/unpublish` | Clear published |
| POST | `/api/ontology/apps/{id}/designer/chat` | NDJSON designer stream |

## Data model

Table `ontology_apps`: `id`, `name`, `api_name` (unique), `description`, `template_id` (e.g. `a2ui`), `bindings` JSONB, `draft_a2ui` / `published_a2ui` JSONB (`format: a2ui_v0_9`, `messages`), `bindings_hash`, `status` (`draft` \| `published`), `created_by`, timestamps.

## Out of scope (v1)

- Creating OT / FoO / Actions inside Builder
- Per-app App Rail icons; Run-by-`api_name` URLs
- Multi-page / non-A2UI apps
