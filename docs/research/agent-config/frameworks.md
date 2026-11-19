# 主流 agent 框架的配置面（vendored）

> 2026-11-19 取。来源：PyPI / npm 上的**已发布包**，解包后读构造签名与类型定义（`ast` 解析 + `rg`）。
> 只有字段名与签名，没有拷贝实现。版本号即证据的一部分。

| 框架 | 版本 | 包 | 读的文件 |
|---|---|---|---|
| OpenAI Agents SDK | **0.25.0** | `openai-agents` (PyPI) | `agents/agent.py` |
| Google ADK | **2.14.1** | `google-adk` (PyPI) | `google/adk/agents/{llm_agent,llm_agent_config}.py`、`google/adk/memory/` |
| Microsoft Agent Framework | **1.26.0** | `agent-framework-core` (PyPI) | `agent_framework/{_agents,_types,_compaction}.py` |
| AutoGen AgentChat | **0.7.5** | `autogen-agentchat` (PyPI) | `autogen_agentchat/agents/_assistant_agent.py` |
| CrewAI | **1.15.43** | `crewai` (PyPI) | `crewai/agent/core.py` |
| Haystack | **3.5.0** | `haystack-ai` (PyPI) | `haystack/components/agents/agent.py` |
| Semantic Kernel | **1.47.0** | `semantic-kernel` (PyPI) | `semantic_kernel/agents/chat_completion/chat_completion_agent.py` |
| LangChain | **1.5.2** | `langchain` (PyPI) | `langchain/agents/factory.py` |
| Mastra | **1.85.0** | `@mastra/core` (npm) | `dist/agent/types.d.ts`、`dist/agent/scopes.d.ts` |
| Deep Agents | **0.7.21** | `deepagents`（本仓库已装） | 见 `deep-agents.md` |

复现方式见本目录 `README.md`；`pip download --no-deps <pkg>` 后 `unzip`，再按上表的路径读。

## 1. 各框架"创建一个 agent"接受什么

### OpenAI Agents SDK 0.25.0

```text
Agent: instructions, prompt, handoffs, model, model_settings,
       input_guardrails, output_guardrails, output_type, hooks,
       tool_use_behavior, reset_tool_choice
```

护栏是**入参**（`input_guardrails` / `output_guardrails`），结构化输出是 `output_type`，交接是 `handoffs`。

### Google ADK 2.14.1

```text
LlmAgentConfig: agent_class, model, model_code, instruction, static_instruction,
                disallow_transfer_to_parent, disallow_transfer_to_peers,
                input_schema, output_schema, output_key, include_contents, tools,
                before_model_callbacks, after_model_callbacks,
                before_tool_callbacks, after_tool_callbacks, generate_content_config
```

指令分三层：`instruction`（全局）/ `global_instruction` / `static_instruction`。生成参数在
`generate_content_config`，ADK 代码里实际读取的键（计数来自 `rg`）：

```text
max_output_tokens(25)  thinking_config(24)  top_p(17)  temperature(13)
stop_sequences(9)  top_k(8)  seed(7)  candidate_count(2)
```

记忆是**独立服务**：`memory/{in_memory,sqlite,vertex_ai_memory_bank,vertex_ai_rag}_memory_service.py`
——即"短期会话"与"长期记忆"是两套东西。

### Microsoft Agent Framework 1.26.0

```text
Agent.__init__: client, instructions, id, name, description, tools, default_options,
                context_providers, middleware, require_per_service_call_history_persistence,
                compaction_strategy, tokenizer, additional_properties
```

`_ChatOptionsBase` 有 **18** 个字段：

```text
model, temperature, top_p, max_tokens, stop, seed, logit_bias, frequency_penalty,
presence_penalty, tools, tool_choice, allow_multiple_tool_calls, response_format,
metadata, user, store, conversation_id, instructions
```

两点值得注意：**`instructions` 同时出现在 agent 与每次调用的 options 里**（可覆盖）；
压缩是**策略对象**（`CompactionStrategy` 协议 + `AgentTriggered` / `UnloadSkills` / `SelectiveToolCall` /
`ToolResult` / `Summarization` 数种实现）。

### AutoGen AgentChat 0.7.5

```text
AssistantAgent.__init__: name, model_client, tools, workbench, handoffs, model_context,
                         description, system_message, model_client_stream,
                         reflect_on_tool_use, max_tool_iterations,
                         tool_call_summary_format, output_content_type,
                         output_content_type_format, memory, metadata
```

`model_context` 是可替换的上下文策略对象（缓冲/按 token 限制/头尾保留），`memory` 与它是两个参数。

### CrewAI 1.15.43

```text
Agent: llm, function_calling_llm, system_template, prompt_template, response_template,
       allow_code_execution, code_execution_mode, respect_context_window,
       use_better_compaction, max_retry_limit, max_execution_time, multimodal,
       inject_date, date_format, planning, planning_config, reasoning,
       max_reasoning_attempts, guardrail, guardrail_max_retries,
       knowledge_search_query, embedder, agent_knowledge_context, crew_knowledge_context,
       conversational, a2a, step_callback, ...
```

