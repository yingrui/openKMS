# Datasets — file datasets and versions

Design note. **Not implemented.** A companion decision to [Ontology — objects, links,
datasets](ontology.md): a dataset is the catalog entry for *data*, not necessarily for a *table*.

The trigger is MLOps: a training set is a file (parquet), not a table. It has to be browsable in the
same Catalog as `factor_values`, downloadable by an agent, and **pinnable** — "model v7 was trained
on dataset `training-set-5d`, version 3". MLflow can record a URI; it cannot say who registered that
data, what columns it had, what it supersedes, or whether it is still around.

## Scope

| Capability | Table dataset | File dataset |
|---|---|---|
| Catalog entry: name, description, owner, domain, tags, sensitivity, ai_context | ✅ | ✅ |
| Permissions (`data:read` / `data:write`) and usage analysis | ✅ | ✅ |
| Browse rows | ✅ SQL | ✅ preview / filtered read |
| Download the raw file | — | ✅ (presigned URL) |
| Versions and pinning (`dataset_id` + `version`) | — | ✅ |
| `dataset_joins` (relationships) | ✅ | ❌ rejected |
| Bind as an object type backend | ✅ | ❌ rejected |
| Junction for a link type (graph index) | ✅ | ❌ rejected |
| SQL / `aggregate` / text-to-cypher grounding | ✅ | ❌ excluded |
| Row editing | ✅ (opt-in) | ❌ immutable |

**A file dataset is a versioned data asset. The Catalog's job for it is identity, provenance,
pinning and governance — not query federation.** Reading a file supports *selection* (column and
predicate pushdown: "only 2026-06..09, only these columns"), which is not a join. If cross-file or
file-to-table joins ever become a requirement, that is a query-engine decision (duckdb and friends)
and its own design note.

## Three layers

```
dataset      the logical asset: name, description, owner, schema contract
 └ versions  a business milestone — immutable, labelled, notes, supersedes
    └ files  immutable data units, one per slice (e.g. one parquet per month)
```

**Adding data is adding a file, not cutting a version.** A new month lands as a new file under the
current version's successor; a version is cut when the business decides (a training snapshot, a
schema change, a re-export) and is labelled by hand:

```
version 3  "2026Q3 训练集"   files: 2026-01 … 2026-09
```

The version number is an auto-increment integer (safe in a storage key); the business name lives in
`label`. Both are shown in the UI; only `version` appears in paths.

### Versions are immutable — and files are shared, not copied

A version's file set never changes. A newer version **reuses the files it did not change** by
referencing their existing keys, so storage grows with the data, not with the square of it:

```
datasets/<dataset_id>/versions/1/files/2026-01.parquet
datasets/<dataset_id>/versions/1/files/2026-02.parquet
datasets/<dataset_id>/versions/2/files/2026-03.parquet          ← only the new slice lives here
```

Version 2's manifest points `2026-01` and `2026-02` at **version 1's** keys. Consequences:

- deleting a version deletes only the files it introduced — and only when no other version's
  manifest references them (reference check, not cascade);
- re-importing a month is never an overwrite: it is a new file plus a new version that references it.

### manifest.json

The manifest is the contract. It is written once when the version is cut and never edited.

```json
{
  "dataset_id": "…",
  "version": 2,
  "label": "2026Q3 训练集",
  "notes": "加入 turnover 相关列之后第一次冻结",
  "supersedes": 1,
  "created_by": "yingrui",
  "created_at": "2026-10-26T09:12:00Z",
  "schema": [
    {"name": "ts_code", "type": "string"},
    {"name": "trade_date", "type": "date"},
    {"name": "mom_20d", "type": "double"}
  ],
  "files": [
    {
      "name": "2026-01.parquet",
      "key": "datasets/<id>/versions/1/files/2026-01.parquet",
      "reused_from_version": 1,
      "rows": 112000,
      "bytes": 1834521,
      "sha256": "…",
      "date_range": ["2026-01-05", "2026-01-30"]
    }
  ]
}
```

Two properties earn their keep:

- **`date_range` per file** lets a read skip whole slices — "only June to September" never opens
  January's object;
- **`schema` on the version** is checked before any data is read, so a model that expects a column
  fails with a clear message rather than a KeyError three layers down.

`sha256` here is the **byte** hash: it proves a download is intact. It is *not* a content identity —
two parquet writes of the same rows differ by writer version and compression. "Same data" is
answered by the version + file set, which is why pinning is `(dataset_id, version)`, not a hash.

## Data model

