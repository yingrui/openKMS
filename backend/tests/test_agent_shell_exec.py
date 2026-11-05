"""Shell execution in the project workspace: no orphans, no silent stalls.

A pipeline like `python x.py | tail -45` prints nothing until its input closes, so a tool call
that waits on the pipe sees no output for the whole timeout. These tests pin the three
behaviours that made a stuck command look like a frozen server:

- the deadline kills the **process group**, so `tail` and grandchildren stop too;
- output is returned even when the command is killed;
- a command that finishes quickly returns its output without waiting for the full deadline.
"""

from __future__ import annotations

import time

from app.services.deep_agents.project_backend import run_shell_command


def _run(cmd: str, *, timeout: float = 5.0, cwd=None):
    import tempfile
    from pathlib import Path

    return run_shell_command(
        cmd,
        cwd=cwd or Path(tempfile.mkdtemp()),
        env=None,
        timeout=timeout,
    )


def test_a_fast_command_returns_its_output():
    result = _run("echo hello")
    assert "hello" in result.output
    assert result.exit_code == 0
    assert not result.timed_out


def test_output_is_returned_before_the_deadline_expires():
    """The point of reading as we go: a short command does not pay the full timeout."""
    started = time.monotonic()
    result = _run("echo quick", timeout=30)
    assert time.monotonic() - started < 5
    assert "quick" in result.output
    assert not result.timed_out


def test_a_timeout_kills_the_pipeline_and_says_so():
    started = time.monotonic()
    result = _run("sleep 60 | tail -1", timeout=1)
    elapsed = time.monotonic() - started
    assert result.timed_out
    assert result.exit_code == 124
    assert "timed out" in result.output.lower()
    # Killed at the deadline, not after the command finishes on its own.
    assert elapsed < 20


def test_a_command_that_prints_then_hangs_keeps_its_partial_output():
    """A progress line must survive the kill: it is the only evidence of what ran."""
    result = _run("echo started; sleep 60", timeout=1)
    assert result.timed_out
    assert "started" in result.output


def test_a_failing_command_reports_its_exit_code():
    result = _run("exit 3")
    assert result.exit_code != 0


def test_output_is_capped():
    result = _run("yes aaaaaaaaaa | head -5000", timeout=10, cwd=None)
    assert len(result.output) < 200_000
