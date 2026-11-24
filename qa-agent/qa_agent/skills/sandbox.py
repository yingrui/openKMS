"""Code tools: Python, and a shell limited to an allow list.

Offered only when a KB sets `sandbox.enabled`, because this is the one capability that runs code. The folder is the session's
own, skills are shared per knowledge base, and the environment carries the **user's own JWT** — so code and skill CLIs act with
the asking user's permissions, exactly as the tool calls do.

The guard rail is `sandbox.check_command`: a shell command may only start programs from an allow list, matched by position.
It is not OS isolation, and `qa_agent/sandbox.py` says so — the project agent's runner is the precedent, with the same caveat.
"""
from __future__ import annotations

from typing import Annotated, Any

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
def run_python(
    code: Annotated[str, "Python source to run in the conversation directory"],
    _config: RunnableConfig,
) -> str:
    """Run Python in this conversation's directory.

    Use for computation the other tools cannot express: reshaping a returned table, a calculation across several
    results. Printed output is the evidence — a value you did not print does not exist for the reader.

    Files go to `out/`; the network is not available; the program allow list does not apply to Python code."""
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
def run_command(
    command: Annotated[str, "One command line; its program must be on the allow list"],
    _config: RunnableConfig,
) -> str:
    """Run one program from this agent's allow list, in this conversation's directory.

    Use for inspection the file tools do not cover — `grep`, `head`, `wc` over a large file in this conversation. Each
    call runs one program with its arguments; a program outside the allow list is refused before it starts, and a
    command that starts another program (`find -exec`, pipes into a shell) is refused too."""
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



sandbox_tools: list[Any] = [run_python, run_command]


#: The list is appended per request rather than written here: it is per agent, and a model that cannot see it guesses a
#: program, gets refused, and spends a round learning what it could have read.
#:
ALLOW_LIST_PREFIX = "Allowed programs: "


def allowed_commands_description(settings: dict[str, Any]) -> str:
    """The `run_command` description for one request: the base text plus the programs this agent may start."""
    commands = sorted(sandbox_runner.allowed_commands(settings))
    return f"{run_command.description.strip()}\n\n{ALLOW_LIST_PREFIX}{', '.join(commands)}."
