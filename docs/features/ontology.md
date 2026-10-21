# Ontology — objects, links, datasets

Object types and link types model an entity-relationship layer that can be backed by PostgreSQL datasets and optionally indexed into Neo4j for graph exploration. **Three Suite Apps** split schema governance, instance exploration, and function authoring:

| App | Routes | Focus |
|-----|--------|-------|
| **Ontology Manager** | `/ontology-manager/*` | Object/link types, datasets, functions registry, groups, action types |
| **Object Explorer** | `/object-explorer/*` | Objects, links, Cypher explore |
| **Function Editor** | `/function-editor/*` | Python function CRUD and Live Preview |

Legacy `/ontology`, `/objects`, `/links` redirect to the new prefixes. See [Ontology Functions](ontology-functions.md). Platform vs tenant DIY (and deferred Action write-back): [Manager alignment](../research/ontology_manager_alignment.md). Learn concepts: [Understanding the ontology (Kanban lab)](../tutorials/understanding-ontology.md). Domain lab: [Tushare market ontology](../tutorials/tushare-market-ontology.md).

**Manager detail chrome:** Object types, link types, datasets, functions, and action types share the left-nav **entity-view** shell (`EntityViewShell` + `entity-view.scss`). Dataset detail tabs: Overview · Data · Columns · Usage · Sharing. Function detail tabs: Overview · Observability — Overview edits optional **primary object type** (`object_type_id`), **I/O contract** (`x-ontology` on input/output schema fields), and lists **action types that bind** this Function. Object type Overview shows related link types, action types, and functions (affiliation, Action bind, or schema OT/LT refs). Action type list filters by object type. Action type detail tabs: Overview · Rules · Log (`/ontology-manager/action-types/:id`; legacy `/actions` redirects). **Create action type** uses a 3-step wizard (Target → Define → Review): object type + Create/Edit/Delete/Custom intent. **Create / Edit / Delete** use built-in rules (`object_create` / `object_modify` / `object_delete`) and run without a Function; **Custom** binds a published Function. Rules tab for built-in actions configures writable property fields; function actions bind a Function version.

The **Objects & links** sidebar group is shown when route patterns allow; a **Neo4j** data source still drives graph counts and Object Explorer behavior where applicable.

## Objects and links

