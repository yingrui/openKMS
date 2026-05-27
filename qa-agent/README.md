# QA Agent Service

RAG-based question answering agent for openKMS knowledge bases, built with FastAPI and LangGraph. The agent does **not** access the database directly; it retrieves context via the openKMS backend API.

## Architecture

- **FastAPI** web server with **`POST /ask`** (JSON answer) and **`POST /ask/stream`** (NDJSON: `delta` {`t`}, optional **`tool_start` / `tool_end` / `tool_error`** like the wiki copilot stream, then `done` with `answer` and `sources`). Response **`sources`**: hybrid retrieval hits unless **Page Index** (`get_section_content_tool` → **`document_section`**) or **ontology** (successful **`run_cypher_tool`** → **`ontology`** rows listing object types + query summaries). Optional body field **`session_id`** is forwarded as Langfuse **`langfuse_session_id`** so multi-turn Q&A groups under one **Session**.
- **LangGraph** agent with nodes: `retrieve` (KB search), `generate` (LLM with tools), `tools` (skill tools)
- **RAG**: `POST /api/knowledge-bases/{id}/search` (semantic search over chunks and FAQs)
- **LangGraph skills** (in `qa_agent/skills/`): ontology (Cypher/graph), page_index (document TOC navigation)
- **OpenAI-compatible** LLM for answer generation, with the same **`extra_body` / `enable_thinking` / `reasoning_content` shim** behavior as wiki copilot (see **Configuration** below and `docs/features/configuration.md`).

The backend forwards the user's access token when calling the agent. The agent uses that token to call the backend APIs (search, object-types, link-types, ontology/explore).

## LangGraph Skills

Skills are modules in `qa_agent/skills/` that provide tools and prompt fragments. The agent uses them when the question matches the skill domain.

### Ontology skill

For coverage/relationship questions (e.g. "Which insurance products cover heart attack?"):
- **get_ontology_schema_tool** – Fetches object types and link types from the backend
- **run_cypher_tool** – Executes read-only Cypher against Neo4j

### Page Index skill

For document-depth questions when search chunks are insufficient:
1. **read_table_of_contents_tool** – Get document structure (sections with start_line, end_line)
2. **select section** – LLM chooses relevant section by title
3. **get_section_content_tool** – Fetch markdown content for the section
4. **determine information-sufficient** – If yes → generate answer; if no → try another section
5. **generate answer** – Use extracted content, cite the section

## Setup

```bash
# Install dependencies
pip install -e .

# Copy and edit configuration
cp .env.example .env
# Set OPENKMS_BACKEND_URL and service auth (OPENKMS_QA_AGENT_* preferred; OPENKMS_CLI_* / OPENKMS_OIDC_* are compatibility aliases).
# LLM URL/model/key come from Console → Models default unless OPENKMS_LLM_MODEL_* overrides are set.

# Run the server
python -m qa_agent.main
```

The server starts on port 8103 by default.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENKMS_BACKEND_URL` | http://localhost:8102 | openKMS backend API base URL |
| `OPENKMS_QA_AGENT_AUTH_MODE` | (unset) | **`local`** or **`oidc`** — should match backend auth mode |
| `OPENKMS_QA_AGENT_BASIC_USER` / `OPENKMS_QA_AGENT_BASIC_PASSWORD` | (unset) | Local mode: HTTP Basic for backend model/config routes |
| `OPENKMS_QA_AGENT_OIDC_SERVICE_CLIENT_ID` / `OPENKMS_QA_AGENT_OIDC_SERVICE_CLIENT_SECRET` | (unset) | OIDC client credentials when not in local mode |
| `OPENKMS_LLM_MODEL_BASE_URL` | (from backend) | Optional override; when unset, qa-agent resolves via existing APIs: **`GET /api/models?category=llm`** + **`GET /api/models/{id}/config`** |
| `OPENKMS_LLM_MODEL_API_KEY` | (from backend) | Optional override |
| `OPENKMS_LLM_MODEL_NAME` | (from backend) | Optional override |
| `OPENKMS_LLM_EXTRA_BODY` | unset | Optional JSON merged into ChatOpenAI **`extra_body`**. **Alias:** `OPENKMS_AGENT_LLM_EXTRA_BODY`. After merge, **`enable_thinking`** is forced **`false`** (same as wiki copilot). |
| `OPENKMS_LLM_REASONING_CONTENT_SHIM` | unset | **auto** when unset: inject empty **`reasoning_content`** on assistant rows for non-`api.openai.com` bases. **Aliases:** `OPENKMS_AGENT_LLM_REASONING_CONTENT_SHIM`, `OPENKMS_AGENT_DASHSCOPE_REASONING_SHIM`. |
| `OPENKMS_RERANK_BASE_URL` | (same as LLM base) | Optional separate OpenAI-compatible root for `POST …/v1/rerank` when the LLM host has no rerank route |
| `OPENKMS_RERANK_ENABLED` | false | Set **`true`** when your `OPENKMS_RERANK_BASE_URL` (or LLM base) implements `POST …/v1/rerank`; otherwise fused BM25+dense order only (no extra HTTP) |
| `HOST` | 0.0.0.0 | Server bind host |
| `PORT` | 8103 | Server port |
| `LANGFUSE_SECRET_KEY` | - | Langfuse secret key (optional; enables tracing **only** with public key + **`LANGFUSE_BASE_URL`**) |
| `LANGFUSE_PUBLIC_KEY` | - | Langfuse public key |
| `LANGFUSE_BASE_URL` | - | **Required** for tracing (e.g. `https://cloud.langfuse.com` or `http://localhost:3002`). If unset, Langfuse is not used. |
| `LANGFUSE_HEALTHCHECK` | true | If **true**, probe ``GET {base}/api/public/health`` before attaching callbacks; while down, all requests skip Langfuse until the next retry. Set **false** to always attach callbacks (no probe). |
| `LANGFUSE_HEALTHCHECK_RETRY_SECONDS` | 60 | When the host is down, wait this many seconds before probing again (5–86400). |
| `LANGFUSE_TRACE_STREAMING` | true | When Langfuse is enabled, attach the callback to **`/ask/stream`** as well; set **`false`** to trace only **`/ask`** (avoids some OpenTelemetry **context detach** warnings on async streams) |

When **all three** Langfuse variables (secret, public, **base URL**) are set, **`/ask`** and (by default) **`/ask/stream`** are traced. Pass **`session_id`** on the ask body so traces share one Langfuse **Session**. The access token is kept in a **context variable** for tools so it is not copied into Langfuse metadata.

## API

### POST /ask

Request:
```json
{
  "knowledge_base_id": "kb-uuid",
  "question": "How do I deploy the application?",
  "conversation_history": [],
  "access_token": "Bearer token passed by backend"
}
```

Response:
```json
{
  "answer": "Based on the documentation...",
  "sources": [
    {
      "id": "chunk-uuid",
      "source_type": "chunk",
      "content": "...",
      "score": 0.92,
      "source_name": "deployment-guide.pdf",
      "document_id": "doc-uuid"
    }
  ]
}
```

## Integration

In the openKMS frontend, configure the **Agent URL** in Knowledge Base Settings to point to this service (e.g., `http://localhost:8103`). The openKMS backend will proxy Q&A requests to this agent, passing the user's access token so the agent can call the backend search API.
