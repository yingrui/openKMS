"""Project workspace backend: filesystem + shell scoped to one project folder.

`deepagents`'s `LocalShellBackend.execute` runs `subprocess.run(..., timeout=N)` **on the
calling thread**, and the caller is a FastAPI request handler running on the event loop. One
slow shell command therefore froze the whole backend: `/health`, every SSE stream and every
other user's request waited behind it. It also left the process group alive on timeout, so a
stuck `python tmp/kg_update.py | tail -45` kept running after the agent gave up and retried.

Three fixes live here:

1. **Off the loop** — the blocking run happens in a worker thread, so a slow command costs one
   thread instead of the entire server.
2. **Kill the process group** — a timeout terminates the whole session `start_new_session`
   created, so `tail` and its grand-children do not outlive the tool call.
3. **Stream while running** — output is read incrementally; the caller gets partial output
   instead of waiting for a pipe to close.
"""

from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import sys
import threading
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

from deepagents.backends import LocalShellBackend

from app.services.deep_agents.command_policy import (
    DEFAULT_DENIED,
    CommandDenied,
    check_command,
)
from app.services.deep_agents.constants import MAX_TOOL_OUTPUT_BYTES


def normalize_workspace_path(cwd: Path, key: str) -> str:
    """Map agent file paths to deepagents virtual paths under ``cwd``.

    With ``virtual_mode=True``, deepagents treats ``/foo`` as ``{cwd}/foo``, not as a
    host absolute path. Host absolutes under ``cwd`` (e.g. from ls/read output) must be
    rewritten to virtual form (``/.gitignore``). Virtual paths like ``/AGENTS.md`` are
    left unchanged.
    """
    raw = (key or "").strip()
    if not raw:
        return raw

    cwd_resolved = cwd.resolve()
    p = Path(raw)

    if p.is_absolute():
        try:
            rel = p.resolve().relative_to(cwd_resolved)
        except ValueError:
            rel = None
        if rel is not None:
            if rel.as_posix() == ".":
                return "/"
            return f"/{rel.as_posix()}"

        cwd_str = str(cwd_resolved)
        if raw == cwd_str:
            return "/"
        prefix = cwd_str.rstrip("/") + "/"
        if raw.startswith(prefix):
            rel_str = raw[len(prefix) :]
            return f"/{rel_str}" if rel_str else "/"

    return raw


@dataclass
class ShellResult:
    """What one shell command produced, including the case where it was cut short."""

    output: str = ""
    exit_code: int = 0
    truncated: bool = False
    timed_out: bool = False
    killed: bool = False
    _chunks: list[str] = field(default_factory=list)


def _kill_group(proc: subprocess.Popen[str]) -> None:
    """Terminate the whole session, not just the shell.

    `start_new_session=True` makes the command a process-group leader, so a pipe like
    `python script.py | tail -45` has both halves in one group. Killing only the leader left
    `tail` (and any grandchildren) running; the group kill is what actually stops the work.
    """
    if proc.poll() is not None:
        return
    try:
        if sys.platform == "win32":
            proc.kill()
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        # Already gone, or the group id is not ours to signal.
        try:
            proc.kill()
        except OSError:
            pass


