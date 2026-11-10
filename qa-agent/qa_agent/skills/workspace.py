"""File tools over the per-session workspace.

A conversation gets a directory (`session_fs`); these are the tools that use it. Deliberately narrow:

- **read-only outside the session**: there is no tool that reaches anything but this conversation's directory;
- **no shell**: reading and writing files is not executing code, and execution needs the boundary described in
  `docs/features/knowledge-base-qa-agent.md`;
- **writes land in `out/`** unless the caller names a path — the agent should not be guessing where its artifacts go.

The session id comes from the request context, exactly like the access token and KB id: a tool call cannot choose which
conversation it is writing into.
"""
from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from .. import session_fs
from ..request_context import get_tool_agents_md, get_tool_knowledge_base_id, get_tool_session_id

#: Where a write goes when the caller does not say. `out/` is the directory the product shows to the user.
ARTIFACT_DIR = "out"


def _scope(config: RunnableConfig) -> tuple[str, str]:
    kb_id = get_tool_knowledge_base_id(config)
    session_id = get_tool_session_id(config)
    if not kb_id or not session_id:
        raise ValueError("No session in scope: this conversation has no workspace.")
    # Materialise on first use, with the KB's rules written in: `AGENTS.md` is what an agent reads to learn the conventions
    # of the place it is working, and `ensure_session_dir` never overwrites one that exists.
    session_fs.ensure_session_dir(kb_id, session_id, agents_md=get_tool_agents_md(config))
    return kb_id, session_id


@tool
def list_workspace_files_tool(_config: RunnableConfig, path: str = "") -> str:
    """List files in this conversation's workspace. Paths are relative to it (``out/chart.csv``); "" is the root.
    Use before writing, to see what already exists."""
    try:
        kb_id, session_id = _scope(_config)
        entries = session_fs.list_dir(kb_id, session_id, path)
        if not entries:
            return "The workspace is empty."
        return "\n".join(
            f"{e['path']}{'/' if e['is_dir'] else ''}"
            + ("" if e["is_dir"] else f" ({e['size']} bytes)")
            for e in entries
        )
    except (ValueError, session_fs.SessionPathError) as exc:
        return f"Error listing workspace: {exc}"


@tool
def read_workspace_file_tool(path: str, _config: RunnableConfig) -> str:
    """Read one text file from this conversation's workspace. Binary or oversized files return their size only.
    A user's uploaded data is under ``uploads/``; artifacts you produced are under ``out/``."""
    try:
        kb_id, session_id = _scope(_config)
        payload = session_fs.read_file(kb_id, session_id, path)
        if payload["is_binary"]:
            return f"{payload['path']} is not text ({payload['size']} bytes, {payload.get('mime') or 'unknown type'})."
        return str(payload["content"])
    except (ValueError, session_fs.SessionPathError) as exc:
        return f"Error reading {path}: {exc}"


@tool
def write_workspace_file_tool(path: str, content: str, _config: RunnableConfig) -> str:
    """Write a text file into this conversation's workspace and return its path. Give a bare name to place it in
    ``out/``. Use this for charts as data tables, CSV, markdown or notes the user should be able to open."""
    try:
        kb_id, session_id = _scope(_config)
        target = path.strip() or "artifact.txt"
        if "/" not in target:
            target = f"{ARTIFACT_DIR}/{target}"
        written = session_fs.write_file(kb_id, session_id, target, content)
        return f"Wrote {written['path']} ({written['size']} bytes)."
    except (ValueError, session_fs.SessionPathError) as exc:
        return f"Error writing {path}: {exc}"


workspace_tools: list[Any] = [
    list_workspace_files_tool,
    read_workspace_file_tool,
    write_workspace_file_tool,
]


WORKSPACE_PROMPT = (
    "**Workspace skill** – This conversation has its own directory; you may read and write files in it:\n"
    "1. **list_workspace_files_tool** to see what is there (a user's attachment is under `uploads/`).\n"
    "2. **read_workspace_file_tool** to read text; binary or large files report their size instead.\n"
    "3. **write_workspace_file_tool** to save something the user should be able to open — a table, CSV, markdown or "
    "notes. A bare filename lands in `out/`.\n"
    "Files are scoped to this conversation: never reference a path outside it, and do not claim to have run code — "
    "writing a file is not executing one.\n"
)
