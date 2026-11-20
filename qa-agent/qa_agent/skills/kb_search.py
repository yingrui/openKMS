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

from ..request_context import get_tool_access_token, get_tool_knowledge_base_id
from ..retriever import retrieve

#: How many hits a retrieval returns in on-demand mode. The KB's `retrieval.top_k` narrows the pre-retrieval node; a
#: deliberate search by the model gets a slightly wider net, because it already decided it needed one.
ON_DEMAND_TOP_K = 8


@tool
def search_knowledge_base(
    query: Annotated[str, "What to look for in this knowledge base"],
    _config: RunnableConfig,
) -> str:
    """Search this knowledge base for passages about `query`. Use when you need facts you do not already have —
    definitions, method descriptions, policy. Returns numbered passages with their source; quote from them and cite."""
    try:
        kb_id = get_tool_knowledge_base_id(_config)
        if not kb_id:
            return "Error: no knowledge base in scope."
        hits = retrieve(
            kb_id,
            query,
            access_token=get_tool_access_token(_config),
            top_k=ON_DEMAND_TOP_K,
        )
        if not hits:
            return json.dumps({"query": query, "passages": []}, ensure_ascii=False)
        # JSON, like the Catalog tools: the passages are also the answer's **evidence**, and `select_display_sources`
        # reads them back out of the transcript to cite them. A prose blob would have to be parsed again.
        return json.dumps(
            {
                "query": query,
                "passages": [
                    {
                        "id": hit.id,
                        "source_type": hit.source_type,
                        "source_name": hit.source_name,
                        "content": hit.content,
                        "score": hit.score,
                        "document_id": hit.document_id,
                        "wiki_page_id": hit.wiki_page_id,
                        "wiki_space_id": hit.wiki_space_id,
                        "chunk_index": hit.chunk_index,
                    }
                    for hit in hits
                ],
            },
            ensure_ascii=False,
        )
    except (ValueError, OSError) as exc:
        return f"Error searching the knowledge base: {exc}"


kb_search_tools: list[Any] = [search_knowledge_base]
