# 功能索引

按主题拆分的功能参考。完整内容曾集中在本文件；现已迁至 `docs/features/`，便于分块浏览与独立维护。下表为权威路由索引——从这里开始。

## 按功能

| 页面 | 涵盖内容 |
|------|----------|
| [基础设施与质量](features/infrastructure.md) | Compose、测试、错误处理、代码分割、类型检查 |
| [文档](features/documents.md) | 文档通道、上传、解析流水线（PaddleOCR-VL、百度云）、`openkms-cli` |
| [文章](features/articles.md) | 文章通道、CRUD、关系、生命周期、附件、批量导入 |
| [评论](features/comments.md) | 用户对文章、文档、知识库、维基空间、Agent 项目的评论与 0–5 分评分 |
| [知识库](features/knowledge-bases.md) | 知识库 CRUD、FAQ、分块、语义检索、QA 代理、kb-index |
| [维基空间](features/wiki-spaces.md) | 维基内容（路径寻址页面、文件、vault）、导入、图谱视图、Wiki Copilot Agent |
| [评测](features/evaluation.md) | 评测集、条目、运行、对比（实验性；质量改进工作流规划中） |
| [术语表](features/glossaries.md) | 双语术语、AI 建议、导入/导出 |
| [知识地图与首页](features/knowledge-map.md) | 知识地图术语、资源链接、首页 hub 图谱 |
| [全局搜索](features/global-search.md) | `/search` 页：文档、文章、维基空间、知识库（名称、通道、更新时间筛选） |
| [本体 — 对象、关系与数据集](features/ontology.md) | 对象/关系类型、实例、Object Explorer、数据源、数据集 |
| [流水线、任务与模型](features/pipelines-and-jobs.md) | 流水线模板、procrastinate 任务、Provider/模型注册（多模态图像/视频模型规划中） |
| [数据安全](features/data-security.md) | 双层模型（操作 RBAC + 资源 ACL）、组、共享、继承、 enforcement |
| [控制台与认证](features/console-and-auth.md) | 权限目录、Console UX、OIDC/本地认证、系统设置、用户设置（API 密钥）、功能开关 |
| [连接器](features/connectors.md) | `/connectors` 同步与 search_tool 种类、数据集输出、Tushare 同步任务、计划任务、Agent `web_search` |
| [Agent（项目工作区）](features/openkms-agents.md) | Deep Agents 对话、文件、本地/远程 git、计划模式、openKMS 研究工具 |
| [Wiki Copilot 与知识库问答](features/wiki-spaces.md) | 维基空间与知识库内嵌助手 |
| [OpenCode 技能（openkms）](features/opencode-openkms-skill.md) | 外部 Agent 技能 + CLI（`openkms-skill/`）；不能替代应用内 Agent |

## 横切参考

| 页面 | 涵盖内容 |
|------|----------|
| [知识类型](features/knowledge-types.md) | 分类（制品、索引、维度）；**昆虫研究**工作流表；**何时新增 Recordings/Video 功能**（[锚点](features/knowledge-types.md#video-as-functionality)） |
| [API 参考](features/api-reference.md) | 按领域分组的 HTTP 端点总表 |
| [数据模型](features/data-models.md) | 各持久化表的 schema |
| [配置](features/configuration.md) | 后端依赖、pgvector、S3/MinIO、Cursor 规则 |

## 新增内容放哪里

代码变更时，编辑上表中最具体的页面：

- **新端点** → 对应功能页 **以及** [API 参考](features/api-reference.md)。
- **新 schema 列** → [数据模型](features/data-models.md) **以及** 使用该列的功能页。
- **新功能面** → 专用功能页；若无合适页面，在 `docs/features/` 下新增文件、在此链接，并在 `mkdocs.yml` 的 `nav:` 中登记。

完整编辑清单见 [AI 代理文档规范](agents.md)。
