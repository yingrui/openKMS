# Object identity (design note): key columns, and a possible RID

Where an object *is* has three answers in this system, and only two are implemented today. This page
records what is shipped and what a Palantir-style platform id would buy — the second half is a
**design, not shipped**.

**Related:** [Ontology](ontology.md) · [Ontology Functions](ontology-functions.md) · [Action webhooks](ontology-functions.md#action-webhooks-telling-the-app-behind-the-data)

## What determines identity today

| Field | Meaning | Mutable |
|-------|---------|---------|
| `object_types.key_properties` | The columns that identify a row in the source table (1..n) | editable, but changes need a re-index |
| API id | `encode_object_id(values)` — the key values joined with `\|`, each URL-escaped | follows the key |
| `__rid` | The platform uuid used **only** when the type has no source table | never |
| `neo4j_label` | The graph label, frozen at creation | never |

Everything that reads or writes an object goes through that pair: the node merge, the list id, the
`GET …/objects/{id}` lookup, the Action `object_id`, and a link's endpoint values. A composite key is
therefore not a display concern — it is the identity (`portfolio_id|ts_code`).

### What a key cannot do

- **A surrogate the application generates** (`id` uuid, `SERIAL`) is not the ontology's to invent,
  but it is not forbidden either: a caller may pass it as an ordinary property and the app decides
  whether to adopt it. Only the key columns are required for a create; the ontology identifies the
  object by those columns regardless.
- **A junction table or an FK column** supplies one value per endpoint, so it cannot address an
  object with a composite key. Indexing refuses (400) rather than merging into whichever node
  matched first; saved link instances are the supported path.

## The gap a RID would close

The ontology reads through to the application's table. There is no ontology-owned row, so there is
nowhere to keep an identity that survives the app changing its key (a re-keyed product code, a
rebuilt table, an import that reassigns ids). Palantir's **RID** solves this because Foundry
materialises objects into its own store; a read-through ontology needs one extra piece first.

**Design (not shipped):**

1. Write `__rid` on **every** node, not only hand-created types, so the graph has a stable handle
   regardless of the source key.
2. Persist the mapping `rid ↔ key values` in the ontology (`object_instances` already holds
   "ontology row ↔ data"; it becomes the mapping table). The app's table is untouched — we never ask
   it to store our id.
3. Actions, logs and links address objects by RID; the webhook payload carries both
   `object.id` (RID) and `object.key` (the key column values), so the receiver still works with its
   own primary key.
4. `id_strategy` per object type: `application_key` (today's behaviour — `Stock` stays `ts_code`)
   or `rid` (for types whose app key is a surrogate). Dashboards, the CLI and the skill keep the
   readable id unless someone opts in.

**Cost:** every read/write path resolves through the mapping instead of a column; re-keying an object
becomes an ontology operation (update the mapping, re-index) rather than "delete the node and wait
for a prune".

**Trigger to build it:** the first application that (a) regenerates its primary keys, or (b) wants an
object whose key is not stable enough to be a contract. Until then `key_properties` is the identity,
and the constraint above is the honest limit.
