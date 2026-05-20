"""FastAPI application for the QA Agent Service."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import settings
from .schemas import AskRequest, AskResponse, RetrieveRequest, RetrieveResponse, SourceItem

logging.basicConfig(level=logging.INFO)
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
    )

    sources = [
        SourceItem(
            id=s.id,
            source_type=s.source_type,
            content=s.content,
            score=s.score,
            source_name=s.source_name,
            document_id=s.document_id,
            wiki_page_id=getattr(s, "wiki_page_id", None),
            wiki_space_id=getattr(s, "wiki_space_id", None),
        )
        for s in result.get("context", [])
    ]

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
