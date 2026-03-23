"""Build PageIndex-compatible tree structure from markdown.

Uses pageindex package: md_to_tree from pageindex.page_index_md.
Requires pageindex with local parsing support (see https://github.com/VectifyAI/PageIndex).
"""

import asyncio
from pathlib import Path
from typing import Any


def build_page_index_from_markdown(md_path: Path) -> dict[str, Any]:
    """
    Build PageIndex-compatible tree from markdown using pageindex.md_to_tree.
    Returns { doc_name, structure }.
    """
    from pageindex.page_index_md import md_to_tree
    from pageindex.utils import ConfigLoader

    config_loader = ConfigLoader()
    user_opt = {
        "if_add_node_summary": "no",
        "if_add_doc_description": "no",
        "if_add_node_text": "no",
        "if_add_node_id": "yes",
    }
    opt = config_loader.load(user_opt)

    tree: dict[str, Any] = asyncio.run(
        md_to_tree(
            md_path=str(md_path),
            if_thinning=False,
            min_token_threshold=None,
            if_add_node_summary=opt.if_add_node_summary,
            summary_token_threshold=None,
            model=opt.model,
            if_add_doc_description=opt.if_add_doc_description,
            if_add_node_text=opt.if_add_node_text,
            if_add_node_id=opt.if_add_node_id,
        )
    )
    return tree
