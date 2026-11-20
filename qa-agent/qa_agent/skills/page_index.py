"""LangGraph skill: Page Index (document table of contents → select section → extract content)."""
import json
from typing import Annotated

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..page_index_client import flatten_toc, get_page_index, get_section
from ..request_context import get_tool_access_token


@tool
def read_document_toc(
    document_id: Annotated[str, "Document id, from the search results in the context"],
    _config: RunnableConfig,
) -> str:
    """ Section titles and line ranges for one document. Use when a retrieved chunk is not enough."""
    try:
        token = get_tool_access_token(_config)
        data = get_page_index(document_id, token)
        structure = data.get("structure", [])
        if not structure:
            return json.dumps({"doc_name": data.get("doc_name"), "sections": [], "message": "No table of contents"})
        sections = flatten_toc(structure)
        return json.dumps(
            {"doc_name": data.get("doc_name"), "sections": sections},
            indent=2,
            default=str,
        )
    except Exception as e:
        return f"Error fetching table of contents: {e}"


@tool
def read_document_section(
    document_id: Annotated[str, "Document id, from the table of contents"],
    start_line: Annotated[int, "First line, 1-based"],
    end_line: Annotated[int, "Last line, inclusive"],
    _config: RunnableConfig,
) -> str:
    """ The markdown of one document section, by the line range the table of contents gave."""
    if start_line < 1 or end_line < 1 or start_line > end_line:
        return "Error: start_line and end_line must be 1-based, start_line <= end_line"
    try:
        token = get_tool_access_token(_config)
        data = get_section(document_id, start_line, end_line, token)
        return data.get("content", "")
    except Exception as e:
        return f"Error fetching section: {e}"


page_index_tools = [read_document_toc, read_document_section]

