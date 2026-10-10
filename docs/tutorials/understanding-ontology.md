# Tutorial: Build a simple Kanban on the ontology

**Goal of this tutorial:** learn openKMS ontology by **building a small Kanban-style project board** on it—object types, links, a few cards, and one decision Function. Kanban is a classic teaching vehicle in software (columns, cards, owners, blockers); here it is the *outcome*, not only a metaphor.

**Optional next case study:** [Tushare market ontology DIY](tushare-market-ontology.md) (markets)—same layering, different domain.

| | |
|--|--|
| **Audience** | Software builders new to Ontology Manager / Object Explorer / Function Editor |
| **Time** | ~60–90 minutes (concepts + lab) |
| **You will leave with** | A live mini-board: **Project**, **WorkItem**, **Person**, **dependsOn**, plus a published FoO such as priority or dependency analysis |

**Product reference:** [Ontology](../features/ontology.md) · [Ontology Functions](../features/ontology-functions.md) · [Goals](../goals.md)

> openKMS does **not** ship a Kanban board UI in Object Explorer. “Board” means: typed work items with a **status/column** property, browseable in Object Explorer, optionally graphed in Neo4j, with FoO for AI-assisted decisions and Actions to **create / update / move / delete** cards (`edits` apply). Optional hosted UIs live under **[Apps](../features/app-builder.md)** (registered Kubernetes Services)—not an in-product A2UI board designer.

---

## 1. Why this goal? (ontology as knowledge + Kanban as teacher)

openKMS is a **knowledge** system. Knowledge is not only prose (docs, wiki, KB). A large part is **structured**: which projects exist, which cards sit in which column, what blocks what, who is overloaded, which priority rule is official. That is **ontology knowledge**—a first-class reason openKMS supports Ontology Manager, Object Explorer, and Functions ([Goals](../goals.md)).

| Kind of knowledge | Surface |
|-------------------|---------|
| Prose / evidence | Documents, articles, wiki, KB |
| Terms & maps | Glossaries, knowledge map |
| **Typed work, relations, decision logic** | **Ontology** |

A **Kanban board** is an ideal teaching target because every developer already knows:

```text
Backlog → In progress → Review → Done
```

Cards have owners, estimates, and blockers. If you can model *that* as ontology + FoO, you can model almost any operational domain later (including markets).

---

## 2. Learning goals

By the end you can:

1. Explain why the board state is **knowledge**, not “just a project tool.”  
2. Name **data source / dataset / object type / instance / link / index / Function**.  
3. Create **Project · WorkItem · Person** (and links) for a toy board.  
4. Put a few cards in columns via a **status** property and find them in Object Explorer.  
5. Publish one **FoO** that helps an AI decide (priority, dependencies, or capacity).  
6. (Optional) Bind Actions that **create / update / move / delete** cards via `edits` (`create` / `modify` / `delete` apply).  
7. (Optional) Know that **[Apps](../features/app-builder.md)** can host an external UI for the same ontology APIs (module registration)—board DIY UI is not built into openKMS.

---

## 3. Concepts you need for the board (short)

```text
Data source (Postgres)     → where tables live (optional for hand-entered instances)
Dataset                    → registered table (optional; use if you sync or seed SQL)
Object type                → Project / WorkItem / Person
Instance                   → one project, one card, one person
Link type                  → belongsTo / assignedTo / dependsOn
Index (Neo4j)              → Cypher (“what blocks WI-2?”)
Function (FoO)             → suggestWorkItemPriority / workItemDependencyClosure
Action                     → create / update / move / delete (edits create|modify|delete; platform applies)
Apps (optional)            → hosted external UI registered to a Service (see Step F)
```

**Dataset vs object type:** a dataset is a *table registration*; an object type says those rows (or hand-created instances) *mean* WorkItems. For this lab you may **skip datasets** and create instances directly in Object Explorer—fastest path for teaching. Add datasets when you sync from Jira/Linear or seed Postgres.

