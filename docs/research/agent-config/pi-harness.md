# pi — 上下文压缩与技能（vendored）

> 来源：本机安装的 `pi` **1.4.0** 自带文档，2026-11-19 读：
> `docs/compaction.md`、`docs/skills.md`（`~/.pi/agent/install/releases/1.4.0/node_modules/@earendil-works/pi-coding-agent/`）。
> **性质说明**：pi 是我们开发时用的编程 harness，不是本产品运行的东西。放进来是因为它的两个机制**已经在影响本仓库的
> 约定**（`AGENTS.md`、`SKILL.md`、结构化摘要段落），而且它的压缩参数是可以直接照着定的数字。

## 1. 两种摘要，不是一个

| 机制 | 触发 | 目的 |
|---|---|---|
| Compaction | 上下文超过阈值，或 `/compact` | 摘要旧消息，腾出上下文 |
| Branch summarization | `/tree` 切换分支 | 切分支时保留上下文 |

## 2. 阈值是可配的数字

```text
自动压缩触发：contextTokens > contextWindow - reserveTokens
默认 reserveTokens = 16384，keepRecentTokens = 20000
```

```json
{ "compaction": { "enabled": true, "reserveTokens": 16384, "keepRecentTokens": 20000 } }
```

```json
{ "compaction": { "modelOverrides": { "some-provider/big-model": { "reserveTokens": 400000 } } } }
```

- 配置位置：`~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json`，递归合并。
- **按模型覆盖** `reserveTokens` / `keepRecentTokens`，各自独立回退；`enabled` 是全局的，不能按模型设。
- 摘要请求**关闭 prompt-cache 写入**（一次性 prompt 不会被复用）。
- 手动：`/compact [instructions]`，可选指令聚焦摘要范围。

**这是本节最有用的部分**：压缩阈值不是"一个魔法常量"，而是"留多少余量 + 保留多少最近 token"，且可按模型覆盖。
我们的 `agent_kb_qa_max_context_messages = 120` 只有"条数"一个维度，既不是 token 也不是余量。

## 3. 摘要是有固定段落的

```text
## Goal
## Constraints & Preferences
## Progress
## Key Decisions
## Next Steps
## Critical Context
```

（本仓库 `tmp/plan/` 与 `MEMORY.md` 的写法就来自这里。）

## 4. 技能：目录 + `SKILL.md` + 渐进加载

```text
pdf-tools/
├── SKILL.md          ← frontmatter: name / description
├── scripts/
├── references/
└── assets/
```

> Pi advertises each available skill by name and description, then loads its full instructions only when the task calls for them.

实现的是 [Agent Skills 规范](https://agentskills.io/specification)；多数非法字段只是警告，不阻断启动。

## 由此可核对的判断

1. **"记住多少"应按 token 与模型余量表达**，不是按消息条数。pi 的两个默认值（16384 余量 / 20000 保留）可作为
   我们窗口参数的量级参照。
2. **摘要要有固定骨架**，否则压缩一次就丢一次决策。deepagents 的默认摘要 prompt 也是这个思路
   （`SESSION INTENT / SUMMARY / ARTIFACTS / NEXT STEPS`）。
3. **技能是"名字 + 描述常驻、正文按需加载"**，不是把全文塞进 system prompt。我们的 `agent_skills` 是硬编码集合、
   把标签直接展开——这两种做法的成本不同，但"描述参与路由"这一点是共同的。
