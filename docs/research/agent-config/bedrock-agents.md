# AWS Bedrock Agents — API 摘录（vendored）

> 来源：`docs.aws.amazon.com` 的 API 参考页，2026-11-19 取。**只有字段与请求结构**，不是全文转载。
> 用途：`tmp/plan/workforce.md` §7 的 [证] 依据。原文：

| 页 | URL |
|---|---|
| `CreateAgent` | https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_CreateAgent.html |
| `InferenceConfiguration` | https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_InferenceConfiguration.html |
| `AssociateAgentKnowledgeBase` | https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_AssociateAgentKnowledgeBase.html |
| `CreateAgentActionGroup` | https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_CreateAgentActionGroup.html |
| `CreateAgentAlias` | https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_CreateAgentAlias.html |

## 1. `CreateAgent` 请求体

注意：**请求体里没有知识库，也没有 action group** —— 两者都是关联/另建的资源。

```http
Request Syntax PUT /agents/ HTTP/1.1 Content-type: application/json { " agentCollaboration ": " string ", " agentName ": " string ", " agentResourceRoleArn ": " string ", " clientToken ": " string ", " customerEncryptionKeyArn ": " string ", " customOrchestration ": { " executor ": { ... } }, " description ": " string ", " foundationModel ": " string ", " guardrailConfiguration ": { " guardrailIdentifier ": " string ", " guardrailVersion ": " string " }, " idleSessionTTLInSeconds ": number , " instruction ": " string ", " memoryConfiguration ": { " enabledMemoryTypes ": [ " string " ], " sessionSummaryConfiguration ": { " maxRecentSessions ": number }, " storageDays ": number }, " orchestrationType ": " string ", " promptOverrideConfiguration ": { " overrideLambda ": " string ", " promptConfigurations ": [ { " additionalModelRequestFields ": JSON value , " basePromptTemplate ": " string ", " foundationModel ": " string ", " inferenceConfiguration ": { " maximumLength ": number , " stopSequences ": [ " string " ], " temperature ": number , " topK ": number , " topP ": number }, " parserMode ": " string ", " promptCreationMode ": " string ", " promptState ": " string ", " promptType ": " string " } ] }, " tags ": { " string " : " string " } }
```

## 2. `InferenceConfiguration`（生成参数成组）

```text
Contents maximumLength The maximum number of tokens to allow in the generated response. Type: Integer Valid Range: Minimum value of 0. Required: No stopSequences A list of stop sequences. A stop sequence is a sequence of characters that causes the model to stop generating the response. Type: Array of strings Array Members: Minimum number of 0 items. Maximum number of 4 items. Required: No temperature The likelihood of the model selecting higher-probability options while generating a response. A lower value makes the model more likely to choose higher-probability options, while a higher value makes the model more likely to choose lower-probability options. Type: Float Valid Range: Minimum value of 0. Maximum value of 1. Required: No topK While generating a response, the model determines the probability of the following token at each point of generation. The value that you set for topK is the number of most-likely candidates from which the model chooses the next token in the sequence. For example, if you set topK to 50, the model selects the next token from among the top 50 most likely choices. Type: Integer Valid Range: Minimum value of 0. Maximum value of 500. Required: No topP While generating a response, the model determines the probability of the following token at each point of generation. The value that you set for Top P determines the number of most-likely candidates from which the model chooses the next token in the sequence. For example, if you set topP to 0.8, the model only selects the next token from the top 80% of the probability distribution of next tokens. Type: Float Valid Range: Minimum value of 0. Maximum value of 1. Required: No
```

## 3. 知识库是**关联**进来的

```text
Associates a knowledge base with an agent. If a knowledge base is associated and its indexState is set to Enabled , the agent queries the knowledge base for information to augment its response to the user.
```

```http
Request Syntax PUT /agents/ agentId /agentversions/ agentVersion /knowledgebases/ HTTP/1.1 Content-type: application/json { " description ": " string ", " knowledgeBaseId ": " string ", " knowledgeBaseState ": " string " }
```

## 4. Action group 是另一个 API

```text
Creates an action group for an agent. An action group represents the actions that an agent can carry out for the customer by defining the APIs that an agent can call and the logic for calling them. To allow your agent to request the user for additional information when trying to complete a task, add an action group with the parentActionGroupSignature field set to AMAZON.UserInput . To allow your agent to generate, run, and troubleshoot code when trying to complete a task, add an action group with the parentActionGroupSignature field set to AMAZON.CodeInterpreter . You must leave the description , apiSchema , and actionGroupExecutor fields blank for this action group. During orchestration, if your agent determines that it needs to invoke an API in an action group, but doesn't have enough information to complete the API request, it will invoke this action group instead and return an Observ
```

## 5. 版本与别名（发布面）

```text
Creates an alias of an agent that can be used to deploy the agent.
```

```http
Request Syntax PUT /agents/ agentId /agentaliases/ HTTP/1.1 Content-type: application/json { " agentAliasName ": " string ", " clientToken ": " string ", " description ": " string ", " routingConfiguration ": [ { " agentVersion ": " string ", " provisionedThroughput ": " string " } ], " tags ": { " string " : " string " } }
```
