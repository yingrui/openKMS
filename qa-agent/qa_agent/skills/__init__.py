"""LangGraph skills: ontology (Cypher/graph), page_index (document TOC navigation),
and three KB-grounded insurance skills (calculator / premium estimator / product comparator)."""
from .insurance_calculator import calculator_tools
from .ontology import ontology_tools
from .page_index import page_index_tools
from .premium_estimator import premium_tools
from .product_comparator import comparator_tools

__all__ = [
    "ontology_tools",
    "page_index_tools",
    "calculator_tools",
    "premium_tools",
    "comparator_tools",
    "get_all_skill_tools",
    "get_skill_prompt_fragments",
]


def get_all_skill_tools() -> list:
    """Return all tools from all skills for the agent."""
    return [
        *ontology_tools,
        *page_index_tools,
        *calculator_tools,
        *premium_tools,
        *comparator_tools,
    ]


def get_skill_prompt_fragments() -> str:
    """Return combined prompt fragments describing when and how to use each skill."""
    from .insurance_calculator import CALCULATOR_PROMPT
    from .ontology import ONTOLOGY_PROMPT
    from .page_index import PAGE_INDEX_PROMPT
    from .premium_estimator import PREMIUM_PROMPT
    from .product_comparator import COMPARATOR_PROMPT
    return "\n\n".join(
        [
            ONTOLOGY_PROMPT,
            PAGE_INDEX_PROMPT,
            CALCULATOR_PROMPT,
            PREMIUM_PROMPT,
            COMPARATOR_PROMPT,
        ]
    )
