# openKMS — AGENTS.md

Agent 工作指南（原 `.cursor/rules/` 合并版）。  
项目事实、环境细节、事故与坑记在**本地 `MEMORY.md`**（不入库，已在 `.gitignore`）。
两个词分工：**事故**指发生过什么，带日期；**坑**指会重复踩的陷阱。

**分工**（同一内容能放进两个文件，通常是设计错了）：

| 文件 | 只放 |
|------|------|
`AGENTS.md` | **规则**：必须怎么做、红线、验收命令 |
`MEMORY.md` | **事实**：发生过什么（带日期）、谁决定了什么、当前状态；事故只记事实并指向规则 |
`docs/**` | **系统怎么工作**（可查、长期有效，英文源） |

**MEMORY.md 的写法**（细则见其「维护规则」一节）：

- 每条带日期。**事故只记事实，不记教训**；教训写进本文或 `docs/`，记忆里留一行指路。
- 每节最多 3–5 条。写入前先问「六个月后这条还有用吗」，没用就不写。
- 坑修好即删；晋升到 `docs/` 后也删。全文上限 120 行，提交前修剪一次。
- 一次性数字与调查（行数、耗时、截图式结论）不进 MEMORY：写进对话、commit message，或 `docs/` 的设计笔记。
- 新增配置键或开关时，必须同时写明**谁读它**；否则它就是一个「配了不生效」的坑。

---

## 项目速览

文档 / 频道 / 文章 / KB·RAG / wiki 知识系统。

| 区域 | 路径 |
|------|------|
| Backend | `backend/app/`（FastAPI + async SQLAlchemy） |
| Frontend | `frontend/src/`（React 19 + Vite） |
| 决策中心 / Chamber | `backend/app/services/runtime/chamber/`、`backend/app/api/chamber.py`、`frontend/src/pages/chamber/` |
| Docker | `docker/`（见 `docker/README.md`） |
| Docs | `docs/` |
| VLM | `vlm-server/` |

**端口：** backend 8102 · Vite 5173 · Docker UI 8082 · VLM 8101 · qa-agent 8103 · docs 8104  
**配置：** `OPENKMS_*` → `backend/.env`；前端 → `config/index.ts`

---

## 第一性原理（决策优先）

从需求本质出发，不从惯例或模板出发。与后文的编码行为、写作规范并用；判断「该不该做、为什么做」时，以本条为准。

1. 动机不清就先讨论，不要假设用户已经想清楚要什么。
2. 发现路径绕远就直说，并给出更短的方案。
3. 遇问题追根因，不打补丁；每个决策都要能回答「为什么」。
4. 输出只留影响决策的信息。

---

## 编码行为（Karpathy 精简版）

琐碎任务可放宽，默认偏谨慎。

**先想后写：** 动手前写清假设；有多种解释时并列说明；有更简单的方案先提出来；不懂就停下来问。  
**最小实现：** 只做被要求的事；不做一次性抽象；不写不可能走到的防御分支；200 行能压到 50 行就重写。  
**手术式改动：** 只改任务相关的行；不顺手改相邻代码和格式；跟随现有风格。替换模块、API 或符号时，同一任务里删掉旧实现，**不留 legacy alias**（除非用户明确要求过渡期）。已存在的死代码只提及，不删除，除非用户要求。  
**可验证交付：** 把任务写成可检查的结果（测例、build、grep）；多步任务先列 `步骤 → 验证`。  
**批量改文本要验行尾：** 用脚本删改行后，先看 `git diff --stat`，确认增删行数同量级。原因：`keepends=True` 的 `splitlines()` 每行已带 `\n`，再用 `"\n".join()` 会把行距翻倍；改用 `"".join()` 或 `splitlines()`。`openkms-skill` 与 `MEMORY.md` 各犯过一次，都是「文件看着对、diff 翻倍」。

---

## 用语与输出

**功能描述的文案：** 就说功能做什么，不说它存在哪、走哪个接口、放在哪个路径或 bucket 等这些技术细节（运维页除外）。  
**术语按读者与可操作性判，不按词本身：** 同一个词在不同界面上可能对错相反。

