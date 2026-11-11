"""Run code for a conversation, in the conversation's own folder, as the user who asked.

The design follows the **project agent**, because that is the shape this product already has: a workspace directory, a
subprocess of the service, a timeout, an output cap, and a command policy. It is a **guard rail, not a sandbox** — the
project's own words — and this module says the same thing: code runs with the qa-agent process's OS user, so it can read what
that user can read. The folder is what keeps sessions apart, not the kernel.

What the folder boundary is:

- the working directory is the **session** directory, so `out/`, `uploads/` and `tmp/` are this conversation's;
- `..` and absolute paths outside it are refused by the file tools (`session_fs`), so another conversation's files are not
  reachable *through the tools*;
- **skills are per knowledge base, not per session**: `{sessions_root}/{kb_id}/skills/` is shared by every conversation of
  that KB and outlives them. It is on `PYTHONPATH`, so a skill's scripts are importable the same way in every session.

Credentials: the subprocess gets the **user's own JWT** (`OPENKMS_API_KEY`), the same token every tool call carries, so code
and skill CLIs reach internal services with exactly that user's permissions. It does **not** inherit the agent's environment —
no model keys, no database URL.
"""
from __future__ import annotations

import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

__all__ = [
    "ALLOWED_COMMANDS",
    "CommandNotAllowed",
    "ExecResult",
    "SandboxError",
    "allowed_commands",
    "check_command",
    "run_python",
    "run_command",
    "sandbox_config",
]

#: Wall-clock ceiling for one execution when a KB names none.
DEFAULT_TIMEOUT_SECONDS = 60

#: Memory ceiling for one execution. Generous — a dataframe of a few million rows fits — because the point is not to police
#: honest work; it is that a runaway allocation must fail *itself* instead of triggering the kernel's OOM killer, which takes
#: the whole qa-agent process (and everyone else's conversations) with it.
DEFAULT_MEMORY_MB = 2048

#: Captured output is truncated here, per stream.
MAX_OUTPUT_BYTES = 64_000

#: What a shell command may start with. Python is separate (`run_python`); this list is for the shell tool, where a wrong
#: command is a wrong *program*, not a wrong expression. Anything not here is refused before it runs.
ALLOWED_COMMANDS: frozenset[str] = frozenset(
    """
    python python3 pip pip3
    ls cat head tail wc sort uniq cut tr grep find xargs
    mkdir cp mv rm rmdir touch ln
    echo printf pwd seq date basename dirname realpath
    awk sed jq
    git make tar gzip gunzip unzip zip
    """.split()
)

#: Shell separators: a command starts after each of them, so the check looks at positions rather than substrings.
_SEPARATORS = frozenset({"&&", "||", ";", "|", "&", "\n", ";;", "(", ")"})

#: Wrappers that put a new command at the following position: `sudo ls`, `env A=1 ls`, `nohup python x.py`.
_WRAPPERS = frozenset({"sudo", "env", "nohup", "time", "command", "exec", "builtin", "xargs"})

#: Interpretation happens inside a string, so the policy is re-run on the body.
_INLINE_EXECUTORS = frozenset({"sh", "bash", "zsh", "dash", "ksh"})

