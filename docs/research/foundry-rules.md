# Palantir Foundry Rules：它到底是怎么配置的，以及对我们意味着什么

调研对象：Palantir Foundry 的 **Foundry Rules**（前身 Taurus）及其周边的 Automate / Vertex / Action。
来源：`palantir.com/docs/foundry/foundry-rules/*`（overview、object model、rule logic、workshop application、
deploy workflow、configure workflow、author and run a rule、permitted and default output values、
enable optional features、permissions），2026-11 抓取。

**一句话结论**：Foundry Rules 不是"条件 + 告警"，而是**一套可部署的规则生产线**——
workflow owner 定义输入、输出与取值约束，rule author 只写逻辑，reviewer 审批，transforms pipeline 批量算，
输出是**行**（通常就是告警表），再由 Action / 通知消费。

---

## 1. 它由哪几块组成

```
部署一次（workflow owner，2–3 分钟后台安装）
├── Workshop 应用
│   ├── Rule Editor       ← 写规则（表单由 Action 参数自动生成）
│   ├── Proposal Reviewer ← 看 diff、批准/驳回
│   └── Rule Viewer       ← 只读查看规则逻辑
├── 规则对象类型 + Action 类型（propose / approve / reject，带 submission criteria）
├── transforms pipeline   ← 把"规则写回数据集"应用到输入，算出结果
└── 输出数据集            ← 每个输出一个数据集，规则产出的行写进去

每次改规则
Rule Editor 保存 → Proposal（对象，含 diff）→ Proposal Reviewer 批准 → 规则生效
→ 触发 pipeline build → 输出数据集多出行 → 挂在 schedule 上持续更新
```

关键点：**规则是对象，提案也是对象**（`old_logic` / `new_logic` 等作为属性），审批流本身用标准对象 + Action 搭，
所以可以按各自合规要求改造。

## 2. 规则本身：输入 → 逻辑块 → 输出

> "Each Foundry rule has logic ... formed of three parts: **Inputs**, **Logic blocks**, **Rule output**."

| 部分 | 内容 | 谁配置 |
|------|------|--------|
| **Inputs** | 数据集或对象（对象提供值自动补全）；受限视图对象需配置 alternate backing dataset | workflow owner 圈定可选项 |
| **Logic blocks** | filtering / expressions / aggregates / joins（另可选 union、select columns、window、time series） | rule author |
| **Rule output** | 输出数据集；每个字段名、显示名、类型、**是否必填**；字段的取值可限定（见 §3） | workflow owner 定义，author 填 |

每个逻辑块都能 **Preview**；保存不直接生效，而是生成 Proposal。

## 3. 最值得学的一点：输出契约与取值约束

workflow owner 在配置输出时逐列定义：

- **列来源**：`Column`（引用上游列）/ `None`（只允许静态值）/ `Selection`（限定若干可选列）；
- **静态值约束**：`Any` / `None` / `Selection`（可选集合，可带 label）/ `Range`（数值、日期区间）/ `Users`（Foundry 用户）；
- **必填**：该列必须在规则里被填；
- **默认值**：可给默认。

所以 rule author 面对的不是空白文本框，而是**一张被约束的表单**：告警必须有 Severity、Assignee、
触发对象 ID，且 Severity 只能从约定的枚举里选。**规则无法产出垃圾**。

## 4. 告警与下游

- 输出数据集的每一行就是一条告警；规则对象的自定义属性承载 `alert_severity`、`alert_assignee`、`priority`；
- Action 的参数可以与输出列对齐，于是"命中即派单/通知"由 Action 完成（webhook / 通知中心）；
- 时间序列规则是独立能力（已 Sunset 的 Time series rules → 迁到 Foundry Rules 的 time series boards）。

## 5. 与我们现在的实现对照

