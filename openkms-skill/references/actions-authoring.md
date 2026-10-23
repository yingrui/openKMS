# Ontology Action authoring (built-in CRUD first)

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**.

**Read this before** `ontology action-types create|update|delete|execute`.

Do **not** invent `rule_type` values by probing the API. Do **not** create throwaway “probe” Actions. Use only the values below.

## `rule_type` (runtime whitelist — not a free string)

| Value | Needs Function? | What execute does |
|-------|-----------------|-------------------|
| **`object_create`** | No | Creates an Explorer instance from `input` properties |
| **`object_modify`** | No | Merges `input` properties onto an existing instance |
| **`object_delete`** | No | Deletes an existing instance |
| **`function`** | Yes (`--function-id`) | Runs published FoO, then applies `create_edit_batch()` edits |

**Default for Kanban / Explorer forms:** built-in create / modify / delete. Use `function` only for custom validation, multi-object edits, or non-trivial derived writes. Suggest / compute without persist → published **Function** + App `executeFunction`, not an Action.

OpenAPI may show `rule_type` as a plain string; the server still rejects unknown values with **400** `unsupported rule_type`. CLI `--rule-type` choices match the whitelist.

## Create examples (preferred)

```bash
# Create
python scripts/cli.py ontology action-types create \
  --api-name createWorkItem --display-name "Create Work Item" \
  --object-type-id OT_ID --rule-type object_create --yes

# Modify (update)
python scripts/cli.py ontology action-types create \
  --api-name updateWorkItem --display-name "Update Work Item" \
  --object-type-id OT_ID --rule-type object_modify --yes

# Delete
python scripts/cli.py ontology action-types create \
  --api-name deleteWorkItem --display-name "Delete Work Item" \
  --object-type-id OT_ID --rule-type object_delete --yes
```

Do **not** pass `--function-id` for these three.

## Execute

- Target instance: prefer top-level `--object-id OI` (App host maps A2UI `objectId` the same way). `input.object_id` also works for modify/delete.
- `input` is property values. Built-in schemas are derived from the object type: **required object-type properties are required on execute** (including modify/delete). Fill them via `loadObjectForEdit` in Apps, or pass the full required set in `--input-json`.

```bash
python scripts/cli.py ontology action-types execute \
  --id AT_ID --object-id OI \
  --input-json '{"title":"…","status":"To Do"}' --yes
```

## Convert Function-backed → built-in (same `api_name`)

1. Prefer **in-place** update (keeps App bindings):

```bash
python scripts/cli.py ontology action-types update --id AT_ID \
  --rule-type object_modify --clear-function --yes
```

Switching `--rule-type` to a built-in type also clears the Function binding server-side even without `--clear-function`.

2. If you must recreate: **`api_name` is unique across all statuses** (including `archived`). Archive alone does **not** free the name — **delete** the old Action first:

```bash
python scripts/cli.py ontology action-types delete --id AT_ID --yes
python scripts/cli.py ontology action-types create … --api-name createWorkItem --rule-type object_create --yes
```

## Delete / archive

| Goal | Command |
|------|---------|
| Soft-disable | `update --id AT --status archived --yes` |
| Free `api_name` / remove forever | `delete --id AT --yes` |

`list` returns **all statuses**. Filter mentally (or with `jq`) for `status=="active"` when wiring Apps.

## Do not

- Default new CRUD Actions to `--rule-type function`.
- Probe unknown rule types (`object_update`, `object_edit`, …) — they fail; use the table above.
- Leave archived Actions that still hold `api_name`s you need — **delete** them.
- Expect Action execute alone to update **dataset-backed** synthetic ids (deferred).
- Bypass CLI with ad-hoc HTTP — if a subcommand is missing, report the gap to the user; only a maintainer working in a skill-source checkout adds it there.

## Dataset-backed object types

Create / modify / delete all work. One rule: an `object_create` must carry the object's **business
key** in `properties` (`id`, `ts_code`, …) — the node and the row the app inserts have to be the
same object, so a create without it is refused. `object_modify` / `object_delete` need only
`object_id`; an existing object's own required columns are not inputs.

The edit lands on the object's node as an overlay, the webhook tells the app, and the next index
writes the table's values back — a delivery that failed is reverted, not believed. So the whole
add/modify/remove cycle is Actions plus webhooks; no Function is needed for a state write.

## Webhooks (no Function needed)

If an Action's job is "change the ontology, then tell the owning application", register the
destination on the Action instead of writing a Function:

```bash
ontology action-types update --id AT --webhook-service turtle \
  --webhook-path /api/webhooks/openkms/portfolio-changes --yes
```

**Verb and body.** `--webhook-method` picks the receiver's verb (a removal is `DELETE`), and
`--webhook-body envelope` (default) posts
`{event, action, object, input, applied, caller, status, action_log_id, at}`; `--webhook-body object`
posts the **resource representation** — the object's properties with the Action's input on top — so
the receiver's own REST endpoint accepts it and the app needs no webhook-shaped handler:

```bash
ontology action-types update --id AT --webhook-service turtle \
  --webhook-path '/api/portfolios/{portfolio_id}/stocks' --webhook-body object --yes
```

`{field}` in the path is filled from the object's properties, the input, `object_id`/`object_type`;
a missing field is an error, not a guess. Delivery is best-effort **after** the change is committed,
so a receiver that is down never fails the Action. **Nothing re-indexes on failure** — check the
action log (`webhook_ok` / `webhook_status` / `webhook_error`) and refresh the type explicitly when
you want the bound table to win again. Clearing: `--webhook-service ''`.
