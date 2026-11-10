"""LangGraph RAG agent with skills: KB search, ontology (Cypher), page_index (document TOC)."""
import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Annotated, Any, Literal

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict

from .config import settings
from .llm_config import get_effective_llm_config
from .logging_config import preview_text
from .kb_answer_sources import (
    ONTOLOGY_SCHEMA_TOOL_NAME,
    PAGE_SECTION_TOOL_NAME,
    RUN_CYPHER_TOOL_NAME,
    extract_cypher_run_from_tool,
    extract_schema_names_from_tool_output,
    select_display_sources,
    source_from_catalog_tool,
    source_from_page_section_tool,
)
from . import agent_config as agent_config_module
from .evidence import ground, label_sources
from .llm_chat import build_messages_for_generate, make_qa_chat_openai, text_from_lc_content
from .request_context import (
    reset_request_access_token,
    reset_request_knowledge_base_id,
    reset_request_session_id,
    set_request_access_token,
    set_request_knowledge_base_id,
    set_request_session_id,
)
from .retriever import retrieve
from .schemas import SourceItem
from .skills import (
    get_all_skill_tools,
    get_skill_prompt_fragments,
    get_union_skill_tools,
    normalize_skill_ids,
)

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    knowledge_base_id: str
    question: str
    conversation_history: list[dict[str, str]]
    access_token: str
    context: list[SourceItem]
    messages: Annotated[list, add_messages]
    answer: str
    agent_skills: list[str]
    #: Retrieval depth for this request, from the KB's agent_config (defaults to 5).
    top_k: int
    #: Tool rounds this request may use, from `orchestration.max_tool_rounds` (None = no bound).
    max_tool_rounds: int | None


def retrieve_node(state: dict[str, Any]) -> dict[str, Any]:
    """Retrieve relevant context from the knowledge base via backend search API."""
    if state.get("context"):
        logger.debug("retrieve_node skip (context already set)")
        return {}
    kb_id = state["knowledge_base_id"]
    sources = retrieve(
        state["knowledge_base_id"],
        state["question"],
        access_token=state["access_token"],
        top_k=int(state.get("top_k") or 5),
    )
    logger.info("retrieve_node kb=%s hits=%d", kb_id, len(sources))
    logger.debug("retrieve_node question=%r", preview_text(state.get("question"), 120))
    return {"context": sources}


def _build_system_prompt(context: list[SourceItem], skills: list[str] | None) -> str:
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
    skill_ids = normalize_skill_ids(skills)
    skill_prompt = get_skill_prompt_fragments(skill_ids)
    return (
        "You are a helpful assistant answering questions based on **this** knowledge base "
        "(and only the skills enabled for it). Do not invent a different product domain "
        "(e.g. insurance) unless the retrieved context or enabled skills are about that domain.\n\n"
        "Sources you may use:\n"
        "1. **Knowledge base** – Document chunks and FAQs (context below).\n"
        "2. **Enabled skills** – described next (only these tools are available).\n\n"
        f"{skill_prompt}\n\n"
        "Context from the knowledge base:\n"
        f"{context_text}\n\n"
        "If the context or skills don't provide enough information, say so honestly. Cite sources when possible."
    )


def generate_node(state: dict[str, Any]) -> dict[str, Any]:
    """Generate answer using LLM with RAG context and ontology tools."""
    llm_cfg = get_effective_llm_config()
    base_url = llm_cfg.openai_v1_base_url

    llm = make_qa_chat_openai(
        base_url=base_url,
        api_key=llm_cfg.api_key,
        model_name=llm_cfg.model_name,
        temperature=0.3,
        streaming=True,
    )
    skill_ids = normalize_skill_ids(state.get("agent_skills"))
    tools = get_all_skill_tools(skill_ids)
    llm_with_tools = llm.bind_tools(tools)

    messages = build_messages_for_generate(
        context_prompt=_build_system_prompt(state["context"], skill_ids),
        conversation_history=state["conversation_history"],
        question=state["question"],
        existing_graph_messages=list(state.get("messages") or []),
    )

    response = llm_with_tools.invoke(messages)

    tool_calls = getattr(response, "tool_calls", None) or []
    if not tool_calls:
        answer_text = text_from_lc_content(response.content)
        logger.info("generate_node final answer_chars=%d", len(answer_text))
        logger.debug("generate_node answer preview=%r", preview_text(answer_text, 120))
        return {"answer": answer_text, "messages": messages + [response]}

    names = [tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "?") for tc in tool_calls]
    logger.info(
        "generate_node tool_calls=%d names=%s graph_messages=%d",
        len(tool_calls),
        names,
        len(messages),
    )
    return {"messages": messages + [response]}


