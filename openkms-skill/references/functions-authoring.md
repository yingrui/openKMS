# Ontology Function authoring

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**. Read this **before** writing `--source-code-file` for `ontology functions create|save-version|validate`.
Ship code via the skill CLI only; do not invent HTTP clients inside function source.

## Minimal template (required shape)

```python
from openkms_functions import Client, function


@function
def execute(input: dict, client: Client) -> dict:
    """Return a JSON-serializable dict."""
    return {"ok": True, "echo": input}
```

Rules:

- Entrypoint name defaults to **`execute`**.
- Signature: `(input: dict, client: Client) -> dict` (return must be JSON-serializable).
- Decorate with **`@function`** (or `@function(uses=[...])` / `@function(edits=[...])`).
- Allowed top-level imports only: `openkms_functions`, `openkms_ontology_sdk`, `typing`, `datetime`, `json`, `math`, `re`, `decimal`.

## Client API (runtime-injected)

`client` is injected by ontology-function-service. Do not construct `Client(...)` yourself inside Functions.

| Call | Meaning |
|------|---------|
| `client("ObjectTypeName").search(limit=N, filters={"search": "…", "status": "in_progress"})` | List instances; non-`search` keys become `prop.<name>=` equality filters |
| `client("ObjectTypeName").fetch_one(object_id)` | One instance by id |
| `client.get_links("LinkTypeName", source_id=…, limit=N)` | Link rows filtered by `source_object_id` on the server |
| `client("publishedApiName").execute_function({…})` | Call another **published** Function |
| `client(sdkMarker).execute_function({…})` | Same, using generated `openkms_ontology_sdk` marker |

Object-type argument is the ontology **object type `name`** (e.g. `Stock`), not the dataset table name.

```python
from openkms_functions import Client, function


@function
def execute(input: dict, client: Client) -> dict:
    ts_code = input.get("ts_code") or ""
    rows = client("Stock").search(filters={"search": ts_code}, limit=5)
    return {"count": len(rows), "items": rows}
```

Composition (declare dependencies):

```python
from openkms_functions import Client, function


@function(uses=["helloGreeting"])
def execute(input: dict, client: Client) -> dict:
    greeting = client("helloGreeting").execute_function({"name": input.get("name", "")})
    return {"greeting": greeting}
```

- `uses=[…]` values are other Functions’ **`api_name`** strings (or SDK markers).
- **Publish fails** if a dependency is missing or unpublished.

## input_schema

Pass JSON Schema on create/save-version (`--input-schema-json`). Execute validates required fields before ofs runs.

Example: `{"type":"object","required":["ts_code"],"properties":{"ts_code":{"type":"string"}}}`

## Lifecycle via skill CLI

1. Write `./my_fn.py` using this doc.
2. `ontology functions create --api-name myFn --display-name "…" --source-code-file ./my_fn.py --input-schema-json '…' --yes`
3. `ontology functions validate --id FN --source-code-file ./my_fn.py --yes`
4. `ontology functions publish --id FN --yes`
5. `ontology functions execute-by-api-name --api-name myFn --input-json '…' --yes`

Iterate with `save-version` then validate → publish again.

Seed check: published **`helloGreeting`** with `{"name":"openKMS"}`.

## Functions vs Actions vs Connectors

| Layer | Role |
|-------|------|
| **Function** | Read / compute / compose; return a dict (`Client` is read/compose only) |
| **Action type** | Intentional op; execute runs the bound Function + audit, then **applies `modify` edits** on resolvable object instances. Dataset/Neo4j synthetic ids and create/delete apply are still deferred |
| **Connector sync** | Load external datasets (e.g. Tushare) — **never** implement sync inside a Function |

Edits: return `{"edits": create_edit_batch().…get_edits()}` from an Action-bound Function to persist `modify` property merges. Domain types (Stock, screens) are **tenant DIY**, not platform seeds — skill Workflow **G**.

## Do not

- Import `httpx` / `requests` / open arbitrary URLs from Function source.
- Call Tushare or other vendors from Function code — use connector-backed datasets + object types.
- Neo4j-index huge daily fact tables just to query them from Functions — search dataset-backed OTs or keep facts as datasets.
- Blind-retry `publish` when validate/uses errors appear on stderr — fix source or publish dependencies first.
- Expect Action execute to update **dataset-backed** synthetic ids until that resolution ships.
