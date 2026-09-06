# 教程：在本体上搭建一个简单看板

**本教程的目标：** 通过在 openKMS **本体上构建一个小型看板（Kanban）** 来学习本体——对象类型、链接、几张卡片，以及一个面向决策的 Function。看板是软件教学里的经典载体（列、卡片、负责人、阻塞）；在这里它是**明确产出**，不只是打比方。

**可选下一篇：** [Tushare 市场分析本体 DIY](tushare-market-ontology.md)（同一套分层，换领域）。

| | |
|--|--|
| **读者** | 刚接触 Ontology Manager / Object Explorer / Function Editor 的研发同学 |
| **时间** | 约 60–90 分钟（概念 + 动手） |
| **学完应有** | 可用的迷你看板：**Project**、**WorkItem**、**Person**、**dependsOn**，以及已发布的优先级/依赖类 FoO |

**功能参考：** [本体](../features/ontology.md) · [Ontology Functions](../features/ontology-functions.md) · [目标](../goals.md)

> openKMS **不在 Object Explorer 交付看板 UI**。「看板」= 带 **status/列** 的工作项，在 Explorer 浏览，可选 Neo4j 看依赖，用 FoO 决策，用 Actions **创建 / 更新 / 移动 / 删除**卡片（`edits` 写回）。可视化应用用 **[App Builder](../features/app-builder.md)** 的平台积木（`OntoObjectList`、`Modal` + `TextField` + `Button` 等）组装，**没有**内置看板组件。已发布应用在 **Apps** 中运行。

英文源：[Build a simple Kanban on the ontology](understanding-ontology.md)

---

## 1. 为什么以「搭看板」为目标？

openKMS 是**知识系统**。知识不只是文档/维基/KB；还有一大块是**结构化的**：项目与卡片、卡在哪一列、谁挡谁、谁过载、哪条优先级规则算官方。这是**本体知识**——openKMS 支持本体的重要原因（见[目标](../goals.md)）。

| 知识形态 | 表面 |
|----------|------|
| 叙述 / 证据 | 文档、文章、维基、KB |
| 术语与地图 | 术语表、知识地图 |
| **有类型的工作、关系、决策逻辑** | **本体** |

**看板**适合当教学目标，因为研发几乎都认识：

```text
Backlog → 进行中 → 评审 → 完成
```

卡片有负责人、估点、阻塞。能把*这个*建成本体 + FoO，其它运营领域（含市场）只是换名字。

---

## 2. 学习目标

1. 说明看板状态为什么是**知识**，而不只是「项目工具」。  
2. 能口述数据源 / 数据集 / 对象类型 / 实例 / 链接 / Index / Function。  
3. 创建 **Project · WorkItem · Person** 及链接。  
4. 用 **status** 当列，在 Explorer 里看到「板」。  
5. 发布一个帮 AI **定优先级 / 析依赖 / 看产能** 的 FoO。  
6. （可选）绑定 Actions，通过 `edits` **创建 / 更新 / 移动 / 删除**卡片（平台 apply `create` / `modify` / `delete`）。  
7. （可选）用同一块看板说明 **App 如何与本体交互**：Resources → DataModel → `OntoObjectList` / `executeAction` / `executeFunction`。

---

## 3. 搭板所需概念（短）

```text
数据源 / 数据集（可选）→ 对象类型 → 实例（卡片）→ 链接 → Index（可选）→ FoO（决策）
→ Action（写回）→ App Builder + Apps（可视化列：租户 Source + 平台 host，见步骤 F）
```

本实验可**不建数据集**，在 Object Explorer **直接建实例**（教学最快）。有 Jira/Linear 或 Postgres 种子表时再登记数据集并绑定。

**FoO：** 入参带对象 id；不是 OOP 方法表。

**三 App：** Manager（模式）· Explorer（看卡片/Cypher）· Function Editor（写 FoO）。

---

## 4. 先设计迷你看板

### 4.1 对象类型

| 类型 | 含义 | 示例属性 |
|------|------|----------|
| **Project** | 一块板 / 一次交付 | `name`、`key`（如 `DEMO`） |
| **WorkItem** | 一张卡 | `title`、`status`（`backlog` \| `in_progress` \| `review` \| `done`）、`estimate`、`priority` |
| **Person** | 经办人 | `name`、`handle` |

本教程里 **`status` = 看板列**。枚举保持短、写清楚。

### 4.2 链接类型

| 链接 | 方向 | 用途 |
|------|------|------|
| **belongsTo** | WorkItem → Project | 卡属于哪块板 |
| **assignedTo** | WorkItem → Person | 负责人 |
| **dependsOn** | WorkItem → WorkItem | 阻塞 / 依赖分析 |

### 4.3 决策 FoO（实验选一个先做）

| apiName | 用途 |
|---------|------|
| `suggestWorkItemPriority` | 给卡片打分（是否阻塞、是否进行中…） |
| `workItemDependencyClosure` | 传递依赖 / 阻塞列表 |
| `teamCapacitySnapshot` | 每人未完成项负载 |

---

## 5. 实验步骤

**前置：** openKMS；跑 FoO 需 ofs；有建 OT/实例/Function 的权限；可选 Neo4j。

**A. Manager 建对象类型** — Project、Person、WorkItem（含 `status` 等）。玩具板可不绑数据集。  

**B. 建链接类型** — belongsTo、assignedTo、dependsOn。  

**C. Explorer 种板** — 一个 Demo Project；Ada / Lin；WI-1（done）、WI-2（in_progress）、WI-3（backlog）；WI-3 **dependsOn** WI-2。  
**看板：** WorkItem 列表按 `status` 筛/排 = 本教程的看板视图。可选 Index 后 Cypher 查依赖。  

