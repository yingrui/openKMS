# Commands — ontology (objects, links, Cypher, Functions, Actions)

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**. Load for Object Explorer / Manager / Function Editor / Action work.

Prefix with `python scripts/cli.py`. Writes need `--yes` / `--dry-run`. Before Function source or Action type create|update|delete|execute, open the mandatory authoring guides linked below. Gotchas: [pitfalls.md](pitfalls.md).

## Read / query

| Goal | Command |
|------|---------|
| Cypher | `ontology cypher --query "MATCH (n) RETURN n LIMIT 10"` |
| NL → Cypher only | `ontology text-to-cypher --question "…"` |
| NL → Cypher → answer (3-call chain) | `ontology ask --question "…"` |
| Object types | `ontology objects list [--master-data-only] [--count-from-neo4j]` · `ontology objects get --id OT_ID` |
| Object instances | `ontology objects instances list --type-id OT_ID --limit 50` · `… instances get --type-id OT_ID --id OI_ID` |
| Link types / instances | `ontology links list` · `ontology links get --id LT_ID` · `ontology links instances list --type-id LT_ID --limit 50` |
| Functions | `ontology functions list` · `ontology functions execute-by-api-name --api-name NAME --input-json '{}' --yes` |
| Action types | `ontology action-types list` |
| Groups | `ontology groups list` |

## Write — objects & links

| Goal | Command |
|------|---------|
| Object type CRUD | `ontology objects create-type --name "Disease" --properties-json '[…]' --yes` · `update-type` · `delete-type` |
| Object instance CRUD | `ontology objects instances create\|update\|delete … --yes` |
| Sync objects → Neo4j | `ontology objects sync-neo4j --neo4j-data-source-id DS --yes` · `sync-neo4j-type --type-id OT_ID --neo4j-data-source-id DS --yes` |
| Link type CRUD | `ontology links create-type --name covers --source-type-id … --target-type-id … --cardinality many-to-many --yes` · `update-type` · `delete-type` |
| Link instance CRUD | `ontology links instances create\|delete … --yes` (dataset-backed M2M may 4xx — see [pitfalls.md](pitfalls.md)) |
| Sync links → Neo4j | `ontology links sync-neo4j --neo4j-data-source-id DS --yes` · `sync-neo4j-type --type-id LT_ID --neo4j-data-source-id DS --yes` |

`sync-neo4j*` **requires** `--neo4j-data-source-id` from `data-sources list` (kind `neo4j`).

## Write — Functions & Actions

| Goal | Command |
|------|---------|
| Create / validate / publish Function | **Read [functions-authoring.md](functions-authoring.md) first**, then `ontology functions create … --source-code-file ./fn.py --yes` → `validate` → `publish` |
| Action type CRUD / execute | **Read [actions-authoring.md](actions-authoring.md) first**. Prefer built-in: `ontology action-types create … --rule-type object_create\|object_modify\|object_delete --yes`. Convert: `update --id AT --rule-type object_modify --clear-function --yes`. Free `api_name`: `delete --id AT --yes`. Execute: `execute --id AT --object-id OI --yes` |

Recipes: [workflows.md](workflows.md) **C**, **G**. Operators HTTP map: [REFERENCE.md](REFERENCE.md).
