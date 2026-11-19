# Deep Agents — 运行面摘录（vendored）

> 来源：**已安装**在 `backend/.venv` 的 `deepagents` **0.7.21**，用 `inspect.signature` / `getsource` 读出；
> 以及本项目 `backend/app/services/runtime/deep_agents/` 的实际调用点。2026-11-19 取。
> 这一份与其它三份的证据性质不同：**不是"别人怎么做"，是我们正在跑的代码。**

## 1. `create_deep_agent` 的全部参数（0.7.21）

```text
model, tools, *, system_prompt, middleware, subagents, skills, memory, permissions,
backend, interrupt_on, response_format, state_schema, context_schema,
checkpointer, store, debug, name, cache
```

`deepagents` 顶层导出：

```text
AsyncSubAgent, AsyncSubAgentMiddleware, CompiledSubAgent, DeepAgentState,
FilesystemMiddleware, FilesystemPermission, FsToolName, GeneralPurposeSubagentProfile,
HarnessProfile, HarnessProfileConfig, MemoryMiddleware, ProviderProfile, RubricMiddleware,
SubAgent, SubAgentMiddleware, backends, create_deep_agent, graph, middleware, profiles,
register_harness_profile, register_provider_profile
```

## 2. 记忆是一个**独立参数**，载体是 `AGENTS.md`

```python
class MemoryMiddleware(AgentMiddleware[MemoryState, ContextT, ResponseT]):
    """Middleware for loading agent memory from `AGENTS.md` files.

    Loads memory content from configured sources and injects into the system
    prompt. Supports multiple sources that are combined together.
    """
    def __init__(self, *, backend, sources: list[str], add_cache_control=False, system_prompt=MEMORY_SYSTEM_PROMPT)
```

`sources` 的示例：`["~/.deepagents/AGENTS.md", "./.deepagents/AGENTS.md"]`。

**这就是那个同名不同义的地方**：

| 谁 | `AGENTS.md` 是什么 |
|---|---|
| `deepagents` 的 `MemoryMiddleware` | **记忆**，注入 system prompt |
| pi（我们的开发用 harness） | **项目指令** |
| 我们的 KB agent（`qa-agent/session_fs.py`） | **KB 规则**，会话创建时拷进工作区 |

同一个文件名，三种角色。跨这三个系统搬运 `AGENTS.md` 时，内容会被当成不同的东西。

## 3. 子代理与上下文压缩都是**现成的中间件**

```text
SubAgent(TypedDict): name, description, system_prompt, ..., mode="fork"（实验性）
  默认隔离：子代理只收到被委派的任务描述
SummarizationMiddleware(model, *, backend, trigger=..., keep=("messages", 20),
                        summary_prompt=DEEPAGENTS_DEFAULT_SUMMARY_PROMPT,
                        trim_tokens_to_summarize=4000)
create_summarization_middleware(model, backend, *, summary_prompt=..., trim_tokens_to_summarize=None)
SkillsMiddleware, FilesystemMiddleware, RubricMiddleware, AsyncSubAgentMiddleware
```

默认摘要 prompt 要求的段落：

```text
## SESSION INTENT
## SUMMARY          ← 含"被否掉的选项及原因"
## ARTIFACTS        ← 创建/修改/访问过的文件
## NEXT STEPS
```

## 4. 我们实际传了什么（`factory.py:145`）

```text
传了：model, tools, system_prompt, middleware, subagents, skills, backend, interrupt_on, checkpointer
没传：memory, permissions, response_format, context_schema, store, name, cache
```

项目代理的压缩走 `context_compaction.py`：直接调 `create_summarization_middleware(llm, backend)`，
沿用 deepagents 的阈值与摘要 prompt，自己驱动最多 5 轮（`_MAX_COMPACTION_ROUNDS`）。

## 由此可核对的判断

1. **"记忆"与"上下文压缩"在成熟库里是两件事**：记忆 = 外部 `AGENTS.md` 注入；压缩 = 阈值触发的摘要中间件。
   我们把它们混在"messages 里截断 120 条"这一件事上，两边都不成立。
2. **我们缺的那一层不用自己写**：`SummarizationMiddleware` 已经在项目代理里跑着；数字员工（qa-agent）没有任何压缩，
   只有 `agent_kb_qa_max_context_messages` 截断。
3. **`memory=` 参数我们没接**。项目代理把 `AGENTS.md` 当指令写在 system prompt 里，而库里 `memory=` 是"注入记忆"的入口——
   两者可以并存，但不能互相替代。