| Feature | Status | Description |
|---------|--------|-------------|
| Object types | ✅ | Schema for entity types (name, description, properties JSONB, optional dataset_id, key_property, is_master_data, display_property). **`key_property` is the optional business primary key** (a normal schema property, like Palantir `restaurantId`); Manager shows a PK checkbox to choose or clear it. `key_property` / `display_property` must name a declared property (API 400 otherwise). **`api_name` is the frozen identifier** code and Cypher use; renaming the type changes only its display name, so already-indexed nodes stay addressable and published Functions keep resolving (see [The graph is the object layer](#the-graph-is-the-ontology-layer)). **Neo4j MERGE / list id:** dataset-backed → `key_property`; Explorer / Action-managed (no dataset) → platform **`__rid`** (UUID; same as queue / Action `object_id`) — not a configurable schema property; Explorer shows `__rid` read-only. Manager list at `/ontology-manager/object-types` with optional **Group** filter (`?group=`); **detail** uses shared **entity-view** shell (`/ontology-manager/object-types/:typeId`) with Overview · Properties · Datasources · Sharing; **create** uses a 4-step wizard (Identity → Schema → Actions → Review): optional group on create, optional Create/Edit/Delete **action type stubs** (no Function auto-bind); list name links to detail; legacy `/…/settings` redirects to Sharing/Overview; table Actions: index-to-graph when Neo4j exists and the type has a linked dataset or at least one stored instance; Master Data flag (only master data types usable for document labels); display_property for label picker display |
| Object instances | ✅ | Instances of object type: CRUD at `/object-explorer/objects/:typeId` (admin write + parent type write ACL). **Reads come from the graph only** (see [The graph is the object layer](#the-graph-is-the-ontology-layer)); writes go to `object_instances` + same-request graph sync |
| Link types | ✅ | Schema for relationships between two object types; Manager list at `/ontology-manager/link-types`; **detail** entity-view (`/ontology-manager/link-types/:linkTypeId`) with Overview · Datasources · Sharing; create stays list modal (Name + API name); legacy settings URLs redirect; table Actions: index when Neo4j exists and the type has a junction/source-dataset setup or at least one saved link; header **Index Links** runs bulk for all such types |
| Link instances | ✅ | Instances of link types (source → target); CRUD at `/links/:typeId` (admin write + parent link type write ACL). **Reads come from the graph only**; create/delete write `link_instances` plus a same-request edge MERGE/DELETE. Endpoints are resolved **in the graph** (409 when either object is not indexed), and either end may be a dataset-backed object — the saved row names object ids, it does not require a queue row |
| Objects list | ✅ | User-facing list at `/objects`; reads the graph only. No Neo4j data source → 409; type not indexed while it has rows to index → empty page flagged `indexed: false` (Explorer tells the user to index). `search` and `prop.<name>=` filters run in the graph, not after paging |
| Purge object type instances | ✅ | Object type Overview Danger zone: purge one type’s apply-queue rows + Neo4j label (`POST /api/object-types/{id}/purge-instances`, confirm `PURGE {Name}`). Does not delete the type schema or datasets. |
| Links list | ✅ | User-facing list at `/links`; instances and link_count from the graph. No Neo4j data source → 409; a junction/FK link type with rows but no indexed edges → `indexed: false` |
| Object Explorer | ✅ | Cypher / text-to-Cypher at `/object-explorer`; list + **instance graph** (Neo4j results via `react-force-graph-2d`); see [Object Explorer](object-explorer.md) for Graph view pipeline, layout modes, and implementation notes |
| Ontology overview | ✅ | Single page at `/ontology-manager` (legacy `/ontology` redirects) with **Card** / **List** (object types, link types, functions, action types) or **Graph** (schema OT nodes + LT edges; optional **Actions** / **Functions** overlay: Action→OT, Function→OT when affiliated, Action→Function when Custom; self-referential link types omitted; layout modes schema/LR/TD/radial; click OT/LT → Explorer, Action/Function → Manager) toggle; preference stored in `localStorage` |
| Ontology sidebar | ✅ | **Ontology** is a top-level item **next to Glossaries** (same menu group); links to `/ontology`; indented subnav for Datasets, Object types, Link types, Objects, Links, Object Explorer when on those routes; visibility follows permission patterns (Neo4j presence still affects graph-backed counts) |
| Search | ✅ | Optional substring filter on object instances, applied in the graph |
| Schema admin counts | ✅ | Ontology Object types / Link types pages: instance_count and link_count from datasets (PostgreSQL) |

## The graph is the ontology layer

Object and link access go through **one** place: the ontology graph (Neo4j). Datasets and the `object_instances` / `link_instances` rows are what gets *indexed into* it — a source and a write queue — never a second read path.

**Reads.** `GET …/objects`, `GET …/objects/{id}` and `GET …/links` query Neo4j by `neo4j_label` / `neo4j_rel_type` only; `search`, `prop.<name>=`, `source_object_id`, `limit`/`offset` are applied in the graph, so `total` describes the filtered set. A relationship joins two objects, so **both endpoints are keyed by the object layer's identity** (`__rid` for hand-created types, the business key for dataset-backed ones) — the `source_key_value` / `target_key_value` a link reports are the ids the object API shows. Consequences, stated rather than papered over:

| State | Answer |
|-------|--------|
| No Neo4j data source | **409** with what to do (Console → Data Sources, then index) |
| Neo4j unreachable | **503** (ontology graph unavailable) |
| Type never indexed, but it has dataset rows or queued instances | `200` with `total: 0` and **`indexed: false`** — the Explorer shows "index it" instead of "no objects" / "no links" |
| Object exists in the write queue only | **404** from detail ("not in the graph yet") |

**Writes.** Hand-created objects and Action edits land in `object_instances` and are MERGEd into the graph in the same request (`sync_queue_ids_to_neo4j`); hand-created links land in `link_instances` and their edge is MERGEd or deleted in the same request (`sync_link_instances_to_neo4j`). A link write whose endpoint is not in the graph yet is refused (**409**, index the object types first) rather than stored unreaddable. Both endpoints are matched by the object's API id — `__rid` for hand-created types, the business key for dataset-backed ones — so a link can join a hand-created object to a dataset-backed master (e.g. a review record to a `Stock`). Deleting an object removes the saved links that name it, so a later bulk index cannot resurrect the edge. Dataset-backed rows are indexed by the **Index** action. Junction-table links stay write-rejected — the junction table is their source of truth, and it is indexed, not read.

**Identity comes in three parts, and only one of them is opaque.**

| Field | Answers | Assigned | Changeable |
|-------|---------|----------|------------|
| `id` (UUID) | *which row* — appears in URLs, ACLs, foreign keys, Action `object_id` | create | never |
| `api_name` | *what code calls it* — `client("WorkItem")`, `MATCH (n:WorkItem)` | create | **never** |
| `name` | *what people see* — the display label | create | freely |

`api_name` is the contract: published Function source holds it as a string, so renaming it would break callers (`PUT` returns **400**). It is generated from the display name when that has ASCII parts (`Work Item` → `WorkItem`); a name with none (e.g. 中文) requires the author to supply one at create, because a generated `Type_a1b2c3` is a worse contract. It is unique, and `^[A-Za-z][A-Za-z0-9_]*$`.

`object_types.neo4j_label` / `link_types.neo4j_rel_type` remain the persisted **graph** identity. For types created since `api_name` existed they *are* `api_name`; rows that predate the column keep the label their nodes were indexed under (so claiming an `api_name` later is not a re-index). `Client` resolves `api_name` → `name` → `id`, so Functions written before the column keep working.

**Deletions need `prune`.** Indexing only MERGEs, so a row deleted in the source leaves a node (or edge) that keeps answering queries. `POST …/index-to-neo4j?prune=true` deletes what that run did not write and reports `nodes_pruned` / `relationships_pruned`; it is opt-in because that is right for a type mirroring a table this deployment owns, and wrong for a hand-maintained graph. It declines (with `prune_skipped`) when the source yields no rows — an empty table is more often a broken read than an instruction to wipe the label.

**Writes to a dataset-backed object are overlay edits, and the table wins.** The owning application creates and deletes those rows, so an Action may only **modify** one (`object_create` / `object_delete` are refused with a message that names the owner). A modify is stored as a queue row keyed by the object's business id and merged into that node, so the object reads back changed immediately; the Action's [webhook](ontology-functions.md#action-webhooks-telling-the-app-behind-the-data) then tells the app. The bound table stays authoritative: the next index writes the table's values back, so a webhook that never landed is **reverted** rather than believed (verified: edit 0.09 without a webhook → graph 0.09, dataset 0.07 → re-index → graph 0.07).

**Freshness is explicit.** The graph is a projection, not a live view: editing rows in the data layer does not move them into the graph until the type is indexed again. `indexed: false` covers the empty case; a partially stale label still reads stale values — re-index after bulk dataset changes, and after a keying change (a type indexed under an older identity keeps its edges under the old key until it is purged and re-indexed).

## Data sources and datasets

PostgreSQL and Neo4j connections live in **Console → Data Sources**; mappings from a connection to a specific table become **datasets**, edited under the Ontology sidebar.

| Feature | Status | Description |
|---------|--------|-------------|
| Data Source CRUD | ✅ | PostgreSQL and Neo4j connection configs; Console → Data Sources |
| Credential encryption | ✅ | Username/password encrypted with Fernet before storage; key from OPENKMS_DATASOURCE_ENCRYPTION_KEY or derived from secret_key |
| Test connection | ✅ | `POST /api/data-sources/{id}/test` validates connectivity |
| Neo4j delete all | ✅ | `POST /api/data-sources/{id}/neo4j-delete-all` wipes all nodes and relationships; confirmation modal in Console |
| Dataset CRUD | ✅ | Map PostgreSQL tables (schema.table) from a data source; **Ontology Manager → Datasets** (`/ontology-manager/datasets`); legacy `/console/datasets` and `/ontology/datasets` redirect |
| List tables from source | ✅ | `GET /api/datasets/from-source/{id}` — requires **`console:datasets`** (Manage datasets) |
| Dataset detail | ✅ | Entity-view at `/ontology-manager/datasets/:id` — Overview (display name) · Data (paginated rows) · Columns (metadata) · Usage (OT/LT bindings) · Sharing; legacy `/…/settings` redirects to Overview/Sharing |
| Dataset rows | ✅ | `GET /api/datasets/{id}/rows?limit=&offset=` fetches paginated rows from table |
| Dataset metadata | ✅ | `GET /api/datasets/{id}/metadata` returns column name, type, nullable, position from information_schema |
| Search datasets | ✅ | Client-side search by display name, schema.table, data source on list page |
| Object type–dataset link | ✅ | Object types can link to a dataset (dataset_id); instance_count shows dataset table row count |
| Link type cardinality | ✅ | Link types have cardinality (one-to-one, one-to-many, many-to-many) and optional dataset link for many-to-many |
| Link type FK mapping | ✅ | Source/Target key properties; junction table columns (source_dataset_column, target_dataset_column) for many-to-many |
| M:M junction table links | ✅ | When link type has dataset_id, links and link_count come from junction table; Add/Delete disabled for dataset-backed links |
| M:1/1:M link count | ✅ | When source object type has dataset and source_key_property (FK column), link_count from rows where FK is not null |
| Index to Neo4j | ✅ | Ontology **Object types** / **Link types** pages: Index Objects/Links button when Neo4j data source exists; indexes datasets as nodes, link types as relationships |

## Ontology overview graph

`/ontology-manager` **Graph** toggle shows the schema diagram (`OntologySchemaGraph.tsx`, `ontologySchemaGraphModel.ts`): object types as nodes, link types as straight directed edges; self-referential link types omitted; **disconnected type groups pack into a 2D grid** (not a single vertical column) with wider layer/node gaps. **Actions** / **Functions** overlays are off by default; when enabled, logic chips sit in a grid under their object type (not around it) so LR neighbors stay readable. Functions also link to every Object Type named in their I/O `x-ontology` contract (and Link Type endpoints). Logic nodes navigate to Manager detail; OT/LT edges still open Object Explorer. Instance exploration and layout lessons for query results are documented in [Object Explorer](object-explorer.md).
