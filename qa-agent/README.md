# QA Agent Service

RAG-based question answering agent for openKMS knowledge bases, built with FastAPI and LangGraph.

## Architecture

- **FastAPI** web server with a single `/ask` endpoint
- **LangGraph** agent with two nodes: `retrieve` (vector search) and `generate` (LLM answer)
- **pgvector** retrieval from the shared openKMS PostgreSQL database (chunks + FAQs tables)
- **OpenAI-compatible** APIs for both embedding and LLM

## Setup

```bash
# Install dependencies
pip install -e .

# Copy and edit configuration
cp .env.example .env
# Edit .env with your database and model settings

# Run the server
python -m qa_agent.main
```

The server starts on port 8103 by default.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_HOST` | localhost | PostgreSQL host |
| `DATABASE_PORT` | 5432 | PostgreSQL port |
| `DATABASE_USER` | postgres | PostgreSQL user |
| `DATABASE_PASSWORD` | | PostgreSQL password |
| `DATABASE_NAME` | openkms | PostgreSQL database |
| `LLM_BASE_URL` | http://localhost:11434/v1 | LLM API base URL |
| `LLM_API_KEY` | no-key | LLM API key |
| `LLM_MODEL_NAME` | qwen2.5 | LLM model name |
| `EMBEDDING_BASE_URL` | http://localhost:11434/v1 | Embedding API base URL |
| `EMBEDDING_API_KEY` | no-key | Embedding API key |
| `EMBEDDING_MODEL_NAME` | nomic-embed-text | Embedding model name |
| `HOST` | 0.0.0.0 | Server bind host |
| `PORT` | 8103 | Server port |

## API

### POST /ask

Request:
```json
{
  "knowledge_base_id": "kb-uuid",
  "question": "How do I deploy the application?",
  "conversation_history": []
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

In the openKMS frontend, configure the **Agent URL** in Knowledge Base Settings to point to this service (e.g., `http://localhost:8103`). The openKMS backend will proxy Q&A requests to this agent.
