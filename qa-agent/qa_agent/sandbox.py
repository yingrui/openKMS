"""Run Python for a conversation, in a container that belongs to the conversation.

问策 needs computation the Catalog cannot express — indicators, rolling windows, cross-dataset comparisons, a chart. The KB
agent could write a file but not produce one, and its prompt said so.

**One container per session, not per execution.** Created on the session's first execution, destroyed with the session. What
that buys, measured: **60 ms per run instead of 412 ms** (no container start), and a container that keeps everything the runs
put on disk — `/workspace`, `/tmp`, anything installed into it.

What it does **not** buy: Python **variables do not survive between runs**. Each execution is `docker exec ... python -c`, a
new interpreter, so `xs = [...]` in one run is gone in the next. A persistent kernel (Jupyter or a small exec server holding a
namespace) is the only way to keep the interpreter alive across turns; until then the agent re-reads what it needs from
`/workspace`, which is also what makes a run reproducible on its own.

**Why a container and not `deep_agents/sandbox.py`:** that runner is `subprocess.run([sys.executable, ...])` as the backend's
own OS user. A child started that way reads `../../backend/.env` and the server's whole environment, and
`build_project_shell_env` puts the caller's bearer token into it. Inside a single-tenant project workspace that is a
conscious trade; here it would be remote code execution for strangers.

The guarantees are the `docker run` below: no network (unless a KB opts into `bridge`), **no credentials** (`--env` is never
inherited; the container gets `HOME` and nothing else), a read-only root with only the session directory mounted, capabilities
dropped, and cpu/memory ceilings. Executions are bounded by `timeout` inside the container, so a runaway loop dies and the
container survives to be used again.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Any

__all__ = [
    "DEFAULT_IMAGE",
    "ExecResult",
    "SandboxError",
    "container_name",
    "docker_available",
    "remove_container",
    "run_python",
    "sandbox_config",
]

#: Present locally in this environment; anything with a Python interpreter works, so a KB may name its own.
DEFAULT_IMAGE = "python:3.12-slim-bookworm"

#: Captured output is truncated here. A loop printing forever must not fill the agent's context or this process's memory.
MAX_OUTPUT_BYTES = 64_000

#: Wall-clock ceiling for one execution when a KB names none. The container lives much longer than any single run.
DEFAULT_TIMEOUT_SECONDS = 60

#: Idle containers are the cost of keeping one per session; the reaper removes them with their directory.
CONTAINER_PREFIX = "okms-sbx-"


class SandboxError(RuntimeError):
    """The sandbox could not be started — a configuration problem, not the user's code failing."""


@dataclass(frozen=True)
class ExecResult:
    ok: bool
    exit_code: int | None
    stdout: str
    stderr: str
    duration_ms: int
    timed_out: bool = False


def sandbox_config(agent_config: dict[str, Any] | None) -> dict[str, Any]:
    """The sandbox settings a KB asked for. `enabled` off means the tool is not offered at all."""
    raw = (agent_config or {}).get("sandbox")
    if not isinstance(raw, dict):
        return {"enabled": False}
    out: dict[str, Any] = {"enabled": bool(raw.get("enabled"))}
    if isinstance(raw.get("image"), str) and raw["image"].strip():
        out["image"] = raw["image"].strip()
    for key, low, high in (("timeout_seconds", 5, 600), ("memory_mb", 128, 8_192), ("cpus", 1, 8)):
        value = raw.get(key)
        if isinstance(value, int) and low <= value <= high:
            out[key] = value
    if raw.get("network") in ("none", "bridge"):
        out["network"] = raw["network"]
    return out


def container_name(kb_id: str, session_id: str) -> str:
    """Deterministic, so a session finds its container again after a restart — and can reap an orphan by name."""
    digest = hashlib.sha256(f"{kb_id}:{session_id}".encode()).hexdigest()[:16]
    return f"{CONTAINER_PREFIX}{digest}"


