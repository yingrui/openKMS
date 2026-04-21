# QA Agent 开发者教程

面向已读过 `qa-agent/README.md`、本地起好 backend / frontend 的开发者。本教程解决 4 个问题：

1. **Quickstart** — 起 qa-agent、连上 KB、端到端问出第一个答案
2. **Skills** — 看懂现有 ontology / page_index skill，并动手加一个新 skill
3. **配置与调优** — env 之外还能调什么
4. **排错** — 常见现象速查

> API schema、env var 完整表见 `qa-agent/README.md`；全局架构图见 `docs/architecture.md`。本教程不重复。

---

## 0. 它是什么，在哪条路径上

qa-agent 是一个**独立的 FastAPI + LangGraph 服务**，默认跑在 `:8103`。它**不直接连数据库**，所有检索 / ontology / page-index 都走 backend API，backend 再把登录用户的 JWT 透传给 agent。

请求流转：

```
Frontend (KB Detail → Q&A tab)
  │  POST /api/knowledge-bases/{kb_id}/ask
  ▼
Backend (app/api/knowledge_bases.py:655-690)       ← 代理、120s 超时
  │  POST {kb.agent_url}/ask  + user JWT
  ▼
qa-agent (qa_agent/main.py:33-60)
  │  invoke_agent()
  ▼
LangGraph: retrieve → generate → (tools → generate)* → END
            │             │
            │             └── ChatOpenAI.bind_tools(skills)
            └── POST {backend}/api/knowledge-bases/{id}/search  (用 JWT)
```

关键源码锚点：

| 角色 | 路径 |
|---|---|
| Agent HTTP 入口 | `qa-agent/qa_agent/main.py:33-60` |
| LangGraph 定义 | `qa-agent/qa_agent/agent.py:110-126` |
| 检索节点 | `qa-agent/qa_agent/agent.py:27-35` |
| 生成节点 | `qa-agent/qa_agent/agent.py:59-96` |
| System prompt 拼装 | `qa-agent/qa_agent/agent.py:38-56` |
| Skill 注册 | `qa-agent/qa_agent/skills/__init__.py` |
| Backend 代理 | `backend/app/api/knowledge_bases.py:655-690` |
| KB 的 `agent_url` 字段 | `backend/app/models/knowledge_base.py:25` |
| 前端 QA tab | `frontend/src/pages/KnowledgeBaseDetail.tsx`（tab `qa`, `handleAsk` L696-714） |

---

## 1. Quickstart：端到端跑第一次提问

### 1.1 前置

- backend 在 `:8102`、frontend 在 `:5173`（或 vite 自动分配的端口）、postgres/minio 起着
- 至少有一个 KB，里面至少有一篇 `status=completed` 的 document，**且 chunks 已 embed**（看 `chunks.embedding` 非空）
- KB 的 `embedding_model_id` 指向一个可用的 embedding 服务
- 手头有一个 OpenAI 兼容的 LLM endpoint（任选：SiliconFlow / DeepSeek / OpenRouter / 本地 Ollama）

环境不齐的话，补一下 `docs/for developer/dev_environment_setup.md`。

### 1.2 装 + 配 + 起

```bash
cd qa-agent
pip install -e .
cp .env.example .env
```

编辑 `.env`（最小可用）：

```bash
OPENKMS_BACKEND_URL=http://localhost:8102
OPENKMS_LLM_MODEL_BASE_URL=https://api.siliconflow.cn/v1
OPENKMS_LLM_MODEL_API_KEY=sk-xxxxxxxx
OPENKMS_LLM_MODEL_NAME=Qwen/Qwen2.5-72B-Instruct
PORT=8103
```

起服务：

```bash
./dev.sh          # 或 python -m qa_agent.main
curl -s localhost:8103/health
# {"status":"ok"}
```

### 1.3 在 KB 里接上 agent

打开前端 → 进入目标 KB → **Settings** tab → 填 **Agent URL**：

```
http://localhost:8103
```

保存后，`Q&A` tab 才会显示（见 `KnowledgeBaseDetail.tsx:770` 的 `tab.id !== 'qa' || Boolean(kb?.agent_url)`）。

### 1.4 问第一个问题

前端走 `Q&A` tab 输入问题即可。如果想绕过前端直接打 agent：

```bash
# 拿到一个登录用户的 JWT（前端 localStorage 或 /api/auth/login 返回）
TOKEN="eyJhbGc..."
KB="11111111-2222-..."

curl -sX POST http://localhost:8103/ask \
  -H "Content-Type: application/json" \
  -d "$(cat <<EOF
{
  "knowledge_base_id": "${KB}",
  "question": "这个文档里说的免赔额是多少？",
  "conversation_history": [],
  "access_token": "${TOKEN}"
}
EOF
)" | jq .
```

返回结构（见 `qa-agent/qa_agent/schemas.py`）：

```json
{
  "answer": "...",
  "sources": [
    {"id":"...","source_type":"chunk","score":0.87,"source_name":"policy.pdf","document_id":"..."}
  ]
}
```

