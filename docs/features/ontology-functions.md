# Ontology Functions

Author and run **Python Ontology Functions** — Palantir-style logic on top of the object/link schema. Functions are stored in PostgreSQL, edited in **Function Editor**, published in **Ontology Manager**, and executed in a subprocess via **ontology-function-service** (`:8105`).

**Related:** [Ontology](ontology.md) · [Ontology SDK](ontology-sdk.md) · [Research](../research/ontology_functions_and_actions.md) · [Manager alignment (platform vs DIY)](../research/ontology_manager_alignment.md) · [Understanding the ontology](../tutorials/understanding-ontology.md) · [Tushare DIY](../tutorials/tushare-market-ontology.md)

## Suite Apps

| App | Route | Role |
|-----|-------|------|
| **Ontology Manager** | `/ontology-manager/functions` | Registry, optional primary object type, Usage (bound action types), publish, Observability |
| **Function Editor** | `/function-editor` | Create (optional primary object type), edit, validate, Live Preview |
| **Object Explorer** | — | Instance browse; Action triggers |

Legacy `/ontology/*` redirects to `/ontology-manager/*`. Optional `object_type_id` on a Function is an affiliation for Groups related resources and Overview Graph — execution still may call any type via `Client`.

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
- Prefer **`client("apiName")`** strings via **`openkms_functions.Client`** (see [Ontology SDK / Client](ontology-sdk.md)). There is no generated ontology marker package.
- Legacy `execute(input, ctx)` still supported with a deprecation warning.
- When `input_schema` is set (JSON Schema object), execute validates required fields, property types, and ontology-typed id shapes before ofs runs.
- I/O fields may declare **`x-ontology`**: `{ "kind": "primitive" | "object_type" | "link_type", "type_name": "WorkItem" }` (`type_name` required for object/link kinds). Manager Overview edits fields structurally; Function Editor can edit the raw JSON. List/detail responses include **`schema_relations`** (referenced OT/LT names + field list) derived from the latest version.

Backend logic: `function_service.py`, `execution_service.py`, `ontology_io_schema.py`.

## External services (calling another system)

A Function's only vocabulary was the openKMS API, so anything that needed another system had to be wired
outside the ontology. **Function Editor → External services** registers the endpoint and gives the author a
name:

```python
@function()
def execute(input: dict, client) -> dict:
    job = client.external("turtle").post("/api/jobs", {"type": "simulation", "portfolio": input["portfolio"]})
    return {"job_id": job.get("id")}
```

| Field | Meaning |
|-------|---------|
| `api_name` | what the source writes (`client.external("turtle")`); fixed at creation |
| `base_url` | origin only (`http://backend:8200`) — the Function supplies the path |
| `auth_kind` | `none` · `bearer` · `header` (named header) · `hmac` (SHA-256 signature of the body, header `X-OpenKMS-Signature` by default) |
| `allowed_paths` | prefixes this service may be called on; anything else is refused **before** the request leaves |
| `timeout_seconds` | 1–60 |

The secret is stored encrypted, never returned by the list API, and resolved at execution time by the
function runtime (`POST …/by-api-name/{name}/resolve`, audited like any other write-shaped call), so it is
not part of the Function source. Note what this design does **not** claim: the sandbox makes the request,
so the allowlist is enforced by the client and by the receiver — not by a network boundary. A deployment
that needs that boundary puts the function runner on a restricted network.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ontology/functions` | List functions |
| POST | `/api/ontology/functions` | Create function + v1 (validated); optional `object_type_id` |
| PATCH | `/api/ontology/functions/{id}` | Update metadata (`display_name`, `description`, `object_type_id`, status) |
| POST | `/api/ontology/functions/{id}/versions` | Save draft version |
| POST | `/api/ontology/functions/{id}/validate` | Static validate |
| POST | `/api/ontology/functions/{id}/publish` | Publish version |
| POST | `/api/ontology/functions/{id}/execute` | Run draft or `use_published` |
| POST | `/api/ontology/functions/by-api-name/{apiName}/execute` | Run published by api name |
| GET | `/api/ontology/functions/{id}/executions` | Observability |

External services: `/api/ontology/external-services` (CRUD + `POST …/by-api-name/{api_name}/resolve`).
Groups: `/api/ontology/groups` (related resources: `GET /api/ontology/groups/{id}/related`). Action types: `/api/ontology/action-types` (honor optional pinned `function_version`). **Built-in** rules `object_create` / `object_modify` / `object_delete` apply edits directly (no Function). **Function** rule type runs the bound Function, audits, and **applies `output.edits` `create` / `modify` / `delete` ops** onto resolvable object instances (`applied.created_ids` / `modified_ids` / `deleted_ids`). Dataset/Neo4j synthetic `object_id` remains deferred ([alignment](../research/ontology_manager_alignment.md#product-decision-action-write-back-b1)). Object list supports `prop.<name>=` equality; link list supports `source_object_id`. Domain object types and Function source remain tenant content, not platform seeds.

## Runtime

1. Editor or Manager calls backend `execute`.
2. Backend loads `source_code` + `entrypoint` from `ontology_function_versions`.
3. Validates `input_schema` and call depth/stack.
4. POSTs to ofs `/execute`.
5. ofs resolves `@function` (or legacy `execute`), injects `Client`, runs subprocess.
6. Audit row in `ontology_function_executions`.

Start ofs locally: `cd ontology-function-service && ./dev.sh`.

**Docker Compose:** service **`ontology-function-service`** (host **`:8105`**). Backend uses **`OPENKMS_ONTOLOGY_FUNCTION_SERVICE_URL=http://ontology-function-service:8105`**. See repo `docker/README.md`.

## Seed

Migration seeds **`helloGreeting`** — pass `{"name": "openKMS"}` in Live Preview.