def _created_argv(session_dir: str, settings: dict[str, Any], name: str) -> list[str]:
    """The command that creates a session's container. This list *is* the security boundary's definition."""
    uid, gid = os.getuid(), os.getgid()
    return [
        "docker", "run", "--detach", "--rm",
        "--name", name,
        "--network", settings.get("network", "none"),
        "--memory", f"{settings.get('memory_mb', 512)}m",
        "--cpus", str(settings.get("cpus", 1)),
        "--pids-limit", "128",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--read-only",
        "--tmpfs", "/tmp:rw,size=256m",
        # Only the session directory: the host filesystem, the repo and the server's environment are not visible.
        "-v", f"{session_dir}:/workspace:rw",
        "-w", "/workspace",
        "--user", f"{uid}:{gid}",
        "-e", "HOME=/tmp",
        "-e", "PYTHONUNBUFFERED=1",
        settings.get("image", DEFAULT_IMAGE),
        # The container is a place to run things, not a thing that does something by itself.
        "sleep", "infinity",
    ]


def _exec_argv(name: str, code: str, timeout: int) -> list[str]:
    """One execution inside the session's container.

    `timeout` runs **inside** the container so a runaway loop is killed at its ceiling while the container survives for the
    next attempt — the agent's loop is exactly "that went wrong, try again".
    """
    return ["docker", "exec", "-w", "/workspace", name, "timeout", f"{timeout}s", "python", "-u", "-c", code]


def _docker(*argv: str, timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(list(argv), capture_output=True, timeout=timeout, text=True, errors="replace")


def docker_available() -> bool:
    return shutil.which("docker") is not None


def _running(name: str) -> bool:
    """Whether the session's container is up. `docker inspect` is the authority: a name is not a running container."""
    try:
        result = _docker("docker", "inspect", "-f", "{{.State.Running}}", name, timeout=15)
    except FileNotFoundError as exc:
        raise SandboxError("The code sandbox is not available on this host.") from exc
    return result.returncode == 0 and result.stdout.strip() == "true"


def _ensure_container(name: str, session_dir: str, settings: dict[str, Any]) -> None:
    if _running(name):
        return
    # A stopped container with the same name would refuse the create; it is stale by definition (--rm normally removes it).
    _docker("docker", "rm", "-f", name, timeout=20)
    created = _docker(*_created_argv(session_dir, settings, name), timeout=120)
    if created.returncode != 0:
        raise SandboxError(f"Could not start the sandbox: {(created.stderr or '').strip()[:200] or 'unknown error'}")


def remove_container(kb_id: str, session_id: str) -> bool:
    """Destroy a session's container. Called with the session directory, not on a timer of its own."""
    name = container_name(kb_id, session_id)
    try:
        result = _docker("docker", "rm", "-f", name, timeout=20)
    except FileNotFoundError:
        return False
    return result.returncode == 0


def run_python(
    code: str,
    *,
    kb_id: str,
    session_id: str,
    settings: dict[str, Any],
) -> ExecResult:
    """Run one snippet in the conversation's container, working in its `/workspace`."""
    from . import session_fs

    if not code.strip():
        raise SandboxError("Nothing to run.")
    session_dir = str(session_fs.ensure_session_dir(kb_id, session_id))
    name = container_name(kb_id, session_id)
    timeout = int(settings.get("timeout_seconds", DEFAULT_TIMEOUT_SECONDS))
    _ensure_container(name, session_dir, settings)

    started = time.monotonic()
    try:
        completed = _docker(*_exec_argv(name, code, timeout), timeout=timeout + 15)
    except subprocess.TimeoutExpired:
        # The outer guard: `timeout` inside should have fired first, but a wedged daemon must not wedge the agent.
        return ExecResult(
            ok=False, exit_code=None, stdout="",
            stderr=f"Stopped after {timeout}s.",
            duration_ms=int((time.monotonic() - started) * 1000), timed_out=True,
        )

    duration = int((time.monotonic() - started) * 1000)
    timed_out = completed.returncode == 124  # `timeout`'s own exit code
    return ExecResult(
        ok=completed.returncode == 0,
        exit_code=completed.returncode,
        stdout=_truncate(completed.stdout or ""),
        stderr=_truncate(completed.stderr or ""),
        duration_ms=duration,
        timed_out=timed_out,
    )


def _truncate(text: str) -> str:
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) <= MAX_OUTPUT_BYTES:
        return text
    return encoded[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace") + "\n…[truncated]"
