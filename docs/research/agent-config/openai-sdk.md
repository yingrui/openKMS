# OpenAI Python SDK — 请求参数摘录（vendored）

> 来源：PyPI `openai` **3.55.1** wheel 内的类型定义，2026-11-19 下载后提取。**只有字段名**，没有拷贝实现。
> 复现：`curl -s https://pypi.org/pypi/openai/json` 取 wheel URL → 解包 → 读下列文件。

## Chat Completions — `openai/types/chat/completion_create_params.py`

采样/生成相关字段（全部与 `temperature` 同层）：

```text
max_completion_tokens
max_tokens
parallel_tool_calls
reasoning_effort
response_format
stop
temperature
top_p
verbosity
```

`reasoning_effort` 的取值（`openai/types/shared/reasoning_effort.py`）：

```text
ReasoningEffort: TypeAlias = Optional[Literal["none", "minimal", "low", "medium", "high", "xhigh", "max"]]
```

`verbosity: Optional[Literal["low", "medium", "high"]]`

## Responses — `openai/types/responses/response_create_params.py`

```text
conversation
input
instructions
max_output_tokens
model
previous_response_id
reasoning
store
temperature
text
tools
top_p
truncation
input
model
```

## 工具是"内置 + 自建"并存 — `openai/types/responses/tool_param.py`

`ToolParam` 联合引用的工具类型：

```text
apply_patch_tool_param
computer_tool_param
computer_use_preview_tool_param
custom_tool_param
file_search_tool_param
function_shell_tool_param
function_tool_param
namespace_tool_param
tool_search_tool_param
web_search_preview_tool_param
web_search_tool_param
```

## 由此可核对的判断

- 生成参数在 OpenAI 是**一组**（`temperature` / `top_p` / `max_tokens` / `max_completion_tokens` / `reasoning_effort` / `verbosity`）。
- `max_tokens` **仍然存在于当前 SDK**（与 `max_completion_tokens` 并存）。
- "思考深度"在 OpenAI 是枚举 `reasoning_effort`，**与 Anthropic 的 token 预算不是同一个东西**（见 `anthropic-sdk.md`）。
