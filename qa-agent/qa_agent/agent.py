"""LangGraph RAG agent with skills: KB search, ontology (Cypher), page_index (document TOC)."""
import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated, Any, Literal

from langchain_core.messages import AIMessage
from langgraph.errors import GraphRecursionError
from langgraph.graph import StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict

from .config import openai_v1_base, settings
from .llm_chat import build_messages_for_generate, make_qa_chat_openai, text_from_lc_content
from .request_context import reset_request_access_token, set_request_access_token
from .retriever import retrieve
from .schemas import SourceItem
from .skills import get_all_skill_tools, get_skill_prompt_fragments


class AgentState(TypedDict):
    knowledge_base_id: str
    question: str
    conversation_history: list[dict[str, str]]
    access_token: str
    context: list[SourceItem]
    messages: Annotated[list, add_messages]
    answer: str


def retrieve_node(state: dict[str, Any]) -> dict[str, Any]:
    """Retrieve relevant context from the knowledge base via backend search API."""
    if state.get("context"):
        return {}
    sources = retrieve(
        state["knowledge_base_id"],
        state["question"],
        access_token=state["access_token"],
        top_k=5,
    )
    return {"context": sources}


def _build_system_prompt(context: list[SourceItem]) -> str:
    def _source_ref(s: SourceItem) -> str:
        parts = []
        if s.document_id:
            parts.append(f"document_id={s.document_id}")
        if s.wiki_page_id:
            parts.append(f"wiki_page_id={s.wiki_page_id}")
        if s.wiki_space_id:
            parts.append(f"wiki_space_id={s.wiki_space_id}")
        return f" [{' '.join(parts)}]" if parts else ""

    context_text = "\n\n---\n\n".join(
        f"[{s.source_type}] {s.source_name or 'FAQ'} (relevance: {s.score:.0%}){_source_ref(s)}:\n{s.content}"
        for s in context
    )
    skill_prompt = get_skill_prompt_fragments()
    return (
        "You are a helpful assistant answering questions based on a knowledge base, document structure (Page Index), and a knowledge graph (ontology).\n\n"
        "You have three sources:\n"
        "1. **Knowledge base** – Document chunks and FAQs (context below). Use for questions about documents, policies, procedures.\n"
        "2. **Page Index skill** – Navigate documents by table of contents when chunks are insufficient. See skill workflow below.\n"
        "3. **Ontology skill** – Query Neo4j for relationships and coverage. See skill workflow below.\n\n"
        f"{skill_prompt}\n\n"
        "Context from the knowledge base:\n"
        f"{context_text}\n\n"
        "If the context or skills don't provide enough information, say so honestly. Cite sources when possible."
    )


def generate_node(state: dict[str, Any]) -> dict[str, Any]:
    """Generate answer using LLM with RAG context and ontology tools."""
    base_url = openai_v1_base(settings.llm_base_url)

    llm = make_qa_chat_openai(
        base_url=base_url,
        api_key=settings.llm_api_key,
        model_name=settings.llm_model_name,
        temperature=0.3,
        streaming=True,
    )
    tools = get_all_skill_tools()
    llm_with_tools = llm.bind_tools(tools)

    messages = build_messages_for_generate(
        context_prompt=_build_system_prompt(state["context"]),
        conversation_history=state["conversation_history"],
        question=state["question"],
        existing_graph_messages=list(state.get("messages") or []),
    )

    response = llm_with_tools.invoke(messages)

    if not response.tool_calls:
        return {"answer": text_from_lc_content(response.content), "messages": messages + [response]}

    return {"messages": messages + [response]}


