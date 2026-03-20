"""LangGraph RAG agent with ontology skills: KB search + object/link types + Cypher."""
from typing import Annotated, Any, Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict

from .config import settings
from .retriever import retrieve
from .schemas import SourceItem
from .tools import get_ontology_tools


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
    sources = retrieve(
        state["knowledge_base_id"],
        state["question"],
        access_token=state["access_token"],
        top_k=5,
    )
    return {"context": sources}


def _build_system_prompt(context: list[SourceItem]) -> str:
    context_text = "\n\n---\n\n".join(
        f"[{s.source_type}] {s.source_name or 'FAQ'} (relevance: {s.score:.0%}):\n{s.content}"
        for s in context
    )
    return (
        "You are a helpful assistant answering questions based on a knowledge base and a knowledge graph (ontology).\n\n"
        "You have two sources of information:\n"
        "1. **Knowledge base** – Document chunks and FAQs (provided as context below). Use this for questions about documents, policies, procedures.\n"
        "2. **Knowledge graph (Neo4j)** – Object types (e.g. Disease, Insurance_Product) and link types (e.g. COVERS). "
        "Use the tools get_ontology_schema_tool and run_cypher_tool for questions about relationships, coverage, which products cover which diseases, etc.\n\n"
        "For coverage questions (e.g. 'Which insurance products cover heart attack?'):\n"
        "- First call get_ontology_schema_tool to learn the node labels and relationship types.\n"
        "- Then write a Cypher query (e.g. MATCH (d:Disease)-[:COVERS]-(p:Insurance_Product) WHERE d.name CONTAINS 'heart' RETURN p.name) and call run_cypher_tool.\n"
        "- Use the results to answer the user.\n\n"
        "Context from the knowledge base:\n"
        f"{context_text}\n\n"
        "If the context or graph doesn't contain enough information, say so honestly. Cite sources when possible."
    )


def generate_node(state: dict[str, Any]) -> dict[str, Any]:
    """Generate answer using LLM with RAG context and ontology tools."""
    base_url = settings.llm_base_url.rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    llm = ChatOpenAI(
        base_url=base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model_name,
        temperature=0.3,
    )
    tools = get_ontology_tools()
    llm_with_tools = llm.bind_tools(tools)

    config = {"configurable": {"access_token": state["access_token"]}}

    messages: list = [
        SystemMessage(content=_build_system_prompt(state["context"])),
    ]
    for msg in state["conversation_history"]:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            messages.append(AIMessage(content=msg["content"]))

    messages.append(HumanMessage(content=f"Question: {state['question']}"))

    existing = state.get("messages") or []
    if existing:
        messages = existing

    response = llm_with_tools.invoke(messages, config=config)

    if not response.tool_calls:
        return {"answer": response.content, "messages": messages + [response]}

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

    tools = get_ontology_tools()
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
        if isinstance(m, AIMessage) and m.content and not m.tool_calls:
            return m.content
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

    agent = get_agent()
    config: dict = {"configurable": {"access_token": access_token}}
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
