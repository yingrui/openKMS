"""Sandboxed Python execution in project workspace."""

from __future__ import annotations

import subprocess
import sys
import textwrap
from pathlib import Path

from langchain_core.tools import tool

from app.config import settings
from app.services.project_fs import project_root


def run_python_in_project(project_id: str, code: str) -> str:
    root = project_root(project_id)
    timeout = settings.agent_sandbox_timeout_seconds
    script = textwrap.dedent(code)
    try:
        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={"PYTHONPATH": str(root), "PATH": "/usr/bin:/bin"},
        )
    except subprocess.TimeoutExpired:
        return f"Execution timed out after {timeout}s"
    out = (result.stdout or "") + (result.stderr or "")
    if not out.strip():
        return f"Exit code {result.returncode} (no output)"
    if len(out) > 32_000:
        out = out[:32_000] + "\n…[truncated]"
    return out


def make_sandbox_tools(project_id: str) -> list:
    @tool
    def run_python(code: str) -> str:
        """Run Python code in the project workspace (no network)."""
        return run_python_in_project(project_id, code)

    return [run_python]
