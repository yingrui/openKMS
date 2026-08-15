# 教程：自己动手搭建 Tushare 市场分析本体（DIY）

这是一份**可跟做的操作指南**。用已交付的 Ontology Manager / Function Editor / Connectors，在**你的部署**里建模 A 股日频数据——**不是**平台内置种子。对象类型与 Function 源码归租户所有。

**用时：** Tushare 凭证可用后约 30–60 分钟。  
**结果：** 绑定 `stock_basic` 的 **Stock** 对象类型（可索引 Neo4j），以及可发布执行的 Function（如 `stockProfile`）。可用 Manager 或 [openkms-skill](../features/openkms-skill.md) CLI。

英文源文档：[Tutorial: Build a Tushare market-analysis ontology](tushare-market-ontology.md)（细节与命令以英文为准；本页为中文导读）。

相关：[连接器](../features/connectors.md) · [本体](../features/ontology.md) · [Ontology Functions](../features/ontology-functions.md) · [平台 vs DIY](../research/ontology_manager_alignment.md)

---

## 你要做 / 先不做

| 做 | 先不做 |
|----|--------|
| Tushare sync → 六张 Postgres 数据集 | 把每条日线都索引进 Neo4j |
| 主数据 **Stock**（`stock_basic`） | 空壳「财报 / 北向」类型（连接器无对应表） |
| 只读 Ontology Functions | 依赖 Action **持久写回** 自选股（写回已[延后](../research/ontology_manager_alignment.md#product-decision-action-write-back-b1)） |

分层：

```text
Connector 同步  →  Datasets（Postgres 事实）
                      ↓
              Object Types（语义）  →  仅主数据进 Neo4j
                      ↓
         Ontology Functions（可治理计算）
```

---

## 前置条件

1. openKMS 已运行（见[快速开始](../quickstart.md)）；执行 Function 需 **ontology-function-service**（Compose 默认 `:8105`）。
2. 权限大致覆盖：连接器、数据集、对象类型、Functions，以及 Console 中的 Neo4j 数据源。
3. 可用的 [Tushare](https://tushare.pro) token。
4. 建议配置 [openkms-skill](../features/openkms-skill.md) 个人 API 密钥。

```bash
python scripts/cli.py data-sources list
# 记下 ontology Postgres 与 Neo4j 的 data-source id
```

---

## 步骤摘要

1. **连接器** — 创建 `tushare`，填 `TUSHARE_TOKEN`，为六个 slot **Provision dataset**，**Run sync**，在任务列表等到完成。详见[连接器 · Tushare](../features/connectors.md#tushare-sync)。
2. **Stock 对象类型** — Ontology Manager 新建 `Stock`，主数据，绑定 `stock_basic`，主键 `ts_code`，展示属性 `name`，按需暴露 `industry` / `area` / `market` 等；**仅对该类型 Index Neo4j**。
3. **Function** — Function Editor 编写 `stockProfile`（用注入的 `Client` 查 `Stock`，**禁止**在 Function 里直连 Tushare）→ Validate / Preview → Manager **Publish**；或用 skill CLI `ontology functions create|validate|publish|execute-by-api-name`。
4. **后续 DIY** — 按需加 `getTradeWindow`、`getAdjCloseSeries`、`screenStocks` 等；复权约定只选一种写进 Function。

完整命令、示例源码与排错表见[英文教程](tushare-market-ontology.md)。

---

## 工作台对象（自选 / 筛选快照）

可以自建无 dataset 的 **Watchlist** / **ScreenRun** 等类型，并在 Object Explorer 或 CLI 里手动建实例。

尚不可用：Action 真正 apply 对象编辑；对 dataset/Neo4j 合成 Stock id 触发 Action 易 404。在写回能力落地前，筛选结果可留在 Function 输出或笔记中。见[对齐说明 · DIY 硬缺口](../research/ontology_manager_alignment.md#diy-blockers-platform-hard-gaps)。

---

## 相关链接

| 文档 | 用途 |
|------|------|
| [英文完整教程](tushare-market-ontology.md) | 逐步命令与示例代码 |
| [openkms-skill](../features/openkms-skill.md) | Agent Workflow **G** |
| [Ontology SDK](../features/ontology-sdk.md) | `@function` / `Client` |
| [Manager 对齐](../research/ontology_manager_alignment.md) | 平台能力 vs 租户内容 |
