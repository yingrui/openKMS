# Doc conventions for AI agents

本文档告诉 AI coding agents 如何编辑 openKMS 的文档和文章。与仓库根目录 `AGENTS.md`（编码与提交规则）配套，供任一 IDE 里的 agent 使用。

## 产品原则 {#product-principles}

讨论定位、路线、优先级之前，先读这一节。提案与原则冲突时，以原则为准，除非明确修订。

1. **系统定义来自可执行事实。** 路由、模型列、默认值、`--help`。不是愿景文档；文档和代码冲突时，代码是系统，文档是要修的说法。
2. **决策 = 修改 + 上下文。** 决策是对业务对象的修改（状态、关联、理由），并带上依据、证据、版本、谁改的。不轻易新增平行对象。
3. **信得过 = 有出处 + 算得出。** 每个结论能指到规则、证据、来源、版本；同样的输入按同样的规则得到同样的结论；规则没覆盖就说“判不了”，不猜。签字不是可靠性；“靠得住”也不是工程可靠性，是决策可依赖。
4. **改得动 = 各自独立，不是分层。** 知识、数据、本体是各自独立的关注点，边界清楚；换一个不用重做另外两个。
5. **客户认为自己独一无二。** 不卖模板，不卖复用；卖“贴合”，系统从客户的规则里长出来。
6. **写产品声明，不写内部备忘录。** “这个产品做 X”胜过“我们要记得做 X”。检验：客户能不能复述这句话？
7. **对外一句话。** openKMS 帮助企业快速构建站得住、改得动的智能决策系统。

**方向。** 业务专家与 AI 主导研发；企业内部平台提供数据与技术支撑；IT 负责接入、权限、安全和交付。

**不要写“只做一件事”“只做一层”这类句式。** 用“只做”来收窄，往往是在摆姿态，不是在给信息；直接说做什么。

**文档不写口播腔。** 用“降低成本”不用“打下来”，用“基础先行”不用“盖楼”，用“推断”不用“猜”，用“由专家定义”不用“在脑子里”。不写“带着 AI”“不用等 IT”“某一块”“再热闹也不做”这类口语句。

**`goals.md` 的结构。** 按“做什么 → 为谁做 → 怎么做 → 和别的做法有什么不同 → 我们坚持什么”组织，每段只回答一个问题。

## 文档结构

三层：

1. **系统/开发参考** — `developer/architecture.md`（模块/流程）、`developer/security.md`、`developer/api-reference.md`、`developer/configuration.md`、`developer/authentication.md`、`developer/data-security.md`、`developer/catalog-data-access.md`
2. **功能页** — `features/` 下每个产品领域一页。大部分产品行为变更落在这里
3. **入口页** — `index.md`、`quickstart.md`、`functionalities.md`、`development_plan.md`、`operations/docker.md`、`developer/setup.md`

不确定改哪里时，先改最具体的 feature page，再更新交叉引用。

## 变更对应关系

| 代码变更 | 文档更新 |
|---|---|
| 新模块/流程/布局/配置 | `developer/architecture.md` |
| 新功能/UI | 对应 `features/` 页面 |
| 新 HTTP 端点 | feature page + `developer/api-reference.md` |
| 新表/字段 | feature page（+ 模型 docstring / 迁移注释里的“为什么”） |
| 完成的任务/计划调整 | `development_plan.md` |
| 新领域 | 新建 `features/xxx.md`，链入 `functionalities.md`，加入 `mkdocs.yml` |
| `backend/app/models/` 变更 | 需要 Alembic migration |

## 保持稳定的内容

- 规范文件的标题不变（跨文档引用依赖它们）
- Feature page 用统一的 `Feature | Status | Description` 表格
- `functionalities.md` 只做路由，不写详细内容
- Mermaid 块只用 ` ```mermaid `，不换其他 fence
- GitHub 编辑链接依赖于 `docs/<path>.md` 路径；移动系统参考页时一次性更新导航和所有链接

## 多语言文档

英文页面（`page.md`）是源，中文翻译为同目录的 `page.zh.md`。链接省略 locale——在 `index.md` 和 `index.zh.md` 里都写 `[Quickstart](../quickstart.md)`。未翻译页面自动回退英文。中文导航标签在 `mkdocs.yml` → `plugins → i18n → languages → zh → nav_translations` 里加。

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