- 配置面（温度、思考模式、知识）不出现读者看不见、也改不动的组件名，例如网关、端点、`extra_body`。
- 集成面（凭证）和技术文档里，端点、请求、接口就是正确用词；换成「调用地址」反而含糊。

**计划/文档/对话/提交：** 用产品域词汇（Manager、Explorer、object type、instance、Function、Action、channel、wiki 等）。谈功能时不用 PG、Neo4j、JSONB 当功能名；迁移、SQL、Docker、ops 语境除外。

| 用 | 别用（谈功能时） |
|----|------------------|
| object type / instance / link | PG instance、DB 行当卡片 |
| dataset-backed / indexed | 用存储命名用户对象 |
| Explorer 创建实例 | PG-only 对象（产品类别） |
| Action apply / 写回 | Action 写 Postgres |

**术语要专业：** 面向用户和文档的概念，用**行业通用词**。不要自造词，也不要用只描述状态的词。判断标准：这个领域的读者（数据平台、治理、安全）一看就懂，并且能从词里读出**规则本身**，而不只是「有个门槛」。

| 用 | 别用 | 为什么 |
|----|------|--------|
| restricted（access / model） | gated | gated 只说「有门」，不说门槛是授权；且不是数据平台的通用词 |
| public / private | open-ish、semi-open | 没有确切边界 |
| grant / permission | 权限配置项、开关 | 无法区分「授权边」与「功能开关」 |
| row policy / row-level security | 行过滤、行限制规则 | 与数据安全的既有术语脱节 |

**内部枚举也要一致。** 值一旦出现在 API、迁移或外部服务里，它就进入公开词表：UI 文案、schema、migration、qa-agent 必须用同一个词。**改词就一次改到底**——枚举值、已有数据的迁移、所有引用一起改，不留 `gated` 与 `restricted` 并存。

改名时，若数据已落库且迁移**已 push**，新增一个补丁迁移改数据；迁移**未 push**，直接改原迁移。

**回复：** 长短与任务匹配；不写套话收尾；外链用 markdown link，代码给 path/citation。  
**提交：** **一律由用户执行**——agent 不 commit，也不改写成现有提交，除非当次对话明确指示。改动留在工作区，等用户提交。  
写提交说明时（用户要求时）：首行能独立看懂，改了什么、变成什么样，60 字以内；不要 `Update code`、`修复问题` 这类没有对象的话。正文写为什么。  
**提交前先看未推送的提交**（适用于用户自己提交、你被要求代写说明的情况）：`git log --oneline @{u}..HEAD`（没有上游时用 `origin/main..HEAD`）。这次改动如果只是在完成或修正其中某一个——同一件事的后续、补漏、改错字——就**合并进那一个**（`git commit --amend` 或交互式 rebase），不要叠成新 commit；确实是另一件事才单独提交。**已经推送的提交不改**，除非用户明确要求。合并后 `git diff <旧 HEAD> <新 HEAD>` 只应包含这次并进去的改动。提交前跑门禁并贴结果。  
**docs/：** 技术细节可以写密；表格和标题与相邻页面一致。我们自己的设计、计划（含设计稿，如 `data-layer-*.md`）放 `features/`；外部对比、调研、vendored 规范（`*_vs_openkms.md`、`ossie/`、库选型）放 `research/`。

---

## 提交前文档

有 commit 意图时，**只更新与本次改动相关的页**：

| 文件 | 何时 |
|------|------|
| `docs/developer/architecture.md` | 新模块/流程/布局/配置 |
| `docs/development_plan.md` | 任务完成/计划变更 |
| `docs/features/<area>.md` | 功能/UI 变更 |
| `docs/developer/api-reference.md` | HTTP 路由变更 |
| `docs/developer/design-system.md` | 共享 SCSS/token/布局原语 |

`docs/functionalities.md` 只在增删功能页时改。英文 `docs/**/*.md` 是源；有 `.zh.md` 时先改英再改中；链接不带 `.zh` 后缀。  
动 `docs/**` 或 `mkdocs.yml`，提交前跑 `mkdocs build --strict --site-dir _site`。

---

## Alembic

