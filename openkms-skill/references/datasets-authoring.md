# Dataset authoring (the Catalog half of the data layer)

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**.

**Read this before** `datasets create|update|ingest|joins|quality|column-description|delete`, or when a
user asks to "add data", "register a table", "upload a CSV", "make this table queryable/groundable".

A **dataset** is the Catalog's reference to a real table in a registered PostgreSQL data source (or a
table created by an upload) plus the facts that make it trustworthy: keys, descriptions,
`ai_context`, relationships, quality rules. The **semantic** meaning (fields, metrics, the scope a
question is asked in) belongs to a **model** (`semantic-models …`) — a dataset is the substrate, a
model is the lens. Do not put model concepts on a dataset.

Order of operations, and what each step buys:

| Step | Command | Why |
|------|---------|-----|
| 0. Prerequisite | `data-sources list` / `create` / `test` | The dataset lives in a PostgreSQL source (Console-managed) |
| 1a. Register an existing table | `datasets discover` → `datasets create` | Point at a table already in the source |
| 1b. Or upload a file | `datasets ingest` | Stores the file, parses it, creates the table **and registers the dataset** |
| 2. Describe columns | `datasets metadata` → `datasets column-description` | Physical column meaning (a **field** is the model-scoped version) |
| 3. Make it usable | `datasets update` | Display name, description, domain, tags, business definition, sensitivity, keys, row editing, `ai_context` |
| 4. Connect | `datasets joins add` | FK edges (`from` many → `to` one) that metrics can join across |
| 5. Trust | `datasets quality add` / `run` / `runs` | Rules over the table — five **declarative** kinds (`not_null`, `unique`, `range`, `referential`, `freshness`), or `sql` for a business-specific constraint (`--sql`). Every kind executes as one read-only query, and `runs` shows the SQL it used in `detail.sql` |
| 6. Verify | `datasets profile` / `schema-history` / `rows` | What the data actually looks like |
| 7. (Optional) speak semantically | `semantic-models …` | Fields + metrics over these datasets; an ontology object type can also promote one |

## 0. Prerequisite — a PostgreSQL data source

```bash
python scripts/cli.py data-sources list
python scripts/cli.py data-sources test --id DS_ID
```

Data sources are **Console** objects (`console.data-sources`). Without one, ask the user to register it
in Console (or `data-sources create` when you hold that permission). Datasets never carry credentials.

## 1a. Register an existing table

```bash
python scripts/cli.py datasets list --data-source-id DS_ID          # already registered?
python scripts/cli.py datasets list --search stock                  # find one by name
python scripts/cli.py datasets discover --data-source-id DS_ID      # tables the source exposes
python scripts/cli.py datasets create \
  --data-source-id DS_ID --schema-name public --table-name daily_basic \
  --display-name "Daily basics" --yes
```

`discover` returns the tables you may register; `create` records the reference (it does **not** copy
data). Re-running with the same schema/table updates the existing dataset instead of duplicating it.

## 1b. Upload a file instead

```bash
python scripts/cli.py datasets ingest \
  --file ./daily_basic.csv --data-source-id DS_ID \
  --schema imports --table daily_basic --yes
```

It runs upload → `preview` (type inference) → `load`, and **prints the resulting dataset** (the load
registers it). `--append` appends to an existing table; the default replaces it. Excel/JSON/CSV/TSV
are accepted. Then continue from step 2 — the dataset already exists.

## 2. Describe the columns

```bash
python scripts/cli.py datasets metadata --id DS_ID
python scripts/cli.py datasets column-description \
  --id DS_ID --column close --description "Closing price, adjusted" --yes
```

`metadata` also records a schema snapshot when the source's columns changed — that is what
`datasets schema-history --id DS_ID` shows over time. Column descriptions are **physical** facts; a
model's field may override its own description for one model without touching this.

## 3. Make it usable (the part agents actually need)

```bash
python scripts/cli.py datasets update --id DS_ID \
  --display-name "Daily basics" \
  --description "Daily per-stock valuation metrics" \
  --domain market --tags "stock,daily" \
  --business-definition "One row per stock per trading day; PE/PB fields are point-in-time" \
  --sensitivity internal \
  --primary-key ts_code,trade_date \
  --unique-keys "ts_code,trade_date" \
  --editable true \
  --ai-instructions "trade_date is the trading day; pe is trailing P/E; use industry for grouping" \
  --ai-synonyms "p/e,市盈率" --ai-examples "P/E by industry last month" \
  --yes
```

- **`--primary-key`** names the physical identity columns (comma-separated) — required before row
  editing or an Action that targets a row.
- **`--unique-keys "a,b;c"`** declares candidate keys (`;` groups, `,` columns). A **relationship**
  pointing at this dataset must target a primary/unique key, so set keys before joins.
- **`--editable true`** allows row editing from the data grid (`data:edit`); it does not change the
  table itself.
