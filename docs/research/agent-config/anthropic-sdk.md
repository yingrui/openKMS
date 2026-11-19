# Anthropic Python SDK — 请求参数摘录（vendored）

> 来源：PyPI `anthropic` **2.10.0** wheel 内的类型定义，2026-11-19 下载后提取。**只有字段名**，没有拷贝实现。

## Messages — `anthropic/types/message_create_params.py`

`MessageCreateParamsBase` 的**全部**字段：

```text
max_tokens
messages
model
cache_control
container
diagnostics
inference_geo
metadata
output_config
service_tier
speed
stop_sequences
system
thinking
tool_choice
tools
user_profile_id
workspace_id
stream
stream
```

**注意：没有 `temperature`、`top_p`、`top_k`。** 全包内 `rg top_k anthropic/` 无命中。

## 思考深度：`anthropic/types/thinking_config_param.py`

`ThinkingConfigParam` 是以下四者的联合：

```text
thinking_config_adaptive_param.py
thinking_config_between_tools_param.py
thinking_config_disabled_param.py
thinking_config_enabled_param.py
```

`ThinkingConfigEnabledParam`（`thinking_config_enabled_param.py`）：

```text
budget_tokens: Required[int]
Must be ≥1024 and less than `max_tokens`.
```

## 输出配置：`anthropic/types/output_config_param.py`

```text
effort: Optional[Literal["low", "medium", "high", "xhigh", "max"]]
format: Optional[JSONOutputFormatParam]
```

## 由此可核对的判断

- Anthropic 当前 API **没有采样参数**，用 `thinking.budget_tokens`（token 预算，≥1024）与
  `output_config.effort`（五档枚举）表达"想多久"。
- 这与 OpenAI 的 `reasoning_effort`（七档）和网关私有的 `enable_thinking`（布尔）**键名与语义都不同**，
  所以 `thinking` 是**不可移植**的配置项。