#: Tool rounds are bounded per request by `agent_config.orchestration.max_tool_rounds`; this is the ceiling used when a KB
#: sets nothing, i.e. today's behaviour — only `recursion_limit` stopped a runaway loop.
UNBOUNDED_TOOL_ROUNDS = 10_000


def tool_rounds_used(messages: list[Any]) -> int:
    """How many times the model has asked for tools in this turn.

    Counted from the transcript rather than from a counter in state: the transcript is what the loop actually consumed, and
    it survives the fallback path that rebuilds the graph state.
    """
    return sum(1 for m in messages if isinstance(m, AIMessage) and getattr(m, "tool_calls", None))


def should_continue(state: dict[str, Any]) -> Literal["tools", "finalize", "__end__"]:
    """Route to tools, to a wrap-up turn, or to the end.

    Reaching the tool budget does not end the turn: cutting the loop mid-tool-call produced an **empty answer**, which is
    worse than an incomplete one. It goes to `finalize`, which asks the model for an answer from what it already has.
    """
    messages = state.get("messages", [])
    if not messages:
        return "__end__"
    last = messages[-1]
    if not (isinstance(last, AIMessage) and last.tool_calls):
        return "__end__"
    budget = int(state.get("max_tool_rounds") or UNBOUNDED_TOOL_ROUNDS)
    used = tool_rounds_used(messages)
    # The budget is the number of rounds *allowed*, so a request that uses the last one wraps up here.
    if used >= budget:
        logger.warning("tool round budget reached (%d/%d); wrapping up", used, budget)
        return "finalize"
    return "tools"


FINALIZE_INSTRUCTION = (
    "You have used the tool budget for this turn. Answer now using only what you already retrieved. "
    "State plainly what you could not check, and do not guess a number you did not retrieve."
)


SKIPPED_TOOL_RESULT = (
    "Not executed: the tool budget for this turn is exhausted. Answer from what you already have."
)


def _answer_pending_tool_calls(messages: list[Any]) -> list[Any]:
    """Give every unanswered tool call a tool result, so the transcript is one the model API accepts."""
    out = list(messages)
    if not out:
        return out
    last = out[-1]
    if not (isinstance(last, AIMessage) and getattr(last, "tool_calls", None)):
        return out
    for call in last.tool_calls:
        call_id = call.get("id") if isinstance(call, dict) else getattr(call, "id", None)
        if call_id:
            out.append(ToolMessage(content=SKIPPED_TOOL_RESULT, tool_call_id=call_id))
    return out


def finalize_node(state: dict[str, Any]) -> dict[str, Any]:
    """One last model turn with no tools bound, so a cut-short turn still yields an answer."""
    llm_cfg = get_effective_llm_config()
    llm = make_qa_chat_openai(
        base_url=llm_cfg.openai_v1_base_url,
        api_key=llm_cfg.api_key,
        model_name=llm_cfg.model_name,
        temperature=0.3,
        streaming=True,
    )
    messages = build_messages_for_generate(
        context_prompt=_build_system_prompt(state["context"], normalize_skill_ids(state.get("agent_skills"))),
        conversation_history=state["conversation_history"],
        question=state["question"],
        existing_graph_messages=list(state.get("messages") or []),
    )
    # The transcript ends with an assistant turn that requested tools the loop never ran. An OpenAI-compatible API rejects
    # that pairing ("insufficient tool messages following tool_calls"), so each unanswered call gets a tool result saying so —
    # more honest than dropping the message, and it tells the model why the data is missing.
    messages = _answer_pending_tool_calls(messages)
    messages = [*messages, HumanMessage(content=FINALIZE_INSTRUCTION)]
    response = llm.invoke(messages)
    answer_text = text_from_lc_content(response.content)
    logger.info("finalize_node answer_chars=%d", len(answer_text))
    return {"answer": answer_text, "messages": [*messages, response]}