def run_shell_command(
    command: str,
    *,
    cwd: Path,
    env: dict[str, str] | None,
    timeout: float,
    max_output_bytes: int = MAX_TOOL_OUTPUT_BYTES,
) -> ShellResult:
    """Run one command, reading output as it arrives, and never leave a process behind.

    The deadline is enforced **while reading**, not after: a pipeline like
    `python x.py | tail -45` prints nothing until stdin closes, so a post-read wait would sit
    on the pipe for the entire timeout and then some. A watchdog kills the process group at
    the deadline, which closes the pipe and releases the read loop.
    """
    proc = subprocess.Popen(  # shell=True is the point: agent-controlled commands
        command,
        shell=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env,
        cwd=str(cwd),
        start_new_session=True,
    )
    chunks: list[str] = []
    size = 0
    truncated = False
    killed_by_deadline = threading.Event()

    def _watchdog() -> None:
        killed_by_deadline.set()
        _kill_group(proc)

    timer = threading.Timer(max(1.0, timeout), _watchdog)
    timer.daemon = True
    timer.start()
    try:
        assert proc.stdout is not None
        # `readline` returns as the command prints, which is the difference between
        # "Thinking..." forever and a visible progress log.
        for line in proc.stdout:
            if size + len(line) > max_output_bytes:
                chunks.append(line[: max(0, max_output_bytes - size)])
                truncated = True
                _kill_group(proc)
                break
            chunks.append(line)
            size += len(line)
        try:
            proc.wait(timeout=max(1.0, timeout))
        except subprocess.TimeoutExpired:
            killed_by_deadline.set()
            _kill_group(proc)
            proc.wait(timeout=5)
    finally:
        timer.cancel()
        if proc.poll() is None:
            _kill_group(proc)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
        if proc.stdout is not None:
            proc.stdout.close()

    timed_out = killed_by_deadline.is_set() and not truncated
    output = "".join(chunks)
    if timed_out:
        output = (
            f"{output.rstrip()}\n\n"
            f"Error: Command timed out after {timeout:g} seconds and was killed. "
            "Long-running commands: split them up, or stream progress so the turn can see it."
        ).strip()
    if truncated:
        output = f"{output.rstrip()}\n\n... Output truncated at {max_output_bytes} bytes."
    return ShellResult(
        output=output or "<no output>",
        exit_code=124 if timed_out else (proc.returncode or 0),
        truncated=truncated,
        timed_out=timed_out,
    )


async def run_shell_command_async(
    command: str,
    *,
    cwd: Path,
    env: dict[str, str] | None,
    timeout: float,
    max_output_bytes: int = MAX_TOOL_OUTPUT_BYTES,
) -> ShellResult:
    """`run_shell_command` on a worker thread.

    The blocking run must never happen on the event loop: it is the difference between one
    slow command costing a thread and costing the whole server.
    """
    return await asyncio.to_thread(
        run_shell_command,
        command,
        cwd=cwd,
        env=env,
        timeout=timeout,
        max_output_bytes=max_output_bytes,
    )


class ProjectWorkspaceBackend(LocalShellBackend):
    """`LocalShellBackend` with normalized paths, a thread-safe shell and a real timeout."""

    def __init__(
        self,
        root_dir: str | Path | None = None,
        *,
        virtual_mode: bool = True,
        timeout: int = 120,
        max_output_bytes: int = 100_000,
        env: dict[str, str] | None = None,
        inherit_env: bool = False,
        denied_commands: Iterable[str] | None = None,
    ) -> None:
        super().__init__(
            root_dir=root_dir,
            virtual_mode=virtual_mode,
            timeout=timeout,
            max_output_bytes=max_output_bytes,
            env=env,
            inherit_env=inherit_env,
        )
        # Empty tuple = policy disabled; None = the module defaults.
        self._denied_commands = DEFAULT_DENIED if denied_commands is None else tuple(denied_commands)

    def _resolve_path(self, key: str) -> Path:
        return super()._resolve_path(normalize_workspace_path(self.cwd, key))

    def execute(self, command: str, *, timeout: int | None = None):  # type: ignore[override]
        """Run one command; blocks, so callers must be off the event loop (see `aexecute`)."""
        from deepagents.backends.protocol import ExecuteResponse

        if not command or not isinstance(command, str):
            return ExecuteResponse(
                output="Error: Command must be a non-empty string.",
                exit_code=1,
                truncated=False,
            )
        # A denial is reported as a tool result, not raised: the model sees the boundary and
        # can choose another approach instead of the turn failing.
        try:
            check_command(command, self._denied_commands)
        except CommandDenied as denied:
            return ExecuteResponse(output=denied.reason, exit_code=126, truncated=False)
        effective = timeout if timeout is not None else self._default_timeout
        result = run_shell_command(
            command,
            cwd=self.cwd,
            env=self._env,
            timeout=float(effective),
            max_output_bytes=self._max_output_bytes,
        )
        return ExecuteResponse(
            output=result.output,
            exit_code=result.exit_code,
            truncated=result.truncated,
        )

    async def aexecute(self, command: str, *, timeout: int | None = None):  # type: ignore[override]
        """Async variant used by the agent loop.

        `subprocess.run`/`Popen` are blocking calls. Running them on the event loop was what
        let one slow shell command freeze the entire backend — `/health`, every other
        session's SSE stream, and this very request. Delegating to `execute` through a worker
        thread costs one thread per running command instead.
        """
        return await asyncio.to_thread(self.execute, command, timeout=timeout)
