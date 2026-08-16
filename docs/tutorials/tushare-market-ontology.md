# Tutorial: Tushare market-analysis ontology (DIY case study)

**Prerequisite:** [Understanding the ontology (Kanban lab)](understanding-ontology.md).  
This page is a **market domain lab**. It assumes you already built (or understood) the mini Kanban ontology path—datasets vs object types, FoO, index choices.

You build **tenant content** in your deployment: A-share daily data from [Tushare](https://tushare.pro) → **Stock** + **Functions on Objects (FoO)**. Not a platform seed.

| | |
|--|--|
| **Audience** | Readers who finished the ontology intro (or equivalent) |
| **Time** | ~45–60 min lab after credentials work |
| **Outcome** | Live Stock type + published FoO Functions (`stockProfile`, series contract) |

**Related:** [Connectors — Tushare](../features/connectors.md#tushare-sync) · [Ontology Functions](../features/ontology-functions.md) · [openkms-skill](../features/openkms-skill.md) · [Platform vs DIY](../research/ontology_manager_alignment.md)

> **Design target / Future requirements** below are product direction (TSP, series store). They are **not** shipped. Use FoO series Functions until then. Feature docs stay unchanged until implementation.

---

## 1. Why this case study?

Market data is a stress test for ontology design:

- **Masters** (stocks) are few and stable → good object types + Neo4j index.  
- **Facts** (daily OHLCV, PE, adj factors) are huge → belong in **datasets**, queried by FoO—not millions of graph nodes.  
- Analysts and agents need **governed** answers (“profile”, “adj-close series”, “screen”) more than ad-hoc SQL.

That matches the intro tutorial’s anti-patterns and Palantir’s split between objects and time series ([TSP overview](https://www.palantir.com/docs/foundry/time-series/time-series-overview/)). openKMS interim: FoO returns `points[]` instead of native TSP.

```text
Connector sync  →  Datasets (six Tushare tables)
                      ↓
              Object type Stock  →  Neo4j index (masters only)
                      ↓
         FoO: stockProfile / getAdjCloseSeries / screens
```

---

## 2. Design choices for market data

| Concern | Palantir-aligned intent | What you do now |
|---------|-------------------------|-----------------|
| Identity | Stock OT + object index | Bind `stock_basic` → Stock; Index Neo4j |
| Price / PE over time | TSP on Stock + time series sync/DB | FoO `(ts_code, start, end) → points[]` |
| Daily bars as peer objects | Avoid | Keep fact tables as datasets only |
| Logic shape | FoO (Function + object id) | `stockProfile`, `getAdjCloseSeries`, … |

**Vocabulary:** Tushare **connector sync** fills Postgres datasets. Palantir **time series sync** indexes `(series_id, timestamp, value)` into a series DB. They are not the same. See intro §4.9.

**FoO style (required for this lab):**

```text
getAdjCloseSeries(ts_code, start, end) → { points: [{ date, value }, ...] }
stockProfile(ts_code)                  → { stock, ... }
```

Not OOP `Stock.getAdjCloseSeries()`. Not calling Tushare inside Function source.

---

## 3. What Tushare puts in datasets

After connector sync (defaults under schema `tushare`):

| Slot / table | Grain | Role here |
|--------------|-------|-----------|
| `stock_basic` | One row per `ts_code` | Backing dataset for **Stock** |
| `trade_calendar` | Exchange + day | Helpers / optional TradeDay later |
| `stock_trade_daily` | Code + trade date | Fact → series / returns FoO |
| `daily_basic` | same | Fact → PE, turnover, limits |
| `stock_adj_daily` | same | Fact → adj factor |
| `dividends` | Code + ex date | Event facts |

**Checkpoint mindset:** Sync ⇒ datasets exist and have rows. **Stock** exists only after you create the object type (intro: dataset ≠ object type).

---

## 4. Lab prerequisites

1. Read [Understanding the ontology](understanding-ontology.md).  
2. openKMS + **ontology-function-service** ([Quickstart](../quickstart.md)).  
3. Permissions: connectors, datasets, object types, functions; Neo4j if indexing.  
4. Tushare token. Optional: [openkms-skill](../features/openkms-skill.md).

```bash
python scripts/cli.py data-sources list
```

| Build | Skip |
|-------|------|
| Six datasets + Stock + FoO | Full daily Neo4j index; empty “fundamentals” OTs; native TSP; Action write-back for Watchlist |

---

## 5. Step 1 — Connector and datasets

**UI:** Connectors → kind `tushare` → `TUSHARE_TOKEN` → Provision all six slots → Run sync → **Manager → Datasets** → open `stock_basic` → **Data / Columns / Usage**.

**CLI:**

```bash
python scripts/cli.py connectors list
python scripts/cli.py connectors sync --id <CONN_ID> --yes
python scripts/cli.py jobs get --id <JOB_ID>
python scripts/cli.py datasets metadata --id <STOCK_BASIC_DATASET_ID>
```

---

## 6. Step 2 — Object type Stock

Bind `stock_basic`, key `ts_code`, master data, display `name`; **Index only Stock**.

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

Confirm: `stock_basic` **Usage** lists Stock; daily datasets still have no OT.

---

## 7. Step 3 — FoO `stockProfile`

```python
from openkms_functions import Client, function


@function
def execute(input: dict, client: Client) -> dict:
    ts_code = (input.get("ts_code") or "").strip()
    if not ts_code:
        return {"error": "ts_code is required"}

    rows = client("Stock").search(limit=20, filters={"search": ts_code})
    stock = next(
        (
            r
            for r in rows
            if str(r.get("ts_code") or r.get("id") or "") == ts_code
            or str((r.get("properties") or {}).get("ts_code", "")) == ts_code
        ),
        rows[0] if rows else None,
    )
    return {"ts_code": ts_code, "found": stock is not None, "stock": stock}
```

```bash
python scripts/cli.py ontology functions create \
  --api-name stockProfile \
  --display-name "Stock profile" \
  --source-code-file ./stock_profile.py \
  --input-schema-json '{"type":"object","required":["ts_code"],"properties":{"ts_code":{"type":"string"}}}' \
  --yes
# validate → publish → execute-by-api-name '{"ts_code":"000001.SZ"}'
```

---

## 8. Step 4 — FoO series (TSP stand-in)

| Input | Output |
|-------|--------|
| `ts_code`, `start`, `end` | `{ "metric": "adj_close", "points": [{"date","value"}, ...], "convention": "..." }` |

```python
from openkms_functions import Client, function


@function
def execute(input: dict, client: Client) -> dict:
    ts_code = (input.get("ts_code") or "").strip()
    start = (input.get("start") or "").strip()
    end = (input.get("end") or "").strip()
    if not ts_code or not start or not end:
        return {"error": "ts_code, start, and end are required"}

    if not client("Stock").search(limit=5, filters={"search": ts_code}):
        return {"ts_code": ts_code, "found": False, "points": []}

    points: list[dict] = []  # fill from daily + adj datasets; prefer future R2 Client API
    return {
        "ts_code": ts_code,
        "metric": "adj_close",
        "start": start,
        "end": end,
        "found": True,
        "points": points,
        "convention": "document your adj formula here",
    }
```

Publish as `getAdjCloseSeries`. Next FoO ideas: `getLatestBasics`, `getTradeWindow`, `screenStocks`, `marketBreadth`.

**Workbench:** Watchlist/Screen OTs may be created manually; Action **apply** persists `create`/`modify`/`delete` on Explorer-created instances. Dataset/Neo4j **synthetic** Action `object_id` remains deferred ([alignment](../research/ontology_manager_alignment.md#diy-blockers-platform-hard-gaps)).

---

## 9. Market-specific anti-patterns

| Avoid | Prefer |
|-------|--------|
| Neo4j for all daily bars | Dataset + FoO series |
| Tushare calls inside Functions | Connector sync |
| Action named “sync market” | Connector Run sync / schedule |
| Skipping Datasets UI after sync | Confirm Data/Columns before Stock OT |

General anti-patterns: [Understanding ontology §6](understanding-ontology.md#6-anti-patterns).

---

## 10. Future platform requirements (from this case)

Track for product work; not in feature docs until built.

| ID | Requirement |
|----|-------------|
| **R1** | FoO templates (object identity inputs) |
| **R2** | Client API to query dataset rows (date / key filters) |
| **R3** | Shared series `points[]` JSON Schema |
| **R4** | TSP on object types (Capabilities-like UI) |
| **R5** | Time series sync + series store |
| **R6** | Explorer series preview for a Stock |
| **R7** | Docs: series ≠ full Neo4j facts |
| **R8** | Action write-back + dataset/Neo4j object ids |

---

## 11. Troubleshooting

| Symptom | Check |
|---------|--------|
| Empty datasets | Token, job logs, Probe, provision |
| Stock missing in Explorer | Bind + key; re-index |
| Cannot read daily rows in Function | Until **R2**, expected limitation |
| Want native `Stock.close` | **R4–R5**; use `getAdjCloseSeries` |

---

## 12. Related

| Doc | Role |
|-----|------|
| [Understanding the ontology](understanding-ontology.md) | Concepts (read first) |
| [openkms-skill](../features/openkms-skill.md) | CLI Workflow G |
| [Palantir time series](https://www.palantir.com/docs/foundry/time-series/time-series-overview/) | TSP model (external) |
| [Palantir FoO](https://www.palantir.com/docs/foundry/functions/functions-on-objects/) | FoO naming (external) |
