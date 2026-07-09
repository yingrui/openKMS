# Ontology Functions

Author and run **Python Ontology Functions** — Palantir-style logic on top of the object/link schema. Functions are stored in PostgreSQL, edited in **Function Editor**, published in **Ontology Manager**, and executed in a subprocess via **ontology-function-service** (`:8105`).

**Related:** [Ontology](ontology.md) · [Research — ontology_functions_and_actions](../research/ontology_functions_and_actions.md)

## Suite Apps

| App | Route | Role |
|-----|-------|------|
| **Ontology Manager** | `/ontology-manager/functions` | Registry, publish, observability |
| **Function Editor** | `/function-editor` | Create, edit code, validate, Live Preview (draft) |
| **Object Explorer** | — | Instance browse only; does not host Function IDE |

Legacy `/ontology/*` redirects to `/ontology-manager/*`.

## Authoring with SDK

New functions use the **`openkms_functions`** package (injected by the executor):

```python
from openkms_functions import ExecuteContext

def execute(input: dict, ctx: ExecuteContext) -> dict:
    rows = ctx.ontology.search_objects("MyObjectType", limit=10)
    return {"count": len(rows)}
```

MVP `OntologyClient` is **read-only** (objects and links via backend HTTP with the caller's token).

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ontology/functions` | List functions |
| POST | `/api/ontology/functions` | Create function + v1 |
| POST | `/api/ontology/functions/{id}/versions` | Save new draft version |
| POST | `/api/ontology/functions/{id}/validate` | Static validate |
| POST | `/api/ontology/functions/{id}/publish` | Publish latest or `version_id` |
| POST | `/api/ontology/functions/{id}/execute` | Run draft or `use_published` |
| POST | `/api/ontology/functions/by-api-name/{apiName}/execute` | Run published by api name |
| GET | `/api/ontology/functions/{id}/executions` | Observability |

Groups: `/api/ontology/groups`. Action types: `/api/ontology/action-types`.

## Runtime

1. Editor or Manager calls backend `execute`.
2. Backend loads `source_code` from `ontology_function_versions`.
3. Backend POSTs to `OPENKMS_ONTOLOGY_FUNCTION_SERVICE_URL/execute`.
4. ofs runs `bootstrap.py` in a **subprocess** with `PYTHONPATH` including `openkms_functions`.
5. Result and audit row in `ontology_function_executions`.

Start ofs locally: `cd ontology-function-service && ./dev.sh`.

## Seed

Migration seeds **`helloGreeting`** — pass `{"name": "openKMS"}` in Live Preview.
