# Ontology Function Client (`openkms_functions`)

Platform authoring and caller library for Ontology Functions. Aligns with Palantir’s **`@osdk/client`** layer: a stable Client API that uses **string api names** (`client("WorkItem")`), not a generated per-ontology package.

**Related:** [Ontology Functions](ontology-functions.md) · [Research](../research/ontology_functions_and_actions.md)

## What ships

| Package | Role | In git |
|---------|------|--------|
| **`openkms_functions`** | `@function`, `Client`, `create_edit_batch`, testing helpers | Yes |

There is **no** `openkms_ontology_sdk` in openKMS. A Palantir-style *generated* ontology SDK (typed markers per OT / published query) is **not supported**; authors and external scripts use string api names on `Client`.

## Authoring

```python
from openkms_functions import Client, function

@function(uses=["helloGreeting"])
def execute(input: dict, client: Client) -> dict:
    greeting = client("helloGreeting").execute_function({"name": input.get("name", "")})
    rows = client("WorkItem").search(limit=10)
    return {"greeting": greeting, "count": len(rows)}
```

- Publish validates `uses=` against published functions.
- Nested `execute_function` is depth- and cycle-guarded.
- `client("…")` resolves object types / link types / functions by api name over the HTTP API.

## External callers (same Client)

```python
import sys
sys.path.insert(0, "ontology-function-service")

from openkms_functions import Client

client = Client("http://localhost:8102", token="YOUR_API_KEY")
print(client("helloGreeting").execute_function({"name": "openKMS"}))
```

Use a personal API key (`Authorization: Bearer`). The Client talks to existing REST endpoints (`/api/object-types/…`, `/api/ontology/functions/by-api-name/…/execute`).

## Edits (foundation)

```python
from openkms_functions import create_edit_batch, function

@function(edits=["WorkItem"])
def execute(input: dict, client) -> dict:
    batch = create_edit_batch()
    batch.modify("WorkItem", primary_key=input["id"], status="done")
    return {"edits": batch.get_edits()}
```

When a Function returns `{"edits": batch.get_edits()}` from an **Action** execute, the platform **applies `modify` ops** onto resolvable object instances. See [Manager alignment](../research/ontology_manager_alignment.md#product-decision-action-write-back-b1).

## Input schema

When a version’s `input_schema` is a JSON Schema object with `required` / `properties.type`, execute rejects invalid input with HTTP 400 before calling ofs.
