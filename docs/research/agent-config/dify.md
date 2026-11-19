# Dify — agent 配置摘录（vendored）

> 来源：`https://docs.dify.ai/llms-full.txt`（Mintlify 的全文导出），2026-11-19 取。节选自该文件，保留原文。
> 复现：`curl -sSL https://docs.dify.ai/llms-full.txt | less`，按下面的关键词定位。

## 1. 知识检索属于知识库，agent 没有 app 级检索设置

原文（`llms-full.txt` 第 263 行附近）：

```text
**The more detailed your knowledge base description, the better the model can determine relevance**, leading to more accurate and targeted retrieval.

> [!NOTE]
>
> An Agent app has no app-level retrieval settings. Each knowledge base is queried independently using its own settings you've configured. When you add several, the agent picks which to query and does not rerank results across them.

#### Search Within Specific Documents
```

这条与我们的 D27（检索深度留在知识源）一致。

## 2. 生成参数是一组模板

原文（第 22162–22180 行，模型参数规则 `ParameterRule`）：

```text
## ParameterRule

**name** `string` *required*

Actual parameter name used in the model call.

**use_template** `string`

Template to use.

Five parameter templates are predefined:

* `temperature`
* `top_p`
* `frequency_penalty`
* `presence_penalty`
* `max_tokens`

Set one of these names in `use_template` to inherit the default configuration from `entities.defaults.PARAMETER_RULE_TEMPLATE`; you then only need `name` and `use_template`. Any additional parameters you set override the template defaults. See `openai/llm/gpt-3.5-turbo.yaml` and the examples in [Creating a New Model Provider](/en/develop-plugin/dev-guides-and-walkthroughs/creating-new-model-provider).
```

## 3. 记忆是可配的窗口

原文（第 9130 行附近）：

```text
>
> **Max Iterations** sets a safety limit to prevent infinite loops. Configure based on task complexity - simple tasks need 3-5 iterations, while complex research might require 10-15.
>
> **Memory** controls how many previous messages the Agent remembers using TokenBufferMemory. Larger memory windows provide more context but increase token costs. This enables conversational continuity where users can reference previous actions.
>
> ### Tool Parameter Auto-Generation
>
```

## 由此可核对的判断

- 知识源与工具是两个面板：知识库自带检索设置，agent 只是"选知识库"。
- 生成参数五项（`temperature` / `top_p` / `frequency_penalty` / `presence_penalty` / `max_tokens`）同层出现。
- 记忆是"记多少条消息"的窗口配置（`TokenBufferMemory`），不是固定常量。
