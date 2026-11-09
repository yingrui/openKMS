"""Configurable command allow/deny policy for project agent shells.

The agent's ``execute`` tool runs ``subprocess.Popen(shell=True)`` with the backend process's
own user, **outside** the project directory and without any OS-level isolation. That is
deliberate — the agent needs real Python, git and the installed skill CLIs. But it also means a
turn that cannot finish its task will happily start inspecting the host: ``docker ps`` to find
containers, ``kubectl get pods`` to find the cluster, ``ps``/``lsof`` to find the API process.
None of that is the user's task, and none of it is needed: every cluster operation the product
supports already goes through the Python client in ``services/kubernetes``.

Commands are matched **by position**, not by substring. ``cd docker && ls`` is ordinary work
that mentions a denied binary; only a word where a command actually starts counts. That keeps
the policy from blocking legitimate commands that merely reference these names.

**This is a guard rail, not a sandbox.** It stops the model from stumbling into host
inspection and makes the boundary explicit; it does not stop a determined escape
(``python -c "import subprocess; subprocess.run(['docker','ps'])"`` gets through). Real
isolation needs a container or VM around the shell — see the module docstring of
``project_backend.py``.
"""

from __future__ import annotations

import logging
import re
import shlex
from collections.abc import Iterable

logger = logging.getLogger(__name__)

# Shell metacharacters that separate one command from the next. A denied binary is only a
# violation when it appears at the start of a segment (`a && docker ps`), not mid-argument
# (`grep docker file.txt`).
_SEPARATORS = frozenset({"&&", "||", ";", "|", "&", "\n", ";;"})

# Wrappers that put a *new* command at the following position, so the check must look past
# them: `sudo docker ps`, `env X=1 docker ps`, `nohup kubectl ...`.
_WRAPPERS = frozenset({"sudo", "env", "nohup", "time", "command", "exec", "builtin", "xargs"})

# `sh -c "docker ps"` hides the real command inside a string. Rather than parse every shell
# dialect, re-run the policy on the script body when one of these is invoked with `-c`.
_INLINE_EXECUTORS = frozenset({"sh", "bash", "zsh", "dash", "ksh", "python", "python3"})

# Default host-control binaries. These are not part of any project task, and the product has
# dedicated APIs for what they would do (Kubernetes apply/dev-sync, connector management).
# `ps`/`lsof` are included because inspecting the backend's own processes and ports was one of
# the observed detours when a skill CLI call failed.
DEFAULT_DENIED = (
    "docker",
    "docker-compose",
    "kubectl",
    "k3s",
    "minikube",
    "podman",
    "nerdctl",
    "systemctl",
    "launchctl",
    "service",
    "iptables",
    "mount",
    "umount",
    "shutdown",
    "reboot",
    "lsof",
    "ps",
)

# Redirecting into a device can wedge or wipe the host; blocked regardless of the binary.
_DENIED_REDIRECT_PREFIXES = ("/dev/sd", "/dev/disk", "/dev/rdisk", "/dev/nvme")

_REDIRECT_RE = re.compile(r">>?\s*(/dev/[A-Za-z0-9/]+)")


class CommandDenied(Exception):
    """A command hit the deny policy; message is shown to the model as the tool result."""

    def __init__(self, binary: str, reason: str) -> None:
        super().__init__(reason)
        self.binary = binary
        self.reason = reason


def parse_denied(raw: str | None) -> tuple[str, ...]:
    """Turn ``OPENKMS_AGENT_DENIED_COMMANDS`` into a tuple.

    Comma-separated, case-insensitive, ignoring blanks so an operator can leave a trailing
    comma. An **empty string** is meaningful: it disables the policy (local development where
    the agent legitimately needs ``docker``), while an unset value keeps the defaults.
    """
    if raw is None:
        return DEFAULT_DENIED
    text = raw.strip()
    if not text:
        return ()
    return tuple(
        sorted({part.strip().lower() for part in text.split(",") if part.strip()})
    )


def _strip_wrappers(segment: list[str]) -> list[str]:
    """Drop leading wrappers and their options so the real binary is first."""
    out = list(segment)
    while out:
        word = out[0].lower()
        if word in _WRAPPERS:
            out.pop(0)
            # Skip this wrapper's own flags (`sudo -n`, `env -i`).
            while out and out[0].startswith("-"):
                out.pop(0)
            # `env NAME=value cmd` / `sudo VAR=1 cmd`.
            while out and "=" in out[0] and not out[0].startswith("/"):
                out.pop(0)
            continue
        break
    return out


def _basename(token: str) -> str:
    return token.replace("\\", "/").rsplit("/", 1)[-1].lower()


def split_segments(command: str) -> list[list[str]]:
    """Tokenize into command segments, each a list of words (quotes resolved)."""
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        # Unbalanced quotes: fall back to a whitespace split so the policy still sees words
        # rather than silently allowing the command through.
        tokens = command.split()

    segments: list[list[str]] = [[]]
    for token in tokens:
        if token in _SEPARATORS or set(token) <= {"&", "|", ";"}:
            if segments[-1]:
                segments.append([])
            continue
        # `a;b` may arrive as one token when punctuation_chars groups it.
        if any(sep in token for sep in ("&&", "||", ";", "|")):
            for part in re.split(r"&&|\|\||;|\|", token):
                if part:
                    segments[-1].append(part)
            segments.append([])
            continue
        segments[-1].append(token)
    return [s for s in segments if s]


def find_violation(command: str, denied: Iterable[str]) -> CommandDenied | None:
    """Return the denial for `command`, or ``None`` when it may run."""
    denied_set = {d.lower() for d in denied}
    if not denied_set:
        return None

    for segment in split_segments(command):
        words = _strip_wrappers(segment)
        if not words:
            continue
        binary = _basename(words[0])
        if binary in denied_set:
            return CommandDenied(binary, _denied_message(binary))
        # `sh -c "docker ps"`: the real command hides inside a quoted script, so re-run the
        # check on the script body instead of comparing the whole string.
        if binary in _INLINE_EXECUTORS:
            for index, word in enumerate(words[1:], start=1):
                if word == "-c" or (word.startswith("-") and "c" in word[1:]):
                    script = " ".join(words[index + 1 :])
                    if script:
                        inner = find_violation(script, denied_set)
                        if inner is not None:
                            return inner
                    break

    for match in _REDIRECT_RE.finditer(command):
        target = match.group(1)
        if target.startswith(_DENIED_REDIRECT_PREFIXES):
            return CommandDenied(target, _denied_message(target))
    return None


def _denied_message(binary: str) -> str:
    return (
        f"`{binary}` is blocked in this workspace shell. "
        "It controls the host or cluster rather than this project, and openKMS already has "
        "dedicated APIs for those operations. "
        "Report what you need instead of inspecting the host, and continue with the project's "
        "own files, Python, git and installed skill CLIs."
    )


def check_command(command: str, denied: Iterable[str]) -> None:
    """Raise :class:`CommandDenied` when `command` violates the policy."""
    violation = find_violation(command, denied)
    if violation is not None:
        logger.warning("agent_command_denied binary=%s", violation.binary)
        raise violation
