# openKMS — AGENTS.md

Agent 工作指南（原 `.cursor/rules/` 合并版）。

---

## 项目速览

文档 / 频道 / 文章 / KB·RAG / wiki 知识系统。

| 区域 | 路径 |
|------|------|
| Backend | `backend/app/`（FastAPI + async SQLAlchemy） |
| Frontend | `frontend/src/`（React 19 + Vite） |
| 议事厅（Chamber） | `backend/app/services/runtime/chamber/`、`backend/app/api/chamber.py`、`frontend/src/pages/chamber/` |
| Docker | `docker/`（见 `docker/README.md`） |
| Docs | `docs/` |
| VLM | `vlm-server/` |

**端口：** backend 8102 · Vite 5173 · Docker UI 8082 · VLM 8101 · qa-agent 8103 · docs 8104  
**配置：** `OPENKMS_*` → `backend/.env`；前端 → `config/index.ts`

---

## 第一性原理（决策优先）

从需求本质出发，不从惯例或模板出发。与下文 Karpathy / 写作规范并用；**「该不该做 / 为什么做」冲突时以本条为准。**

1. 动机不清 → 先讨论，别假设用户知道要什么  
2. 路径绕远 → 直说并给更短方案  
3. 遇问题追根因，不打补丁；每个决策能答「为什么」  
4. 输出只留影响决策的信息  

---

## 编码行为（Karpathy 精简版）

 trivial 任务可酌情放宽；默认偏谨慎。

**先想后写：** 假设写清；多义并列说明；有更简方案要提；不懂就停问。  
**最小实现：** 只做被要求的；不单次抽象；不写不可能分支的防御；200 行能 50 行就重写。  
**手术式改动：** 只动任务相关行；不顺手改相邻代码/格式；匹配现有风格；**替换**模块/API/符号时同任务删旧实现，**不留 legacy alias**（除非用户明确要求过渡期）；预存死代码仅提及不删，除非用户要求。  
**可验证交付：** 把任务写成可检查结果（测例、build、grep）；多步任务列 `步骤 → 验证`。

---

## 用语与输出

**SPA 可见文案：** 说功能做什么，不说存储/API/路径/bucket/env（运维页除外）。  
**计划/文档/对话/提交：** 用产品域词汇（Manager、Explorer、object type、instance、Function、Action、channel、wiki…），默认不用 PG/Neo4j/JSONB 当功能名（迁移/SQL/Docker/ops 上下文除外）。

| 用 | 别用（谈功能时） |
|----|------------------|
| object type / instance / link | PG instance、DB 行当卡片 |
| dataset-backed / indexed | 用存储命名用户对象 |
| Explorer 创建实例 | PG-only 对象（产品类别） |
| Action apply / 写回 | Action 写 Postgres |

**术语要专业：** 面向用户和文档的概念，用**行业通用词**，不用自造词或只描述状态的词。判断标准：这个领域的读者（数据平台、治理、安全）看到会立刻理解，且能从中读出**规则本身**，而不只是「有个门槛」。

| 用 | 别用 | 为什么 |
|----|------|--------|
| restricted（access / model） | gated | gated 只说「有门」，不说门槛是授权；且不是数据平台的通用词 |
| public / private | open-ish、semi-open | 没有确切边界 |
| grant / permission | 权限配置项、开关 | 无法区分「授权边」与「功能开关」 |
| row policy / row-level security | 行过滤、行限制规则 | 与数据安全的既有术语脱节 |

**内部枚举也要一致。** 一旦某个值会出现在 API、迁移、外部服务里，它就是一个公开词表的一部分——UI 文案、schema、migration、qa-agent 必须用同一个词。**改词就一次改到底**（枚举值 + 已有数据迁移 + 引用），不留 `gated` 与 `restricted` 并存的状态。

改名时若有数据已落库且迁移**已 push**，新增补丁迁移改数据；**未 push** 则直接改原迁移。

**回复：** 长短匹配任务；无套话收尾；外链用 markdown link，代码用 path/citation。  
**提交：** 祈使句主题；**无用户明示禁止 commit/push**；用户说 commit 时只 stage 本任务文件。  
**docs/：** 技术细节可写密；表格/标题与邻页一致。**我们自己的设计/计划（含设计稿，如 `data-layer-*.md`）→ `features/`**；**外部对比 / 调研 / vendored 规范（`*_vs_openkms.md`、`ossie/`、库选型）→ `research/`**。

---

## 提交前文档

有 commit 意图时，**只更新 staged 相关页：**

| 文件 | 何时 |
|------|------|
| `docs/architecture.md` | 新模块/流程/布局/配置 |
| `docs/development_plan.md` | 任务完成/计划变更 |
| `docs/features/<area>.md` | 功能/UI 变更 |
| `docs/features/api-reference.md` | HTTP 路由变更 |
| `docs/design-system.md` | 共享 SCSS/token/布局原语 |

`docs/functionalities.md` 仅增删功能页时改。英文 `docs/**/*.md` 为源；有 `.zh.md` 则英先中后；链接不带 `.zh` 后缀。  
动 `docs/**` / `mkdocs.yml` → 提交前 `mkdocs build --strict --site-dir _site`。

---

## Alembic

- 改 `backend/app/models/` → `alembic revision --autogenerate` → review → `upgrade head`  
- 改 **`permission_default_patterns.py`** → 另加 **refresh migration** 重刷 `security_permissions`（参考 `c3d4e5f6a7b8_*` / `j1k2l3m4n5o6_*`）；只改 Python 默认值**不会**更新已有库  
- API 启动**不**建表；本地 `backend/dev.sh`（pgvector + Alembic）；Docker CMD 先 Alembic 再 uvicorn  
- 新 model 注册 `backend/alembic/env.py`；Procrastinate 表排除  

> **维护：** 细则（refresh migration 模板、env 注册清单等）日后可迁至 `docs/`，本节改外链 + 要点即可。

---

## 前端验证

- 动 `frontend/src/**` → **`cd frontend && npm run check`**（typecheck → app-layout → app-modules → check:styles → check:lint → vitest → build）
- CI 跑同一条命令：`.github/workflows/frontend.yml`
- 具体规则、棘轮基线、允许清单见 `docs/design-system.md` 与 `frontend/scripts/`

## 后端验证

- 动 `backend/**` → **`cd backend && ./check.sh`**（ruff → noqa 检查 → pytest；内部 `uv run`，所以一定用项目 `.venv`）
- CI 跑同一条命令：`.github/workflows/backend.yml`
- 具体规则见 `pyproject.toml` 的 `[tool.ruff]` 与 `check.sh`

## Apps（module / 托管 Service）

详 `docs/features/app-builder.md`。

- **仅** `template_id=module`：登记 Kubernetes Service → Apps 图库 iframe 代理；身份头见文档。
- **已移除** 产品内 A2UI App 编创（Design / Source / synthesize / OntoObjectList / `app_components`）。Knowledge Map Overview 等其它 A2UI 面保留。未来 A2UI 实验放在 **Agent Project** 会话，不回 Apps 产品面。
- API：`/api/chamber/apps` + `…/proxy`；表名 `chamber_apps` / `chamber_published_versions`。
- FastAPI：`_register_routes(router)` 前 router **必须有 prefix**。

**验收：** 动前端 `npm run build` · 动模型 `alembic upgrade head` · grep 无 `OntoObjectList` / `apps synthesize` / `pages/app-builder/`。
