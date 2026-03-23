"""LangGraph skills: ontology (Cypher/graph) and page_index (document TOC navigation)."""
from .ontology import ontology_tools
from .page_index import page_index_tools

__all__ = ["ontology_tools", "page_index_tools", "get_all_skill_tools"]


def get_all_skill_tools() -> list:
    """Return all tools from all skills for the agent."""
    return [*ontology_tools, *page_index_tools]


def get_skill_prompt_fragments() -> str:
    """Return combined prompt fragments describing when and how to use each skill."""
    from .ontology import ONTOLOGY_PROMPT
    from .page_index import PAGE_INDEX_PROMPT
    return ONTOLOGY_PROMPT + "\n\n" + PAGE_INDEX_PROMPT
