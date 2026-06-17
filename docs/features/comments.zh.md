# 评论

用户对共享内容的评论与 0–5 分评分。与 **文章 LLM 评审**（自动量表）和 **评测运行**（基准数据集）不同。

## 支持的资源

| `resource_type` | 目标 | 读权限 |
|-----------------|------|--------|
| `article` | 文章 | 文章频道 ACL（读） |
| `document` | 文档 | 文档频道 ACL（读） |
| `knowledge_base` | 知识库 | 知识库资源 ACL（读） |
| `wiki_space` | Wiki 空间 | Wiki 空间资源 ACL（读） |
| `project` | Agent 项目 | 项目所有者（`user_sub`）+ Agents 功能已启用 |

## 行为

- **顶层评论**需要正文和 **rank**（0–5 整数）。同一用户对同一资源可发多条顶层评论。
- **回复**只能挂在顶层评论下（单层线程）。回复仅有正文，无评分。
- **编辑 / 删除**：仅作者（`created_by` 与 JWT `sub` 一致）。
- 删除顶层评论会级联删除其回复。

## API

见 [API 参考 — 评论](api-reference.md#comments)。

## 界面

详情页右侧为 **评论侧栏**（类似飞书文档）：

- **工具竖条**（最右侧）：`MessageSquare` 开关评论。Wiki 工作区另有 **Copilot**；打开其一会关闭另一。
- **评论面板**：摘要（平均分、数量）、带 0–5 星的撰写区、可滚动线程与内联回复。

已接入：文章详情、文档详情、知识库详情（Q&A 全屏模式下隐藏）、Wiki 工作区与空间设置、Agent 项目工作区与设置。

## 数据模型

表 **`content_comments`**：多态 `resource_type` + `resource_id`，可选 `parent_comment_id`，`body`，`rank`（仅顶层），`created_by`，`created_by_name`，时间戳。见 [数据模型 — ContentComment](data-models.md#contentcomment)。
