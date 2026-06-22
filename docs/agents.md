# Doc conventions for AI agents

本文档告诉 AI coding agents 如何编辑 openKMS 的文档和文章。内容来自 `.cursor/rules/*.mdc`，供任一 IDE 里的 agent 使用。

## 文档结构

三层：

1. **顶层参考文件** — `architecture.md`（模块/流程/配置）、`functionalities.md`（路由）、`development_plan.md`（进度）、`security.md`、`tech_debt.md`
2. **功能页** — `features/` 下每个产品领域一页，加上 `api-reference.md`、`data-models.md`、`configuration.md`。大部分代码变更落在这里
3. **入口页** — `index.md`、`quickstart.md`、`operations/docker.md`、`developer/setup.md`

不确定改哪里时，先改最具体的 feature page，再更新交叉引用。

## 变更对应关系

| 代码变更 | 文档更新 |
|---|---|
| 新模块/流程/布局/配置 | `architecture.md` |
| 新功能/UI | 对应 `features/` 页面 |
| 新 HTTP 端点 | feature page + `features/api-reference.md` |
| 新表/字段 | feature page + `features/data-models.md` |
| 完成的任务/计划调整 | `development_plan.md` |
| 新领域 | 新建 `features/xxx.md`，链入 `functionalities.md`，加入 `mkdocs.yml` |
| `backend/app/models/` 变更 | 需要 Alembic migration |

## 保持稳定的内容

- 规范文件的标题不变（跨文档引用依赖它们）
- Feature page 用统一的 `Feature | Status | Description` 表格
- `functionalities.md` 只做路由，不写详细内容
- Mermaid 块只用 ` ```mermaid `，不换其他 fence
- GitHub 编辑链接依赖于 `docs/<file>.md` 路径，不要移动文件

## 多语言文档

英文页面（`page.md`）是源，中文翻译（`page.zh.md`）以 `_zh` 后缀。链接省略 locale——在 `index.md` 和 `index.zh.md` 里都写 `[Quickstart](quickstart.md)`。未翻译页面自动回退英文。中文导航标签在 `mkdocs.yml` → `plugins → i18n → languages → zh → nav_translations` 里加。

## 构建与部署

```bash
pip install -r docs/requirements.txt
mkdocs build --strict   # CI 用这个命令
```

`.github/workflows/docs.yml` 在 `docs/**` 或 `mkdocs.yml` 变更时自动部署到 GitHub Pages。

## 中文洞察文章的写作规范

以下规则来自实际文章的反复修改过程。

**语气与姿态。** 像投资人或观察者在写，不像产品经理或工程师在写。不讲道，不武断——不宣称根因（"根源在于……"），不替所有企业下判断（"企业都……"）。让读者自己走到结论，不要硬塞。砍掉"不是口号""必须讲清""认真"这些不改变判断的修饰词。

**结构与格式。** 叙事段落里不用列表、编号、表格。不要 PPT 式加粗堆砌，每段最多一句粗。少用"不是……而是……"。标题平实、有递进——有逻辑链就让标题自己说。

**用词。** 不造词——"入口治理""出口优化""流程自主""五层组织能力"不是正常汉语。知识管理不用经济学术语（消费端/生产端/消费速度）。不用技术黑话（Agentic RAG、索引管道、RAG 参数、提示词），改用"检索和回溯""优化输出效果"或描述概念本身。知识不等同于制度，根据上下文用材料、内容、知识。正文不出现产品名（Copilot、openKMS）。不用网页导航词（下面、上文、前面讲的是），按印刷品写。

**衔接与过渡。** 一段一个意思。过渡要么不写，写了就不生硬——"方向有了，问题得一个一个解"太机械。不同节不重复同一论点。术语全文统一。

**具体，不抽象。** 用场景不用分类标签。"三年前的报关指引，人还会打个问号；AI 却往往讲得跟现行规定一样笃定"比"AI 无法判断内容的时效性"有力。具体对比强于绝对断言。

**最终检查。** 出声读——像人说出来的吗？有哪个词口头不会用？每句话能少两个字吗？每段都在推论证吗？