`guardrail` + `guardrail_max_retries` 是**逐 agent 的校验器**；`planning` / `reasoning` 是显式开关；
`respect_context_window` / `use_better_compaction` 是上下文处理的两个档位。

### Haystack 3.5.0

```text
Agent.__init__: chat_generator, tools, system_prompt, user_prompt, required_variables,
                exit_conditions, state_schema, max_agent_steps, streaming_callback,
                raise_on_tool_invocation_failure, tool_concurrency_limit,
                tool_streaming_callback_passthrough, hooks
```

`exit_conditions` 是显式的**终止条件**（可给多个），`max_agent_steps` 是硬上限。

### Semantic Kernel 1.47.0

```text
ChatCompletionAgent.__init__: arguments, description, function_choice_behavior, id,
                              instructions, kernel, name, plugins, prompt_template_config, service
```

工具以 `plugins` + `function_choice_behavior`（`auto` / `required` / `none` 及过滤器）表达；
会话是 `AgentThread`，不是 agent 的字段。

### LangChain 1.5.2

```text
create_agent: model, tools, system_prompt, middleware, response_format, state_schema,
              context_schema, checkpointer, store, interrupt_before, interrupt_after,
              debug, name, cache, transformers
```

**没有** `temperature` / `max_tokens` / `memory` 参数——生成参数在 model 对象上，记忆在 `checkpointer` + `store`
（短期 / 长期），人在环在 `interrupt_before/after`，横切能力在 `middleware`。

### Mastra 1.85.0

`AgentConfigBase` 的字段（约 30 个，节选）：

```text
id, name, description, metadata, instructions, model, maxRetries, tools, hooks, workflows,
durable, defaultOptions, defaultNetworkOptions, agents, scorers, memory, scopes,
skills, skillsFormat, browser, voice, channels, workspace, knowledge,
inputProcessors, outputProcessors, maxProcessorRetries, errorProcessors,
requestContextSchema, goal, backgroundTasks, notifications, signals
```

三处与本次讨论直接相关：

```ts
// 权限作用域（scopes.d.ts，标注 experimental）
export type AgentScopesConfig<TRequestContext> = string[] | ((args: {
    scopes: string[]; requestContext: RequestContext<TRequestContext>;
    mastra?: any;
    /** The authenticated end user, when the request has one. */
    user?: MastraUser;
}) => string[] | Promise<string[]>);
```

- **护栏是处理器链**：`inputProcessors` / `outputProcessors` / `errorProcessors` + `maxProcessorRetries`。
- **子代理是一等字段**：`agents`；`defaultNetworkOptions` 是它们的协作方式。
- **`instructions` 可以是函数**（`DynamicArgument<AgentInstructions>`），按请求上下文生成。

## 2. 跨框架观察

1. **"知识/检索"几乎不是内建字段** [证]：OpenAI Agents 用内置 `file_search` 工具；LangChain / CrewAI / Haystack /
   ADK 的 agent 字段里都没有"知识库"这一项，检索要么是工具、要么是独立的 pipeline 组件。**只有 Mastra 有
   `knowledge` 字段**（且是 `Knowledge | string` 的引用）。→ 我们把知识源做成独立对象、由 agent 绑定，与多数做法一致。
2. **`instructions` 与"模型调用参数"始终分开** [证]：9 个框架无一把它俩合成一个"prompt 对象"；
   ADK 甚至分三层指令，Mastra 允许 instructions 是函数。
3. **生成参数成组，且位置不统一** [证]：OpenAI Agents → `model_settings`；ADK → `generate_content_config`；
   MS Agent Framework → `ChatOptions`（18 字段，含 `instructions`）；LangChain → 在 model 对象上（`create_agent` 无此参数）；
   CrewAI → `llm` 对象里。
4. **记忆普遍是两个东西** [证]：短期（`model_context` / `checkpointer` / `AgentThread` / `memory`）与长期
   （ADK 的 memory service、Mastra 的 `memory`、LangChain 的 `store`）。
5. **压缩/k 上下文管理是独立策略** [证]：MS Agent Framework 的 `CompactionStrategy` 协议（数种实现）、
   `compaction_strategy` 参数；CrewAI 的 `respect_context_window` / `use_better_compaction`；Deep Agents 的
   `SummarizationMiddleware`。**没有一家只有"截断 N 条消息"。**
6. **护栏有三种形态** [证]：入参校验器（OpenAI Agents 的 input/output guardrails、CrewAI 的 `guardrail`）、
   处理器链（Mastra 的三类 processors）、回调（ADK 的 before/after model/tool callbacks）。
7. **权限/身份只有少数框架当一等公民** [证]：Mastra 有 `scopes` 与 `user`；其余把这件事留给部署层。
   → 我们的服务凭证 + 绑定鉴权在这条线上不算落后，但**没有"调用方是谁"这一维**（Mastra 的 `user` 即此）。
8. **版本/发布在 agent 对象里普遍缺席** [证]：9 个框架的 agent 构造都没有"版本"字段；版本属于部署与平台层
   （Bedrock 的 alias 是平台层能力）。→ 我们把"发布"放到阶段三是站得住的，但**不能指望从框架里白拿**。
