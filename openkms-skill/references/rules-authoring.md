# Metric rule authoring (指标勾稽)

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**.

**Read this before** `metric-rules add|update|evaluate|evaluate-all` and `metric-events patch`.

A rule watches **one metric** and states what must hold. Running it yields **pass / fail / unknown** for a period and scope; a failure that carries advice opens an **alert**. Rules live under `/api/metric-rules`, alerts under `/api/metric-events`. The CLI splits them the same way, under the API's own names: `metric-rules …` and `metric-events …`.

Do **not** invent a condition shape by probing the API. Exactly one of `condition` / `identities` is required; both are JSON on the CLI.

## The two kinds of "must hold"

| Kind | CLI flag | Question it answers | Example |
|------|----------|---------------------|---------|
| **threshold** | `--condition` | is this number in range? | 缺货 SKU 数 < 5 |
| **identity** | `--identities` | do these numbers agree? | 分货额度(明细) = 方案累计额度(方案表) |

A reconciliation ("指标勾稽") is an **identity**, not a threshold: two metrics, each computed from its own source, must agree within a tolerance.

## `--condition` (threshold)

One comparison, or a list of comparisons that must **all** hold:

```json
{"left": <operand>, "op": ">", "right": {"value": 1}}
{"all": [{"left": …, "op": ">=", "right": …}, {"left": …, "op": "<", "right": …}]}
```

`op ∈ < <= > >= == !=`. No `any`, no nesting. An operand is one of four shapes, the same for either side:

| Shape | Meaning |
|-------|---------|
| `{"metric": "<metric_id>", "filters": […]}` | a metric's value, optionally filtered |
| `{"dataset_agg": {"dataset_id": "…", "fn": "count|sum|avg|min|max", "column": null, "filters": […]}}` | an aggregate straight off a table |
| `{"diff": [<operand>, <operand>]}` | left − right |
| `{"ratio": [<operand>, <operand>]}` | left ÷ right |

`filters` uses the data layer's own filter vocabulary (`{field|column, op, value}`), so a rule can be scoped to one scenario without a second filter language.

```bash
python scripts/cli.py metric-rules add \
  --name "缺货 SKU 数在阈值内" --metric-id METRIC_ID \
  --condition '{"left":{"metric":"METRIC_ID"},"op":"<","right":{"value":5}}' \
  --conclusion "缺货 SKU 数越界" --suggestion "检查今日分货" --yes
```

## `--identities` (identity / 勾稽)

A JSON array of identities. Each is one target explained by weighted members:

```json
[{"target": {"metric": "A"}, "members": [{"metric": "B", "weight": 1}, {"metric": "C", "weight": -1}], "tolerance": {"abs": 1}}]
```

| Field | Meaning |
|-------|---------|
| `target` | the metric that must be explained (`{"metric": "<id|name>"}`) |
| `members` | the metrics that explain it, each with a `weight` |
| `tolerance` | how far apart the two sides may be: `{"abs": 1}` (rows, currency) or `{"rel": 0.001}` (a share of the target) |
| `kind` | `decompose` (default) or `ratio` |

Two kinds, because the arithmetic of "agree" differs:

- **`decompose`** (default) — `target = Σ weight × member`. Additive: a total against its parts, or two sources of the same number (one member, weight −1).
- **`ratio`** — `target = numerator / denominator`, exactly two members. A rate is not additive, so it cannot be a weighted sum.

Two identities cannot explain the same target metric (their residuals would overwrite each other in the alert) — merge them.

```bash
python scripts/cli.py metric-rules add \
  --name "分货额度 = 方案累计额度" --metric-id TARGET_METRIC_ID \
  --identities '[{"target":{"metric":"TARGET_METRIC_ID"},"members":[{"metric":"DETAIL_METRIC_ID","weight":-1}],"tolerance":{"abs":1}}]' \
  --yes
```

## Run parameters and grouping

A rule may declare **run parameters** (`--run-params`) — the values a run must be given, and how each narrows the operands:

```json
{"arguments": [{"key": "cycle", "kind": "filter", "field": "cycle", "role": "period", "required": true}]}
```

| Field | Meaning |
|-------|---------|
| `key` | the argument's name (`[a-zA-Z_][a-zA-Z0-9_]*`) |
| `kind` | `filter` (narrows every operand by a field) or `key` (narrows the scopes to the groups the run names) |
| `field` | the field the value applies to (for `filter`) |
| `role` | `period` — the value *names the period*, so the verdict belongs to that period and its interval lands on the alert |
| `required` | the run refuses to start without it |

`--group-by FIELD` states the dimension the rule is checked per (e.g. `scenario_id`): one verdict per group, not one per run.

The "运行" button asks for exactly what `metric-rules get` reports as `run_params` — do not guess keys.

## Evaluate

```bash
# One rule, for a period and scope (--simulate = compute verdicts, publish no alerts)
python scripts/cli.py metric-rules evaluate --id RULE_ID \
  --values '{"cycle":"2026-W46","scenario":["S1"]}' --simulate

# Every active rule, or one metric's
python scripts/cli.py metric-rules evaluate-all --metric-id METRIC_ID \
  --values '{"cycle":"2026-W46"}'
```

A verdict is `pass` / `fail` / `unknown`. `unknown` is **not** a failure — it means the rule could not be computed (missing source, uncomputable operand) and publishes nothing. `--simulate` still reports what *would* have published.

## Alerts (`metric-events …`)

A failure that carries advice opens an alert; it records the rule, the revision that fired, the period and scope, the evidence (each identity's residual), and the suggested action. State machine:

| State | Meaning |
|-------|---------|
| `open` | needs a decision |
| `dismissed` | seen, not acted on |
| `resolved` | acted on |

```bash
python scripts/cli.py metric-events list --open-only
python scripts/cli.py metric-events summary            # open/total per metric
python scripts/cli.py metric-events patch --event-id EVENT_ID --status resolved --assignee alice --yes
python scripts/cli.py metric-rules events --id RULE_ID
```

**`version` is the rule's revision, not an event count.** Every accepted edit bumps it; the alert records which revision fired. Deleting a rule deletes its alerts (FK cascade) — they have no meaning without it.

## One rule, one number

A rule watches one metric, so list them via the metric they watch, not by scanning:

```bash
python scripts/cli.py metrics list                    # find the metric id
python scripts/cli.py metric-rules list --metric-id METRIC_ID
```
