# Agent 配置面 — 外部证据（vendored）

> 2026-11-19 取。用途：`tmp/plan/workforce.md` §7 的 [证] 依据。
> 这个目录存在的理由：**一份没有来源的调研不算调研。** 前一版配置面对照表是凭记忆写的，其中"Anthropic 有
> temperature / top_k / top_p"这一条**是错的**（见 `anthropic-sdk.md`）。把这些摘录放进仓库，是为了让下一个人
> 能离线复核结论，而不是再凭一次记忆。

| 文件 | 来源 | 取的是什么 |
|---|---|---|
| [`bedrock-agents.md`](bedrock-agents.md) | `docs.aws.amazon.com` API 参考 | `CreateAgent` / `InferenceConfiguration` / `AssociateAgentKnowledgeBase` / `CreateAgentActionGroup` / `CreateAgentAlias` 的请求结构 |
| [`openai-sdk.md`](openai-sdk.md) | PyPI `openai` **3.55.1** wheel | `Chat Completions` 与 `Responses` 的请求字段名、`reasoning_effort` 取值、工具联合类型 |
| [`anthropic-sdk.md`](anthropic-sdk.md) | PyPI `anthropic` **2.10.0** wheel | `MessageCreateParams` 的全部字段、`thinking` 配置、`output_config` |
| [`dify.md`](dify.md) | `docs.dify.ai/llms-full.txt` | 知识检索归属、生成参数模板、记忆窗口的原文段落 |

## 怎么取（可复现）

```bash
# AWS：直接读 API 参考页（HTML，去掉标签后取 Request Syntax）
curl -sS -o /tmp/a.html https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_CreateAgent.html

# OpenAI / Anthropic：从 PyPI 拿 wheel，解包后读类型定义 —— 版本号即证据的一部分
curl -sS https://pypi.org/pypi/openai/json | python3 -c "import json,sys;print(next(f['url'] for f in json.load(sys.stdin)['urls'] if f['filename'].endswith('-py3-none-any.whl')))"
#   解包后：openai/types/chat/completion_create_params.py、openai/types/responses/response_create_params.py

# Dify：Mintlify 的全文导出
curl -sSL https://docs.dify.ai/llms-full.txt -o /tmp/dify.txt
```

## 这些摘录能证明什么、不能证明什么

**能**：某个平台的某个版本里，某个字段**在不在**、叫什么、什么类型。这足以判断"知识库是不是 agent 的字段"
（Bedrock：不是，要 `AssociateAgentKnowledgeBase`）、"生成参数是不是一组"（是）、"temperature 是不是每家都有"
（不是，Anthropic 没有）。

**不能**：

- **不能**证明这是"最佳实践"。平台的 API 面是能力清单，不是推荐用法。本项目的取舍仍按自己的五问（D18）判。
- **不能**代表产品 UI 的推荐结构。UI 怎么分组是产品判断，摘录只提供事实边界。
- **不是全文转载**：AWS 只抄请求语法与字段说明，SDK 只抄字段名与枚举值，Dify 只摘相关段落。要看全貌请按上面的
  命令自己取。
- **有版本时效**：SDK 与服务端都会变。引用这里的结论时请连同版本号一起引用（例如"`anthropic` 2.10.0 的
  `MessageCreateParams` 没有 `temperature`"），不要写成"Anthropic 没有 temperature"。

## 未纳入的

Azure AI Foundry、Vertex/ADK、Coze 的可达但未逐条读过，因此**不作为结论依据**，也没有放到这里。需要时按同样方式补，
并在此表登记来源与版本。
