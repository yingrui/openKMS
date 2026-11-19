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
| [`frameworks.md`](frameworks.md) | PyPI / npm 上的 9 个框架（OpenAI Agents 0.25.0、Google ADK 2.14.1、Microsoft Agent Framework 1.26.0、AutoGen 0.7.5、CrewAI 1.15.43、Haystack 3.5.0、Semantic Kernel 1.47.0、LangChain 1.5.2、Mastra 1.85.0） | 各自"创建一个 agent"接受的字段/签名，以及跨框架的 8 条观察 |
| [`deep-agents.md`](deep-agents.md) | **已安装的** `deepagents` **0.7.21** + 本仓库调用点 | `create_deep_agent` 全参数、`MemoryMiddleware`、`SummarizationMiddleware`、`SubAgent`、我们传了/没传什么 |
| [`pi-harness.md`](pi-harness.md) | 本机 `pi` **1.4.0** 自带文档 | 压缩阈值（`reserveTokens` / `keepRecentTokens` / 按模型覆盖）、摘要骨架、技能加载方式 |

后两份与前三份的证据性质不同：**不是"别人怎么做"，而是"我们在跑什么"**。`deepagents` 0.7.21 是
`backend/.venv` 里实际安装的版本，`factory.py` 的调用点就在仓库里；pi 是我们开发时用的 harness，
它的约定（`AGENTS.md`、`SKILL.md`、结构化摘要段落）已经渗进本仓库。

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

## 一个同名不同义的坑（摘自 `deep-agents.md`）

`AGENTS.md` 在三处指三样东西：`deepagents` 的 `MemoryMiddleware` 把它当**记忆**注入 system prompt；pi 把它当
**项目指令**；我们的 KB agent（`qa-agent/session_fs.py`）把它当**KB 规则**拷进会话工作区。
搬运这个文件时，"它到底是被当成指令还是记忆"必须重新确认。

## 未纳入的

Azure AI Foundry、Vertex/ADK、Coze 的可达但未逐条读过，因此**不作为结论依据**，也没有放到这里。需要时按同样方式补，
并在此表登记来源与版本。
