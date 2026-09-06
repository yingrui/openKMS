# openkms-skill

可移植的 **[Agent Skill](https://agentskills.io/specification)** + Python CLI，用**个人 API 密钥**（**Settings → API keys**）调用 openKMS HTTP API。

适用主机包括：

| 主机 | 安装方式 |
|------|----------|
| **openKMS Agents**（应用内） | **Agents → Skills** 上传 zip，在项目 Agent 设置中安装 |
| **Claude Code** | `./install.sh --target claude-code` → `~/.claude/skills/openkms/` |
| **OpenCode** | `./install.sh --target opencode` → `~/.config/opencode/skills/openkms/` |
| **其他 / 手动** | 复制 skill 目录；配置 `config.yml` 或环境变量 |

仓库路径：[`openkms-skill/`](https://github.com/yingrui/openKMS/blob/main/openkms-skill/)。与 **`openkms-cli`**（worker / 流水线工具）不同。

英文页为源：详见 [openkms-skill](openkms-skill.md)（本页为摘要；完整命令与布局说明以英文为准）。

## 布局（[agentskills.io](https://agentskills.io/specification)）

`SKILL.md` + `references/`（`REFERENCE.md`、`functions-authoring.md`、`app-builder.md`、`app-builder-kanban.md`）+ `assets/kanban-a2ui-messages.json` + `scripts/cli.py`。

## 使用

```bash
python scripts/cli.py ping
```

Agent **只能**走 bundled CLI。写 Function 源码前读 `references/functions-authoring.md`。控制面 API（feature toggles、schedules hub 等）不包装。**App Builder** 机制见 `references/app-builder.md`（与 Design 右侧清单一致：Resources → Loaders → Layout → Preview → Publish）；CLI：`apps list|get|create|patch|synthesize|publish|delete`（见 [应用构建器](app-builder.md)）；Kanban 示例见 `references/app-builder-kanban.md`，样例消息 `assets/kanban-a2ui-messages.json`。领域本体是**租户 DIY**（`SKILL.md` Workflow G / H、[认识本体](../tutorials/understanding-ontology.md)、[Tushare 案例](../tutorials/tushare-market-ontology.md)），不是平台种子；Action 对可解析实例的 **create / update / delete apply** 已交付，dataset/Neo4j 合成 `object_id` 仍延后，见 [Manager 对齐说明](../research/ontology_manager_alignment.md)。
