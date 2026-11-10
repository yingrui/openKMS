"""The `run_python` tool: computation inside the conversation's own workspace.

Offered only when a KB sets `sandbox.enabled`, because it is the one capability that runs code — see `qa_agent/sandbox.py`
for what the container guarantees and why the project runtime's subprocess runner could not be reused.
"""
from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from .. import sandbox as sandbox_runner
from ..request_context import get_tool_knowledge_base_id, get_tool_session_id


def _settings(config: RunnableConfig) -> dict[str, Any]:
    """The sandbox settings, taken from the request context like the session and the token — not from a tool argument."""
    from ..request_context import get_tool_sandbox

    return get_tool_sandbox(config)


@tool
def run_python_tool(code: str, _config: RunnableConfig) -> str:
    """Run Python in this conversation's workspace. The working directory is `/workspace`, which is the conversation's own
    directory: a file written there is visible to the user, so save results under `out/`.

    No network. Nothing outside `/workspace` is readable. The interpreter has the standard library plus pandas, numpy and
    matplotlib when the configured image provides them. Print the numbers you want to report — stdout is what you see.
    """
    kb_id = get_tool_knowledge_base_id(_config)
    session_id = get_tool_session_id(_config)
    if not kb_id or not session_id:
        return "Error: no conversation in scope."
    settings = _settings(_config)
    if not settings.get("enabled"):
        return "Error: the code sandbox is not enabled for this knowledge base."
    try:
        result = sandbox_runner.run_python(code, kb_id=kb_id, session_id=session_id, settings=settings)
    except sandbox_runner.SandboxError as exc:
        return f"Error: {exc}"

    parts = [f"exit={result.exit_code} · {result.duration_ms} ms" + (" · stopped on timeout" if result.timed_out else "")]
    if result.stdout.strip():
        parts.append("stdout:\n" + result.stdout.rstrip())
    if result.stderr.strip():
        parts.append("stderr:\n" + result.stderr.rstrip())
    if not result.stdout.strip() and not result.stderr.strip():
        parts.append("(no output)")
    return "\n\n".join(parts)


SANDBOX_PROMPT = (
    "**Code skill** – You can run Python in this conversation's workspace with **run_python_tool**:\n"
    "1. The working directory is `/workspace`, the same directory the file tools use. Write artifacts to `out/`.\n"
    "2. There is **no network**. Use installed libraries only (standard library, and pandas/numpy/matplotlib when the image "
    "has them).\n"
    "3. Print what you want to report: stdout is the evidence. Say which numbers the run produced, and do not state a "
    "number the run did not print or a cited source did not contain.\n"
    "4. A non-zero exit or a message about a timeout is information, not a failure of the conversation — fix the code and "
    "run it again, or say what could not be computed.\n"
)

sandbox_tools: list[Any] = [run_python_tool]
