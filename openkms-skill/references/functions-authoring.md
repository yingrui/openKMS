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
- Allowed top-level imports only: `openkms_functions`, `typing`, `datetime`, `json`, `math`, `re`, `decimal`.

## Client API (runtime-injected)

`client` is injected by ontology-function-service. Do not construct `Client(...)` yourself inside Functions.

| Call | Meaning |
|------|---------|
| `client("ObjectTypeName").search(limit=N, filters={"search": "…", "status": "in_progress"})` | List instances; non-`search` keys become `prop.<name>=` equality filters |
| `client("ObjectTypeName").fetch_one(object_id)` | One instance by id |
| `client.get_links("LinkTypeName", source_id=…, limit=N)` | Link rows filtered by `source_object_id` on the server |
| `client("publishedApiName").execute_function({…})` | Call another **published** Function |
| `client("apiName").execute_function({…})` | Compose another published Function by api name |

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

- `uses=[…]` values are other Functions’ **`api_name` strings**.
- **Publish fails** if a dependency is missing or unpublished.

## input_schema / output_schema

Pass JSON Schema on create/save-version (`--input-schema-json`). Execute validates required fields and types before ofs runs.

Mark ontology references with **`x-ontology`** so Manager / Overview Graph know which Object Types and Link Types the Function contracts against (primitives need no annotation, or `"kind":"primitive"`):

Kanban FoO pattern (A2UI host may inject either key; both are WorkItem ids):

```json
{
  "type": "object",
  "anyOf": [{"required": ["work_item_id"]}, {"required": ["object_id"]}],
  "properties": {
    "work_item_id": {
      "type": "string",
      "x-ontology": { "kind": "object_type", "type_name": "WorkItem" }
    },
    "object_id": {
      "type": "string",
      "x-ontology": { "kind": "object_type", "type_name": "WorkItem" }
    }
  }
}
```

Array of object ids (e.g. dependency `blockers` on output):

```json
{
  "type": "array",
  "x-ontology": { "kind": "object_type", "type_name": "WorkItem" },
  "items": { "type": "string" }
}
```

- `kind: object_type` / `link_type` → value is an instance id (`string`) or `array` of ids; `type_name` must match an existing Object Type / Link Type **name**.
- `kind: primitive` (or omit `x-ontology`) → normal JSON types.
- Publish/create rejects unknown `type_name` values.
- Without `x-ontology`, Manager / Overview Graph treat fields as primitives even if the Function has an optional Object Type affiliation.

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
| **Function** | Read / compute / compose; return a dict (`Client` is read/compose only). Optional FoO for suggest / derive — not the default write path |
| **Action type (built-in)** | **First choice for CRUD.** `--rule-type object_create\|object_modify\|object_delete` — no Function; platform applies create / property merge / delete on Explorer instances |
| **Action type (function)** | **Only when custom logic is required.** `--rule-type function` + bound FoO; execute runs the Function + audit, then applies `create_edit_batch()` edits |
| **Connector sync** | Load external datasets (e.g. Tushare) — **never** implement sync inside a Function |

**Prefer built-in Actions** for create / edit / delete WorkItem-style flows (Kanban, Explorer forms). See **[actions-authoring.md](actions-authoring.md)** for `rule_type`, execute addressing, convert/delete. Author a Function-backed Action only for validation, multi-object edits, or non-trivial derived writes. Dataset/Neo4j synthetic ids and link edit ops remain deferred for apply.

Edits from FoO: return `{"edits": create_edit_batch().…get_edits()}` from an Action-bound Function. Domain types (Stock, screens, Kanban WorkItem) are **tenant DIY**, not platform seeds — skill Workflow **G**.

## Do not

- Default new Actions to `--rule-type function` when `object_create` / `object_modify` / `object_delete` would suffice.
- Import `httpx` / `requests` / open arbitrary URLs from Function source.
- Call Tushare or other vendors from Function code — use connector-backed datasets + object types.
- Neo4j-index huge daily fact tables just to query them from Functions — search dataset-backed OTs or keep facts as datasets.
- Blind-retry `publish` when validate/uses errors appear on stderr — fix source or publish dependencies first.
- Expect Action execute to update **dataset-backed** synthetic ids until that resolution ships.
