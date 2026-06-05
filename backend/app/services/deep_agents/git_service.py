"""Local and remote git operations scoped to a project workspace."""

from __future__ import annotations

import os
import stat
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.services.credential_crypto import decrypt_secret
from app.services.project_fs import project_root, resolve_project_path


def _run_git(
    project_id: str,
    args: list[str],
    *,
    timeout: int = 120,
    env_extra: dict[str, str] | None = None,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    work = cwd or project_root(project_id)
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", **(env_extra or {})}
    try:
        return subprocess.run(
            ["git", *args],
            cwd=work,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        raise HTTPException(status_code=504, detail="Git operation timed out") from e
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail="git is not available on the server") from e


def _git_identity(settings: dict, fallback_name: str = "openKMS User") -> dict[str, str]:
    git_cfg = settings.get("git") if isinstance(settings.get("git"), dict) else {}
    name = git_cfg.get("user_name") or fallback_name
    email = git_cfg.get("user_email") or "agent@openkms.local"
    return {"GIT_AUTHOR_NAME": name, "GIT_AUTHOR_EMAIL": email, "GIT_COMMITTER_NAME": name, "GIT_COMMITTER_EMAIL": email}


def git_init(project_id: str, settings: dict) -> bool:
    root = project_root(project_id)
    if (root / ".git").exists():
        return True
    env = _git_identity(settings)
    result = _run_git(project_id, ["init"], env_extra=env)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git init failed")
    return True


def git_status(project_id: str) -> dict[str, Any]:
    root = project_root(project_id)
    if not (root / ".git").exists():
        return {"entries": [], "branch": None}
    branch_r = _run_git(project_id, ["rev-parse", "--abbrev-ref", "HEAD"])
    branch = branch_r.stdout.strip() if branch_r.returncode == 0 else None
    status_r = _run_git(project_id, ["status", "--porcelain"])
    entries: list[dict[str, str]] = []
    for line in (status_r.stdout or "").splitlines():
        if len(line) < 4:
            continue
        code = line[:2]
        path = line[3:].strip()
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        entries.append({"path": path, "status": code.strip()})
    return {"entries": entries, "branch": branch}


def git_log(project_id: str, limit: int = 10) -> list[dict[str, str]]:
    root = project_root(project_id)
    if not (root / ".git").exists():
        return []
    result = _run_git(
        project_id,
        ["log", f"-{limit}", "--pretty=format:%H%x09%s%x09%an%x09%ai"],
    )
    entries: list[dict[str, str]] = []
    for line in (result.stdout or "").splitlines():
        parts = line.split("\t", 3)
        if len(parts) >= 4:
            entries.append(
                {"hash": parts[0][:8], "message": parts[1], "author": parts[2], "date": parts[3]}
            )
    return entries


def git_add(project_id: str, paths: list[str] | None = None) -> str:
    args = ["add", *paths] if paths else ["add", "-A"]
    result = _run_git(project_id, args)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git add failed")
    return result.stdout or "ok"


def git_commit(project_id: str, message: str, settings: dict) -> str:
    env = _git_identity(settings)
    result = _run_git(project_id, ["commit", "-m", message], env_extra=env)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git commit failed")
    return result.stdout or "committed"


def git_diff(project_id: str, path: str | None = None) -> str:
    args = ["diff"]
    if path:
        args.append(path)
    result = _run_git(project_id, args)
    return result.stdout or ""


def _askpass_env(token: str) -> dict[str, str]:
    fd, script_path = tempfile.mkstemp(prefix="git-askpass-", suffix=".sh")
    os.close(fd)
    script = f'#!/bin/sh\necho "{token}"\n'
    Path(script_path).write_text(script, encoding="utf-8")
    os.chmod(script_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
    return {"GIT_ASKPASS": script_path, "GIT_ASKPASS_SCRIPT": script_path}


def _cleanup_askpass(env_extra: dict[str, str]) -> None:
    script = env_extra.get("GIT_ASKPASS_SCRIPT")
    if script and Path(script).exists():
        try:
            Path(script).unlink()
        except OSError:
            pass


def git_with_pat(
    project_id: str,
    args: list[str],
    *,
    username: str,
    token: str,
    timeout: int = 300,
) -> subprocess.CompletedProcess[str]:
    env_extra = _askpass_env(token)
    env_extra["GIT_USERNAME"] = username
    try:
        return _run_git(project_id, args, env_extra=env_extra, timeout=timeout)
    finally:
        _cleanup_askpass(env_extra)


def git_clone_into_project(
    project_id: str,
    url: str,
    *,
    username: str,
    token: str,
) -> None:
    root = project_root(project_id)
    if any(root.iterdir()):
        raise HTTPException(status_code=400, detail="Project folder is not empty")
    env_extra = _askpass_env(token)
    env_extra["GIT_TERMINAL_PROMPT"] = "0"
    try:
        result = subprocess.run(
            ["git", "clone", url, str(root)],
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, **env_extra},
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        raise HTTPException(status_code=504, detail="git clone timed out") from e
    finally:
        _cleanup_askpass(env_extra)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git clone failed")


def git_remote_add(project_id: str, url: str) -> None:
    result = _run_git(project_id, ["remote", "add", "origin", url])
    if result.returncode != 0:
        # try set-url if origin exists
        result = _run_git(project_id, ["remote", "set-url", "origin", url])
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git remote failed")


def git_pull(project_id: str, username: str, token: str) -> str:
    result = git_with_pat(project_id, ["pull", "origin"], username=username, token=token)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git pull failed")
    return result.stdout or "pulled"


def git_push(project_id: str, username: str, token: str) -> str:
    result = git_with_pat(project_id, ["push", "origin", "HEAD"], username=username, token=token)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git push failed")
    return result.stdout or "pushed"


def decrypt_pat(encrypted: str) -> str:
    return decrypt_secret(encrypted)
