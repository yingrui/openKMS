# openKMS 的目标与要解决的业务问题

本文从**业务与知识工程**角度说明 openKMS 希望达成的方向；具体能力与实现路径见 [Overview](overview.md)、[Architecture](architecture.md)、[Functionalities](functionalities.md) 与 [Development plan](development_plan.md)（已交付索引、战略重点与 backlog）。

---

## 图书馆与导航员：AI 就绪的知识工程 {#goals-library}

过去常见隐喻是「在知识的海洋里遨游」——人靠搜索与偶发链接碰运气。对 **AI Agent** 而言，海洋式语料不够：需要**可导航的结构**。

openKMS 的方向是建设一座**分类、编目、可检索的图书馆**：通道（channel）、文档/文章/维基/知识库的分工、知识地图与本体，都是为了让人与机器都能**尽快定位到「这一类」知识**，而不是在海量片段里随机捞取。目标是 **AI 就绪（AI-ready）** 的工程化知识：有边界、有类型、有入口。

---

## 隐性经验的萃取与显性化 {#goals-tacit}

许多高价值知识仍在专家脑中：**手感、判读规则、例外情况、组合条件**。传统做法是访谈、写 SOP，成本高且滞后。

openKMS 关注**专家知识库的自动化构建**：在**不显著增加专家负担**的前提下，通过文档入库、解析、索引、评估与（可选的）Agent 辅助，把已存在于邮件、报告、纪要中的经验**沉淀为可检索、可版本化、可关联的结构**；并与术语表、知识地图等结合，减少「只有当事人懂」的孤岛。

---

## 规则的动态保鲜与溯源 {#goals-lifecycle}

政策、法规、合同条款一变，依赖它们的 **SOP、检查清单、培训材料** 若不同步更新，下游 **Agent 会按过时条文「瞎指挥」**，风险比「不知道」更大。

因此需要：**文档间的血缘与生命周期**（替代、修订、参见等关系）、**生效区间与当前版本**、以及面向 RAG/问答的「当前是否可用」语义。海关政策一类场景是典型代表：**一处变更，能驱动系统内多处相关文档被看见、被更新或被标记待审**，而不是静默腐烂。

---

## 海量非标业务文档的理解 {#goals-documents}

企业里大量 **PDF、PPT、扫描件、混排图文**，格式不统一、版式复杂。机器要「读懂」，需要 **多模态解析**（版式、表格、图注）、可校对的 **Markdown 中间层**，以及在模型仍不确定时**人工审阅与修正**的闭环。

openKMS 将这类能力落在文档通道、VLM 解析流水线与可编辑版本上，使「机器先读、人再兜底」成为常态流程，而不是一次性导入即黑箱。面向 **图像、音视频等证据型媒体** 的编目、解析与检索，见 [Development plan — Multimodal](development_plan.md#multimodal-models--media-high) 与 [Knowledge types — Rich media](features/knowledge-types.md#rich-media-and-3d)（与办公文档管线并列推进，而非仅附件存放）。

---

## 从检索资料到驱动决策 {#goals-decision}

Agent 不仅需要「一段话的答案」，还需要区分：

- **概念性知识**（术语、定义、分类）
- **事实性知识**（条款、参数、名单）
- **程序性知识**（步骤、分支、审批链）

此外还要对齐 **内部业务逻辑**（规则如何落地到流程）与 **每日更新的数据**（指标、状态、台账）。检索只是底座；**结构化本体、知识地图、与业务数据的边界与接口**，才支撑从「查到」走向「能据此做判断」。

---

## 为智能体提供精准的知识服务 {#goals-agent-service}

对 **AI Agent** 暴露的知识服务应满足：**快、准、全**——在权限与数据范围内，尽量一次给足上下文，减少幻觉与反复追问。这依赖统一的索引、混合检索、元数据过滤、以及面向 Agent 的 API/工具（如个人 API Key、CLI、外部技能包），而不是把同一问题在多个系统里各问一遍。产品侧应优先建设 **应用内助手**（维基 Copilot、知识库问答等），[OpenCode skill](features/opencode-openkms-skill.md) 等外部技能作为补充，而非唯一入口——见 [Development plan — In-product agents](development_plan.md#in-product-agents-high)。

---

## 打破组织级信息孤岛，成为 Data for AI 的统一知识源 {#goals-unified-source}

邮件、网盘、旧 KMS、工单备注各自为政，**高质量知识无法复用**，模型训练与 Agent 上下文也缺少可信单一来源。

openKMS 的定位包括：**汇聚多源内容、统一权限与血缘、支持与其他知识管理系统或数据湖的集成**，在合规前提下成为组织面向 **Data for AI** 的**统一知识层**之一——不是替代所有业务库，而是把「可被 AI 安全消费的解释性知识与文档」集中编目与治理。

---

## 与当前产品的关系 {#goals-product-fit}

上述方向是**长期产品叙事**；当前仓库中的文档/文章/维基、知识库与 RAG、知识地图、本体、评估与控制台等，是沿这些支柱**逐步实现**的能力切片。

| 你想了解 | 文档 |
|----------|------|
| 今天已交付什么 | [Overview](overview.md)、[Functionalities](functionalities.md)（与 [Development plan — Current State](development_plan.md#current-state-as-of-2026-06) 同步） |
| 下一步重点与缺口 | [Development plan — Strategic priorities](development_plan.md#strategic-priorities)、[Backlog](development_plan.md#backlog) |

**尚未闭环、与本文差距较大的方向**（详见 development plan）：

- **[连接器](development_plan.md#connectors-high)** — 实例与密钥已可配置，**同步写入数据集的作业尚未交付**（对应 [#goals-unified-source](#goals-unified-source) 的多源汇聚）。
- **[应用内 Agent](development_plan.md#in-product-agents-high)** — 维基 / 知识库等分场景助手已有，**尚无统一、跨资源的全局助手**（对应 [#goals-agent-service](#goals-agent-service)）。
- **[评估与质量改进](development_plan.md#evaluation--knowledge-quality-high)** — 评测运行与对比已有，**从失败项到可执行的改稿 / 补洞闭环仍在演进**（对应 [#goals-tacit](#goals-tacit)）。
- **[规则变更影响](development_plan.md#policy--lifecycle-medium)** — 文档生命周期与血缘已支持，**「一处政策变更 → 关联材料待审 / 可见」的工作流尚未产品化**（对应 [#goals-lifecycle](#goals-lifecycle) 海关类场景）。
