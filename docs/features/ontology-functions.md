# Ontology Functions

Author and run **Python Ontology Functions** — Palantir-style logic on top of the object/link schema. Functions are stored in PostgreSQL, edited and published in **Function Editor**, and executed in a subprocess via **ontology-function-service** (`:8105`).

**Related:** [Ontology](ontology.md) · [Ontology SDK](ontology-sdk.md) · [Research](../research/ontology_functions_and_actions.md) · [Manager alignment (platform vs DIY)](../research/ontology_manager_alignment.md) · [Understanding the ontology](../tutorials/understanding-ontology.md) · [Tushare DIY](../tutorials/tushare-market-ontology.md)

## Suite Apps

| App | Route | Role |
|-----|-------|------|
| **Ontology Manager** | `/ontology-manager/functions` | Registry (the same Functions), optional primary object type, Usage (bound action types), Observability |
| **External services** | `/external-services` | The endpoints the ontology may call — a Function's `client.external(…)` **and** an Action's webhook share one registry: kind, target, credential, allowed paths, timeout, who uses it |
| **Function Editor** | `/function-editor` | Create (optional primary object type), edit, validate, Live Preview. The workspace links to the **External services** app, so an author can register one without leaving the flow |
| **Object Explorer** | — | Instance browse; Action triggers |

Legacy `/ontology/*` redirects to `/ontology-manager/*`. Optional `object_type_id` on a Function is an affiliation for Groups related resources and Overview Graph — execution still may call any type via `Client`.

**Manager → Functions → Overview** shows **External services**: the names its source calls with `client.external(…)`, scanned from the published and latest versions, each linking to the registry. A name that is not registered is marked `(!)` — that Function will fail on that line at run time.

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
| **Manager → Action types** carries the webhook as a column: target (method + path) and the **last delivery**; the Action's own **Webhook** tab (`…/action-types/{id}/webhook`) holds the settings | A webhook is part of an Action, not a place of its own — but "what reaches where, and did it land?" should be readable without opening each Action |
| Delivery outcome is **columns** on the action log (`webhook_ok` / `webhook_status` / `webhook_error`) | "Did anyone hear it?" is a filter on the log, not a JSONB dig. Nothing re-indexes on failure — refresh the type explicitly when you want the table to win again |

For a **dataset-backed** object type all three ops work, provided a create carries the object's business key (the node and the app's row must share identity). The edit is written as an overlay on the object's node, the webhook announces it, and the next index re-asserts the bound table — a delivery that failed is reverted, not believed. `object_modify` / `object_delete` require only `object_id`: an existing object's own required columns are not inputs. See [the graph is the ontology layer](ontology.md#the-graph-is-the-ontology-layer).

The webhook is **not** a Function: no `client.external(...)` in source, no per-integration code. `object` is the object the Action acted on — resolved through the graph, so a dataset-backed `Portfolio` works.

**A create has no incoming object id, so the payload is built from the result.** `object.id`, `input.id` (when the caller supplied it) and `applied.created_ids[0]` are the same value — the id the ontology stored — and `object.key` carries the key columns with their values so the receiver can address its row without parsing the property map.

**Whether the app adopts that id is the app's decision.** A dataset-backed type requires only its key columns; a surrogate `id` is just another property a caller may pass or leave for the app to generate. An app may store `object.id`, ignore it, or keep its own primary key — the ontology identifies the object by its key either way. (If an app both ignores it *and* ends up with a different row identity, the next prune removes the ontology's copy — that is the "table wins" rule.)

## External services (calling another system)

A Function's only vocabulary was the openKMS API, so anything that needed another system had to be wired
outside the ontology. **External services** (`/external-services`) registers the endpoint — one registry for both consumers, a Function's `client.external(…)` and an Action's webhook — and gives the author a name:

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

## Editing and publishing

The editor's header carries **Save** (writes a new draft version) and **Publish** (makes the latest draft callable). Publish
is disabled when the latest draft is already the published version, so the button never means "nothing will happen".
Back goes to the list this Function belongs to — `source='code'` → Functions, `source='logic'` → Logic functions — not to
a fixed route.

## Two entries, one registry

The Function Editor's left rail has two entries over the same table: **Functions** (`source='code'`, authored as
Python source) and **Logic functions** (`source='logic'`, a prompt plus ontology tools). `source` is the only difference — same versions, same publish step,
same `openkms_functions` call surface — so it is one list component filtered by `?source=`, not a second registry.

