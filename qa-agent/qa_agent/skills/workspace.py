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

from typing import Annotated, Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from .. import session_fs
from ..request_context import get_tool_knowledge_base_id, get_tool_session_id

#: Where a write goes when the caller does not say. `out/` is the directory the product shows to the user.
ARTIFACT_DIR = "out"


def _scope(config: RunnableConfig) -> tuple[str, str]:
    kb_id = get_tool_knowledge_base_id(config)
    session_id = get_tool_session_id(config)
    if not kb_id or not session_id:
        raise ValueError("No session in scope: this conversation has no workspace.")
    # Materialise on first use. No `AGENTS.md` is written here any more: the conventions reach the model through the
    # system prompt, and a per-conversation copy was a second source that edits could never survive.
    session_fs.ensure_session_dir(kb_id, session_id)
    return kb_id, session_id


@tool
def list_files(
    _config: RunnableConfig,
    path: Annotated[str, "Directory inside the conversation; empty for the root"] = "",
) -> str:
    """ Files in this conversation's directory, as relative paths."""
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
def read_file(
    path: Annotated[str, "Path relative to the conversation directory"],
    _config: RunnableConfig,
) -> str:
    """ One text file from this conversation's directory; binary files report their size."""
    try:
        kb_id, session_id = _scope(_config)
        payload = session_fs.read_file(kb_id, session_id, path)
        if payload["is_binary"]:
            return f"{payload['path']} is not text ({payload['size']} bytes, {payload.get('mime') or 'unknown type'})."
        return str(payload["content"])
    except (ValueError, session_fs.SessionPathError) as exc:
        return f"Error reading {path}: {exc}"


@tool
def write_file(
    path: Annotated[str, "Relative path; a bare name lands in out/"],
    content: Annotated[str, "Text to write"],
    _config: RunnableConfig,
) -> str:
    """ Write a text file into this conversation's directory and return its path."""
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
    list_files,
    read_file,
    write_file,
]


