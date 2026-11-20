"""LangGraph skill: Page Index (document table of contents → select section → extract content)."""
import json

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..page_index_client import flatten_toc, get_page_index, get_section
from ..request_context import get_tool_access_token


@tool
def read_table_of_contents_tool(
    document_id: str,
    _config: RunnableConfig,
) -> str:
    """Read the table of contents (Page Index) for a document.
    Use when context from search mentions a document_id and you need to navigate the document structure.
    Returns a flattened list of sections with node_id, title, start_line, end_line.
    Use get_section_content_tool to fetch the content of a selected section."""
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
def get_section_content_tool(
    document_id: str,
    start_line: int,
    end_line: int,
    _config: RunnableConfig,
) -> str:
    """Fetch the markdown content of a document section by line range (1-based, inclusive).
    Use after read_table_of_contents_tool: pick a section by its start_line and end_line.
    Parent sections include all children (their end_line spans to next sibling)."""
    if start_line < 1 or end_line < 1 or start_line > end_line:
        return "Error: start_line and end_line must be 1-based, start_line <= end_line"
    try:
        token = get_tool_access_token(_config)
        data = get_section(document_id, start_line, end_line, token)
        return data.get("content", "")
    except Exception as e:
        return f"Error fetching section: {e}"


page_index_tools = [read_table_of_contents_tool, get_section_content_tool]

