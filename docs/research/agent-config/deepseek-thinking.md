# DeepSeek 思考模式 — 官方术语与参数（vendored）

> 来源：`https://api-docs.deepseek.com/guides/thinking_mode.md` 与 `.../zh-cn/guides/thinking_mode.md`，2026-11-19 取。
> 保留原文表格与结论句，删去示例代码。**这一份直接推翻了我们 `enable_thinking` 的实现假设。**

## 1. 官方术语（中文 / 英文）

| 中文 | 英文 |
|---|---|
| **思考模式** | **Thinking Mode** |
| **思考模式开关** | **Thinking Mode Toggle** |
| **思考强度控制** | **Thinking Effort Control** |
| 思维链（内容） | chain-of-thought reasoning / `reasoning_content` |

官方对这一模式的中文定义（可直接引用到产品文案）：

> DeepSeek 模型支持思考模式：在输出最终回答之前，模型会先输出一段思维链内容，以提升最终答案的准确性。

## 2. 参数形状：三种 API 格式，三种写法

中文原文表格：

```
|           | 控制参数（OpenAI 格式）                              | 控制参数（Anthropic 格式）                              | 控制参数（Responses API 格式）                                             |
| --------- | -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| 思考模式开关(1) | `{"thinking": {"type": "enabled/disabled"}}` | `{"thinking": {"type": "enabled/disabled"}}`    | `{"reasoning": {"effort": "none/low/high/max"}}` / (none 表示关闭思考模式) |
| 思考强度控制(2) | `{"reasoning_effort": "low/high/max"}`       | `{"output_config": {"effort": "low/high/max"}}` | `{"reasoning": {"effort": "none/low/high/max"}}` / (none 表示关闭思考模式) |
```

要点：

- 开关是**结构化对象** `{"thinking": {"type": "enabled" | "disabled"}}`，不是布尔。
- 在 OpenAI SDK 的 Chat Completion 里，`thinking` 必须放进 **`extra_body`**（`reasoning_effort` 是顶层参数）。
- **思考强度 `reasoning_effort` 取值是 `low / high / max`**（另接受 `minimal / medium / xhigh / ultra` 并映射，见原文表）。
- **默认打开**：`(1) 思考模式默认打开，且 effort 默认为 high`。
- Anthropic 格式用 `{"output_config": {"effort": ...}}`，Responses 格式用 `{"reasoning": {"effort": ...}}`。

## 3. 与其它参数的相互作用（产品必须写明的部分）

中文原文：

> 思考模式不支持 `temperature`、`presence_penalty`、`frequency_penalty` 参数。请注意，为了兼容已有软件，设置参数不会报错，但也不会生效。

> `top_p` 的行为因模型而异：
> - `deepseek-flash`：仅在思考模式下生效，有效取值范围为 `0.95`–`1.0`，低于 `0.95` 的取值会按 `0.95` 处理。在非思考模式下，该参数恒为 `1.0`，传入的值会被忽略。
> - `deepseek-v4-pro`：思考模式下会忽略传入值（启用工具调用时固定为 `0.95`，否则为 `1.0`）；非思考模式下生效。

即：**打开思考模式后，`temperature` 和 `top_p` 可能整体失效，且不报错。** 一个把两者并排放置的界面，必须说清这件事。

## 4. 我们现在的实现与官方不一致

| 我们 | DeepSeek 官方 | 后果 |
|---|---|---|
| `extra_body.enable_thinking: true/false`（`qa_agent_chat_extra_body`） | `extra_body.thinking: {"type": "enabled"\|"disabled"}` | 发的是**未知键**。默认打开思考的模型收不到"关闭"，我们以为关了、实际没关 |
| 产品语义 `on/off`，默认 `off` | 默认 `enabled`，effort `high` | 我们"默认直接回答"的假设不成立 |
| 无 `reasoning_effort` | 有，且是官方推荐的强度旋钮 | 只能在"思考/不思考"之间二选一，不能调强度 |
| `enable_thinking` 是 DashScope（阿里）系的写法 | 各家不同：DeepSeek `thinking.type`、OpenAI `reasoning_effort`、Anthropic `thinking.budget_tokens` | **传输格式必须按 provider 适配**，不能写死一种形状 |

`enable_thinking` 这个键在阿里 DashScope 的 Qwen 上是真实的，所以它对我们当前的网关可能仍然有效——
问题不在它"错"，而在我们**把它当成了通用机制**，并据此写出了"跟随部署配置"这种无法解释的选项。

## 5. 实测：我们的参数关不掉它（2026-11-19，`deepseek-flash`）

对部署里配的默认模型直接发请求（同一句提示，`max_tokens=400`），看响应有没有 `reasoning_content`：

| 发出的形状 | `reasoning_content` | 结论 |
|---|---|---|
| 什么都不发（基线） | 102 字符 | 默认就在思考（与官方"默认打开"一致） |
| `enable_thinking: false`（阿里写法，裸 JSON） | 220 字符 | **仍在思考** |
| `enable_thinking: true`（裸 JSON） | 142 字符 | 仍在思考 |
| `{"thinking": {"type": "disabled"}}`（官方） | **0 字符** | **关掉了**，`completion_tokens` 从 43–80 降到 3 |
| `{"thinking": {"type": "enabled"}}`（官方） | 147 字符 | 思考 |
| SDK `extra_body={"enable_thinking": False}`（qa-agent 真实路径） | 133 字符 | **仍在思考** |
| SDK `extra_body={"thinking": {"type": "disabled"}}` | **0 字符** | 关掉了 |

