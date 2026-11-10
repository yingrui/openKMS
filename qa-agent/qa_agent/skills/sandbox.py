"""Code tools: Python, and a shell limited to an allow list.

Offered only when a KB sets `sandbox.enabled`, because this is the one capability that runs code. The folder is the session's
own, skills are shared per knowledge base, and the environment carries the **user's own JWT** — so code and skill CLIs act with
the asking user's permissions, exactly as the tool calls do.

The guard rail is `sandbox.check_command`: a shell command may only start programs from an allow list, matched by position.
It is not OS isolation, and `qa_agent/sandbox.py` says so — the project agent's runner is the precedent, with the same caveat.
"""
from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from .. import sandbox as sandbox_runner
from ..request_context import get_tool_access_token, get_tool_knowledge_base_id, get_tool_session_id


def _scope(config: RunnableConfig) -> tuple[str, str, dict[str, Any]]:
    from ..request_context import get_tool_sandbox

    kb_id = get_tool_knowledge_base_id(config)
    session_id = get_tool_session_id(config)
    if not kb_id or not session_id:
        raise ValueError("No conversation in scope.")
    return kb_id, session_id, get_tool_sandbox(config)


def _render(result: sandbox_runner.ExecResult) -> str:
    head = f"exit={result.exit_code} · {result.duration_ms} ms" + (" · stopped on timeout" if result.timed_out else "")
    parts = [head]
    if result.stdout.strip():
        parts.append("stdout:\n" + result.stdout.rstrip())
    if result.stderr.strip():
        parts.append("stderr:\n" + result.stderr.rstrip())
    if not result.stdout.strip() and not result.stderr.strip():
        parts.append("(no output)")
    return "\n\n".join(parts)


@tool
def run_python_tool(code: str, _config: RunnableConfig) -> str:
    """Run Python in this conversation's workspace (the working directory). Files written there are visible to the user,
    so save results under `out/`.

    Skills of this knowledge base are on `PYTHONPATH` (`{kb}/skills/`, `{kb}/skills/scripts/`), and `OPENKMS_API_KEY` holds
    the asking user's token, so a skill CLI can call openKMS with that user's permissions. Print the numbers you want to
    report: stdout is the evidence.
    """
    try:
        kb_id, session_id, settings = _scope(_config)
    except ValueError as exc:
        return f"Error: {exc}"
    if not settings.get("enabled"):
        return "Error: code execution is not enabled for this knowledge base."
    try:
        result = sandbox_runner.run_python(
            code,
            kb_id=kb_id,
            session_id=session_id,
            settings=settings,
            access_token=get_tool_access_token(_config),
        )
    except sandbox_runner.SandboxError as exc:
        return f"Error: {exc}"
    return _render(result)


@tool
def run_command_tool(command: str, _config: RunnableConfig) -> str:
    """Run a shell command in this conversation's workspace. Only programs on this knowledge base's allow list may start a
    command; anything else is refused before it runs. Prefer `run_python_tool` unless a command-line tool is the point
    (`git`, `jq`, `sed`)."""
    try:
        kb_id, session_id, settings = _scope(_config)
    except ValueError as exc:
        return f"Error: {exc}"
    if not settings.get("enabled"):
        return "Error: code execution is not enabled for this knowledge base."
    try:
        result = sandbox_runner.run_command(
            command,
            kb_id=kb_id,
            session_id=session_id,
            settings=settings,
            access_token=get_tool_access_token(_config),
        )
    except sandbox_runner.CommandNotAllowed as exc:
        return f"Refused: {exc}"
    except sandbox_runner.SandboxError as exc:
        return f"Error: {exc}"
    return _render(result)


SANDBOX_PROMPT = (
    "**Code skill** – You can run Python and shell commands in this conversation's workspace:\n"
    "1. **run_python_tool** for computation. The working directory is the conversation's folder; write artifacts to `out/`.\n"
    "2. **run_command_tool** only for command-line tools — every program it starts must be on this knowledge base's allow "
    "list, and anything else is refused before it runs.\n"
    "3. Skills of this knowledge base are on `PYTHONPATH`, and `OPENKMS_API_KEY` is the asking user's token: code acts with "
    "**their** permissions, never more.\n"
    "4. Print what you want to report — stdout is the evidence. Do not state a number the run did not print or a cited "
    "source did not contain.\n"
    "5. A non-zero exit or a timeout is information: fix the code and run it again, or say what could not be computed.\n"
)

sandbox_tools: list[Any] = [run_python_tool, run_command_tool]
