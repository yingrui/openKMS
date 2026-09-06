# openkms-skill assets

Static templates and sample payloads per [agentskills.io](https://agentskills.io/specification) `assets/`.

| File | Use |
|------|-----|
| [`kanban-a2ui-messages.json`](kanban-a2ui-messages.json) | A2UI v0.9 **messages array** for a Kanban-style App (`createSurface` + seeds + `updateComponents`). Pass to `apps patch\|publish --a2ui-messages-file`. |

Read [references/app-builder.md](../references/app-builder.md) before patching; composition notes in [references/app-builder-kanban.md](../references/app-builder-kanban.md) (aligned to this file).

**Assumptions in this sample (keep docs/bindings in sync):**

| Kind | Values in JSON |
|------|----------------|
| Object type | `WorkItem` |
| Actions | `createWorkItem`, `updateWorkItem` (prefer built-in `object_create` / `object_modify`) |
| Function | `suggestWorkItemPriority` (optional suggest only — not required for Save) |
| Loader / List paths | `/lists/todo`, `/lists/inProgress`, `/lists/done` |
| `status` filters | `To Do`, `In Progress`, `done` (exact strings) |
| Form buckets | `/createWorkItem`, `/editWorkItem` |

Adjust api names and filters only if the tenant ontology differs — then update Resources `--bindings-json` to match.