def should_continue(state: dict[str, Any]) -> Literal["tools", "__end__"]:
    """Route to tools node if there are tool calls, else end."""
    messages = state.get("messages", [])
    if not messages:
        return "__end__"
    last = messages[-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return "__end__"


def build_graph() -> StateGraph:
    """Build the RAG + ontology agent graph."""
    graph = StateGraph(AgentState)

    tools = get_all_skill_tools()
    tool_node = ToolNode(tools)

    graph.add_node("retrieve", retrieve_node)
    graph.add_node("generate", generate_node)
    graph.add_node("tools", tool_node)

    graph.add_edge("retrieve", "generate")
    graph.add_conditional_edges("generate", should_continue)
    graph.add_edge("tools", "generate")
    graph.set_entry_point("retrieve")

    return graph


def _extract_answer(state: dict[str, Any]) -> str:
    """Extract final answer from the last non-tool AIMessage."""
    messages = state.get("messages", [])
    for m in reversed(messages):
        if isinstance(m, AIMessage) and not m.tool_calls:
            t = text_from_lc_content(m.content).strip()
            if t:
                return t
    return ""


_compiled_graph = None


def get_agent():
    """Get the compiled agent graph (singleton)."""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_graph().compile()
    return _compiled_graph


def invoke_agent(
    knowledge_base_id: str,
    question: str,
    conversation_history: list[dict[str, str]],
    access_token: str,
) -> dict[str, Any]:
    """Invoke the agent and return answer + sources."""
    from .langfuse_client import get_langfuse_callback

    h = set_request_access_token(access_token or "")
    try:
        agent = get_agent()
        config: dict[str, Any] = {}
        callback = get_langfuse_callback()
        if callback:
            config["callbacks"] = [callback]
        result = agent.invoke(
            {
                "knowledge_base_id": knowledge_base_id,
                "question": question,
                "conversation_history": conversation_history,
                "access_token": access_token,
                "context": [],
                "messages": [],
                "answer": "",
            },
            config=config,
        )
        if callback and hasattr(callback, "flush"):
            callback.flush()
        answer = _extract_answer(result)
        return {"answer": answer, "context": result.get("context", [])}
    finally:
        reset_request_access_token(h)


def _ndjson_line(obj: dict[str, Any]) -> bytes:
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")


def _tool_io_preview(x: Any, max_len: int) -> str:
    """JSON-serializable string for tool args/results (NDJSON line size bound)."""
    if x is None:
        return ""
    try:
        s = x if isinstance(x, str) else json.dumps(x, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        s = str(x)
    if len(s) > max_len:
        return s[: max_len - 18] + "…[truncated]"
    return s


def _stream_chunk_text(chunk: object) -> str:
    """Token/segment text from LangGraph ``on_chat_model_stream`` chunks."""
    if chunk is None:
        return ""
    content = getattr(chunk, "content", None)
    if not content:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text" and block.get("text"):
                parts.append(str(block["text"]))
        return "".join(parts)
    return str(content)


def _sources_to_jsonable(sources: list[SourceItem]) -> list[dict[str, Any]]:
    return [s.model_dump(mode="json") for s in sources]


async def astream_agent_ndjson(
    knowledge_base_id: str,
    question: str,
    conversation_history: list[dict[str, str]],
    access_token: str,
) -> AsyncIterator[bytes]:
    """NDJSON stream: ``delta`` / ``tool_*`` events (wiki-copilot-compatible), then ``done`` or ``error``."""
    from .langfuse_client import get_langfuse_callback

    h = set_request_access_token(access_token or "")
    try:
        ctx = retrieve(
            knowledge_base_id,
            question,
            access_token=access_token,
            top_k=5,
        )
        state: dict[str, Any] = {
            "knowledge_base_id": knowledge_base_id,
            "question": question,
            "conversation_history": conversation_history,
            "access_token": access_token,
            "context": ctx,
            "messages": [],
            "answer": "",
        }
        agent = get_agent()
        config: dict[str, Any] = {}
        callback = get_langfuse_callback() if settings.langfuse_trace_streaming else None
        if callback:
            config["callbacks"] = [callback]

        buf: list[str] = []
        try:
            async for ev in agent.astream_events(state, config, version="v2"):  # type: ignore[union-attr]
                ename = (ev.get("event") or "") if isinstance(ev, dict) else ""
                if ename == "on_chat_model_stream":
                    ch = (ev.get("data") or {}).get("chunk")
                    t = _stream_chunk_text(ch)
                    if t:
                        buf.append(t)
                        yield _ndjson_line({"type": "delta", "t": t})
                elif ename == "on_tool_start":
                    name = (ev.get("name") or "tool").split("/")[-1]
                    data = ev.get("data") or {}
                    inp = data.get("input")
                    run_id = str(ev.get("run_id") or "")
                    yield _ndjson_line(
                        {
                            "type": "tool_start",
                            "run_id": run_id,
                            "name": name,
                            "input": _tool_io_preview(inp, 6_000),
                        }
                    )
                elif ename == "on_tool_end":
                    data = ev.get("data") or {}
                    out = data.get("output")
                    run_id = str(ev.get("run_id") or "")
                    name = (ev.get("name") or "tool").split("/")[-1]
                    yield _ndjson_line(
                        {
                            "type": "tool_end",
                            "run_id": run_id,
                            "name": name,
                            "output": _tool_io_preview(out, 10_000),
                        }
                    )
                elif ename == "on_tool_error":
                    data = ev.get("data") or {}
                    err = data.get("error")
                    err_s = str(err) if err is not None else "Tool error"
                    run_id = str(ev.get("run_id") or "")
                    name = (ev.get("name") or "tool").split("/")[-1]
                    yield _ndjson_line(
                        {
                            "type": "tool_error",
                            "run_id": run_id,
                            "name": name,
                            "error": _tool_io_preview(err_s, 2_000),
                        }
                    )
        except GraphRecursionError as e:
            yield _ndjson_line(
                {"type": "error", "detail": f"Recursion limit exceeded: {e!s}", "answer": "".join(buf)}
            )
            if callback and hasattr(callback, "flush"):
                callback.flush()
            return
        except Exception as e:
            yield _ndjson_line({"type": "error", "detail": str(e) or type(e).__name__, "answer": "".join(buf)})
            if callback and hasattr(callback, "flush"):
                callback.flush()
            return

        answer = "".join(buf)
        sources_list: list[SourceItem] = list(ctx)
        if not answer.strip():
            result = await asyncio.to_thread(
                invoke_agent,
                knowledge_base_id,
                question,
                conversation_history,
                access_token,
            )
            answer = result.get("answer", "") or ""
            sources_list = list(result.get("context") or ctx)
            if answer:
                yield _ndjson_line({"type": "delta", "t": answer})

        yield _ndjson_line({"type": "done", "answer": answer, "sources": _sources_to_jsonable(sources_list)})
        if callback and hasattr(callback, "flush"):
            callback.flush()
    finally:
        reset_request_access_token(h)
