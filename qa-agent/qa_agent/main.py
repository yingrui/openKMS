"""FastAPI application for the QA Agent Service."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import settings
from .langfuse_client import silence_otel_export_loggers
from .schemas import AskRequest, AskResponse, RetrieveRequest, RetrieveResponse, SourceItem

logging.basicConfig(level=logging.INFO)
silence_otel_export_loggers()
logger = logging.getLogger(__name__)

app = FastAPI(
    title="openKMS QA Agent",
    version="0.1.0",
    description="RAG-based question answering agent for openKMS knowledge bases",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest):
    """Answer a question using RAG + ontology tools against the knowledge base."""
    from .agent import invoke_agent

    result = invoke_agent(
        knowledge_base_id=request.knowledge_base_id,
        question=request.question,
        conversation_history=request.conversation_history,
        access_token=request.access_token or "",
        session_id=request.session_id,
    )

    sources: list[SourceItem] = []
    for s in result.get("context", []):
        if isinstance(s, SourceItem):
            sources.append(s)
        else:
            sources.append(SourceItem.model_validate(s))

    return AskResponse(
        answer=result.get("answer", ""),
        sources=sources,
    )


@app.post("/ask/stream")
async def ask_stream(request: AskRequest):
    """Stream answer as NDJSON: delta lines {type, t}, then done {type, answer, sources}."""
    from .agent import astream_agent_ndjson

    return StreamingResponse(
        astream_agent_ndjson(
            knowledge_base_id=request.knowledge_base_id,
            question=request.question,
            conversation_history=request.conversation_history,
            access_token=request.access_token or "",
            session_id=request.session_id,
        ),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/retrieve", response_model=RetrieveResponse)
async def retrieve_endpoint(request: RetrieveRequest):
    """Hybrid retrieval (BM25 + dense + RRF + rerank) without answer generation."""
    from .retriever import retrieve

    items = retrieve(
        knowledge_base_id=request.knowledge_base_id,
        query=request.query,
        access_token=request.access_token,
        top_k=request.top_k,
    )
    return RetrieveResponse(results=items)


def run():
    """Run the server with uvicorn."""
    import uvicorn
    uvicorn.run(
        "qa_agent.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )


if __name__ == "__main__":
    run()
