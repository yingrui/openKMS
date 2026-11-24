"""Retrieval of this knowledge base, as a tool the model may call.

`orchestration.retrieve = always` pre-fetches five chunks before generation; `on_miss` skips that and gives the model this
tool instead, so it fetches context when it judges it missing. The tool is also available whenever the agent's tool ledger
enables the `knowledge_search` capability — searching again with a better query is a normal thing for a model to do.
"""
from __future__ import annotations

import json
from typing import Annotated, Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..request_context import get_tool_access_token, get_tool_knowledge_base_id, get_tool_rerank
from ..retriever import retrieve

#: How many hits a retrieval returns in on-demand mode. The KB's `retrieval.top_k` narrows the pre-retrieval node; a
#: deliberate search by the model gets a slightly wider net, because it already decided it needed one.
ON_DEMAND_TOP_K = 8


@tool
def search_knowledge_base(
    query: Annotated[str, "What to look for in this knowledge base"],
    _config: RunnableConfig,
) -> str:
    """Search this knowledge base for passages about `query`.

    Use for definitions, clauses, rules, procedures — what the corpus says. Not for entities, counts or relationships
    (use the ontology) or for measures (use the semantic model); a search that returns nothing does not mean the answer
    is absent, so try the other sources before saying so.

    Returns JSON `{query, passages: [{id, source_type, source_name, content, score, ...}]}`. Quote from `content` and
    name `source_name` when you cite: the reader checks the document, not your summary."""
    try:
        kb_id = get_tool_knowledge_base_id(_config)
        if not kb_id:
            return "Error: no knowledge base in scope."
        rerank, model_id = get_tool_rerank(_config)
        hits = retrieve(
            kb_id,
            query,
            access_token=get_tool_access_token(_config),
            top_k=ON_DEMAND_TOP_K,
            rerank=rerank,
            rerank_model_id=model_id,
        )
        if not hits:
            return json.dumps({"query": query, "passages": []}, ensure_ascii=False)
        # JSON, like the Catalog tools: the passages are also the answer's **evidence**, and `select_display_sources`
        # reads them back out of the transcript to cite them. A prose blob would have to be parsed again.
        # `model_dump` rather than a hand-written field list: the list was five places long, and the copy here silently
        # dropped `retrieval_mode`, `retrieval_debug` and `doc_metadata` — every answer lost its retrieval chain.
        return json.dumps(
            {
                "query": query,
                "passages": [hit.model_dump(mode="json") for hit in hits[:ON_DEMAND_TOP_K]],
            },
            ensure_ascii=False,
        )
    except (ValueError, OSError) as exc:
        return f"Error searching the knowledge base: {exc}"


kb_search_tools: list[Any] = [search_knowledge_base]