> 直接打 agent 时 `access_token` 要用**未带 `Bearer ` 前缀**的原始 JWT —— backend 代理时会把 `Authorization` header 里的值原样透传（见 `knowledge_bases.py:676`）。

---

## 2. Skills：机制 + 写一个新 skill

### 2.1 机制速览

Skill 是放在 `qa_agent/skills/` 下的模块，每个 skill 暴露两样东西：

1. `*_tools: list[BaseTool]` — LangChain tools，带 `@tool` 装饰
2. `*_PROMPT: str` — 一句话告诉 LLM 这个 skill 什么时候用

`skills/__init__.py` 把所有 tools 聚合：

```python
# skills/__init__.py
def get_all_skill_tools() -> list:
    return [*ontology_tools, *page_index_tools]

def get_skill_prompt_fragments() -> str:
    return ONTOLOGY_PROMPT + "\n\n" + PAGE_INDEX_PROMPT
```

这两个函数分别被 `agent.py:71`（`bind_tools`）和 `agent.py:45`（拼进 system prompt）调用。

**Token 透传**：tools 通过 `RunnableConfig` 参数拿 JWT：

```python
def _get_access_token(config: RunnableConfig) -> str:
    return config.get("configurable", {}).get("access_token", "")
```

这条 config 从 `agent.py:74` / `agent.py:159` 的 `{"configurable": {"access_token": ...}}` 注入。

### 2.2 现有两个 skill

**Ontology skill**（`qa_agent/skills/ontology.py`）

- 场景：涉及关系 / 覆盖面的问题，如 "哪些产品覆盖心梗？"
- 流程：`get_ontology_schema_tool` 拉出 node label + rel type → LLM 写 Cypher → `run_cypher_tool` 执行
- 依赖：backend 的 `/api/object-types`、`/api/link-types`、`/api/ontology/explore`

**Page Index skill**（`qa_agent/skills/page_index.py`）

- 场景：chunk 片段不足以回答、需要整节原文时
- 流程：`read_table_of_contents_tool` 拿 TOC → LLM 选节 → `get_section_content_tool` 取该 section 的 markdown（按行号切片）
- 适合：长文档里「第 X 条细则是什么」这类问题

Langfuse 开了之后，可以在一条 trace 里看到 `retrieve → generate → tools(name=run_cypher_tool) → generate → END` 的完整路径。

### 2.3 写一个新 skill：`glossary`（术语表查询）最小例

假设 backend 有一个假想的 `GET /api/glossary?term=X` 返回某个术语解释。要把它做成 skill：

**第一步** — 新建 `qa_agent/skills/glossary.py`：

```python
"""LangGraph skill: glossary term lookup."""
import httpx
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..config import settings


def _get_access_token(config: RunnableConfig) -> str:
    return config.get("configurable", {}).get("access_token", "")


@tool
def lookup_term_tool(term: str, _config: RunnableConfig) -> str:
    """Look up the definition of a domain term (e.g. 'deductible', '免赔额') from the glossary.
    Use this BEFORE answering when the question contains jargon you are not sure about."""
    if not term or not term.strip():
        return "Error: term cannot be empty."
    try:
        token = _get_access_token(_config)
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        r = httpx.get(
            f"{settings.openkms_backend_url}/api/glossary",
            params={"term": term.strip()},
            headers=headers,
            timeout=30.0,
        )
        r.raise_for_status()
        return r.text
    except Exception as e:
        return f"Error looking up term: {e}"


glossary_tools = [lookup_term_tool]

GLOSSARY_PROMPT = (
    "**Glossary skill** – When the question contains a domain term you're unsure about, "
    "call lookup_term_tool(term) first to get its definition before answering."
)
```

**第二步** — 在 `qa_agent/skills/__init__.py` 里注册：

```python
from .glossary import glossary_tools         # ← add

def get_all_skill_tools() -> list:
    return [*ontology_tools, *page_index_tools, *glossary_tools]   # ← add

def get_skill_prompt_fragments() -> str:
    from .ontology import ONTOLOGY_PROMPT
    from .page_index import PAGE_INDEX_PROMPT
    from .glossary import GLOSSARY_PROMPT                          # ← add
    return "\n\n".join([ONTOLOGY_PROMPT, PAGE_INDEX_PROMPT, GLOSSARY_PROMPT])
```

**第三步** — 重启 agent (`./dev.sh`)，问一个包含术语的问题，trace 里应能看到 `lookup_term_tool` 被调用。

几条注意事项：

- **Tool docstring 就是工具说明**。LLM 只看 docstring 决定用不用；写清楚「什么时候用」「输入是什么」。
- **`_config` 参数名前缀下划线**告诉 LangChain 这是 runtime-injected 的，不暴露给 LLM（对比 `term: str` 是 LLM 会填的）。
- **错误处理**：返回错误字符串而不是抛异常，LLM 能读到并自行恢复（比如换一个 term 重试）。

---

## 3. 配置与调优

### 3.1 env var（README 没讲的 "什么时候改"）

