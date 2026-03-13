# QA Agent Service

RAG-based question answering agent for openKMS knowledge bases, built with FastAPI and LangGraph. The agent does **not** access the database directly; it retrieves context via the openKMS backend API.

## Architecture

- **FastAPI** web server with a single `/ask` endpoint
- **LangGraph** agent with two nodes: `retrieve` (calls backend search API) and `generate` (LLM answer)
- **Backend API** for retrieval: `POST /api/knowledge-bases/{id}/search` (semantic search over chunks and FAQs)
- **OpenAI-compatible** LLM for answer generation

The backend forwards the user's access token when calling the agent. The agent uses that token to call the backend search API, so search runs in the user's auth context.

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
| `LLM_BASE_URL` | http://localhost:11434/v1 | LLM API base URL |
| `LLM_API_KEY` | no-key | LLM API key |
| `LLM_MODEL_NAME` | qwen2.5 | LLM model name |
| `HOST` | 0.0.0.0 | Server bind host |
| `PORT` | 8103 | Server port |

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