注意第一个坑：`extra_body` 是 OpenAI SDK 的构造，SDK 会把它**合并进请求体**。把它原样当 JSON 字段发出去，
服务端只会看到一个叫 `extra_body` 的未知字段——那一轮所有用例因此看起来"没区别"。

**结论：`enable_thinking` 在该端点上是被忽略的未知字段，"关闭思考"从未生效。**

## 6. 实测二：本地网关的 `qwen3.5` 关不掉

同一个探测方法，对部署里另一个 chat 模型（MLOps Hub，`http://localhost:8080/api/v1`，模型 `qwen3.5`）：

| 发出的形状 | `reasoning_content` |
|---|---|
| 什么都不发 | 746 字符 |
| `enable_thinking: false` | 909 字符 |
| `enable_thinking: true` | 801 字符 |
| `{"thinking": {"type": "disabled"}}` | 794 字符 |
| `{"thinking": {"type": "enabled"}}` | 877 字符 |
| `reasoning_effort: low` | 765 字符 |

**六种形状全部无效**：这个网关始终输出思维链。所以"能不能关掉思考"是**每个端点各自的属性**，不是我们能从
模型名或 `capabilities: ["thinking"]` 推出来的。

## 7. 实测三：GLM 两种写法都认

`https://open.bigmodel.cn/api/paas/v4`，模型 `glm-4.6`，同一套探测：

| 发出的形状 | `reasoning_content` | total_tokens |
|---|---|---|
| 什么都不发 | 838 字符 | 308 |
| `enable_thinking: false` | **0** | **25** |
| `enable_thinking: true` | 482 字符 | 191 |
| `{"thinking": {"type": "disabled"}}` | **0** | **25** |
| `{"thinking": {"type": "enabled"}}` | 407 字符 | 182 |

即 GLM 同时接受两种拼写。同一次探测里还看到模型差异：`glm-4-plus` / `glm-4-flash` 不输出 `reasoning_content`，
`glm-4.5` / `glm-4.6` 输出——所以"有没有思考"也是模型级属性。

## 8. 实测四：`glm-5.3-flash` 关不掉，而且 `reasoning_effort` 是真旋钮

厂商文档（`docs.bigmodel.cn`，GLM-5.3-Flash）：推荐 `temperature: 1`、`top_p: 0.95`、`reasoning_effort: max`；
`thinking.type` **仅支持 `enabled`**。文档另说明 GLM-5.3 / 5.3-Flash / 5.2 / 5.1 / 5 / 4.7 系列**默认开启思考**，
与 GLM-4.6 的"混合（自动开启）"不同。

关闭写法在该模型上（实测）：

| 传法 | 结果 |
|---|---|
| 什么都不传 | reasoning 86 tokens（默认思考） |
| `{"enable_thinking": false}` | **HTTP 400, code 1210**：`该模型始终思考，不支持关闭思考；请使用 low、high 或 max` |
| `{"thinking": {"type": "disabled"}}` | **同样的 400** |
| `{"thinking": {"type": "enabled"}}` | 正常，reasoning 151 |
| `{"reasoning_effort": "low"}` | reasoning 0，completion 5 |

`reasoning_effort` 的强度差异（多步计算题，答案唯一，三档都答对 783.33）：

| 设置 | reasoning_tokens | 耗时 |
|---|---|---|
| `low` | 177 | 4.2s |
| `high` | 285 | 5.4s |
| `max` | **2035** | **34.9s** |

即：`max` 比 `low` 多约 11 倍推理、8 倍时间。**同一个 provider 下，4.6 能关、5.3-flash 不能关**——"能不能关"
是模型级属性，"怎么写"是 provider 级属性。

## 9. 因此的产品结论

1. 界面用官方术语：**思考模式**（开启 / 关闭），不是自造的"回答方式 / 跟随部署配置"。
2. 说明用官方对效果的定义，外加代价：开启后先输出思维链再回答，更准、更慢、更贵。
3. 必须写明副作用：开启后 `temperature` 可能不生效（官方明文）。
4. **实测过的写法**：DeepSeek（`thinking.type`）、GLM（`enable_thinking` 与 `thinking.type` 皆可）。
   本部署的 `qwen3.5` 网关任何写法都不生效。DashScope / OpenAI / Anthropic 的预设来自各自文档，**未在本环境实测**。

5. **不能关闭的模型，报错是正确行为**：`glm-5.3-flash` 收到关闭请求返回 400。这是显式失败，好过静默无效；
   要省推理就用 `reasoning_effort: low`。因此不做 model 级片段覆盖，接受"选错模型会报错"。

6. **传输层是 provider 上的两段 JSON**：`api_providers.config.thinking = {"on": …, "off": …}`，随
   `/llm-defaults` 下发，qa-agent 只合并 agent 选择的那一段；该段为空就不发。枚举（`deepseek | none`）
   只能描述一家写法，片段能描述全部——DeepSeek 的对象、DashScope 的布尔、OpenAI 的 `reasoning_effort`、
   Anthropic 的 token 预算，都是"发什么"的差异，不是"哪一家"的差异。加一家厂商从改代码变成改配置。