def build_graph() -> StateGraph:
    """Build the RAG + skills agent graph."""
    graph = StateGraph(AgentState)

    # Union of all skill tools so opted-in insurance tools can execute; generate binds a subset.
    tool_node = ToolNode(get_union_skill_tools())

    graph.add_node("retrieve", retrieve_node)
    graph.add_node("generate", generate_node)
    graph.add_node("tools", tool_node)
    graph.add_node("finalize", finalize_node)

    graph.add_edge("retrieve", "generate")
    graph.add_conditional_edges(
        "generate",
        should_continue,
        {"tools": "tools", "finalize": "finalize", "__end__": END},
    )
    graph.add_edge("tools", "generate")
    graph.add_edge("finalize", END)
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
    session_id: str | None = None,
    agent_skills: list[str] | None = None,
    agent_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Invoke the agent and return answer + sources."""
    from .langfuse_client import build_langgraph_trace_config

    skill_ids = normalize_skill_ids(agent_skills)
    retrieve_k = agent_config_module.top_k(agent_config)
    h = set_request_access_token(access_token or "")
    h_kb = set_request_knowledge_base_id(knowledge_base_id or "")
    # The workspace key. Tools read it from the request context, so a tool call cannot address another conversation.
    h_sess = set_request_session_id(session_id or "")
    t0 = time.monotonic()
    logger.info(
        "invoke_agent start kb=%s history=%d session=%s skills=%s top_k=%d",
        knowledge_base_id,
        len(conversation_history or []),
        session_id or "-",
        skill_ids,
        retrieve_k,
    )
    logger.debug("invoke_agent question=%r", preview_text(question, 200))
    try:
        agent = get_agent()
        config = build_langgraph_trace_config(session_id, streaming=False, include_callback=True)
        result = agent.invoke(
            {
                "knowledge_base_id": knowledge_base_id,
                "question": question,
                "conversation_history": conversation_history,
                "access_token": access_token,
                "context": [],
                "messages": [],
                "answer": "",
                "agent_skills": skill_ids,
                "top_k": retrieve_k,
                "max_tool_rounds": agent_config_module.max_tool_rounds(agent_config),
            },
            config=config,
        )
        callback = (config.get("callbacks") or [None])[0]
        if callback and hasattr(callback, "flush"):
            callback.flush()
        answer = _extract_answer(result)
        display = select_display_sources(
            result.get("context", []),
            messages=list(result.get("messages") or []),
        )
        # Label, do not filter: `used` when the answer's numbers came from a source, `consulted` when the query merely ran.
        display = label_sources(display, answer)
        grounding = ground(display, answer)
        msgs = list(result.get("messages") or [])
        logger.info(
            "invoke_agent done kb=%s elapsed=%.2fs answer_chars=%d sources=%d graph_messages=%d",
            knowledge_base_id,
            time.monotonic() - t0,
            len(answer or ""),
            len(display),
            len(msgs),
        )
        return {"answer": answer, "context": display, "grounding": grounding}
    except GraphRecursionError:
        logger.error(
            "invoke_agent recursion_limit kb=%s elapsed=%.2fs",
            knowledge_base_id,
            time.monotonic() - t0,
            exc_info=True,
        )
        raise
    except Exception:
        logger.error(
            "invoke_agent failed kb=%s elapsed=%.2fs",
            knowledge_base_id,
            time.monotonic() - t0,
            exc_info=True,
        )
        raise
    finally:
        reset_request_knowledge_base_id(h_kb)
        reset_request_session_id(h_sess)
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
    session_id: str | None = None,
    agent_skills: list[str] | None = None,
    agent_config: dict[str, Any] | None = None,
) -> AsyncIterator[bytes]:
    """NDJSON stream: ``delta`` / ``tool_*`` events (wiki-copilot-compatible), then ``done`` or ``error``."""
    from .langfuse_client import build_langgraph_trace_config, get_langfuse_callback

    skill_ids = normalize_skill_ids(agent_skills)
    retrieve_k = agent_config_module.top_k(agent_config)
    h = set_request_access_token(access_token or "")
    h_kb = set_request_knowledge_base_id(knowledge_base_id or "")
    # The workspace key. Tools read it from the request context, so a tool call cannot address another conversation.
    h_sess = set_request_session_id(session_id or "")
    t0 = time.monotonic()
    logger.info(
        "astream_agent_ndjson start kb=%s history=%d session=%s skills=%s top_k=%d",
        knowledge_base_id,
        len(conversation_history or []),
        session_id or "-",
        skill_ids,
        retrieve_k,
    )
    logger.debug("astream_agent_ndjson question=%r", preview_text(question, 200))
    try:
        ctx = retrieve(
            knowledge_base_id,
            question,
            access_token=access_token,
            top_k=retrieve_k,
        )
        logger.info("astream_agent_ndjson retrieve kb=%s hits=%d", knowledge_base_id, len(ctx))
        state: dict[str, Any] = {
            "knowledge_base_id": knowledge_base_id,
            "question": question,
            "conversation_history": conversation_history,
            "access_token": access_token,
            "context": ctx,
            "messages": [],
            "answer": "",
            "agent_skills": skill_ids,
            "top_k": retrieve_k,
            "max_tool_rounds": agent_config_module.max_tool_rounds(agent_config),
        }
        agent = get_agent()
        stream_cb = get_langfuse_callback() if settings.langfuse_trace_streaming else None
        config = build_langgraph_trace_config(
            session_id,
            streaming=True,
            include_callback=bool(stream_cb),
        )
        callback = (config.get("callbacks") or [None])[0]

        buf: list[str] = []
        streamed_sections: list[SourceItem] = []
        seen_section_ids: set[str] = set()
        streamed_catalog: list[SourceItem] = []
        stream_schema_names: list[str] = []
        stream_schema_seen: set[str] = set()
        stream_cypher_runs: list[tuple[str, dict[str, Any]]] = []
        # tool_start input by run_id — catalog evidence needs args (metric / model_id / sql).
        tool_inputs_by_run: dict[str, Any] = {}
        graph_events = 0
        tool_starts = 0
        tool_ends = 0
        tool_errors = 0
        last_event_at = t0
        try:
            async for ev in agent.astream_events(state, config, version="v2"):  # type: ignore[union-attr]
                graph_events += 1
                now = time.monotonic()
                ename = (ev.get("event") or "") if isinstance(ev, dict) else ""
                if logger.isEnabledFor(logging.DEBUG):
                    logger.debug(
                        "astream_events #%d event=%s name=%s gap=%.2fs",
                        graph_events,
                        ename,
                        (ev.get("name") or "") if isinstance(ev, dict) else "",
                        now - last_event_at,
                    )
                last_event_at = now
                if ename == "on_chat_model_stream":
                    ch = (ev.get("data") or {}).get("chunk")
                    t = _stream_chunk_text(ch)
                    if t:
                        buf.append(t)
                        yield _ndjson_line({"type": "delta", "t": t})
                elif ename == "on_tool_start":
                    tool_starts += 1
                    name = (ev.get("name") or "tool").split("/")[-1]
                    data = ev.get("data") or {}
                    inp = data.get("input")
                    run_id = str(ev.get("run_id") or "")
                    if run_id:
                        tool_inputs_by_run[run_id] = inp
                    inp_preview = preview_text(_tool_io_preview(inp, 400), 400)
                    logger.info(
                        "tool_start #%d name=%s run_id=%s",
                        tool_starts,
                        name,
                        run_id[:8] if run_id else "-",
                    )
                    logger.debug(
                        "tool_start #%d input=%r",
                        tool_starts,
                        inp_preview,
                    )
                    yield _ndjson_line(
                        {
                            "type": "tool_start",
                            "run_id": run_id,
                            "name": name,
                            "input": _tool_io_preview(inp, 6_000),
                        }
                    )
                elif ename == "on_tool_end":
                    tool_ends += 1
                    data = ev.get("data") or {}
                    out = data.get("output")
                    run_id = str(ev.get("run_id") or "")
                    name = (ev.get("name") or "tool").split("/")[-1]
                    out_raw = _tool_io_preview(out, 500)
                    out_preview = preview_text(out_raw, 500)
                    logger.info(
                        "tool_end #%d name=%s run_id=%s output_chars=%d",
                        tool_ends,
                        name,
                        run_id[:8] if run_id else "-",
                        len(out_raw),
                    )
                    logger.debug(
                        "tool_end #%d preview=%r",
                        tool_ends,
                        out_preview,
                    )
                    yield _ndjson_line(
                        {
                            "type": "tool_end",
                            "run_id": run_id,
                            "name": name,
                            "output": _tool_io_preview(out, 10_000),
                        }
                    )
                    tool_inp = data.get("input")
                    if tool_inp is None and run_id:
                        tool_inp = tool_inputs_by_run.get(run_id)
                    if name == PAGE_SECTION_TOOL_NAME:
                        src = source_from_page_section_tool(tool_inp, out)
                        if src is not None and src.id not in seen_section_ids:
                            seen_section_ids.add(src.id)
                            streamed_sections.append(src)
                    elif name == ONTOLOGY_SCHEMA_TOOL_NAME:
                        for n in extract_schema_names_from_tool_output(out):
                            if n not in stream_schema_seen:
                                stream_schema_seen.add(n)
                                stream_schema_names.append(n)
                    elif name == RUN_CYPHER_TOOL_NAME:
                        pair = extract_cypher_run_from_tool(tool_inp, out)
                        if pair is not None:
                            stream_cypher_runs.append(pair)
                    else:
                        cat = source_from_catalog_tool(
                            name, tool_inp, out, index=len(streamed_catalog)
                        )
                        if cat is not None:
                            streamed_catalog.append(cat)
                elif ename == "on_tool_error":
                    tool_errors += 1
                    data = ev.get("data") or {}
                    err = data.get("error")
                    err_s = str(err) if err is not None else "Tool error"
                    run_id = str(ev.get("run_id") or "")
                    name = (ev.get("name") or "tool").split("/")[-1]
                    logger.warning(
                        "tool_error #%d name=%s run_id=%s",
                        tool_errors,
                        name,
                        run_id[:8] if run_id else "-",
                    )
                    logger.debug(
                        "tool_error #%d error=%r",
                        tool_errors,
                        preview_text(err_s, 300),
                    )
                    yield _ndjson_line(
                        {
                            "type": "tool_error",
                            "run_id": run_id,
                            "name": name,
                            "error": _tool_io_preview(err_s, 2_000),
                        }
                    )
                elif ename == "on_chain_error":
                    data = ev.get("data") or {}
                    err = data.get("error")
                    logger.error(
                        "astream_events chain_error event=%s error=%r",
                        ename,
                        preview_text(str(err) if err is not None else "", 500),
                        exc_info=err if isinstance(err, BaseException) else False,
                    )
        except GraphRecursionError as e:
            elapsed = time.monotonic() - t0
            limit = settings.agent_recursion_limit
            logger.error(
                "astream_agent_ndjson recursion_limit kb=%s limit=%d elapsed=%.2fs graph_events=%d "
                "tool_starts=%d tool_ends=%d delta_chars=%d cypher_runs=%d: %s",
                knowledge_base_id,
                limit,
                elapsed,
                graph_events,
                tool_starts,
                tool_ends,
                sum(len(x) for x in buf),
                len(stream_cypher_runs),
                e,
                exc_info=True,
            )
            detail = (
                f"Recursion limit exceeded ({limit} steps, "
                f"OPENKMS_QA_AGENT_RECURSION_LIMIT / OPENKMS_AGENT_RECURSION_LIMIT): {e!s}"
            )
            yield _ndjson_line({"type": "error", "detail": detail, "answer": "".join(buf)})
            if callback and hasattr(callback, "flush"):
                callback.flush()
            return
        except Exception as e:
            elapsed = time.monotonic() - t0
            logger.error(
                "astream_agent_ndjson failed kb=%s elapsed=%.2fs graph_events=%d "
                "tool_starts=%d tool_ends=%d delta_chars=%d: %s",
                knowledge_base_id,
                elapsed,
                graph_events,
                tool_starts,
                tool_ends,
                sum(len(x) for x in buf),
                e,
                exc_info=True,
            )
            yield _ndjson_line({"type": "error", "detail": str(e) or type(e).__name__, "answer": "".join(buf)})
            if callback and hasattr(callback, "flush"):
                callback.flush()
            return

        answer = "".join(buf)
        sources_list = select_display_sources(
            ctx,
            messages=None,
            streamed_sections=streamed_sections if streamed_sections else None,
            streamed_catalog=streamed_catalog if streamed_catalog else None,
            streamed_ontology_schema_names=stream_schema_names if stream_schema_names else None,
            streamed_ontology_cypher_runs=stream_cypher_runs if stream_cypher_runs else None,
        )
        if not answer.strip():
            logger.info(
                "astream_agent_ndjson no streamed tokens; fallback invoke_agent kb=%s "
                "(tool_starts=%d tool_ends=%d)",
                knowledge_base_id,
                tool_starts,
                tool_ends,
            )
            result = await asyncio.to_thread(
                invoke_agent,
                knowledge_base_id,
                question,
                conversation_history,
                access_token,
                session_id,
                skill_ids,
                agent_config,
            )
            answer = result.get("answer", "") or ""
            sources_list = select_display_sources(
                list(result.get("context") or ctx),
                messages=list(result.get("messages") or []),
                streamed_sections=streamed_sections if streamed_sections else None,
                streamed_catalog=streamed_catalog if streamed_catalog else None,
                streamed_ontology_schema_names=stream_schema_names if stream_schema_names else None,
                streamed_ontology_cypher_runs=stream_cypher_runs if stream_cypher_runs else None,
            )
            if answer:
                yield _ndjson_line({"type": "delta", "t": answer})

        sources_list = label_sources(sources_list, answer)
        grounding = ground(sources_list, answer)
        elapsed = time.monotonic() - t0
        logger.info(
            "astream_agent_ndjson done kb=%s elapsed=%.2fs graph_events=%d tool_starts=%d "
            "tool_ends=%d tool_errors=%d answer_chars=%d sources=%d cypher_runs=%d",
            knowledge_base_id,
            elapsed,
            graph_events,
            tool_starts,
            tool_ends,
            tool_errors,
            len(answer or ""),
            len(sources_list),
            len(stream_cypher_runs),
        )
        yield _ndjson_line(
            {
                "type": "done",
                "answer": answer,
                "sources": _sources_to_jsonable(sources_list),
                # Additive: the label and the ratio travel with the answer so a reader (or a score) can use them.
                "grounding": grounding.model_dump(),
            }
        )
        if callback and hasattr(callback, "flush"):
            callback.flush()
    finally:
        reset_request_knowledge_base_id(h_kb)
        reset_request_session_id(h_sess)
        reset_request_access_token(h)
