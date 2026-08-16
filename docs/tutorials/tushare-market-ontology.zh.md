# 教程：Tushare 市场分析本体（DIY 案例）

**先修：** [认识本体（看板实验）](understanding-ontology.md)。  
本页是**市场领域实验**。默认你已走过（或理解）迷你看板路径——数据集 vs 对象类型、FoO、Index 取舍。

在**你的部署**里用 [Tushare](https://tushare.pro) 搭建 **Stock** + **FoO** Function——租户内容，非平台种子。

| | |
|--|--|
| **读者** | 已读完本体入门（或同等基础） |
| **时间** | 凭证就绪后约 45–60 分钟实验 |
| **产出** | 可用的 Stock 类型 + 已发布 FoO（`stockProfile`、序列契约） |

**相关：** [连接器 · Tushare](../features/connectors.md#tushare-sync) · [Ontology Functions](../features/ontology-functions.md) · [openkms-skill](../features/openkms-skill.md)

英文源（完整 CLI）：[Tushare market-analysis ontology](tushare-market-ontology.md)。

> **设计目标 / 后续要求**（TSP 等）尚未交付；现阶段用 FoO 序列 Function。实现前不改 features 文档。

---

## 1. 为什么用市场数据做案例？

- **主数据**（股票）少而稳 → 适合 OT + Neo4j index。  
- **事实**（日线、估值）量大 → 留在**数据集**，用 FoO 查，而不是百万图节点。  
- 需要可治理的「画像 / 序列 / 筛选」，而不是每人一份 SQL。

与入门教程的反模式、Palantir「对象 vs 时序」划分一致。openKMS 过渡方案：FoO 返回 `points[]`。

```text
连接器 sync → 六张数据集 → Stock（仅主数据 Index）→ FoO
```

---

## 2. 市场向设计取舍

| 关切 | 对齐 Palantir 的意图 | 你现在怎么做 |
|------|----------------------|--------------|
| 身份 | Stock OT + 对象索引 | 绑 `stock_basic`，Index Neo4j |
| 价格随时间 | TSP + 时序 sync/库 | FoO `(ts_code, start, end) → points[]` |
| 日线当平级对象 | 避免 | 事实表仅数据集 |
| 逻辑形态 | FoO | `stockProfile`、`getAdjCloseSeries`… |

**两个 sync：** 连接器 sync 灌 Postgres；Palantir time series sync 进时序库——不是一回事。见[入门 §4.9](understanding-ontology.md)。

---

## 3. 同步后数据集角色

| 表 | 粒度 | 本案例角色 |
|----|------|------------|
| `stock_basic` | 每代码一行 | **Stock** 背后数据集 |
| `trade_calendar` | 交易所+日 | 日历 / 可选 TradeDay |
| `stock_trade_daily` 等日频 | 代码+交易日 | 事实 → 序列 FoO |
| `dividends` | 代码+除权日 | 事件事实 |

**检查点：** 同步完成 = 数据集有行；**Stock** 要等你创建对象类型（数据集 ≠ 对象类型）。

---

## 4. 实验步骤摘要

**前置：** 读完[认识本体](understanding-ontology.md)；ofs 可用；Tushare token。

1. **连接器** — `tushare` + token + 六槽位 Provision + Run sync；到 **Datasets** 看 `stock_basic` 的 Data/Columns/Usage。  
2. **Stock** — 主数据，绑 `stock_basic`，主键 `ts_code`，**只 Index Stock**。  
3. **`stockProfile`** — 入参 `ts_code`，`Client("Stock")`，禁止 Function 内调 Tushare；Publish。  
4. **`getAdjCloseSeries`** — `(ts_code, start, end) → points[]`；复权约定写死一种；读日频优先等平台 **R2**。

完整命令与代码见[英文教程](tushare-market-ontology.md) §5–8。

自选/筛选工作台可手动建 OT；Action 写回仍延后。

---

## 5. 市场向反模式与后续要求

| 避免 | 更好 |
|------|------|
| 日线全进 Neo4j | 数据集 + FoO |
| Function 打 Tushare | 连接器 sync |
| 同步完不看 Datasets | 先确认 Data/Columns 再建 Stock |

**R1–R8**（FoO 模板、dataset 行 API、TSP、时序 sync、Explorer 预览、Action 写回等）见[英文教程「Future platform requirements」一节](tushare-market-ontology.md)。通用建模习惯见[看板实验教程](understanding-ontology.md)。

---

## 6. 相关链接

| 文档 | 角色 |
|------|------|
| [认识本体（看板实验）](understanding-ontology.md) | **先做**迷你看板 |
| [英文完整实验](tushare-market-ontology.md) | CLI / 代码 |
| [openkms-skill](../features/openkms-skill.md) | Workflow G |
