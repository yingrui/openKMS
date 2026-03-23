"""LangChain tools - re-exports from skills for backward compatibility."""
from .skills import get_all_skill_tools


def get_ontology_tools() -> list:
    """Return all agent tools (ontology + page_index skills)."""
    return get_all_skill_tools()