```sql
-- an object-storage connection, same credential encryption/test as the other kinds
data_sources.kind: postgresql | neo4j | object_storage
    -- bucket / prefix / region live in options

datasets
    + kind             -- 'table' | 'file'
    -- schema_name/table_name become nullable (only kind='table')
    -- partial unique index: (data_source_id, schema_name, table_name) WHERE kind='table'
    -- is_editable forced false for kind='file'

dataset_versions
    id, dataset_id → datasets
    version       int            -- auto-increment per dataset
    label         text           -- business name
    notes         text
    supersedes    int | null
    manifest_key  text           -- the object holding the manifest above
    schema        jsonb          -- column contract, copied out of the manifest for querying
    row_count     bigint, byte_size bigint, file_count int
    date_from, date_to date      -- overall coverage
    status        text           -- active | deprecated
    created_by, created_by_name, created_at
    UNIQUE (dataset_id, version)

dataset_version_files
    version_id → dataset_versions
    name, storage_key, sha256
    rows, bytes, date_from, date_to
    reused_from_version int | null
    PRIMARY KEY (version_id, name)
```

`dataset_version_files` duplicates the manifest on purpose: it answers "which versions contain this
file" and "is it safe to delete" without parsing every manifest.

## Guards (three, and they are semantic)

1. **`validate_join`** — either endpoint `kind='file'` → 400: *file datasets cannot take part in a
   relationship*. Without this, a relationship would be created and then read rows through a path
   that cannot do it.
2. **object type binding** — `ObjectType.dataset_id` pointing at a file dataset → 400: the object
   layer needs a key, MERGE and write-back; a file snapshot has none of them.
3. **row access paths** — link-type junction indexing, `aggregate`, text-to-cypher grounding and
   agent SQL all read tables. They must **exclude** file datasets explicitly rather than fall back
   to a preview, because a preview silently stands in for the whole table and returns wrong answers.

## API and CLI

```
# register / browse
POST   /api/datasets                        {kind: "file", ...}      # catalog entry only
GET    /api/datasets?kind=file
GET    /api/datasets/{id}/versions
GET    /api/datasets/{id}/versions/{version}          # manifest + files
POST   /api/datasets/{id}/versions                    # cut a version: {label, notes, files[]}
GET    /api/datasets/{id}/versions/{v}/files/{name}/url  # presigned download

# data
GET    /api/datasets/{id}/versions/{v}/preview?limit=100
GET    /api/datasets/{id}/versions/{v}/rows?columns=…&where=trade_date>='2026-06-01'
POST   /api/datasets/{id}/uploads                     # small files, straight from the UI
```

Large files never pass through the API: the CLI/agent asks for a presigned URL, uploads directly to
MinIO, then registers the object (existence checked, size and sha256 computed server-side). That
split is what makes "agent uploads a 500 MB parquet" workable.

CLI (skill), because an agent has to be able to do all of this without a browser:

```
datasets file put    --id <dataset> --version <v> --path ./2026-10.parquet   # presigned, direct
datasets version cut --id <dataset> --label "2026Q4" --notes "…" --include 1,2,3
datasets file get    --id <dataset> --version 3 --out ./cache/          # honours file date_range
datasets file list   --id <dataset> --version 3
```

## UI

Datasets list gains a **kind badge**. A file dataset's detail page has Overview · Versions · Data
(preview + download) · Usage · Sharing, and hides Columns (live) and Relationships, which have no
meaning for a file. Cutting a version is an explicit button with a required label — the version list
is the audit trail of what was frozen when, and by whom.

## Deletion and retention

- A version can be `deprecated` but stays addressable; nothing that has been used for a training
  snapshot is hard-deleted by policy (that decision belongs to the data owner, not to a lifecycle
  rule);
- a file is deletable only when **no version's manifest references it**;
- the reference check runs on delete and is surfaced in the UI as "used by versions 2, 3".

## Non-goals

- No query federation, no joins, no SQL over files (see scope table);
- no object types backed by files;
- no write path into a version — correction means a new file and a new version;
- openKMS does not record which MLflow run used a version. The consumer records that (the training
  script knows its run id), which keeps openKMS from mirroring MLflow's lineage.

## Open questions

1. Version labels: free text, or constrained (`YYYYQn`) so lists sort meaningfully?
2. Do we need "restore a deprecated version as current" (a pointer), or is "latest is current" enough?
3. Object-storage source: one connection per bucket, or bucket-per-dataset inside one connection?
4. Schema contract strictness: new columns in a later file — allowed (superset) or does it force a new
   *dataset*? The current rule elsewhere is "new columns = a different dataset", which would mean a
   full re-export of history; worth re-checking when the first real schema change arrives.