**FoO:** Function whose inputs include object ids (e.g. `work_item_id`). Not OOP `WorkItem.method()` ([Palantir FoO](https://www.palantir.com/docs/foundry/functions/functions-on-objects/)). Mark those fields with **`x-ontology`** (`kind: object_type`, `type_name: WorkItem`) on `input_schema` / `output_schema` so Manager and the Overview Graph treat them as Object Type links—not bare strings.

**Suite Apps:** Manager (schema) · Explorer (cards / Cypher) · Function Editor (FoO).

---

## 4. Design the mini-board (before clicking)

### 4.1 Object types

| Object type | Key ideas | Example properties |
|-------------|-----------|-------------------|
| **Project** | One board / delivery effort | `name`, `key` (e.g. `DEMO`) |
| **WorkItem** | One card | `title`, `status` (`backlog` \| `in_progress` \| `review` \| `done`), `estimate`, `priority` |
| **Person** | Assignee | `name`, `email` or `handle` |

`status` **is** the Kanban column for this tutorial. Keep the enum small and documented.

### 4.2 Link types

| Link | From → To | Why |
|------|-----------|-----|
| **belongsTo** | WorkItem → Project | Card on a board |
| **assignedTo** | WorkItem → Person | Owner |
| **dependsOn** | WorkItem → WorkItem | Blockers / dependency analysis |

### 4.3 Decision Functions (pick one for the lab)

| apiName | Purpose |
|---------|---------|
| `suggestWorkItemPriority` | Score a card (blocked? due soon? estimate?) |
| `workItemDependencyClosure` | List transitive `dependsOn` blockers |
| `teamCapacitySnapshot` | Open items per Person on a Project |

Agents and humans should call the **published** Function instead of ad-hoc SQL.

---

## 5. Lab — build it

### Prerequisites

- openKMS running ([Quickstart](../quickstart.md)).  
- For FoO execute: **ontology-function-service** up.  
- Permissions to create object/link types, instances, and Functions.  
- Optional Neo4j data source if you want Cypher on dependencies.

### Step A — Create object types (Manager)

In **Ontology Manager → Object types**, create:

1. **Project** — properties `name` (string), `key` (string); mark master if you use document labels later.  
2. **Person** — `name`, `handle`.  
3. **WorkItem** — `title`, `status`, `estimate` (number), optional `priority` (number or string).

No dataset required for this toy board. (If you prefer tables: create `pm.*` in Postgres, register **Datasets**, then bind—same OT names.)

### Step B — Create link types

1. **belongsTo** — WorkItem → Project (many-to-one).  
2. **assignedTo** — WorkItem → Person.  
3. **dependsOn** — WorkItem → WorkItem.

### Step C — Seed a board (Object Explorer)

Create instances (names illustrative):

| Type | Instance |
|------|----------|
| Project | `Demo Board` (`key=DEMO`) |
| Person | `Ada`, `Lin` |
| WorkItem | `WI-1` Setup board (`status=done`) |
| WorkItem | `WI-2` Write FoO (`status=in_progress`) |
| WorkItem | `WI-3` Dependency demo (`status=backlog`) |

Links:

- Each WorkItem **belongsTo** Demo Board.  
- `WI-2` **assignedTo** Ada; `WI-3` **assignedTo** Lin.  
- `WI-3` **dependsOn** `WI-2` (blocked until FoO exists).

**“See the board”:** Object Explorer → WorkItem list → sort/filter by `status`. That *is* your Kanban view for this tutorial. Optional: Index types to Neo4j and Cypher for dependency paths.

### Step D — Publish one FoO (Function Editor → Manager Publish)

Declare object ids as **WorkItem** refs on the Function schema (callers may pass either key):

```json
{
  "type": "object",
  "anyOf": [{"required": ["work_item_id"]}, {"required": ["object_id"]}],
  "properties": {
    "work_item_id": {
      "type": "string",
      "x-ontology": {"kind": "object_type", "type_name": "WorkItem"}
    },
    "object_id": {
      "type": "string",
      "x-ontology": {"kind": "object_type", "type_name": "WorkItem"}
    }
  }
}
```

Pass that JSON as `--input-schema-json` on create/save-version (Manager Overview can set the same fields structurally). Without `x-ontology`, the Graph and `schema_relations` treat ids as primitives even if the Function affiliates to an Object Type.

Example contract for priority (implement scoring however you like; keep input/output stable):

```python
from openkms_functions import Client, function


@function
def execute(input: dict, client: Client) -> dict:
    """FoO: suggest priority for one WorkItem (Kanban decision helper)."""
    wid = (input.get("work_item_id") or input.get("object_id") or "").strip()
    if not wid:
        return {"error": "work_item_id (or object_id) is required"}

    item = client("WorkItem").fetch_one(wid)
    # Soft heuristic for teaching—replace with real rules later.
    status = str((item or {}).get("status") or (item or {}).get("properties", {}).get("status") or "")
    score = 50
    reasons = []
    if status == "blocked" or status == "backlog":
        score += 10
        reasons.append("waiting_or_backlog")
    if status == "in_progress":
        score += 20
        reasons.append("already_in_progress")
    return {
        "work_item_id": wid,
        "score": score,
        "reasons": reasons,
        "priority": "high" if score >= 70 else "medium" if score >= 55 else "low",
        "hint": "Extend with dependsOn / assignee load when Client link APIs fit your data.",
    }
```

Publish as `suggestWorkItemPriority`. Execute with the id of `WI-3`. Use `client("WorkItem")` / `client("suggestWorkItemPriority")` string api names via `openkms_functions`.

For dependency closure, BFS with server-filtered links. Input schema: required `work_item_id` with the same WorkItem `x-ontology`. Optional output schema marks `blockers` as an array of WorkItem ids:

```json
{
  "type": "object",
  "properties": {
    "work_item_id": {
      "type": "string",
      "x-ontology": {"kind": "object_type", "type_name": "WorkItem"}
    },
    "blockers": {
      "type": "array",
      "x-ontology": {"kind": "object_type", "type_name": "WorkItem"},
      "items": {"type": "string"}
    }
  }
}
```

```python
from openkms_functions import Client, function


@function
def execute(input: dict, client: Client) -> dict:
    wid = (input.get("work_item_id") or "").strip()
    seen: set[str] = set()
    frontier = [wid]
    blockers: list[str] = []
    while frontier:
        cur = frontier.pop()
        if cur in seen:
            continue
        seen.add(cur)
        for link in client.get_links("dependsOn", source_id=cur, limit=100):
            tgt = link.get("target_object_id") or link.get("target_key_value")
            if tgt and tgt not in seen:
                blockers.append(str(tgt))
                frontier.append(str(tgt))
    return {"work_item_id": wid, "blockers": blockers}
```

Capacity-style FoO can use property filters: `client("WorkItem").search(filters={"status": "in_progress"}, limit=200)`.

### Step E — Actions: create / update / move / delete WorkItems

In **Ontology Manager → Action types**, create **WorkItem** actions with built-in rules — no Function required for simple CRUD:

| Intent | Rule type | Example api_name |
|--------|-----------|------------------|
| Create | `object_create` | `createWorkItem` |
| Edit | `object_modify` | `updateWorkItem` |
| Delete | `object_delete` | `deleteWorkItem` |

On the **Rules** tab you can limit writable fields (e.g. only `status` for a column-move action). Optional **`defaults`** in parameters (e.g. `{"status": "done"}`) pre-fill values on modify — useful for a **Move to Done** action that only needs `object_id`.

Action execute applies **`create` / `modify` / `delete`** on Explorer-style object instances (`applied.created_ids` / `modified_ids` / `deleted_ids`).

**Custom logic** (cross-type checks, computed fields, multi-step edits) still uses a published Function bound to a **`function`** rule type.

When creating a **WorkItem** object type, the Manager wizard can tick Create / Edit / Delete to add matching built-in action types automatically.

Try create from an App or API; try update / move / delete on a card in Object Explorer.

### Step F — Optional hosted Apps (external UI)

Object Explorer (and Action / FoO APIs) are enough for this lab. If you later want a **custom board UI**, build it as a normal web app and **register** it under **[Apps](../features/app-builder.md)** (hosted Service + identity headers). openKMS no longer ships an in-product A2UI App designer for composing boards.

**Story to remember:** board **state** and **rules** live in the ontology; any visual board is your own UI calling the same Actions / Functions.

---

## 6. What success looks like

| Checkpoint | Pass criteria |
|------------|---------------|
| Schema | Project, WorkItem, Person + three link types exist |
| Board | ≥3 WorkItems with different `status` values; visible in Explorer |
| Relations | At least one **dependsOn** and one **assignedTo** |
| Decision | Published FoO returns JSON for a card id |
| Write | Actions create / update / move / delete persist via `edits` (`applied.created_ids` / `modified_ids` / `deleted_ids`) |
| Story | You can explain: board state = ontology knowledge; FoO = shared decision rule; Explorer / Actions are enough without a custom board UI |

---

## 7. Anti-patterns

| Avoid | Prefer |
|-------|--------|
| Building a custom Kanban SPA before OT/links exist | Model the board in ontology first |
| Expecting a published FoO alone to persist card edits | FoO computes; Actions apply `edits` |
| Indexing every status-change event | Index WorkItem/Person/Project + dependsOn |
| Calling Jira on every Function execute | Sync or hand-enter instances; FoO reads ontology |
| Secret priority formulas in chat only | Published FoO with version + audit |
| Treating the board as “not knowledge” | Columns, blockers, and priority rules *are* knowledge |

---

## 8. Glossary (board-oriented)

| Term | On the Kanban lab |
|------|-------------------|
| **Object type** | Project / WorkItem / Person |
| **Instance** | One card or person |
| **status property** | Kanban column |
| **dependsOn** | Blocker edge for analysis |
| **FoO** | Decision helper on a card / project |
| **Action** | Intentional write (create / modify / delete apply) |
| **Apps** | Optional hosted external UI registered to a Service |
| **Index** | Optional graph for dependency Cypher |

Full stack glossary remains in older revisions’ spirit: data source, dataset, publish, Action, TSP—see [Ontology](../features/ontology.md).

---

## 9. Next steps

| Path | When |
|------|------|
| Enrich FoO (`workItemDependencyClosure`, `teamCapacitySnapshot`) | You want stronger AI decisions on the same board |
| [Apps (hosted modules)](../features/app-builder.md) | Register your own board UI as a hosted App |
| Bind datasets / connector sync from a real tracker | You outgrow hand-entered cards |
| [Tushare market ontology DIY](tushare-market-ontology.md) | Practice the same pattern on market data |
| [Ontology Functions](../features/ontology-functions.md) | Deeper authoring / SDK |

---

## 10. Check yourself

1. Why is “cards on a board” **ontology knowledge** in openKMS, not only a UI widget?  
2. Which property plays the role of **Kanban columns** in this lab?  
3. Name one FoO that helps with **dependencies**, **priority**, or **resources**.  
4. If FoO suggests a new priority, what still has to run for the card to **persist** that change?

If you can answer and your Demo Board instances exist, you finished this tutorial’s goal.
