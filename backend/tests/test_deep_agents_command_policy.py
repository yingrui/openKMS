"""Host-control command policy for project agent shells."""

from __future__ import annotations

import pytest

from app.services.runtime.deep_agents.command_policy import (
    DEFAULT_DENIED,
    CommandDenied,
    check_command,
    find_violation,
    parse_denied,
)
from app.services.runtime.deep_agents.project_backend import ProjectWorkspaceBackend


# --- Config parsing -----------------------------------------------------------------

def test_unset_uses_defaults() -> None:
    assert parse_denied(None) == DEFAULT_DENIED


def test_empty_string_disables_policy() -> None:
    """Local dev may legitimately need docker; an explicit empty value opts out."""
    assert parse_denied("") == ()
    assert parse_denied("   ") == ()


def test_custom_list_is_trimmed_and_deduped() -> None:
    assert parse_denied(" docker , kubectl ,, terraform ") == ("docker", "kubectl", "terraform")


# --- Blocked: host control ----------------------------------------------------------

@pytest.mark.parametrize(
    "command",
    [
        "docker ps -a",
        "docker start neo4j-container",
        "kubectl get pods -n stock",
        "kubectl get pods 2>/dev/null | grep -i neo4j",
        "git status && kubectl get pods",
        "sudo -n docker ps",
        "env FOO=1 kubectl get pods",
        "sh -c 'docker ps'",
        "bash -c 'kubectl get pods'",
        "/usr/local/bin/docker ps",
        "ps aux | grep uvicorn",
        "lsof -nP -iTCP:8102",
    ],
)
def test_host_control_commands_are_blocked(command: str) -> None:
    violation = find_violation(command, DEFAULT_DENIED)
    assert violation is not None, command
    assert isinstance(violation, CommandDenied)


@pytest.mark.parametrize(
    "command",
    [
        "python -c \"import psycopg2\"",
        "rg psycopg backend/",
        "grep -n 'ps aux' notes.md",
        "python3 -c 'import psutil'",
    ],
)
def test_process_inspection_lookalikes_are_allowed(command: str) -> None:
    """Blocking `ps`/`lsof` must not catch `psycopg2`, `psutil` or quoted prose."""
    assert find_violation(command, DEFAULT_DENIED) is None, command


def test_denial_message_explains_boundary_to_the_model() -> None:
    violation = find_violation("docker ps", DEFAULT_DENIED)
    assert violation is not None
    assert "blocked" in violation.reason
    assert "dedicated APIs" in violation.reason


# --- Allowed: legitimate work that merely mentions a denied word ---------------------

@pytest.mark.parametrize(
    "command",
    [
        "cd docker && ls",           # directory name
        "ls docker/",
        "rg docker backend/",         # argument
        "grep -r kubectl .",
        "cat file | grep docker",
        "echo 'docker ps'",           # inert string
        "python3 -c \"print(1)\"",
        "python .openkms/skills/openkms/scripts/cli.py ontology objects list",
        "git status",
    ],
)
def test_legitimate_commands_are_not_blocked(command: str) -> None:
    assert find_violation(command, DEFAULT_DENIED) is None, command


def test_empty_policy_allows_everything() -> None:
    assert find_violation("docker ps", ()) is None


# --- Backend integration ------------------------------------------------------------

def _backend(denied: tuple[str, ...]) -> ProjectWorkspaceBackend:
    return ProjectWorkspaceBackend(
        root_dir="/tmp",
        virtual_mode=True,
        inherit_env=False,
        env={},
        timeout=5,
        denied_commands=denied,
    )


def test_backend_returns_tool_result_instead_of_raising() -> None:
    """A denial must reach the model as an observation, not fail the turn."""
    response = _backend(DEFAULT_DENIED).execute("docker ps -a")
    assert response.exit_code == 126
    assert "blocked" in response.output


def test_backend_still_runs_allowed_commands() -> None:
    response = _backend(DEFAULT_DENIED).execute("echo hello-probe")
    assert response.exit_code == 0
    assert "hello-probe" in response.output


def test_backend_with_disabled_policy_runs_blocked_command() -> None:
    """Disabling is real: the command is not intercepted (it may fail on its own merits)."""
    response = _backend(()).execute("docker ps -a")
    assert "blocked in this workspace shell" not in response.output


def test_check_command_raises_for_callers_that_want_it() -> None:
    with pytest.raises(CommandDenied):
        check_command("kubectl get pods", DEFAULT_DENIED)
