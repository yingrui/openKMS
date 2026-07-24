# Ontology Functions

Author and run **Python Ontology Functions** — Palantir-style logic on top of the object/link schema. Functions are stored in PostgreSQL, edited in **Function Editor**, published in **Ontology Manager**, and executed in a subprocess via **ontology-function-service** (`:8105`).

**Related:** [Ontology](ontology.md) · [Ontology SDK](ontology-sdk.md) · [Research](../research/ontology_functions_and_actions.md)

## Suite Apps

| App | Route | Role |
|-----|-------|------|
| **Ontology Manager** | `/ontology-manager/functions` | Registry, publish, Observability |
| **Function Editor** | `/function-editor` | Create, edit, validate, Live Preview |
| **Object Explorer** | — | Instance browse; Action triggers |

Legacy `/ontology/*` redirects to `/ontology-manager/*`.

## Authoring with SDK

```python
from openkms_functions import Client, function

@function(uses=["helloGreeting"])
def execute(input: dict, client: Client) -> dict:
    rows = client("MyObjectType").search(limit=10)
    other = client("helloGreeting").execute_function({"name": input.get("name", "")})
    return {"count": len(rows), "greeting": other}
```

- **`@function(uses=[…])`** — publish fails if a dependency is missing or unpublished.
- **Published queries** sidebar inserts composition snippets.
- **`openkms_ontology_sdk`** regenerates on publish (see [Ontology SDK](ontology-sdk.md)).
- Legacy `execute(input, ctx)` still supported with a deprecation warning.
- When `input_schema` is set (JSON Schema object), execute validates required fields and property types before ofs runs.

Backend logic: `function_service.py`, `execution_service.py`, `sdk_codegen.py`.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ontology/functions` | List functions |
| POST | `/api/ontology/functions` | Create function + v1 (validated) |
| POST | `/api/ontology/functions/{id}/versions` | Save draft version |
| POST | `/api/ontology/functions/{id}/validate` | Static validate |
| POST | `/api/ontology/functions/{id}/publish` | Publish + regenerate SDK |
| POST | `/api/ontology/functions/{id}/execute` | Run draft or `use_published` |
| POST | `/api/ontology/functions/by-api-name/{apiName}/execute` | Run published by api name |
| GET | `/api/ontology/functions/{id}/executions` | Observability |

Groups: `/api/ontology/groups`. Action types: `/api/ontology/action-types` (honor optional pinned `function_version`).

## Runtime

1. Editor or Manager calls backend `execute`.
2. Backend loads `source_code` + `entrypoint` from `ontology_function_versions`.
3. Validates `input_schema` and call depth/stack.
4. POSTs to ofs `/execute`.
5. ofs resolves `@function` (or legacy `execute`), injects `Client`, runs subprocess.
6. Audit row in `ontology_function_executions`.

Start ofs locally: `cd ontology-function-service && ./dev.sh`.

## Seed

Migration seeds **`helloGreeting`** — pass `{"name": "openKMS"}` in Live Preview.
