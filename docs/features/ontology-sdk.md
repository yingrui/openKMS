# Ontology SDK

Typed Python helpers for Ontology Functions and external callers. Aligns with Palantir’s split: **platform packages** (`openkms_functions`) plus a **generated ontology SDK** (`openkms_ontology_sdk`).

**Related:** [Ontology Functions](ontology-functions.md) · [Research](../research/ontology_functions_and_actions.md)

## Packages

| Package | Role |
|---------|------|
| `openkms_functions` | `@function` decorator, `Client`, `ExecuteContext`, `create_edit_batch` |
| `openkms_ontology_sdk` | Generated object-type and published-query markers (`api_name` dataclasses) |

Both live under `ontology-function-service/` and are on the ofs subprocess `PYTHONPATH`. External scripts add the same path (or install as editable packages).

## Authoring (inside Function Editor)

```python
from openkms_functions import Client, function
from openkms_ontology_sdk import helloGreeting

@function(uses=["helloGreeting"])
def execute(input: dict, client: Client) -> dict:
    greeting = client(helloGreeting).execute_function({"name": input.get("name", "")})
    rows = client("Employee").search(limit=10)
    return {"greeting": greeting, "count": len(rows)}
```

- Publish validates `uses=` against published functions.
- Nested `execute_function` is depth- and cycle-guarded.

## Codegen

Generated after **Manager → Publish**, into `ontology-function-service/openkms_ontology_sdk/` (override with `OPENKMS_ONTOLOGY_SDK_OUTPUT_DIR`).

Manual regenerate (HTTP-based CLI):

```bash
OPENKMS_API_URL=http://localhost:8102 OPENKMS_API_KEY=… \
  python scripts/generate_ontology_sdk.py
```

Publish regenerates from the database (no API key required on the server).

## External callers (same Client)

```python
import sys
sys.path.insert(0, "ontology-function-service")

from openkms_functions import Client
from openkms_ontology_sdk import helloGreeting

client = Client("http://localhost:8102", token="YOUR_API_KEY")
print(client(helloGreeting).execute_function({"name": "openKMS"}))
```

Use a personal API key (`Authorization: Bearer`). The Client talks to existing REST endpoints (`/api/object-types/…`, `/api/ontology/functions/by-api-name/…/execute`).

## Edits (foundation)

```python
from openkms_functions import create_edit_batch, function

@function(edits=["Employee"])
def execute(input: dict, client) -> dict:
    batch = create_edit_batch()
    batch.modify("Employee", primary_key=input["id"], status="active")
    return {"edits": batch.get_edits()}
```

`create_edit_batch` records intended Ontology edits. Applying those edits via Actions / object write APIs is the next product step; authors can return the edit list today for inspection.

## Input schema

When a version’s `input_schema` is a JSON Schema object with `required` / `properties.type`, execute rejects invalid input with HTTP 400 before calling ofs.
