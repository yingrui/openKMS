# QA Agent Service

RAG-based question answering agent for openKMS knowledge bases, built with FastAPI and LangGraph. The agent does **not** access the database directly; it retrieves context via the openKMS backend API.

## Architecture

- **FastAPI** web server with **`POST /ask`** (JSON answer) and **`POST /ask/stream`** (NDJSON: `delta` {`t`}, optional **`tool_start` / `tool_end` / `tool_error`** like the wiki copilot stream, then `done` with `answer` and `sources`)
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
# Edit .env with backend URL and LLM settings

# Run the server
python -m qa_agent.main
```

The server starts on port 8103 by default.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENKMS_BACKEND_URL` | http://localhost:8102 | openKMS backend API base URL |
| `OPENKMS_LLM_MODEL_BASE_URL` | http://localhost:11434/v1 | LLM API base URL (normalized to a `.../v1` root for chat and rerank) |
| `OPENKMS_LLM_MODEL_API_KEY` | no-key | LLM API key |
| `OPENKMS_LLM_MODEL_NAME` | qwen2.5 | LLM model name |
| `OPENKMS_LLM_EXTRA_BODY` | unset | Optional JSON merged into ChatOpenAI **`extra_body`**. **Alias:** `OPENKMS_AGENT_LLM_EXTRA_BODY`. After merge, **`enable_thinking`** is forced **`false`** (same as wiki copilot). |
| `OPENKMS_LLM_REASONING_CONTENT_SHIM` | unset | **auto** when unset: inject empty **`reasoning_content`** on assistant rows for non-`api.openai.com` bases. **Aliases:** `OPENKMS_AGENT_LLM_REASONING_CONTENT_SHIM`, `OPENKMS_AGENT_DASHSCOPE_REASONING_SHIM`. |
| `OPENKMS_RERANK_BASE_URL` | (same as LLM base) | Optional separate OpenAI-compatible root for `POST …/v1/rerank` when the LLM host has no rerank route |
| `OPENKMS_RERANK_ENABLED` | true | Set `false` to skip rerank and use fused BM25+dense order only |
| `HOST` | 0.0.0.0 | Server bind host |
| `PORT` | 8103 | Server port |
| `LANGFUSE_SECRET_KEY` | - | Langfuse secret key (optional; enables tracing) |
| `LANGFUSE_PUBLIC_KEY` | - | Langfuse public key |
| `LANGFUSE_BASE_URL` | - | Langfuse host (e.g. https://cloud.langfuse.com or http://localhost:3002) |
| `LANGFUSE_TRACE_STREAMING` | false | When Langfuse is enabled, set `true` to trace `POST /ask/stream` as well (default off: avoids OpenTelemetry “detach context” noise with async streaming) |

When Langfuse keys are set, **`POST /ask`** (and the non-streaming fallback inside streaming) are traced. Streaming traces are opt-in via `LANGFUSE_TRACE_STREAMING`. The access token is kept in a **context variable** for tools so it is not copied into Langfuse metadata.

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
