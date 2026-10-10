# Workflow recipes

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**. Load for multi-step recipes. Command catalogs: [commands-content.md](commands-content.md), [commands-ontology.md](commands-ontology.md), [commands-ops.md](commands-ops.md).

**A. Find a doc by phrase, fetch its markdown.**

```bash
python scripts/cli.py search --q "乳腺癌" --types documents --limit 5
# pick the doc id from the response
python scripts/cli.py documents markdown --id <doc_id> --out ./case.md
```

**B. Ask the KB a question (grounded with citations).**

```bash
python scripts/cli.py kb list
python scripts/cli.py kb ask --id <kb_id> --question "既往症的判定标准是什么？"
```

**C. NL question against the ontology graph.**

```bash
python scripts/cli.py ontology ask --question "列出与'重疾豁免'触发条件相关的合规通函"
# returns {question, cypher, explanation, columns, rows, answer}
```

**D. Tight-loop content discovery + read.**

```bash
python scripts/cli.py articles list --channel-id <ch_id> --limit 200 \
  | jq -r '.items[] | select(.name | test("乳腺癌")) | .id' \
  | while read id; do python scripts/cli.py articles markdown --id "$id" --out "./$id.md"; done
```

**E. After wiki page edits, refresh KB search for one linked space.**

```bash
python scripts/cli.py kb wiki-spaces list --kb-id <kb_id>
python scripts/cli.py kb wiki-spaces reindex --kb-id <kb_id> --space-id <space_id> --yes
# → JobResponse with "id"; poll jobs get
```

**F. Improve an article using the latest content review.**

```bash
python scripts/cli.py articles reviews latest --id <art_id>
# → .result.suggestions[], .result.criteria[], .result.pass, .result.summary
# If 404: run review first
python scripts/cli.py articles review run --id <art_id> --yes
python scripts/cli.py articles markdown --id <art_id>
```

**G. Tenant DIY: Tushare datasets → Stock object type → read-only Function (not a platform seed).**

Domain schema and Function source are **operator content**. In the openKMS monorepo: `docs/tutorials/understanding-ontology.md`, `docs/tutorials/tushare-market-ontology.md`. Skill-only installs do not ship those docs — use [functions-authoring.md](functions-authoring.md) and CLI help. Do **not** invent product APIs for this path.

```bash
python scripts/cli.py data-sources list
python scripts/cli.py connectors list
python scripts/cli.py connectors sync --id <conn> --yes
python scripts/cli.py jobs get --id <job_id>
python scripts/cli.py datasets metadata --id <stock_basic_dataset_id>
python scripts/cli.py ontology objects create-type \
  --name Stock --dataset-id <id> --key-property ts_code --is-master-data \
  --display-property name --properties-json '[...]' --yes
# Prefer NOT sync-neo4j on huge daily bar datasets; sync Stock (and analysis OTs) only:
python scripts/cli.py ontology objects sync-neo4j-type \
  --type-id <stock_ot> --neo4j-data-source-id <neo4j_ds> --yes
python scripts/cli.py ontology functions create \
  --api-name stockProfile --display-name "Stock profile" \
  --source-code-file ./stock_profile.py --yes
python scripts/cli.py ontology functions validate --id <fn> --source-code-file ./stock_profile.py --yes
python scripts/cli.py ontology functions publish --id <fn> --yes
python scripts/cli.py ontology functions execute-by-api-name \
  --api-name stockProfile --input-json '{"ts_code":"000001.SZ"}' --yes
```

Author `stock_profile.py` per [functions-authoring.md](functions-authoring.md). Workbench types (Watchlist / ScreenRun): create instances via Explorer / `ontology objects` for **non-dataset** types if needed. Action execute **applies** create/modify/delete on those instances; dataset-backed synthetic ids remain deferred.

**H. Register a hosted module App.**

Read **[app-builder.md](app-builder.md)** then either:

```bash
python scripts/cli.py kubernetes register-app \
  --cluster-id ID --namespace default --service my-svc --port 80 \
  --name "Web" --api-name webApp --yes
```

or `apps create` with `--bindings-json` containing `k8s`.