| 变量 | 改的场景 |
|---|---|
| `OPENKMS_LLM_MODEL_BASE_URL` | 切 provider 时改。代码会自动补 `/v1`（`agent.py:61-63`），所以 `https://api.siliconflow.cn` 和 `https://api.siliconflow.cn/v1` 都行 |
| `OPENKMS_LLM_MODEL_NAME` | 换模型时改。必须是 provider 认识的字符串（如 `Qwen/Qwen2.5-72B-Instruct`、`deepseek-chat`、`qwen2.5:7b`） |
| `OPENKMS_BACKEND_URL` | 仅在部署拓扑变了时改；docker 里常是 `http://backend:8102`，本地是 `http://localhost:8102` |
| `LANGFUSE_*` | 3 个都填才会启用（`config.py:28-29`），少一个就静默不开 |

### 3.2 源码里可调的硬编码值

README 没写但你可能想调的：

| 值 | 位置 | 默认 | 调的时机 |
|---|---|---|---|
| LLM `temperature` | `qa_agent/agent.py:69` | `0.3` | 事实性 QA 建议 ≤0.3；开放式/对话式可到 0.6–0.8 |
| 检索 `top_k` | `qa_agent/agent.py:33-34` | `5` | chunk 粒度细时调到 8–10；token 预算紧时降到 3 |
| httpx timeout（agent → backend） | `retriever.py` / `ontology_client.py` / `page_index_client.py` | `30s` | Cypher 慢查询或大 section 需要提到 60s |
| Backend → agent 超时 | `backend/app/api/knowledge_bases.py:669` | `120s` | 用 reasoning / thinking 模型（例如 DeepSeek-R1）时提到 300s |

这几个都**不是 env 驱动**，改完要重启对应的服务。

### 3.3 切 LLM provider 速查

| Provider | `OPENKMS_LLM_MODEL_BASE_URL` | 示例 `OPENKMS_LLM_MODEL_NAME` |
|---|---|---|
| SiliconFlow | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-72B-Instruct` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-sonnet-4` |
| Ollama（本地） | `http://localhost:11434/v1` | `qwen2.5:7b` |

### 3.4 Langfuse 开起来

```bash
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com    # 或 self-host 地址
```

启用后每次 `/ask` 都会在 Langfuse 里生成一条 trace，能看到 retrieve 的 top_k 结果、每次 LLM 调用的 prompt/response、tool call 的 input/output。调 prompt 和排查「为什么没触发某 skill」都靠它。

---

## 4. 排错速查

| 症状 | 根因 | 修法 |
|---|---|---|
| 前端 `Q&A` tab 不显示 | KB 的 `agent_url` 为空 | Settings tab 填 `http://localhost:8103` 并保存 |
| 前端点 Ask 返回 502 `Could not reach agent service` | agent 没起 / 地址不对 | `curl {agent_url}/health`；注意 docker 里要用 `host.docker.internal:8103` 或 docker 网络名 |
| Agent 日志 `401 Unauthorized` | 用户 JWT 过期 / auth 模式不一致 | 前端重登；确认 backend `.env` 的 `OPENKMS_AUTH_MODE` 和前端 `VITE_AUTH_MODE` 一致 |
| `answer` 出了但 `sources` 为空 | chunks 没 embedding 或 KB 的 `embedding_model_id` 维度和当前 embedding API 对不上 | `SELECT COUNT(*) FROM chunks WHERE embedding IS NULL AND knowledge_base_id=...`；向量维度不符时重跑 index 管线 |
| LLM 报 `connection refused` / 404 | `OPENKMS_LLM_MODEL_BASE_URL` 格式不对 | 代码会自动补 `/v1`（`agent.py:61-63`），但别自己加 `/chat/completions` |
| Langfuse 里看不到 trace | 三个 `LANGFUSE_*` 少填一个，或 base URL 不通 | `config.py:28-29` 双键判断；`curl $LANGFUSE_BASE_URL` 看通不通 |
| Page Index 工具报 `section content empty` | 文档 `status` 不是 `completed` 或 `markdown` 字段为空 | `GET /api/documents/{id}` 看 `status` 和 `markdown` 是否都有值；没有就重跑 pipeline |
| Ontology 工具返回 `Error executing Cypher: ...` | Cypher 不是只读 / label 写错 | 只允许 `MATCH/RETURN/WHERE`；先让 LLM 调 `get_ontology_schema_tool` 再写 Cypher |
| 回答里没引用 source | chunk 检索分数过低（LLM 觉得不相关） | 调高 `top_k` 或换更贴题的 embedding 模型 |

---

## 5. 进一步阅读

- `qa-agent/README.md` — env / API schema 参考
- `docs/architecture.md` — 系统级组件图、时序
- `backend/app/api/knowledge_bases.py:655-690` — backend 代理实现
- `backend/app/services/kb_search.py` — pgvector 余弦检索
- `qa-agent/qa_agent/agent.py` — LangGraph 主图，调 prompt / 加节点都看这里
