"""Run Python for a conversation, inside a container.

问策 needs computation the Catalog cannot express — indicators, rolling windows, cross-dataset comparisons, a chart. The KB
agent could write a file but not produce one, and its prompt said so.

**Why a container and not `deep_agents/sandbox.py`:** that runner is `subprocess.run([sys.executable, ...])` as the backend's
own OS user. A child started that way reads `../../backend/.env` and the server's whole environment, and
`build_project_shell_env` puts the caller's bearer token into it. Inside a single-tenant project workspace that is a
conscious trade; here it would be remote code execution for strangers.

What this module guarantees, each one a line in the docker invocation:

- **no network** (`--network none`) unless a KB opts into `bridge`;
- **no credentials**: no `-e OPENKMS_*`, and `--env` is not inherited — the container gets `HOME` and that is all. The Catalog
  is reached through tool calls the agent makes, never through a key arbitrary code could read;
- **read-only filesystem** except the session directory, which is mounted at `/workspace` and is the only place writes land;
- **caps dropped**, `no-new-privileges`, a pid limit;
- **quotas** — cpu, memory, wall-clock — where a kill is a tool error the model can react to, not a 500;
- **a non-root user** equal to the host user, so artifacts come out owned by whoever will read them.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Any

__all__ = ["DEFAULT_IMAGE", "ExecResult", "SandboxError", "sandbox_config", "run_python"]

#: Present locally in this environment; anything with a Python interpreter works, so a KB may name its own.
DEFAULT_IMAGE = "python:3.12-slim-bookworm"

#: Captured output is truncated here. A loop printing forever must not fill the agent's context or this process's memory.
MAX_OUTPUT_BYTES = 64_000

#: Wall-clock ceiling when a KB names none.
DEFAULT_TIMEOUT_SECONDS = 60


class SandboxError(RuntimeError):
    """The sandbox could not be started at all — a configuration problem, not the user's code failing."""


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


def _docker_argv(code: str, session_dir: str, settings: dict[str, Any], name: str) -> list[str]:
    """The command, built where it can be read and tested — this list is the security boundary's whole definition."""
    uid, gid = os.getuid(), os.getgid()
    argv = [
        "docker", "run", "--rm",
        "--name", name,
        "--network", settings.get("network", "none"),
        "--memory", f"{settings.get('memory_mb', 512)}m",
        "--cpus", str(settings.get("cpus", 1)),
        "--pids-limit", "128",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--read-only",
        "--tmpfs", "/tmp:rw,size=64m",
        # Only the session directory: the host filesystem, the repo and the server's environment are not visible.
        "-v", f"{session_dir}:/workspace:rw",
        "-w", "/workspace",
        "--user", f"{uid}:{gid}",
        "-e", "HOME=/tmp",
        "-e", "PYTHONUNBUFFERED=1",
        settings.get("image", DEFAULT_IMAGE),
        "python", "-u", "-c", code,
    ]
    return argv


def run_python(
    code: str,
    *,
    kb_id: str,
    session_id: str,
    settings: dict[str, Any],
) -> ExecResult:
    """Run one Python snippet in the conversation's workspace. Files it writes appear in `out/` (or wherever it writes)."""
    from . import session_fs

    if not code.strip():
        raise SandboxError("Nothing to run.")
    session_dir = str(session_fs.ensure_session_dir(kb_id, session_id))
    name = f"okms-sbx-{session_id[:8]}-{int(time.time() * 1000) % 100000}"
    argv = _docker_argv(code, session_dir, settings, name)
    timeout = int(settings.get("timeout_seconds", DEFAULT_TIMEOUT_SECONDS))

    started = time.monotonic()
    try:
        completed = subprocess.run(argv, capture_output=True, timeout=timeout, text=True, errors="replace")
    except subprocess.TimeoutExpired:
        # `--rm` plus a killed client can leave the container running; remove it by name.
        subprocess.run(["docker", "rm", "-f", name], capture_output=True, timeout=15)
        return ExecResult(
            ok=False,
            exit_code=None,
            stdout="",
            stderr=f"Stopped after {timeout}s.",
            duration_ms=int((time.monotonic() - started) * 1000),
            timed_out=True,
        )
    except FileNotFoundError as exc:  # docker not installed
        raise SandboxError("The code sandbox is not available on this host.") from exc

    duration = int((time.monotonic() - started) * 1000)
    return ExecResult(
        ok=completed.returncode == 0,
        exit_code=completed.returncode,
        stdout=_truncate(completed.stdout or ""),
        stderr=_truncate(completed.stderr or ""),
        duration_ms=duration,
    )


def _truncate(text: str) -> str:
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) <= MAX_OUTPUT_BYTES:
        return text
    return encoded[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace") + "\n…[truncated]"


def docker_available() -> bool:
    """Whether executions can run at all — checked once, so a KB that enabled the sandbox hears about it early."""
    return shutil.which("docker") is not None
