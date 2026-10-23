# Ontology Functions

Author and run **Python Ontology Functions** — Palantir-style logic on top of the object/link schema. Functions are stored in PostgreSQL, edited in **Function Editor**, published in **Ontology Manager**, and executed in a subprocess via **ontology-function-service** (`:8105`).

**Related:** [Ontology](ontology.md) · [Ontology SDK](ontology-sdk.md) · [Research](../research/ontology_functions_and_actions.md) · [Manager alignment (platform vs DIY)](../research/ontology_manager_alignment.md) · [Understanding the ontology](../tutorials/understanding-ontology.md) · [Tushare DIY](../tutorials/tushare-market-ontology.md)

## Suite Apps

| App | Route | Role |
|-----|-------|------|
| **Ontology Manager** | `/ontology-manager/functions` | Registry, optional primary object type, Usage (bound action types), publish, Observability |
| **Function Editor** | `/function-editor` | Create (optional primary object type), edit, validate, Live Preview. **External services** live here too (`/function-editor/external-services`): the list shows each service's kind, target, credential type and which Functions call it, so removing one says what it would break |
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

## Action webhooks (telling the app behind the data)

An Action changes objects and links; the application that owns those rows needs to hear about it. Registering the destination **on the Action** — an external service + path — makes that a platform behaviour instead of a bespoke Function, and keeps the URL out of source:

```json
POST <service base><path>
{
  "event": "action.executed",
  "action": {"id": "at-…", "api_name": "…", "display_name": "…", "rule_type": "…"},
  "object": {"object_type": "Portfolio", "id": "…", "properties": {"name": "main", …}},
  "input": {…the caller's input, plus the resolved object…},
  "applied": {"created_ids": […], "modified_ids": […], "deleted_ids": […]},
  "caller": {"sub": "…", "name": "…"},
  "status": "ok",
  "action_log_id": "al-…",
  "at": "2026-10-21T14:19:42+00:00"
}
```

| Rule | Why |
|------|-----|
| Fires only after a **successful** run (`status: ok`), for built-in and Function rules alike | An error changed nothing to announce |
| Best-effort, **after** the change is committed | A receiver that is down must not fail an Action that already happened |
| Outcome recorded next to the Action log (`output_payload.webhook`) and returned as `webhook` | "Did anyone hear it?" is answerable without a second table |
| Path must be inside the service's `allowed_paths`; the credential comes from the service (`none` / `bearer` / `header` / `hmac`) | The registry stays the only place a destination is declared |
| `webhook_method` (POST / PUT / PATCH / DELETE / GET) | A removal is `DELETE /things/{id}`; posting everything as POST only fit endpoints that upsert |
| `webhook_body`: `envelope` (metadata payload) or `object` (the object's properties + the Action's input) | `object` is the resource representation a REST endpoint already accepts, so the app keeps **its own** API instead of growing a webhook-shaped one |
| Path placeholders — `/api/portfolios/{portfolio_id}/stocks` — resolve from the object's properties, the input, `object_id` / `object_type` | One Action can address a resource whose id lives in the object; nothing is templated beyond `{field}` |
| A Function-rule Action with no webhook shows **`Called by its Function: <service>`** | Its destination lives in the Function source; the page says so instead of implying it goes nowhere |
| Delivery outcome is **columns** on the action log (`webhook_ok` / `webhook_status` / `webhook_error`) | "Did anyone hear it?" is a filter on the log, not a JSONB dig. Nothing re-indexes on failure — refresh the type explicitly when you want the table to win again |

For a **dataset-backed** object type all three ops work, provided a create carries the object's business key (the node and the app's row must share identity). The edit is written as an overlay on the object's node, the webhook announces it, and the next index re-asserts the bound table — a delivery that failed is reverted, not believed. `object_modify` / `object_delete` require only `object_id`: an existing object's own required columns are not inputs. See [the graph is the ontology layer](ontology.md#the-graph-is-the-ontology-layer).

The webhook is **not** a Function: no `client.external(...)` in source, no per-integration code. `object` is the object the Action acted on — resolved through the graph, so a dataset-backed `Portfolio` works — and `applied` carries the ids for a create, where there was no object yet.

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
| `kind` | `http` — the sandbox calls the URL itself. `k8s_service` — the **backend** calls the Service through that cluster's kubeconfig, because the Service's DNS only resolves inside the cluster |
| `base_url` | `http` only: origin (`http://backend:8200`) — the Function supplies the path. A cluster DNS name (`*.svc.cluster.local`) is refused here with a pointer to `k8s_service`, because the sandbox cannot resolve it |
| `cluster_id` / `namespace` / `service` / `port` / `base_path` | `k8s_service` only: the coordinates (and an optional mount prefix) the backend dials |
| `auth_kind` | `none` · `bearer` · `header` (named header) · `hmac` (SHA-256 signature of the body, header `X-OpenKMS-Signature` by default) |
| `allowed_paths` | prefixes this service may be called on; anything else is refused **before** the request leaves |
| `timeout_seconds` | 1–60 |

The secret is stored encrypted, never returned by the list API, and resolved at execution time by the
function runtime (`POST …/by-api-name/{name}/resolve`, audited like any other write-shaped call), so it is
not part of the Function source.

Who sends the request depends on the kind, and that is the whole reason there are two:

| | `http` | `k8s_service` |
|---|---|---|
| Request leaves from | the function sandbox | the openKMS backend |
| Credential | resolved into the sandbox | never leaves the backend |
| Allowlist enforced by | the client, and the receiver | the backend (re-checked; the caller's copy is not trusted) |
| Works when | the sandbox can route to the origin | the Service is only reachable inside its cluster |

Neither kind gives a hard network boundary: for `http` the sandbox makes the call, so the allowlist is a
rule the client keeps. A deployment that needs the boundary itself puts the function runner on a
restricted network — and then `k8s_service` (relayed by the backend) is the kind that still works.

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

Migration seeds **`helloGreeting`** — pass `{"name": "openKMS"}` in Live Preview. It is a demo Function and safe to delete (archive first: a published Function cannot be deleted outright; Function Editor's Delete does both steps).
