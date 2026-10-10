"""Local and remote git operations scoped to a project workspace."""

from __future__ import annotations

import os
import stat
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.services.credentials.credential_crypto import decrypt_secret
from app.services.project_fs import ensure_project_gitignore, project_root, resolve_project_path


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


def git_env_for_shell(settings: dict, fallback_name: str = "openKMS User") -> dict[str, str]:
    """Author/committer env vars for agent shell git commands."""
    return _git_identity(settings, fallback_name)


def git_init(project_id: str, settings: dict) -> bool:
    root = project_root(project_id)
    ensure_project_gitignore(project_id)
    if (root / ".git").exists():
        return True
    env = _git_identity(settings)
    result = _run_git(project_id, ["init"], env_extra=env)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git init failed")
    return True


def git_origin_url(project_id: str) -> str | None:
    root = project_root(project_id)
    if not (root / ".git").exists():
        return None
    result = _run_git(project_id, ["remote", "get-url", "origin"])
    if result.returncode != 0:
        return None
    url = (result.stdout or "").strip()
    return url or None


def git_ahead_behind(project_id: str) -> dict[str, int] | None:
    """Ahead/behind counts relative to the upstream branch, if one is configured."""
    result = _run_git(project_id, ["rev-list", "--left-right", "--count", "@{u}...HEAD"])
    if result.returncode != 0:
        return None
    parts = (result.stdout or "").split()
    if len(parts) != 2:
        return None
    behind, ahead = parts
    return {"ahead": int(ahead), "behind": int(behind)}


def git_current_branch(project_id: str) -> str | None:
    root = project_root(project_id)
    if not (root / ".git").exists():
        return None
    result = _run_git(project_id, ["rev-parse", "--abbrev-ref", "HEAD"])
    return result.stdout.strip() if result.returncode == 0 else None


def git_status(project_id: str) -> dict[str, Any]:
    root = project_root(project_id)
    if not (root / ".git").exists():
        return {"entries": [], "branch": None, "remote_url": None, "ahead": None, "behind": None}
    ensure_project_gitignore(project_id)
    branch = git_current_branch(project_id)
    status_r = _run_git(project_id, ["status", "--porcelain"])
    entries: list[dict[str, str]] = []
    for line in (status_r.stdout or "").splitlines():
        if len(line) < 4:
            continue
        # Keep both porcelain columns: index char = staged, worktree char = unstaged.
        code = line[:2]
        path = line[3:].strip()
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        entries.append({"path": path, "status": code})
    counts = git_ahead_behind(project_id) or {}
    return {
        "entries": entries,
        "branch": branch,
        "remote_url": git_origin_url(project_id),
        "ahead": counts.get("ahead"),
        "behind": counts.get("behind"),
    }


def git_log(project_id: str, limit: int = 30) -> list[dict[str, str]]:
    root = project_root(project_id)
    if not (root / ".git").exists():
        return []
    result = _run_git(
        project_id,
        ["log", f"-{limit}", "--pretty=format:%H%x09%s%x09%an%x09%ai%x09%D"],
    )
    entries: list[dict[str, str]] = []
    for line in (result.stdout or "").splitlines():
        parts = line.split("\t", 4)
        if len(parts) >= 4:
            entries.append(
                {
                    "hash": parts[0][:8],
                    "message": parts[1],
                    "author": parts[2],
                    "date": parts[3],
                    "refs": parts[4].strip() if len(parts) > 4 else "",
                }
            )
    return entries


def git_branches(project_id: str) -> list[str]:
    root = project_root(project_id)
    if not (root / ".git").exists():
        return []
    result = _run_git(project_id, ["branch", "--format=%(refname:short)"])
    return [line.strip() for line in (result.stdout or "").splitlines() if line.strip()]


def safe_paths(paths: list[str]) -> list[str]:
    """Reject paths that could escape the workspace or be read as git options."""
    clean: list[str] = []
    for raw in paths:
        p = (raw or "").strip()
        if not p or p.startswith("/") or p.startswith("-"):
            raise HTTPException(status_code=400, detail="Invalid path")
        if any(part == ".." for part in p.split("/")):
            raise HTTPException(status_code=400, detail="Invalid path")
        clean.append(p)
    return clean


def git_add(project_id: str, paths: list[str] | None = None) -> str:
    args = ["add", "--", *paths] if paths else ["add", "-A"]
    result = _run_git(project_id, args)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git add failed")
    return result.stdout or "ok"


def git_unstage(project_id: str, paths: list[str]) -> str:
    """Move paths out of the index. Handles the no-commits-yet case."""
    if not paths:
        raise HTTPException(status_code=400, detail="No paths given")
    args = ["reset", "-q", "HEAD", "--", *paths]
    result = _run_git(project_id, args)
    if result.returncode != 0:
        # Unborn branch: nothing to reset against, drop them from the index instead.
        result = _run_git(project_id, ["rm", "--cached", "-r", "--quiet", "--ignore-unmatch", "--", *paths])
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git unstage failed")
    return "ok"


def git_discard(project_id: str, paths: list[str]) -> str:
    """Throw away working-tree changes for tracked paths."""
    if not paths:
        raise HTTPException(status_code=400, detail="No paths given")
    result = _run_git(project_id, ["restore", "--worktree", "--", *paths])
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git discard failed")
    return "ok"


def git_commit(project_id: str, message: str, settings: dict) -> str:
    env = _git_identity(settings)
    result = _run_git(project_id, ["commit", "-m", message], env_extra=env)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git commit failed")
    return result.stdout or "committed"


def _is_tracked(project_id: str, path: str) -> bool:
    result = _run_git(project_id, ["ls-files", "--error-unmatch", "--", path])
    return result.returncode == 0


def git_diff(project_id: str, path: str | None = None, *, staged: bool = False) -> str:
    args = ["diff"]
    if staged:
        args.append("--cached")
    if path:
        if not staged and not _is_tracked(project_id, path):
            # Untracked file: show it as a whole-file addition, like VS Code does.
            result = _run_git(project_id, ["diff", "--no-index", "--", os.devnull, path])
            if result.returncode not in (0, 1):
                raise HTTPException(status_code=500, detail=result.stderr or "git diff failed")
            return result.stdout or ""
        args.extend(["--", path])
    result = _run_git(project_id, args)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "git diff failed")
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


def clone_git_args(url: str, dest: str, branch: str | None = None) -> list[str]:
    args = ["git", "clone"]
    if branch:
        args.extend(["--branch", branch, "--single-branch"])
    args.extend([url, dest])
    return args


def git_clone_into_project(
    project_id: str,
    url: str,
    *,
    username: str | None = None,
    token: str | None = None,
    branch: str | None = None,
) -> None:
    root = project_root(project_id)
    root.parent.mkdir(parents=True, exist_ok=True)
    if root.exists() and any(root.iterdir()):
        raise HTTPException(status_code=400, detail="Project folder is not empty")
    env_extra: dict[str, str] = {"GIT_TERMINAL_PROMPT": "0"}
    if token:
        env_extra.update(_askpass_env(token))
        if username:
            env_extra["GIT_USERNAME"] = username
    try:
        result = subprocess.run(
            clone_git_args(url, str(root), branch),
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, **env_extra},
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        raise HTTPException(status_code=504, detail="git clone timed out") from e
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail="git is not available on the server") from e
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