- **`ai_context`** (`--ai-instructions/--ai-synonyms/--ai-examples`) is what an agent reads to know
  what the data *means* — spend effort here; it is the difference between a queryable table and a
  groundable one.
- Only the flags you pass change; `PUT /api/datasets/{id}` is a partial update. `--sensitivity ""`
  clears it.

## 4. Relationships (Ossie foreign keys)

```bash
python scripts/cli.py datasets joins list --id DS_ID
python scripts/cli.py datasets joins add \
  --from-id DAILY_BASIC_ID --to-id STOCK_BASIC_ID \
  --columns "ts_code=ts_code" --required --name "daily_basic → stock_basic" --yes
python scripts/cli.py datasets joins delete --join-id JOIN_ID --yes
```

`--from-id` is the **many** side (it holds the FK), `--to-id` the **one** side (the referenced key).
`--required` renders INNER (only matched rows); omit it for LEFT. Composite keys: `--columns
"a=x,b=y"` (aligned pairs). The target columns must be the target dataset's primary/key columns.

## 5. Quality rules

```bash
python scripts/cli.py datasets quality list --id DS_ID          # rules + last status
python scripts/cli.py datasets quality add --id DS_ID \
  --name "close is never null" --type not_null --column close --yes
python scripts/cli.py datasets quality run --id DS_ID --rule-id RULE_ID --yes
python scripts/cli.py datasets quality runs --id DS_ID --rule-id RULE_ID --limit 20  # newest first, paged
# A business-specific constraint: one read-only SELECT returning ONE number = the count of violating
# rows (>0 fails). Must read {{table}}; {{column}} is optional and gets quoted.
# `expect` is what the number means: `zero` (default) = rows that break the rule; `nonzero` = coverage,
# where finding nothing (= 0) is the failure.
python scripts/cli.py datasets quality add --id DS_ID --name "PE above 100" --type sql --column pe_ttm \
  --sql 'SELECT count(*) FROM {{table}} WHERE {{column}} > 100' --yes
# A coverage check fails when nothing is found. Ask the **trading calendar**, not the clock: on a weekend
# `= CURRENT_DATE` reports missing data that is not missing.
python scripts/cli.py datasets quality add --id DS_ID --name "Latest trading day has data" \
  --type sql --column trade_date --expect nonzero \
  --sql 'SELECT count(*) FROM {{table}} WHERE {{column}} = (SELECT max(cal_date::date) FROM tushare.trade_calendar WHERE is_open = 1 AND cal_date::date <= CURRENT_DATE)' \
  --yes
python scripts/cli.py datasets quality update --id DS_ID --rule-id RULE_ID --enabled false --yes
python scripts/cli.py datasets quality delete --id DS_ID --rule-id RULE_ID --yes
```

`--type` is a whitelist — `not_null` / `unique` / `range` / `referential` / `freshness` — and each
needs its own config: `--min`/`--max` (range), `--ref-dataset-id`/`--ref-column` (referential),
`--max-age-days` (freshness). Do not invent types. `quality update --config '{"min":0}'` replaces the
config object wholesale.

## 6. Verify before you hand off

```bash
python scripts/cli.py datasets rows --id DS_ID --limit 5 --sort trade_date --order desc
python scripts/cli.py datasets rows --id DS_ID --filter "close > 100" --filter "industry in 银行,证券"
python scripts/cli.py datasets profile --id DS_ID
python scripts/cli.py datasets schema-history --id DS_ID
```

`rows` **filters the table's columns** (AND-ed; operators `= != like in > >= < <= between is_null
is_not_null`, `between` written `a..b`) and is keyset-paged: pass the last `--sort` value back as
`--after`. The response's `total` counts what the filters match. `profile` computes
null/distinct/min/max per column against the source.

## 7. From dataset to meaning

- **Model** (the semantic lens): `semantic-models list/create`, then `semantic-models fields
  list|add|delete` and `metrics list|add|compute`. Fields are **model-scoped** — there is deliberately
  no `datasets fields` command (it would 404). A metric is an Ossie ANSI-SQL expression with a
  `base_dataset` anchor; `semantic-models query` is how a person *and an agent* ask it.
- **Ontology** (promotion): create an object type whose `dataset_id` is this dataset so its instances
  live in the table (key property + property types come from the fields).

## Rules and gaps

- **Writes confirm.** Every write takes `--dry-run` and needs `-y/--yes` (non-TTY without `--yes`
  exits 2). Read commands are safe to run freely.
- **Permissions:** `data:read` (browse), `data:write` (create/update/ingest/keys/quality/relationships),
  `data:edit` (row edits). A 403 usually means the permission is missing, not that the shape is wrong.
- **Row editing has no CLI command.** `POST /api/datasets/{id}/rows/apply` exists (the data grid uses
  it, `data:edit`) but the bundled CLI does not wrap it — if a task needs it, **report the gap** rather
  than hand-writing HTTP.
- **Deleting a dataset** removes the catalog entry, not the table: `datasets delete --id DS_ID --yes`.
  Check `datasets joins list` and any model that scopes it first.
