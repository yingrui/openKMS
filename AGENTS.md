# openKMS — AGENTS.md

Agent 工作指南（原 `.cursor/rules/` 合并版）。

---

## 项目速览

文档 / 频道 / 文章 / KB·RAG / wiki 知识系统。

| 区域 | 路径 |
|------|------|
| Backend | `backend/app/`（FastAPI + async SQLAlchemy） |
| Frontend | `frontend/src/`（React 19 + Vite） |
| App Builder | `backend/app/services/app_builder/`、`backend/app/api/app_builder.py`、`frontend/src/pages/app-builder/` |
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

**回复：** 长短匹配任务；无套话收尾；外链用 markdown link，代码用 path/citation。  
**提交：** 祈使句主题；**无用户明示禁止 commit/push**；用户说 commit 时只 stage 本任务文件。  
**docs/：** 技术细节可写密；表格/标题与邻页一致。

---

## 提交前文档

有 commit 意图时，**只更新 staged 相关页：**

| 文件 | 何时 |
|------|------|
| `docs/architecture.md` | 新模块/流程/布局/配置 |
| `docs/development_plan.md` | 任务完成/计划变更 |
| `docs/features/<area>.md` | 功能/UI 变更 |
| `docs/features/api-reference.md` | HTTP 路由变更 |
| `docs/features/data-models.md` | 表/列变更 |
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

- 动 `frontend/src/**` → `frontend/` 下 `npm run build`（`tsc -b && vite build`）；**`tsc --noEmit` 不够**  
- 动 app shell（`App.scss`、`app-page.scss`、`ChannelSectionLayout*`、`MainLayout.tsx`）→ `npm run check:app-layout`  
- 动 Suite App 列表/顺序（`appModules.ts` 等）→ 只在 `APP_MODULES` 设 `order` → `npm run check:app-modules`  

**页边距：** `--app-page-padding-x/y` 只放在 `.app-content` 或 `.app-page-pane`；不与页面根叠 padding；用全局 `.page-header` / `.page-subtitle`；全出血路由 SCSS 注释 `app-layout-exception:` 并登记 `docs/design-system.md`。

> **维护：** 细则（gutter 例外表、check 脚本说明等）日后可迁至 `docs/design-system.md` / `docs/developer/`，本节改外链 + 要点即可。

---

## App Builder & A2UI

详 `docs/features/app-builder.md`。

**平台 vs 租户 App**

| 平台代码 | DB 里 published Source |
|----------|------------------------|
| catalog + host（`executeAction`、`loadObjectForEdit`、`OntoObjectList` 加载器） | 布局、文案、过滤、Modal↔Action  wiring |
| `_a2ui-platform.scss` 通用 A2UI 样式 | resource allowlist + `draft_a2ui` / `published_a2ui` |
| 校验、Designer NDJSON、发布门禁 | 领域 UX（如多列看板 = 多个过滤 List + Modal 组合） |

**禁止：** 平台写领域 UI（看板 widget、应用名按钮、board 形 binding、按域名 synthesize）；load 时 silent heal/normalize/auto-synthesize → **校验失败可见**，仅 **`POST …/synthesize`** 显式重置 stub。  
**已废弃：** `OntoKanbanBoard`、`OntoActionForm`、`ontology_app_kanban_a2ui.py`、board binding、load-time auto-heal。

**放置：** 后端 `app_builder/` + `api/app_builder.py`（非 `ontology/`）；API 仅 **`/api/app-builder/apps`**，迁路由即删旧路；表名 `ontology_apps` 仅历史存储；前端 `appBuilderApi.ts`、`pages/app-builder/a2ui/`。

**A2UI Source 坑（高频）**

1. `List` 行模板用**相对** path（`title`），勿 `/title`（从 DataModel 根解析 → 标题空）  
2. `OntoObjectList` 仅 loader；展示用 basic `List` + 行模板  
3. 建/编弹窗 = `Modal` + `TextField` + `executeAction` / `loadObjectForEdit`；输入形来自 Action，无平台 form 组件  
4. 多列板在 Source 组合，无平台 widget  
5. 样式只 polish  primitive；勿写某 App 专用 SCSS  

新失败模式加 `app_builder/a2ui.py` 校验，勿 per-app hack。  
FastAPI：`_register_routes(router)` 前 router **必须有 prefix**，否则 `@get("")` 导入崩溃。

**App Builder 任务验收：** `pytest backend/tests/test_app_builder_a2ui.py` · 动前端则 `npm run build` · 动权限/模型则 `alembic upgrade head` · grep 无 `OntoKanbanBoard`/`/api/ontology/apps`/`ontology_app_kanban`。