#: Variables passed through into the subprocess. A curated list, not `os.environ.copy()`: the agent holds model keys and a
#: database URL, and none of that belongs in code a user asked for.
_PASSTHROUGH_ENV = ("PATH", "LANG", "LC_ALL", "TZ", "TMPDIR", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY")


class SandboxError(RuntimeError):
    """The execution could not be started — a configuration problem, not the user's code failing."""


class CommandNotAllowed(SandboxError):
    """A command outside the allow list. Refused before it runs, with the allowed set named."""

    def __init__(self, command: str, allowed: frozenset[str]) -> None:
        self.command = command
        super().__init__(
            f"`{command}` is not in this knowledge base's command allow list. Allowed: "
            + ", ".join(sorted(allowed))
            + "."
        )


@dataclass(frozen=True)
class ExecResult:
    ok: bool
    exit_code: int | None
    stdout: str
    stderr: str
    duration_ms: int
    timed_out: bool = False


def sandbox_config(agent_config: dict[str, Any] | None) -> dict[str, Any]:
    """The execution settings a KB asked for. `enabled` off means no code tools are offered."""
    raw = (agent_config or {}).get("sandbox")
    if not isinstance(raw, dict):
        return {"enabled": False}
    out: dict[str, Any] = {"enabled": bool(raw.get("enabled"))}
    for key, low, high in (("timeout_seconds", 5, 600), ("memory_mb", 256, 8_192)):
        value = raw.get(key)
        if isinstance(value, int) and low <= value <= high:
            out[key] = value
    if isinstance(raw.get("allow_commands"), list):
        extra = {str(c).strip() for c in raw["allow_commands"] if isinstance(c, str) and str(c).strip()}
        if extra:
            out["allow_commands"] = sorted(extra)
    return out


def allowed_commands(settings: dict[str, Any]) -> frozenset[str]:
    """The built-in allow list, plus anything this KB added. Additive: a KB can widen, not narrow, without a code change.

    `settings` is `sandbox_config(agent_config)`, which already lifted the KB's `allow_commands` out of the config — passing
    the config again looked like a second source and was never used.
    """
    extra = settings.get("allow_commands") or []
    return ALLOWED_COMMANDS | {str(c) for c in extra if isinstance(c, str)}


def check_command(command: str, allowed: frozenset[str]) -> None:
    """Refuse a shell command whose program is not allowed. Matched **by position**, so `grep docker notes.md` is fine.

    Wrappers (`sudo`, `env`, `nohup`) are looked past; `sh -c "…"` re-runs the policy on the string, because otherwise the
    interpreter becomes a way around the list.
    """
    for segment in re.split(r"(\n|&&|\|\||;|;;|\||&)", command or ""):
        part = (segment or "").strip()
        if not part or part in _SEPARATORS:
            continue
        try:
            tokens = shlex.split(part)
        except ValueError:
            tokens = part.split()
        if not tokens:
            continue
        head = tokens[0]
        while head in _WRAPPERS and len(tokens) > 1:
            tokens = tokens[1:]
            # `env A=1 cmd` → skip the assignments
            while tokens and "=" in tokens[0] and not tokens[0].startswith("-"):
                tokens = tokens[1:]
            if not tokens:
                return
            head = tokens[0]
        if head not in allowed:
            raise CommandNotAllowed(head, allowed)
        if head in _INLINE_EXECUTORS and len(tokens) >= 3 and tokens[1] == "-c":
            check_command(tokens[2], allowed)


def _env(kb_id: str, session_id: str, access_token: str) -> dict[str, str]:
    """A curated environment: the user's authority, and nothing of the agent's own."""
    from . import session_fs
    from .config import settings

    env = {key: os.environ[key] for key in _PASSTHROUGH_ENV if key in os.environ}
    env["HOME"] = str(session_fs.session_root(kb_id, session_id) / "tmp")
    env["PYTHONUNBUFFERED"] = "1"
    env["MPLBACKEND"] = "Agg"  # a chart is written to a file; there is no display
    # One font cache for the whole service. `HOME` is the session's `tmp/`, so the default location would rebuild it in every
    # new conversation — measured at ~10 s per first chart.
    cache = Path(settings.sessions_root).expanduser().resolve() / ".mplconfig"
    cache.mkdir(parents=True, exist_ok=True)
    env["MPLCONFIGDIR"] = str(cache)
    paths = [str(session_fs.session_root(kb_id, session_id))]
    skills = session_fs.kb_skills_dir(kb_id)
    if skills.is_dir():
        paths.append(str(skills))
        scripts = skills / "scripts"
        if scripts.is_dir():
            paths.append(str(scripts))
    if existing := os.environ.get("PYTHONPATH"):
        paths.append(existing)
    env["PYTHONPATH"] = os.pathsep.join(paths)
    if access_token:
        # The same bearer the tool calls carry: code and skill CLIs act with the asking user's permissions, no more.
        env["OPENKMS_API_KEY"] = access_token
        env["OPENKMS_API_BASE_URL"] = settings.openkms_backend_url.rstrip("/")
    return env


def _with_memory_ceiling(argv: list[str], memory_mb: int) -> list[str]:
    """Prefix a command with a virtual-memory limit, applied by the child's own shell before it execs.

    `ulimit -v` (KiB) is set soft **then** hard: a soft limit must never exceed the hard one, so lowering the hard limit first
    is refused while the soft limit is still unlimited — and if only the soft limit were set, the code could raise it back.
    A host that refuses (macOS will not go below the address space already in use) prints to stderr and the run proceeds
    without a ceiling, rather than failing for a reason the model cannot act on.

    Deliberately not `subprocess.Popen(preexec_fn=…)`: Python documents that hook as unsafe when the parent has threads, and
    tool calls run in a thread pool, so the old version could deadlock the service to set a limit. A shell prologue has no
    such hazard and the same effect — `exec` keeps the pid, so the timeout still kills the whole group.
    """
    kib = memory_mb * 1024
    prologue = f"ulimit -S -v {kib} 2>/dev/null; ulimit -H -v {kib} 2>/dev/null; exec \"$@\""
    return ["/bin/sh", "-c", prologue, "sh", *argv]


def _run(
    argv: list[str], *, cwd: str, env: dict[str, str], timeout: int, memory_mb: int = DEFAULT_MEMORY_MB
) -> ExecResult:
    started = time.monotonic()
    if os.name == "posix" and memory_mb > 0:
        argv = _with_memory_ceiling(argv, memory_mb)
    try:
        proc = subprocess.Popen(  # no shell of its own; the prologue below is the only one, and it only execs
            argv,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            errors="replace",
            start_new_session=True,  # so a timeout can kill the whole process group, grandchildren included
        )
    except FileNotFoundError as exc:
        raise SandboxError("The interpreter for this execution is not available.") from exc

    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        _kill_group(proc)
        return ExecResult(
            ok=False, exit_code=None, stdout="",
            stderr=f"Stopped after {timeout}s.",
            duration_ms=int((time.monotonic() - started) * 1000), timed_out=True,
        )
    return ExecResult(
        ok=proc.returncode == 0,
        exit_code=proc.returncode,
        stdout=_truncate(stdout or ""),
        stderr=_truncate(stderr or ""),
        duration_ms=int((time.monotonic() - started) * 1000),
    )


def _kill_group(proc: subprocess.Popen) -> None:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        proc.kill()
    try:
        proc.communicate(timeout=5)
    except (subprocess.TimeoutExpired, ValueError):
        pass


def run_python(
    code: str,
    *,
    kb_id: str,
    session_id: str,
    settings: dict[str, Any],
    access_token: str = "",
) -> ExecResult:
    """Run one Python snippet in the conversation's folder."""
    from . import session_fs

    if not code.strip():
        raise SandboxError("Nothing to run.")
    session_dir = str(session_fs.ensure_session_dir(kb_id, session_id))
    if not shutil.which(sys.executable):
        raise SandboxError("The interpreter for this execution is not available.")
    result = _run(
        [sys.executable, "-u", "-c", code],
        cwd=session_dir,
        env=_env(kb_id, session_id, access_token),
        timeout=int(settings.get("timeout_seconds", DEFAULT_TIMEOUT_SECONDS)),
        memory_mb=int(settings.get("memory_mb", DEFAULT_MEMORY_MB)),
    )
    report_execution(
        kb_id=kb_id, session_id=session_id, kind="python", result=result, code=code, access_token=access_token
    )
    return result


def run_command(
    command: str,
    *,
    kb_id: str,
    session_id: str,
    settings: dict[str, Any],
    access_token: str = "",
) -> ExecResult:
    """Run one shell command, if every program it starts is on the allow list."""
    from . import session_fs

    allowed = allowed_commands(settings)
    check_command(command, allowed)
    session_dir = str(session_fs.ensure_session_dir(kb_id, session_id))
    result = _run(
        ["/bin/sh", "-c", command],
        cwd=session_dir,
        env=_env(kb_id, session_id, access_token),
        timeout=int(settings.get("timeout_seconds", DEFAULT_TIMEOUT_SECONDS)),
        memory_mb=int(settings.get("memory_mb", DEFAULT_MEMORY_MB)),
    )
    report_execution(
        kb_id=kb_id,
        session_id=session_id,
        kind="command",
        result=result,
        code=command,
        program=(command.split() or [None])[0],
        access_token=access_token,
    )
    return result


def report_execution(
    *,
    kb_id: str,
    session_id: str,
    kind: str,
    result: ExecResult,
    code: str,
    program: str | None = None,
    access_token: str = "",
) -> None:
    """Tell the backend what ran, so it lands in the audit log with the user as the actor.

    Best effort by design: the execution already happened, and an audit write that fails must not turn a successful run into
    an error the model has to explain. The code itself is not sent — a size and a short hash identify it without storing it.
    """
    import hashlib
    import json
    import urllib.request

    from .config import settings

    if not access_token:
        return
    payload = {
        "knowledge_base_id": kb_id,
        "session_id": session_id,
        "kind": kind,
        "exit_code": result.exit_code,
        "duration_ms": result.duration_ms,
        "timed_out": result.timed_out,
        "code_chars": len(code or ""),
        "code_sha": hashlib.sha256((code or "").encode()).hexdigest()[:12],
        "program": program,
    }
    url = f"{settings.openkms_backend_url.rstrip('/')}/internal-api/executions"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=3):
            return
    except (OSError, ValueError) as exc:  # network, auth, malformed — none of which the model should hear about
        import logging

        logging.getLogger(__name__).debug("execution audit not recorded: %s", exc)


def _truncate(text: str) -> str:
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) <= MAX_OUTPUT_BYTES:
        return text
    return encoded[:MAX_OUTPUT_BYTES].decode("utf-8", errors="replace") + "\n…[truncated]"
