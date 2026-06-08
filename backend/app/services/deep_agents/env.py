"""Environment for project agent shell and sandbox tools."""

from __future__ import annotations

from app.config import settings
from app.services.deep_agents.git_service import git_env_for_shell
from app.services.project_fs import resolve_project_path


def build_project_shell_env(
    project_id: str,
    bearer_token: str,
    project_settings: dict,
) -> dict[str, str]:
    """Env vars for execute/run_python in a project workspace."""
    shell_env: dict[str, str] = {
        **git_env_for_shell(project_settings),
        "GIT_TERMINAL_PROMPT": "0",
        "OPENKMS_API_KEY": bearer_token,
        "OPENKMS_API_BASE_URL": settings.openkms_backend_url.rstrip("/"),
    }
    openkms_skill = resolve_project_path(project_id, ".openkms/skills/openkms")
    if openkms_skill.is_dir():
        scripts_dir = str(openkms_skill / "scripts")
        shell_env["OPENKMS_SKILL_ROOT"] = str(openkms_skill)
        existing_pp = shell_env.get("PYTHONPATH", "")
        shell_env["PYTHONPATH"] = f"{scripts_dir}:{existing_pp}" if existing_pp else scripts_dir
    return shell_env
