# Tutorial: Build a Tushare market-analysis ontology (DIY)

This is a **hands-on operator guide**. You use shipped Ontology Manager / Function Editor / Connectors to model **your** A-share daily data—not a platform seed. Domain types and Function source stay in **your** deployment.

**Time:** about 30–60 minutes after Tushare credentials work.  
**Outcome:** a **Stock** object type on `stock_basic`, Neo4j-indexed, plus one published Function (`stockProfile`) you can run from Manager or [openkms-skill](../features/openkms-skill.md).

Related product docs: [Connectors](../features/connectors.md) · [Ontology](../features/ontology.md) · [Ontology Functions](../features/ontology-functions.md) · [Platform vs DIY](../research/ontology_manager_alignment.md)

---

## What you will (and will not) build

| Build | Skip for now |
|-------|----------------|
| Tushare sync → six Postgres datasets | Indexing every daily bar into Neo4j |
| Object type **Stock** (master data) on `stock_basic` | Empty “fundamentals / northbound” types (connector has no such tables) |
| Read-only Function(s) over dataset-backed objects | Explorer Actions that **persist** Watchlist rows (Action write-back is [deferred](../research/ontology_manager_alignment.md#product-decision-action-write-back-b1)) |

Mental model:

```text
Connector sync  →  Datasets (facts in Postgres)
                      ↓
              Object Types (semantics)  →  Neo4j index for masters only
                      ↓
         Ontology Functions (governed compute)
```

---

## Prerequisites

1. openKMS running (see [Quickstart](../quickstart.md)); **ontology-function-service** up if you will Live Preview / execute Functions (Compose service on `:8105`).
2. Permissions roughly: connectors + datasets + ontology object types + functions (+ Neo4j data source configured in Console).
3. A [Tushare](https://tushare.pro) token with access to the daily APIs you plan to sync.
4. Optional but recommended: [openkms-skill](../features/openkms-skill.md) configured with a personal API key for CLI steps.

Confirm data sources (skill):

```bash
python scripts/cli.py data-sources list
# Note: ontology Postgres data-source id, and Neo4j data-source id (for index).
```

---

## Step 1 — Create and wire the Tushare connector

**UI**

1. Open **Connectors** → create kind **`tushare`**.
2. Set secret **`TUSHARE_TOKEN`**, leave `api_base_url` default unless you use a proxy.
3. On **Output datasets**, for each slot use **Provision dataset** (or bind existing datasets):  
   `trade_calendar`, `stock_basic`, `stock_trade_daily`, `daily_basic`, `stock_adj_daily`, `dividends`.
4. **Run sync now** (optional date range). Wait for job **`run_connector_sync`** under Job runs.
5. Optional: **Probe** tab to hit live `daily` without writing.

**CLI** (after the connector exists):

```bash
python scripts/cli.py connectors list
python scripts/cli.py connectors sync --id <CONN_ID> --yes
python scripts/cli.py jobs get --id <JOB_ID>   # poll until completed
python scripts/cli.py datasets metadata --id <STOCK_BASIC_DATASET_ID>
```

**Check:** dataset `stock_basic` has rows; primary key column is `ts_code`.

Slot → table map: [Connectors — Tushare](../features/connectors.md#tushare-sync).

---

## Step 2 — Create the Stock object type

Treat **Stock** as master data. Prefer **not** creating Neo4j nodes for every `DailyBar` row (millions of `(ts_code, trade_date)` pairs belong in SQL / Function queries).

**UI (Ontology Manager)**

1. **Object types** → **New**.
2. Name: `Stock`. Mark **Master data**. Display property: `name` (or `ts_code`).
3. Bind dataset = your `stock_basic` dataset. Key property: **`ts_code`**.
4. Expose analysis-friendly properties (names must match dataset columns), for example:
   - `ts_code`, `name`, `industry`, `area`, `market`, `list_date`, `is_hs` (strings)
5. Save. On the type (or list Actions), **Index to Neo4j** when a Neo4j data source exists.

**CLI**

```bash
python scripts/cli.py ontology objects create-type \
  --name Stock \
  --dataset-id <STOCK_BASIC_DATASET_ID> \
  --key-property ts_code \
  --display-property name \
  --is-master-data \
  --properties-json '[
    {"name":"ts_code","type":"string","required":true},
    {"name":"name","type":"string","required":false},
    {"name":"industry","type":"string","required":false},
    {"name":"area","type":"string","required":false},
    {"name":"market","type":"string","required":false},
    {"name":"list_date","type":"string","required":false},
    {"name":"is_hs","type":"string","required":false}
  ]' \
  --yes

python scripts/cli.py ontology objects sync-neo4j-type \
  --type-id <STOCK_TYPE_ID> \
  --neo4j-data-source-id <NEO4J_DS_ID> \
  --yes
```

**Check:** Object Explorer → **Objects** → filter type Stock; or Cypher Explore for a known `ts_code`.

Optional later: Object type **TradeDay** on `trade_calendar` (composite key `exchange` + `cal_date`). Fact tables (`stock_trade_daily`, …) can stay **datasets only** until you need Explorer browsing.

---

## Step 3 — Author and publish `stockProfile`

Functions are **versioned, published compute**—not another sync path. Do not call Tushare from Function source; read ontology / datasets via the injected `Client`.

Create a file `stock_profile.py`:

```python
from openkms_functions import Client, function


@function
def execute(input: dict, client: Client) -> dict:
    ts_code = (input.get("ts_code") or "").strip()
    if not ts_code:
        return {"error": "ts_code is required"}

    rows = client("Stock").search(limit=20, filters={"search": ts_code})
    stock = next(
        (r for r in rows if str(r.get("ts_code") or r.get("id") or "") == ts_code
         or str(r.get("properties", {}).get("ts_code", "")) == ts_code),
        rows[0] if rows else None,
    )
    return {
        "ts_code": ts_code,
        "found": stock is not None,
        "stock": stock,
        "hint": "Extend with more Functions that join daily_basic / adj_factor datasets as you grow.",
    }
```

Authoring rules: skill package `openkms-skill/references/functions-authoring.md` (allowed imports, `@function`, `uses=`). See also [openkms-skill](../features/openkms-skill.md).

**UI**

1. **Function Editor** → create function api name `stockProfile`.
2. Paste source → **Validate** / Live Preview with `{"ts_code":"000001.SZ"}`.
3. **Ontology Manager → Functions** → **Publish**.

**CLI**

```bash
python scripts/cli.py ontology functions create \
  --api-name stockProfile \
  --display-name "Stock profile" \
  --source-code-file ./stock_profile.py \
  --input-schema-json '{"type":"object","required":["ts_code"],"properties":{"ts_code":{"type":"string"}}}' \
  --yes

python scripts/cli.py ontology functions validate --id <FN_ID> --source-code-file ./stock_profile.py --yes
python scripts/cli.py ontology functions publish --id <FN_ID> --yes
python scripts/cli.py ontology functions execute-by-api-name \
  --api-name stockProfile \
  --input-json '{"ts_code":"000001.SZ"}' \
  --yes
```

**Check:** JSON includes your stock row (or a clear `found: false` if that code is not in the synced universe).

---

## Step 4 — Suggested next Functions (still DIY)

Add these as separate published Functions when you need them. Prefer composition with `@function(uses=[...])`.

| apiName | Purpose |
|---------|---------|
| `getTradeWindow` | Last *N* open calendar dates |
| `getAdjCloseSeries` | Adjusted close series (pick **one** adjustment convention and stick to it) |
| `getLatestBasics` | Latest PE/PB/turnover/mkt cap from `daily_basic` |
| `screenStocks` | Cross-sectional filter (industry, PE band, …) |
| `marketBreadth` | Up/down / limit counts for a trade date |

Keep heavy joins in Function logic over datasets; do not Neo4j-index full daily tables “just in case.”

---

## Workbench objects (Watchlist / Screen) — current limits

You *may* create non-dataset object types such as **Watchlist** / **ScreenRun** and create instances in Object Explorer or via CLI.

What is **not** ready yet:

- Action execute that **applies** object edits (`create_edit_batch` is inspect-only).
- Reliable Actions on dataset-backed Stock rows whose ids are Neo4j/dataset synthetic keys (execute still resolves PG `ObjectInstance` ids).

Until Action write-back ships, treat Watchlists as manual instance CRUD, or keep screening results in Function output / notes. See [Manager alignment — DIY blockers](../research/ontology_manager_alignment.md#diy-blockers-platform-hard-gaps).

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Sync job fails / empty tables | Token privileges; rate limits; job logs; Probe without dates |
| Stock list empty in Explorer | Dataset bind + key property; re-run Neo4j index for the type |
| Function import / `Client` errors | ofs running; skill/authoring allowed imports; publish before `execute-by-api-name` |
| `uses=` publish fails | Dependency Function must exist and be **published** |
| Want “Add to Watchlist” on a Stock row | Deferred platform gap — not a missing Stock type |

---

## Related

| Doc | Why |
|-----|-----|
| [openkms-skill](../features/openkms-skill.md) | CLI Workflow **G** (same path for agents) |
| [Ontology SDK](../features/ontology-sdk.md) | `@function`, `Client`, edit-batch foundation |
| [Object Explorer](../features/object-explorer.md) | Browse Stocks / Cypher |
| [Manager alignment](../research/ontology_manager_alignment.md) | What is platform vs your content |
