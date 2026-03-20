# QA Agent Service

RAG-based question answering agent for openKMS knowledge bases, built with FastAPI and LangGraph. The agent does **not** access the database directly; it retrieves context via the openKMS backend API.

## Architecture

- **FastAPI** web server with a single `/ask` endpoint
- **LangGraph** agent with nodes: `retrieve` (KB search), `generate` (LLM with tools), `tools` (ontology tools)
- **RAG**: `POST /api/knowledge-bases/{id}/search` (semantic search over chunks and FAQs)
- **Ontology skills**: Tools to query object types, link types, and execute Cypher against Neo4j
- **OpenAI-compatible** LLM for answer generation

The backend forwards the user's access token when calling the agent. The agent uses that token to call the backend APIs (search, object-types, link-types, ontology/explore).

## Ontology Skills

For questions about relationships and coverage (e.g. "Which insurance products cover heart attack?"):

1. **get_ontology_schema_tool** – Fetches object types (node labels) and link types (relationships) from the backend. Use to learn the graph structure.
2. **run_cypher_tool** – Executes read-only Cypher queries against Neo4j. Use after getting the schema to query the graph.

The agent automatically calls these tools when the question relates to ontology/coverage. Example flow: user asks "Which products cover heart attack?" → agent calls `get_ontology_schema_tool` → agent generates Cypher (e.g. `MATCH (d:Disease)-[:COVERS]-(p:Insurance_Product) WHERE d.name CONTAINS 'heart' RETURN p.name`) → agent calls `run_cypher_tool` → agent formats the answer.

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
