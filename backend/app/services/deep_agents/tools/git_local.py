"""Local git tools for project agents."""

from __future__ import annotations

from langchain_core.tools import tool

from app.services.deep_agents import git_service


def make_git_tools(project_id: str, settings: dict) -> list:
    @tool
    def git_status() -> str:
        """Show git status for the project workspace."""
        import json

        return json.dumps(git_service.git_status(project_id), ensure_ascii=False)

    @tool
    def git_log(limit: int = 10) -> str:
        """Show recent git commits."""
        import json

        return json.dumps(git_service.git_log(project_id, limit=limit), ensure_ascii=False)

    @tool
    def git_add(paths: str = "") -> str:
        """Stage files for commit. Comma-separated paths, or empty for all."""
        path_list = [p.strip() for p in paths.split(",") if p.strip()] if paths.strip() else None
        return git_service.git_add(project_id, path_list)

    @tool
    def git_commit(message: str) -> str:
        """Create a git commit with the given message (requires user approval)."""
        return git_service.git_commit(project_id, message, settings)

    @tool
    def git_diff(path: str = "") -> str:
        """Show git diff, optionally for a single path."""
        return git_service.git_diff(project_id, path or None)

    return [git_status, git_log, git_add, git_commit, git_diff]