Logic function *authoring* is not open yet: the entry lists what exists and says so. What it will add is a `flow_spec`
(prompt + ontology tools + deterministic steps) stored on the version, executed by the backend with a per-node trace —
see `tmp/plan/function-logic.md` and [Palantir's LLM functions](../research/palantir-llm-functions.md).

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ontology/functions` | List functions (`?source=code\|logic` — the two editor entries) |
| POST | `/api/ontology/functions` | Create function + v1 (validated); optional `object_type_id`; `source='logic'` + `flow_spec` for a Logic function |
| PATCH | `/api/ontology/functions/{id}` | Update metadata (`display_name`, `description`, `object_type_id`, status) |
| POST | `/api/ontology/functions/{id}/versions` | Save draft version (`flow_spec` for Logic functions) |
| POST | `/api/ontology/functions/{id}/validate` | Static validate |
| POST | `/api/ontology/functions/{id}/publish` | Publish version |
| POST | `/api/ontology/functions/{id}/execute` | Run draft or `use_published` |
| POST | `/api/ontology/functions/by-api-name/{apiName}/execute` | Run published by api name |
| GET | `/api/ontology/functions/{id}/executions` | Observability, including the per-node `trace` of a Logic run |

External services: `/api/ontology/external-services` (CRUD + `POST …/by-api-name/{api_name}/resolve`).
Groups: `/api/ontology/groups` (related resources: `GET /api/ontology/groups/{id}/related`). Action types: `/api/ontology/action-types` (honor optional pinned `function_version`). **Built-in** rules `object_create` / `object_modify` / `object_delete` apply edits directly (no Function). **Function** rule type runs the bound Function, audits, and **applies `output.edits` `create` / `modify` / `delete` ops** onto resolvable object instances (`applied.created_ids` / `modified_ids` / `deleted_ids`). Dataset/Neo4j synthetic `object_id` remains deferred ([alignment](../research/ontology_manager_alignment.md#product-decision-action-write-back-b1)). Object list supports `prop.<name>=` equality; link list supports `source_object_id`. Domain object types and Function source remain tenant content, not platform seeds.

## Logic functions (flow, not source)

A function whose `source='logic'` carries a **`flow_spec`** on its version instead of Python: an ordered list of nodes,
each with a prompt, a model and an output schema, plus an `output` reference. Same table, same versions, same publish
step — so Actions, permissions and `openkms_functions` callers do not change.

| Piece | Where |
|-------|-------|
Flow body | `ontology_function_versions.flow_spec` (validated before the version is saved) |
Executor | `app/services/ontology/logic_runtime.py` — **the backend orchestrates; ofs is not involved** (a flow is not untrusted code, and it needs DB, permissions and per-node budgets) |
Model | a node's `model_id` resolves through the platform registry (`api_models` / `api_providers`); omitted → the default `chat-completions` model |
Trace | `ontology_function_executions.trace` — per node: prompt as sent, tokens, duration, error; read via `GET …/{id}/executions` |

Supported node kinds today: **`model`**, **`action`**, **`transform`**, **`condition`** and **`loop`** — every block
AIP Logic has except `Create variable`, whose job the transform covers.

**`transform` is the deterministic step.** `{kind: "transform", template: {…}}` renders a JSON object from the
variables with no model call and no tokens, which is what keeps a flow from asking the model to do arithmetic, renaming
or assembly. A field that is exactly one reference keeps the referenced type; mixed text renders as text.

**`loop` maps a list through a body.** `{kind: "loop", over: "{{n1.items}}", as: "item", nodes: […], concurrency}`
runs the body once per element with `{{item}}` bound (plus `{{index}}`), and the body may be `model` or `action` nodes —
no nested loops or conditions, same one-level rule as branches. A loop that writes (`action` in the body) runs **one
iteration at a time**, so the collected edit batch keeps the caller's order; a loop that only computes runs up to
`concurrency` (default 4) at once. Output is `{"edits": […]}` when the body edits, otherwise `{"items": […]}`, and the
iteration count is capped at 50 — a loop is a cost multiplier, so the ceiling is not optional.

**`condition` branches, with AIP Logic's rules.** `{kind: "condition", branches: [{when, nodes}, …]}` runs the first
branch whose `when` holds; an empty `when` is the fallback and **must be last** (a fallback in the middle would swallow
everything after it). The branch's last node is the condition's output, so a branch can answer with a value or propose
an edit. Nesting is one level: a branch body holds `model` and `action` nodes, not another condition. A `when` is
truthy unless it renders to empty, `false`, `0`, `no`, `null` or `none`.

**`action` nodes compose edits; they never apply them.** `{id, kind: "action", action_type, params}` renders its
parameters from earlier node outputs (`{"ts_code": "{{n1.ticker}}"}`), resolves the action type, and produces an edit
batch with the same builder the built-in action path uses. The flow's output then carries `{"edits": [...]}`, which is
applied only when an Action calls the function — the same invariant code functions have, now true in the flow shape too.
A dry run shows the batch and writes nothing. **Function-backed actions work, with one boundary.** For a `rule_type='function'` action the flow runs the bound
function (code → ofs, logic → the flow executor, with the same depth/cycle guard) and takes the ontology edits it
returns. An action whose function writes through an **external service** instead — calling out to another system rather
than returning edits — is refused with a message that says so: a preview must not perform that write, and a flow's
output is edits, not outward calls. Those actions stay callable as Actions, just not as flow nodes.

A parameter that is exactly one reference keeps the referenced type (`{"confirm": "{{n1.confirm}}"}` passes a boolean),
because an action's function receives typed input, not strings.

**Typed inputs.** `flow_spec.inputs` declares `{name, type}` with `string` / `number` / `integer` / `boolean` /
`object`. Declared inputs are checked before the first model call: a missing or mistyped value fails with the input's
name instead of rendering an empty prompt. The editor derives this list from `{{input.x}}` in the prompts, so the
declaration and the text cannot disagree — but the declaration is what the executor enforces.

**An `object` input names an object type** (`{"name": "customer", "type": "object", "object_type": "Customer"}`, and
`x-object-type` in the function-level schema). That is what lets the editor offer `{{input.customer.plan}}` as a
checkbox-free chip and lets the run panel **search that type and pass one instance's properties** instead of asking a
person to type the JSON they would otherwise have to know by heart. The executor reads the chosen instance's fields by
path, so a prompt can use ontology data without a tool call.

**Tools (`query_objects`).** A node may carry up to four read tools:
`{kind: "query_objects", object_type, properties, limit}`. The model never sees a table: it asks for a search, the
backend calls `GET /api/object-types/{type}/objects` **with the caller's token** (so the object-type ACL and
`ontology:read` apply to the person running it, not to the platform), and only the granted properties are returned —
that is both the token budget and the data minimisation. `limit` is capped at 25.

**`calculator`.** `{kind: "calculator"}` takes no configuration: the model may call it with an arithmetic expression
and gets an exact result, instead of computing in its head. Nothing from the model's text is ever evaluated — the
expression is parsed into an AST and walked, and only numbers, `+ - * / // % **`, parentheses and
`abs/round/min/max/sqrt/floor/ceil` are allowed; results are capped (`1e15`, exponent `100`). A bad expression comes
back as the tool's answer so the model can fix it, and the call is traced with its result. It runs in-process, so a flow
needs no runner for it.

**`apply_action`.** A node may let the model *propose* an ontology edit:
`{kind: "apply_action", action_type, description}`. The action's declared parameters become the tool's arguments, so the
model fills `ts_code` because it was told to; the backend composes the edit batch with the same builder the Action path
uses and hands the batch back to the model (which can reason about what it asked for). **Nothing is written**: the batch
travels out with the flow's output and is applied only when an Action calls the function.

**`call_function`.** A node may also call an already-published function:
`{kind: "call_function", function: "<api_name>", description}`. The target's **published input schema becomes the
tool's parameters**, so the model fills in real arguments instead of guessing; the call carries the same depth and
call-stack headers the SDK client sends, so the cycle guard applies to flows exactly as it does to code functions (the
caller does not append itself — the callee does, on arrival).

Either way a node gets at most four model round trips and six tool calls. Every call lands in the trace with its arguments, row count, duration and error,
including a failed one — a denied read is exactly what you need to see afterwards.

Invariants:

- The model never touches the ontology — it gets a prompt and returns data. Tools arrive with the tool nodes.
- A node over its token or time budget **fails**; it is never truncated (a truncated answer looks like a real one).
- Every node leaves a trace entry, including failed ones — the prompt on a failure is the thing you need most.

## Runtime

1. Editor or Manager calls backend `execute`.
2. Backend loads the version and branches: `source='logic'` → `logic_runtime.run_flow`; otherwise `source_code` + `entrypoint` → ofs.
3. Validates `input_schema` and call depth/stack.
4. POSTs to ofs `/execute`.
5. ofs resolves `@function` (or legacy `execute`), injects `Client`, runs subprocess.
6. Audit row in `ontology_function_executions`.

Start ofs locally: `cd ontology-function-service && ./dev.sh`.

**Docker Compose:** service **`ontology-function-service`** (host **`:8105`**). Backend uses **`OPENKMS_ONTOLOGY_FUNCTION_SERVICE_URL=http://ontology-function-service:8105`**. See repo `docker/README.md`.

## Seed

Migration seeds **`helloGreeting`** — pass `{"name": "openKMS"}` in Live Preview. It is a demo Function and safe to delete (archive first: a published Function cannot be deleted outright; Function Editor's Delete does both steps).
