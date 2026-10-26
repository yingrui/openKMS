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
dataset      the logical asset: name, description, owner, recorded schema
 └ versions  a numbered milestone — draft while being assembled, immutable once published
    └ files  immutable data units, one per slice (e.g. one parquet per month)
```

**Adding data is adding a file, not cutting a version.** A new month lands as a new file; a version
is cut when someone decides to freeze one (a training snapshot, a re-export):

```
v3   notes: "2026Q3 冻结，用于 5 日 Top-50 模型第 7 版"   files: 2026-01 … 2026-09
```

The version **is** its integer — `v1`, `v2`, `v3`. There is no business label to keep in sync and no
"current version" pointer: a consumer that needs a specific one asks for it (`--version 2`), and
"latest" is just the highest number. `notes` is free text for the human who cut it.

### A version is a draft until it is published

Assembling a version is iterative: create `v3` as a **draft**, add the files as they are produced,
look at the totals, then **publish**. Only publishing freezes it.

| State | File set | Manifest | Pinnable (readable by a consumer) |
|---|---|---|---|
| `draft` | mutable — files added, removed | none yet | no |
| `published` | frozen | written once | yes |
| `deprecated` | frozen (unchanged) | unchanged | yes — a consumer may still ask for it by number |

A published version's file set never changes; adding data afterwards means `v4`. Deprecating is a
label, not a change: deprecated versions are kept (see retention).

### Files are shared, not copied

A newer version **reuses the files it did not change** by referencing their existing keys, so
storage grows with the data, not with the square of it:

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

The manifest is the contract. It is written **at publish** and never edited; a draft has no manifest,
which is exactly why a draft cannot be pinned.

```json
{
  "dataset_id": "…",
  "version": 2,
  "notes": "2026Q3 冻结，用于 5 日 Top-50 模型第 7 版",
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
- **`schema` on the version** is *recorded*, not enforced. It exists so a reader knows what to
  expect; whether a later file may add a column is the dataset owner's call, not a rule the platform
  applies. A model that finds a missing column fails loudly on its own side.

`sha256` here is the **byte** hash: it proves a download is intact. It is *not* a content identity —
two parquet writes of the same rows differ by writer version and compression. "Same data" is
answered by the version + file set, which is why pinning is `(dataset_id, version)`, not a hash.

## Data model

```sql
-- One built-in source, no configuration: the platform's own MinIO bucket.
-- It is seeded, not created by a user, and it has no credentials form or "test connection" —
-- the deployment already holds those (OPENKMS_S3_*). Every file dataset points at it.
data_sources  (kind='object_storage', name='Object Storage')

datasets
    + kind             -- 'table' | 'file'
    -- schema_name/table_name become nullable (only kind='table')
    -- partial unique index: (data_source_id, schema_name, table_name) WHERE kind='table'
    -- is_editable forced false for kind='file'

dataset_versions
    id, dataset_id → datasets
    version       int            -- auto-increment per dataset; it *is* the version ("v3")
    notes         text           -- why it was cut, written by whoever cut it
    status        text           -- draft | published | deprecated
    manifest_key  text           -- null until published, then the object holding the manifest
    schema        jsonb          -- column contract, copied out of the manifest for querying
    row_count     bigint, byte_size bigint, file_count int
    date_from, date_to date      -- overall coverage
    published_at  timestamptz    -- null while draft
    created_by, created_by_name, created_at
    UNIQUE (dataset_id, version)

dataset_version_files
    version_id → dataset_versions
    name, storage_key, sha256
    rows, bytes, date_from, date_to
    reused_from_version int | null
    created_by, created_at          -- a draft can be filled by more than one person
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
POST   /api/datasets/{id}/versions                    # open a draft: {notes} → {version: 3, status: draft}
POST   /api/datasets/{id}/versions/{v}/files          # add a file to a draft
DELETE /api/datasets/{id}/versions/{v}/files/{name}   # only while draft
POST   /api/datasets/{id}/versions/{v}/publish        # freeze: writes the manifest
POST   /api/datasets/{id}/versions/{v}/deprecate
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
datasets version create --id <dataset> --notes "2026Q4 数据入湖"        # → draft v3
datasets file put      --id <dataset> --version 3 --path ./2026-10.parquet   # presigned, direct
datasets version publish --id <dataset> --version 3
datasets version deprecate --id <dataset> --version 2
datasets file get      --id <dataset> --version 3 --out ./cache/        # honours file date_range
datasets file list     --id <dataset> --version 3
```

## UI

Datasets list gains a **kind badge**. A file dataset's detail page has Overview · Versions · Data
(preview + download) · Usage · Sharing, and hides Columns (live) and Relationships, which have no
meaning for a file. The version list reads like a ledger — `v3 draft · 8 files · 900k rows`, `v2
published 2026-10-01 · used by 2 versions` — with *add file* and *publish* on drafts and *deprecate*
on published ones.

## Deletion and retention

- **Deprecated versions are kept.** They stay readable and pinnable, so a model can always be traced
  back to the data it saw. Nothing expires by policy.
- A draft may be deleted outright — it was never publishable, so nothing can reference it.
- A file becomes deletable only when **no published manifest references it**; the reference check
  runs on delete and is surfaced as "used by versions 2, 3".

## Non-goals

- No query federation, no joins, no SQL over files (see scope table);
- no object types backed by files;
- no write path into a version — correction means a new file and a new version;
- openKMS does not record which MLflow run used a version. The consumer records that (the training
  script knows its run id), which keeps openKMS from mirroring MLflow's lineage.

## Decided

- **Version is an integer.** No label, no "current version" pointer; a consumer asks for the version
  it needs, and "latest" is the highest number.
- **Draft → published.** A version is assembled as a draft (files added, removed), then published,
  and publishing is what freezes it and writes the manifest.
- **One object-storage source, unconfigured** — the deployment's MinIO bucket, seeded rather than
  entered by a user. A dataset's data lives under `datasets/<dataset_id>/` in that bucket.
- **Schema is recorded, not enforced.** Adding a column later is the dataset owner's decision; the
  platform does not police compatibility.
- **Deprecated versions are retained indefinitely.**

## Still open

1. Who may publish? Opening a draft is `data:write`, but publishing is the moment a training set
   becomes pinnable — it may deserve its own permission once more than one person touches a dataset.
2. Two people adding files to the same draft: last-writer-wins is fine for now, but the UI should
   show who added which file (`dataset_version_files.created_by`) so a surprise is explainable.