**D. 发布一个 FoO** — 如 `suggestWorkItemPriority(work_item_id)`；依赖闭包用 `get_links(..., source_id=)` BFS；产能用 `search(filters={"status": "in_progress"})`（完整示例见[英文教程](understanding-ontology.md)）。使用 `client("WorkItem")` 等字符串 api name（`openkms_functions`）。  

**E. Actions：创建 / 更新 / 移到 Done / 删除** — 在 **Ontology Manager → 操作类型** 为 WorkItem 创建内置规则（`object_create` / `object_modify` / `object_delete`），无需为简单 CRUD 绑定 Function。Rules 页可限制可写字段；`moveWorkItemToDone` 类动作可在 parameters 里设 `defaults`（如 `status: done`）。自定义逻辑仍用 Function 规则。执行后平台 **apply create / modify / delete**（响应含 `applied.*_ids`）。可在 Explorer 或 API 试写回。

**F. App Builder 可视化看板（App 如何与本体交互）** — Object Explorer 只展示**实例**；多列看板是另一个 **App**：同一套 WorkItem / Action / FoO，经 A2UI 接线。详解见 [应用构建器 · App 与本体如何交互](../features/app-builder.md#app-ontology-interaction)。

| 层 | 在看板 App 上 | 例子 |
|----|---------------|------|
| **本体** | 你已建好的类型、卡片、Action、FoO | `WorkItem`、`createWorkItem`、`suggestWorkItemPriority` |
| **Resources** | App 可用的 api name 白名单 | 设置 → 资源 |
| **Source（A2UI）** | 布局、DataModel 路径、哪个 Button 触发哪个 host 事件 | 每个 `status` 一列过滤列表 |
| **平台 host** | 自定义 `OntoObjectList` + `executeAction` / `executeFunction` / `loadObjectForEdit` | `catalog.tsx` + `AppA2uiSurface.tsx` |

要点：

1. **Resources** 例如 `objectTypes: [WorkItem]`、`actions: [createWorkItem, updateWorkItem]`、`functions: [suggestWorkItemPriority]`。Source 引用不在白名单内的 Action/Function → 发布失败。  
2. **读：** 每列一个 `OntoObjectList`（按 `status` 过滤）把实例写入 `dataPath`；再用基础 `List` 行模板展示。行内字段用**相对**路径（`title`、`id`）。`OntoObjectList` 是 openKMS **自定义** catalog 组件（只负责加载）。  
3. **写：** 新建 = Modal + `/createWorkItem/*` 上的 TextField → `executeAction` / `createWorkItem`。编辑 = 行上 `loadObjectForEdit` 填 `/editWorkItem` → 保存 `executeAction` / `updateWorkItem`。没有 `OntoActionForm`。  
4. **算：** 编辑表单上 `executeFunction`（`suggestWorkItemPriority`），用 `applyPath` / `applyKey` 把建议的 `priority` 写回字段；**持久化仍靠 Save 的 `executeAction`**。完整 context JSON 见[英文教程步骤 F](understanding-ontology.md)。  
5. **编创：** 设置（资源 / 加载器）→ 设计 → Source（或 openkms-skill `apps`）→ 预览 → 发布 → 在 **Apps** 打开。应用内无设计器聊天。

**记住：** 板**状态** = 本体实例；FoO = 共享决策规则；板**UI** = 租户 Source + 平台 host 事件，打在同一套 API 上。

---

## 6. 成功标准

| 检查点 | 通过 |
|--------|------|
| Schema | 三 OT + 三链接存在 |
| 板 | ≥3 张卡、不同 `status`，Explorer 可见 |
| 关系 | 至少一条 dependsOn、一条 assignedTo |
| 决策 | 已发布 FoO 对卡片 id 返回 JSON |
| 写回 | Actions 创建 / 更新 / 移动 / 删除经 `edits` 持久化 |
| App UI（可选） | 已发布看板 App：Resources + 分列 `OntoObjectList` + 创建/编辑 Modal；Suggest priority = `executeFunction` 后再 Save |
| 叙事 | 板状态 = 本体知识；FoO = 共享规则；看板 UI = App Builder → Apps（host 桥接 DataModel ↔ 本体） |

---

## 7. 反模式

| 避免 | 更好 |
|------|------|
| 先做拖拽看板 SPA、模式未建 | 先本体建模 |
| 平台「KanbanBoard」或看板形 bindings | Source 里用过滤的 `OntoObjectList` + `List` 组列 |
| 以为 `executeFunction` 单独就能存 priority | FoO 填表单；`executeAction` 才持久化 |
| 状态流水全进 Neo4j | Index 主数据 + dependsOn |
| Function 每次打 Jira | 手建实例或先 sync |
| 优先级只活在聊天里 | 已发布 FoO |
| 「看板不是知识」 | 列、阻塞、优先级规则*就是*知识 |

---

## 8. 自测

1. 为什么「看板上的卡片」在 openKMS 里算**本体知识**？  
2. 本实验里哪个属性扮演**看板列**？  
3. 举一个做**依赖 / 优先级 / 资源**的 FoO 名字。  
4. 看板 App 上，`executeFunction` 建议优先级之后靠什么持久化？哪类 host 事件把卡片装进某一列？

答得出且 Demo 实例在，本教程目标达成。

---

## 9. 接下来

加强同一块板上的 FoO · **[App Builder](../features/app-builder.md)**（步骤 F 的完整 host / 前端对照）· 接到真实跟踪工具的数据集 · [Tushare 案例](tushare-market-ontology.md) · [Ontology Functions](../features/ontology-functions.md)
