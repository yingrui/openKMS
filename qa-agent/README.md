# QA Agent Service

RAG-based question answering agent for openKMS knowledge bases, built with FastAPI and LangGraph. The agent does **not** access the database directly; it retrieves context via the openKMS backend API.

## Architecture

- **FastAPI** web server with a single `/ask` endpoint
- **LangGraph** agent with nodes: `retrieve` (KB search), `generate` (LLM with tools), `tools` (skill tools)
- **RAG**: `POST /api/knowledge-bases/{id}/search` (semantic search over chunks and FAQs)
- **LangGraph skills** (in `qa_agent/skills/`): ontology (Cypher/graph), page_index (document TOC navigation)
- **OpenAI-compatible** LLM for answer generation

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
| `OPENKMS_LLM_MODEL_BASE_URL` | http://localhost:11434/v1 | LLM API base URL |
| `OPENKMS_LLM_MODEL_API_KEY` | no-key | LLM API key |
| `OPENKMS_LLM_MODEL_NAME` | qwen2.5 | LLM model name |
| `HOST` | 0.0.0.0 | Server bind host |
| `PORT` | 8103 | Server port |
| `LANGFUSE_SECRET_KEY` | - | Langfuse secret key (optional; enables tracing) |
| `LANGFUSE_PUBLIC_KEY` | - | Langfuse public key |
| `LANGFUSE_BASE_URL` | - | Langfuse host (e.g. https://cloud.langfuse.com or http://localhost:3002) |

When Langfuse keys are set, agent runs are traced for observability (LLM calls, tool invocations, graph steps).

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
