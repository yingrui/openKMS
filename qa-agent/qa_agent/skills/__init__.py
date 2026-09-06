"""LangGraph skills: ontology (Cypher/graph), page_index (document TOC navigation),
and three credit-risk skills (guarantee ring / group exposure / related-party penetration).

Insurance skills (insurance_calculator / premium_estimator / product_comparator) remain on
disk but are unregistered for the credit-risk demo."""
from .guarantee_ring import guarantee_ring_tools
from .ontology import ontology_tools
from .page_index import page_index_tools
from .related_party import related_party_tools
from .risk_exposure import risk_exposure_tools

__all__ = [
    "ontology_tools",
    "page_index_tools",
    "guarantee_ring_tools",
    "risk_exposure_tools",
    "related_party_tools",
    "get_all_skill_tools",
    "get_skill_prompt_fragments",
]


def get_all_skill_tools() -> list:
    """Return all tools from all skills for the agent."""
    return [
        *ontology_tools,
        *page_index_tools,
        *guarantee_ring_tools,
        *risk_exposure_tools,
        *related_party_tools,
    ]


def get_skill_prompt_fragments() -> str:
    """Return combined prompt fragments describing when and how to use each skill."""
    from .guarantee_ring import GUARANTEE_RING_PROMPT
    from .ontology import ONTOLOGY_PROMPT
    from .page_index import PAGE_INDEX_PROMPT
    from .related_party import RELATED_PARTY_PROMPT
    from .risk_exposure import RISK_EXPOSURE_PROMPT
    return "\n\n".join(
        [
            ONTOLOGY_PROMPT,
            PAGE_INDEX_PROMPT,
            GUARANTEE_RING_PROMPT,
            RISK_EXPOSURE_PROMPT,
            RELATED_PARTY_PROMPT,
        ]
    )
