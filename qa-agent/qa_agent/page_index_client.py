"""Client for Page Index (table of contents) and document sections via backend API."""
import httpx

from .config import settings


def get_page_index(document_id: str, access_token: str) -> dict:
    """Fetch PageIndex tree structure for a document.
    Returns { structure: [...], doc_name: str }."""
    base = settings.openkms_backend_url.rstrip("/")
    url = f"{base}/api/documents/{document_id}/page-index"
    headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}

    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()


def get_section(
    document_id: str,
    start_line: int,
    end_line: int,
    access_token: str,
) -> dict:
    """Fetch a markdown section by line range (1-based, inclusive).
    Returns { content: str, start_line: int, end_line: int }."""
    base = settings.openkms_backend_url.rstrip("/")
    url = f"{base}/api/documents/{document_id}/section"
    headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}
    params = {"start_line": start_line, "end_line": end_line}

    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.json()


def flatten_toc(structure: list[dict], parent_end: int | None = None) -> list[dict]:
    """Flatten TOC to list of { node_id, title, line_num, start_line, end_line }.
    Parent nodes include all children (end_line = next sibling - 1 or parent_end)."""
    result = []
    for i, node in enumerate(structure):
        start = node.get("line_num") or 1
        next_sibling = structure[i + 1] if i + 1 < len(structure) else None
        next_start = next_sibling.get("line_num") if next_sibling else None
        end = (next_start - 1) if next_start is not None else (parent_end or 999999)
        result.append({
            "node_id": node.get("node_id"),
            "title": node.get("title", ""),
            "line_num": start,
            "start_line": start,
            "end_line": end,
        })
        if node.get("nodes"):
            result.extend(flatten_toc(node["nodes"], parent_end=end))
    return result
