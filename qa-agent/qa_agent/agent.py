"""LangGraph RAG agent for question answering."""
from typing import Any, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

from .config import settings
from .retriever import retrieve
from .schemas import SourceItem


class AgentState(TypedDict):
    knowledge_base_id: str
    question: str
    conversation_history: list[dict[str, str]]
    context: list[SourceItem]
    answer: str


def retrieve_node(state: AgentState) -> dict[str, Any]:
    """Retrieve relevant context from the knowledge base."""
    sources = retrieve(state["knowledge_base_id"], state["question"], top_k=5)
    return {"context": sources}


def generate_node(state: AgentState) -> dict[str, Any]:
    """Generate answer using LLM with retrieved context."""
    base_url = settings.llm_base_url.rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    llm = ChatOpenAI(
        base_url=base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model_name,
        temperature=0.3,
    )

    context_text = "\n\n---\n\n".join(
        f"[{s.source_type}] {s.source_name or 'FAQ'} (relevance: {s.score:.0%}):\n{s.content}"
        for s in state["context"]
    )

    system_prompt = (
        "You are a helpful assistant answering questions based on a knowledge base. "
        "Use the provided context to answer the user's question accurately. "
        "If the context doesn't contain enough information, say so honestly. "
        "Cite sources when possible."
    )

    messages: list[Any] = [SystemMessage(content=system_prompt)]

    for msg in state["conversation_history"]:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            messages.append(AIMessage(content=msg["content"]))

    user_message = (
        f"Context from the knowledge base:\n{context_text}\n\n"
        f"Question: {state['question']}"
    )
    messages.append(HumanMessage(content=user_message))

    response = llm.invoke(messages)
    return {"answer": response.content}


def build_graph() -> StateGraph:
    """Build the RAG agent graph."""
    graph = StateGraph(AgentState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("generate", generate_node)
    graph.add_edge("retrieve", "generate")
    graph.add_edge("generate", END)
    graph.set_entry_point("retrieve")
    return graph


_compiled_graph = None


def get_agent():
    """Get the compiled agent graph (singleton)."""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_graph().compile()
    return _compiled_graph
