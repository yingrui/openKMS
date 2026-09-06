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
- Bypass CLI with ad-hoc HTTP — if a subcommand is missing, extend this skill.
