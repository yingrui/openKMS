"""Build PageIndex-compatible tree structure from markdown.

Uses "#" to determine node headings and levels: "#" = level 1, "##" = level 2, "###" = level 3, etc.
Output format: { doc_name, structure } with title, node_id, line_num, nodes.
"""

import re
from pathlib import Path
from typing import Any


def md_to_tree(md_path: Path) -> dict[str, Any]:
    """
    Convert markdown to PageIndex-compatible tree structure.
    Uses # headings for hierarchy: # = level 1, ## = level 2, ### = level 3, etc.
    Returns { doc_name, structure }.
    """
    content = md_path.read_text(encoding="utf-8")
    lines = content.split("\n")
    node_list, _ = _extract_nodes_from_markdown(lines)
    tree_structure = _build_tree_from_nodes(node_list)
    _write_node_id(tree_structure)
    _format_structure(tree_structure, order=["title", "node_id", "summary", "prefix_summary", "line_num", "nodes"])
    return {
        "doc_name": md_path.stem,
        "structure": tree_structure,
    }


def _extract_nodes_from_markdown(lines: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    """Extract header nodes. Use # for level: # = 1, ## = 2, ### = 3, etc. Skip code blocks."""
    header_pattern = re.compile(r"^(#{1,6})\s+(.+)$")
    code_block_pattern = re.compile(r"^```")
    node_list: list[dict[str, Any]] = []
    in_code_block = False

    for line_num, line in enumerate(lines, 1):
        stripped = line.strip()
        if code_block_pattern.match(stripped):
            in_code_block = not in_code_block
            continue
        if not stripped or in_code_block:
            continue
        match = header_pattern.match(stripped)
        if match:
            level = len(match.group(1))
            title = match.group(2).strip()
            node_list.append({"title": title, "line_num": line_num, "level": level})

    return node_list, lines


def _build_tree_from_nodes(node_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build hierarchical tree from flat node list using stack-based algorithm."""
    if not node_list:
        return []

    stack: list[tuple[dict[str, Any], int]] = []
    root_nodes: list[dict[str, Any]] = []
    node_counter = 1

    for node in node_list:
        current_level = node["level"]
        tree_node: dict[str, Any] = {
            "title": node["title"],
            "node_id": str(node_counter).zfill(4),
            "line_num": node["line_num"],
            "nodes": [],
        }
        node_counter += 1

        while stack and stack[-1][1] >= current_level:
            stack.pop()

        if not stack:
            root_nodes.append(tree_node)
        else:
            stack[-1][0]["nodes"].append(tree_node)

        stack.append((tree_node, current_level))

    return root_nodes


def _write_node_id(data: Any, node_id: int = 0) -> int:
    """Assign node_id depth-first (0000, 0001, ...)."""
    if isinstance(data, dict):
        data["node_id"] = str(node_id).zfill(4)
        node_id += 1
        for key in list(data.keys()):
            if "nodes" in key:
                node_id = _write_node_id(data[key], node_id)
    elif isinstance(data, list):
        for item in data:
            node_id = _write_node_id(item, node_id)
    return node_id


def _reorder_dict(data: dict[str, Any], key_order: list[str]) -> dict[str, Any]:
    """Keep only keys in key_order that exist."""
    if not key_order:
        return data
    return {k: data[k] for k in key_order if k in data}


def _format_structure(structure: Any, order: list[str]) -> Any:
    """Recursively reorder keys and drop empty nodes."""
    if not order:
        return structure
    if isinstance(structure, dict):
        if "nodes" in structure:
            structure["nodes"] = _format_structure(structure["nodes"], order)
        if not structure.get("nodes"):
            structure.pop("nodes", None)
        structure = _reorder_dict(structure, order)
    elif isinstance(structure, list):
        structure = [_format_structure(item, order) for item in structure]
    return structure


def build_page_index_from_markdown(md_path: Path) -> dict[str, Any]:
    """
    Build PageIndex-compatible tree from markdown.
    Uses # headings for hierarchy. Returns { doc_name, structure }.
    """
    return md_to_tree(md_path)