- 改 `backend/app/models/`：`alembic revision --autogenerate` → **逐条复核** → `upgrade head`。  
  **复核的判据：这条 op 是不是你这次改的？** autogenerate 会比对“模型 vs 库”，凡是库里有、模型没声明的都会被提议删除 —— 包括运行时创建的表（LangGraph `checkpoint*`、Procrastinate）和迁移里用 SQL 建的索引（GIN、partial unique）。这类对象由 `backend/alembic/env.py` 的 `EXCLUDE_TABLES` / `EXCLUDE_INDEXES` 负责声明，**不要靠每次手删**：新增运行时表或 SQL 建索引时，同一处登记。一条生成出来的迁移里出现与本任务无关的 `drop_table` / `drop_index`，说明过滤清单缺项，先补清单再重生成。  
- 改 **`permission_default_patterns.py`**：另加一条 **refresh migration** 重刷 `security_permissions`（参考 `c3d4e5f6a7b8_*`、`j1k2l3m4n5o6_*`）。只改 Python 默认值不会更新已有库。  
- API 启动时不建表。本地用 `backend/dev.sh`（先 pgvector，再 Alembic）；Docker 的 CMD 先跑 Alembic 再起 uvicorn。
- **openKMS backend 一律由用户执行 `backend/dev.sh` 启动，agent 不要手工起 uvicorn。** 手工启动会跳过 pgvector 与 Alembic 检查，也失去 `--reload`。需要重启时提醒用户，不要自己拉起或杀掉进程。  
- 新 model 要注册到 `backend/alembic/env.py`；Procrastinate 与 LangGraph checkpoint 的表在 `EXCLUDE_TABLES` 里排除。  

> **维护：** 细则（refresh migration 模板、env 注册清单等）日后可迁至 `docs/`，本节只留外链和要点。

---

## 前端验证

- 动 `frontend/src/**` → **`cd frontend && npm run check`**（typecheck → app-layout → app-modules → check:styles → check:copy → check:lint → vitest → build）
- CI 跑同一条命令：`.github/workflows/frontend.yml`
- 具体规则、棘轮基线、允许清单见 `docs/developer/design-system.md` 与 `frontend/scripts/`

## 后端验证

- 动 `backend/**` → **`cd backend && ./check.sh`**（ruff → noqa 检查 → pytest）。脚本内部用 `uv run`，所以一定用项目 `.venv`
- CI 跑同一条命令：`.github/workflows/backend.yml`
- 具体规则见 `pyproject.toml` 的 `[tool.ruff]` 与 `check.sh`

## 其它验证

```bash
# qa-agent / openkms-skill / 分货应用
cd qa-agent && ./check.sh                      # ruff(E9/F/B/BLE) + pytest
cd openkms-skill && python -m pytest tests -q
cd ~/workspace/capacity-allocation/backend && ./check.sh

# 技能与路由真相
python <skill>/scripts/cli.py ping
python <skill>/scripts/cli.py api spec --path /api/<area>     # 路由以 /openapi.json 为准
cd backend && uv run python scripts/audit_dataset_joins.py    # 关系库健康，有问题退出码 1
```

改了 `openkms-skill/` 之后要跑它的 `./install.sh`：仓库里是**源**，`~/.pi/agent/skills/openkms/` 是**安装副本**，不重装就还是旧命令。

## Apps（module / 托管 Service）

详 `docs/features/app-builder.md`。

- 只有 `template_id=module` 的应用会被登记为 Kubernetes Service，再由 Apps 图库通过 iframe 代理访问；身份头见文档。
- **已移除**产品内的 A2UI App 编创（Design / Source / synthesize / OntoObjectList / `app_components`）。Knowledge Map Overview 等其它 A2UI 面保留。未来的 A2UI 实验放在 **Agent Project** 会话，不回 Apps 产品面。
- API：`/api/chamber/apps` + `…/proxy`；表名 `chamber_apps` / `chamber_published_versions`。
- FastAPI：`_register_routes(router)` 之前，router **必须有 prefix**。

**验收：** 改前端跑 `npm run build`；改模型跑 `alembic upgrade head`；grep 确认没有 `OntoObjectList`、`apps synthesize`、`pages/app-builder/`。
