"""FastAPI application for the QA Agent Service."""
import asyncio
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import settings
from .langfuse_client import silence_otel_export_loggers
from .logging_config import configure_logging, preview_text
from .schemas import (
    PromptPreviewRequest,
    PromptPreviewResponse,
    AskRequest,
    AskResponse,
    RetrieveRequest,
    RetrieveResponse,
    SourceItem,
    resolve_kb_id,
)

configure_logging(settings.log_level)
silence_otel_export_loggers()
logger = logging.getLogger(__name__)
logger.info("qa-agent recursion_limit=%d", settings.agent_recursion_limit)

@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Sweep idle session workspaces for as long as the service runs."""
    from .workspace_reaper import run_forever

    task = asyncio.create_task(run_forever())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title="openKMS QA Agent",
    version="0.1.0",
    description="RAG-based question answering agent for openKMS knowledge bases",
    lifespan=lifespan,
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


def _kb_or_400(path_kb_id: str | None, body_kb_id: str | None) -> str:
    try:
        return resolve_kb_id(path_kb_id, body_kb_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


async def _ask_impl(kb_id: str, request: AskRequest) -> AskResponse:
    from .agent import invoke_agent

    t0 = time.monotonic()
    logger.info(
        "POST ask kb=%s history=%d session=%s skills=%s",
        kb_id,
        len(request.conversation_history or []),
        request.session_id or "-",
        request.agent_skills,
    )
    logger.debug("POST ask question=%r", preview_text(request.question, 200))
    result = invoke_agent(
            knowledge_base_id=kb_id,
            question=request.question,
            conversation_history=request.conversation_history,
            access_token=request.access_token or "",
            session_id=request.session_id,
            agent_skills=request.agent_skills,
        agent_config=request.agent_config,
        installed_skills=request.installed_skills,
        system_prompt=request.system_prompt,
        prompt_version=request.prompt_version,
    )

    sources: list[SourceItem] = []
    for s in result.get("context", []):
        if isinstance(s, SourceItem):
            sources.append(s)
        else:
            sources.append(SourceItem.model_validate(s))

    answer = result.get("answer", "")
    logger.info(
        "POST ask done kb=%s elapsed=%.2fs answer_chars=%d sources=%d",
        kb_id,
        time.monotonic() - t0,
        len(answer or ""),
        len(sources),
    )
    grounding = result.get("grounding")
    return AskResponse(
        answer=answer,
        sources=sources,
        grounding=grounding,
        langfuse_trace_id=result.get("langfuse_trace_id"),
        prompt_version=result.get("prompt_version"),
        warnings=list(result.get("warnings") or []),
        verified=bool(result.get("verified", True)),
    )


def _stream_response(kb_id: str, request: AskRequest) -> StreamingResponse:
    from .agent import astream_agent_ndjson

    logger.info(
        "POST ask/stream kb=%s history=%d session=%s skills=%s",
        kb_id,
        len(request.conversation_history or []),
        request.session_id or "-",
        request.agent_skills,
    )
    logger.debug("POST ask/stream question=%r", preview_text(request.question, 200))
    return StreamingResponse(
        astream_agent_ndjson(
            knowledge_base_id=kb_id,
            question=request.question,
            conversation_history=request.conversation_history,
            access_token=request.access_token or "",
            session_id=request.session_id,
            agent_skills=request.agent_skills,
            agent_config=request.agent_config,
            system_prompt=request.system_prompt,
            prompt_version=request.prompt_version,
        ),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _prompt_preview_impl(kb_id: str, request: PromptPreviewRequest) -> PromptPreviewResponse:
    from . import agent_config as agent_config_module
    from .agent import _build_system_prompt

    config = request.agent_config
    skills = request.agent_skills
    base = agent_config_module.system_prompt(config)
    # The same call the answer path makes, with the retrieved passages replaced by a marker: they depend on the
    # question, and inventing sample passages would misrepresent what the model sees.
    system_prompt = _build_system_prompt(
        context=[],
        skills=skills,
        policy=agent_config_module.answer_policy(config),
        state_prompt=base,
        agents_md=agent_config_module.agents_md(config),
        installed_skills=request.installed_skills,
    ).replace(
        "Context from the knowledge base:\n\n",
        "Context from the knowledge base:\n<passages retrieved for this question>\n",
    )
    return PromptPreviewResponse(
        system_prompt=system_prompt,
        base_instruction=base,
        agents_md=agent_config_module.agents_md(config),
    )


def _retrieve_impl(kb_id: str, request: RetrieveRequest) -> RetrieveResponse:
    from .retriever import retrieve

    items = retrieve(
        knowledge_base_id=kb_id,
        query=request.query,
        access_token=request.access_token,
        top_k=request.top_k,
    )
    return RetrieveResponse(results=items)


@app.get("/knowledge-bases/{kb_id}/sessions/{session_id}/files")
async def list_session_files(kb_id: str, session_id: str):
    """What this conversation produced and what it was given.

    The workspace belonged to the agent until now: a user could be told "saved as industry_count.csv" and have no way to
    reach the file. The list is flat with sizes; the download endpoint serves the bytes.

    Trust: this service is called by the backend, which has already checked the caller's access to the KB — the same model as
    `/ask`, which also forwards a token rather than verifying one.
    """
    from . import session_fs

    try:
        root = session_fs.session_root(kb_id, session_id)
    except session_fs.SessionPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not root.is_dir():
        return {"session_id": session_id, "files": []}
    files: list[dict[str, object]] = []
    for entry in session_fs.list_dir(kb_id, session_id):
        if entry["is_dir"]:
            for child in session_fs.list_dir(kb_id, session_id, str(entry["path"])):
                if not child["is_dir"]:
                    files.append(child)
        else:
            files.append(entry)
    return {"session_id": session_id, "files": files}


@app.get("/knowledge-bases/{kb_id}/sessions/{session_id}/files/download")
async def download_session_file(kb_id: str, session_id: str, path: str):
    """One artifact, as bytes. Text and binary are both served as-is; this is a download, not a preview."""
    from fastapi.responses import FileResponse

    from . import session_fs

    try:
        target = session_fs.resolve_session_path(kb_id, session_id, path)
    except session_fs.SessionPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(target, filename=target.name)


@app.post("/knowledge-bases/{kb_id}/ask", response_model=AskResponse)
async def ask_for_kb(kb_id: str, request: AskRequest):
    """Answer a question against the knowledge base named in the path."""
    kid = _kb_or_400(kb_id, request.knowledge_base_id)
    return await _ask_impl(kid, request)


@app.post("/knowledge-bases/{kb_id}/ask/stream")
async def ask_stream_for_kb(kb_id: str, request: AskRequest):
    """Stream answer as NDJSON for the knowledge base named in the path."""
    kid = _kb_or_400(kb_id, request.knowledge_base_id)
    return _stream_response(kid, request)


@app.post("/knowledge-bases/{kb_id}/prompt-preview", response_model=PromptPreviewResponse)
async def prompt_preview_for_kb(kb_id: str, request: PromptPreviewRequest):
    """The system prompt as it is actually assembled, plus the text that becomes AGENTS.md.

    Uses the same builder the answer path uses, so this is the text the model receives rather than a description of
    it. Retrieved context is the one part that cannot be rendered without a question: it is shown as a marker where
    the passages are inserted.
    """
    kid = _kb_or_400(kb_id, request.knowledge_base_id)
    return _prompt_preview_impl(kid, request)


@app.post("/knowledge-bases/{kb_id}/retrieve", response_model=RetrieveResponse)
async def retrieve_for_kb(kb_id: str, request: RetrieveRequest):
    """Hybrid retrieval without answer generation."""
    kid = _kb_or_400(kb_id, request.knowledge_base_id)
    return _retrieve_impl(kid, request)


def run():
    """Run the server with uvicorn, without a reloader — the plain start, as in the container."""
    import uvicorn

    uvicorn.run(
        "qa_agent.main:app",
        host=settings.host,
        port=settings.port,
    )


if __name__ == "__main__":
    run()
