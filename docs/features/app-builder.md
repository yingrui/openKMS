# App Builder & Apps

**App Builder** authors ontology-backed A2UI apps. **Apps** is the published gallery and full-bleed Run surface — end users never need Builder.

Authors open **New app**, enter a name, and bind api names that already exist in their tenant. The platform does **not** suggest domain templates or seed Object Types / Actions.

**Related:** [Ontology Functions](ontology-functions.md) · [Ontology](ontology.md) · [Understanding the ontology (Kanban lab)](../tutorials/understanding-ontology.md) · [Knowledge Map](knowledge-map.md) (Overview A2UI designer pattern)

## Suite Apps

| App | Route | Layout | Role |
|-----|-------|--------|------|
| **App Builder** | `/app-builder` | Ontology-style left rail (list / new); full-bleed Design | Author: bindings form, A2UI design, publish |
| **Apps** | `/apps` | No ontology rail | End user: published gallery + Run |

| Route | Role |
|-------|------|
| `/app-builder` | Draft + published apps; **New app** |
| `/app-builder/new` | Bindings form (does **not** create OT/Actions/FoOs) |
| `/app-builder/:appId/design` | 3-pane designer (chat \| live draft \| publish) |
| `/apps` | Published gallery only |
| `/apps/:appId` | Run **published** A2UI only (404 if draft) |

Permissions reuse `ontology:read` / `ontology:write` (no separate `apps:*` keys in v1).

## Bindings

Wizard requires user-entered api names; server resolves ids and `bindings_hash` at create/update/publish. Example shape (values are **author-chosen**):

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

Missing or unknown bindings block create/update (400 with `missing_bindings`). Stale hash → gallery **Stale** badge and Run banner; writers repair in Design.

**Writes** go through Action execute only (no direct instance PUT). Links are read/display only in v1.

## A2UI catalog

Catalog id: `https://openkms.local/a2ui/catalogs/ontology-app/v1.json`.

| Component | Behavior |
|-----------|----------|
| `OntoKanbanBoard` | Columns from bindings; drag → `setStatusAction`; add/edit/delete/FoO |
| `OntoActionButton` | Explicit Action by api_name |
| `OntoFunctionButton` | Published FoO; result panel |
| `OntoObjectLink` | Navigate to Object Explorer type |

Create synthesizes draft A2UI from the submitted bindings. Designer NDJSON chat (`surface=ontology_app_designer`) can rearrange layout via `set_a2ui_messages`. Publish copies draft → `published_a2ui`; unpublish clears published and returns to draft.

## API

`/api/ontology/apps` (`ontology:read` / `ontology:write`):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ontology/apps` | List (`?status=published` for gallery) |
| POST | `/api/ontology/apps` | Create + synthesize draft |
| GET | `/api/ontology/apps/{id}` | **Published** run document (404 if draft) |
| GET | `/api/ontology/apps/{id}/design` | Draft for Builder |
| PATCH | `/api/ontology/apps/{id}` | Update metadata / bindings / draft messages |
| DELETE | `/api/ontology/apps/{id}` | Delete app |
| POST | `/api/ontology/apps/{id}/synthesize` | Reset draft from bindings |
| POST | `/api/ontology/apps/{id}/publish` | Publish (optional body `a2ui_messages`) |
| POST | `/api/ontology/apps/{id}/unpublish` | Clear published |
| POST | `/api/ontology/apps/{id}/designer/chat` | NDJSON designer stream |

## Data model

Table `ontology_apps`: `id`, `name`, `api_name` (unique), `description`, `template_id` (e.g. `a2ui`), `bindings` JSONB, `draft_a2ui` / `published_a2ui` JSONB (`format: a2ui_v0_9`, `messages`), `bindings_hash`, `status` (`draft` \| `published`), `created_by`, timestamps.

## Out of scope (v1)

- Per-app App Rail icons; Run-by-`api_name` URLs
- Creating OT / FoO / Actions inside Builder
- Link create/delete edit ops; multi-page / non-A2UI apps