| Foundry | 我们 | 差异性质 |
|---------|------|---------|
| 规则 = 对象（Rule）+ 提案对象 | 规则 = 本体对象（`Rule`）+ version/audit，**无提案** | 治理强度不同；单作者阶段不需要 |
| 逻辑 = 行管道（filter/aggregate/join…） | 逻辑 = 布尔条件树（指标 / 数据集聚合 / 比 / 差，可嵌套） | 我们窄，但指标本身已封装 join；无需再造管道 |
| 维度（scenario 之类）在规则内：filter 或 group-by | `group_by: {field,label}`，一次运行覆盖全组 | **已对齐**（这是刚改的） |
| 输出 = 行 → 输出数据集 | 输出 = 每组的判定 + 每失败组一条 `Event` 对象 | 形状不同：他们产数据，我们产事件 |
| 输出列契约 + 取值约束 | Event 字段固定，但 `conclusion`/`suggestion` 是自由文本 | **有差距**，见 §6.3 |
| 每块 Preview（写规则时就能看数据） | 没有试算：保存后才能运行 | **最大差距**，见 §6.1 |
| 部署需要 Workshop 应用 + transforms pipeline + 输出数据集 | 零部署：本体对象 + 即时求值 | 我们不背这个包袱，是正确的取舍 |
| 规则由 pipeline 批量算 + 挂 schedule | 目前只能手动「运行」 | 需要 P2 定时（我们已有 jobs 机制） |
| 可选功能按 workflow 开关（aggregate/join/window/time series） | 只有一种逻辑形状 | 无需对齐 |

**结论**：我们和 Foundry Rules 是同一类东西的两种形状——他们是**批量产数据**，我们是**即时产事件**。
不该为了"像"而把 pipeline / 输出数据集 / Workshop 搬进来；该抄的是**治理与反馈**那几件。

## 6. 可执行的四条建议（按价值排序）

### 6.1 试算（Preview 的等价物）— 最该做

Foundry 每个逻辑块都能 Preview：写规则时立刻看到这块会产出什么。
我们目前写完保存、再运行、再看 `last_values` / 事件，反馈回路长了三步。

做法（成本低）：`POST /api/rules/{id}/evaluate?dry_run=true`（或 body `dry_run`）——求值但不发布事件、
不写 `last_*`；前端在条件面板加「试算」按钮，就地显示每个分组的数值与判定。

### 6.2 保存时校验 `group_by.field`

Foundry 的字段是从输入 schema 里选的，不可能写错；我们是手写列名，写错只在运行时变成
`'x' is not a column`。保存时用指标模型字段 / 数据集列校验即可（候选列表已经有了）。

### 6.3 事件输出契约（对应"permitted values"）

我们的 Event 字段是固定的（severity、conclusion、suggestion、period、scope…），比自由表单好，
但仍有两处松：`conclusion` 可空、长度无上限；`severity` 虽有枚举但结论/建议不校验。
建议：conclusion 必填、上限 120 字；suggestion 上限 240 字；`group_by.label` 必填（否则标题会退化成 id）。
这与 Foundry"必填 + 枚举"的精神一致，成本是几行校验。

### 6.4 提案/审批：等第二个作者再上

Foundry 的 Proposal 是为"多作者 + 审计要求"设计的。我们单人维护，version + audit 足够；
触发条件写死：**出现第二个规则作者，或规则开始驱动对外动作**时再做。

## 7. 明确不要照搬的三件

| 不搬 | 原因 |
|------|------|
| transforms pipeline / 输出数据集 | 我们会变成"再造 dbt"；事件已经是对象，下游（Explorer、agent、通知）直接消费 |
| Workshop 应用作为前置 | 规则页面在本体 Manager 里即可，零部署是优势 |
| 逻辑块（join / union / window / time series） | 需要 join 的规则应该写成一个指标，而不是让规则承担建模职责 |

## 8. 时间线视角（对我们的排期）

| 阶段 | 借 Foundry 的那一件 |
|------|-------------------|
| 现在（P1） | 已完成：规则对象、group-by、事件对象、`about` 链接、severity/结论/建议 |
| 下一步 | **试算**（6.1）+ **字段校验**（6.2）+ **输出契约**（6.3） |
| 有第二作者时 | Proposal / 审批（6.4） |
| 需要周期性 | 定时求值（复用 jobs，以规则 owner 身份） |

---

## 附：抓取到的关键原文

> "Rules are standard objects consisting of: a collection of rule metadata properties … custom properties …
> **For "alerting" patterns, these might be `alert_severity`, `alert_assignee`, or `priority`** … a logic
> property containing the match conditions … stored as a compressed JSON blob." — *Object model*

> "Each logic block takes rows output from the previous block/source and applies the transformation,
> outputting a new set of rows and columns. The output can be viewed by clicking the **Preview** button."
> — *Rule logic*

> "The rule output allows workflow owners to enforce the exact columns and types that rule authors must
> output from their logic. Visually, this enforcement is represented as a form where each form input
> corresponds to a column in the output dataset." — *Rule logic*

> "When a user approves a proposal, the edits will be applied and the proposal will be either created,
> edited, or deleted (depending on the proposal)." — *Workshop application*
