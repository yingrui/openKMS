"""Filesystem operations for agent workspace projects."""

from __future__ import annotations

import mimetypes
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.config import settings

_DEFAULT_AGENTS_MD = """# Project instructions

Describe what this project is for and how the agent should work here.

## Goals

- 

## Constraints

- 
"""

_DEFAULT_GITIGNORE = """# Installed agent skills (managed by openKMS)
.openkms/skills/
"""

def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return s[:128] or "project"


def make_slug(name: str, existing: set[str] | None = None) -> str:
    base = _slugify(name)
    if not existing or base not in existing:
        return base
    for i in range(2, 1000):
        candidate = f"{base}-{i}"
        if candidate not in existing:
            return candidate
    return f"{base}-{hash(name) % 10000}"


def project_root(project_id: str) -> Path:
    root = Path(settings.projects_root).resolve()
    path = (root / project_id).resolve()
    if not str(path).startswith(str(root)):
        raise HTTPException(status_code=400, detail="Invalid project path")
    return path


def resolve_project_path(project_id: str, relative: str = "") -> Path:
    base = project_root(project_id)
    rel = (relative or "").strip().replace("\\", "/").lstrip("/")
    if rel and (".." in Path(rel).parts):
        raise HTTPException(status_code=400, detail="Invalid path")
    target = (base / rel).resolve() if rel else base
    if not str(target).startswith(str(base)):
        raise HTTPException(status_code=400, detail="Invalid path")
    return target


def ensure_project_gitignore(project_id: str) -> None:
    root = project_root(project_id)
    gitignore = root / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(_DEFAULT_GITIGNORE, encoding="utf-8")


def scaffold_project_dir(project_id: str) -> Path:
    root = project_root(project_id)
    root.mkdir(parents=True, exist_ok=True)
    agents_md = root / "AGENTS.md"
    if not agents_md.exists():
        agents_md.write_text(_DEFAULT_AGENTS_MD, encoding="utf-8")
    ensure_project_gitignore(project_id)
    openkms = root / ".openkms"
    openkms.mkdir(exist_ok=True)
    (openkms / "skills").mkdir(exist_ok=True)
    return root


def list_dir(project_id: str, relative: str = "") -> list[dict]:
    path = resolve_project_path(project_id, relative)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if not path.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")
    entries: list[dict] = []
    for child in sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        stat = child.stat()
        entries.append(
            {
                "name": child.name,
                "path": str(child.relative_to(project_root(project_id))).replace("\\", "/"),
                "is_dir": child.is_dir(),
                "size": None if child.is_dir() else stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            }
        )
    return entries


def read_file(project_id: str, relative: str) -> dict:
    path = resolve_project_path(project_id, relative)
    if not path.exists() or path.is_dir():
        raise HTTPException(status_code=404, detail="File not found")
    size = path.stat().st_size
    mime, _ = mimetypes.guess_type(path.name)
    is_binary = mime is not None and not mime.startswith("text/") and mime not in (
        "application/json",
        "application/xml",
        "application/javascript",
    )
    if is_binary or size > 2_000_000:
        return {"path": relative, "content": None, "is_binary": True, "size": size}
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return {"path": relative, "content": None, "is_binary": True, "size": size}
    return {"path": relative, "content": content, "is_binary": False, "size": size}


def write_file(project_id: str, relative: str, content: str) -> None:
    path = resolve_project_path(project_id, relative)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


async def upload_file(project_id: str, relative_dir: str, file: UploadFile) -> str:
    raw_name = (file.filename or "upload").replace("\\", "/").lstrip("/")
    if not raw_name or ".." in Path(raw_name).parts:
        raise HTTPException(status_code=400, detail="Invalid filename")
    rel_dir = (relative_dir or "").strip().replace("\\", "/").strip("/")
    relative = f"{rel_dir}/{raw_name}" if rel_dir else raw_name
    dest = resolve_project_path(project_id, relative)
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = await file.read()
    dest.write_bytes(data)
    base = project_root(project_id)
    return str(dest.relative_to(base)).replace("\\", "/")


def _is_protected_delete_path(relative: str) -> bool:
    norm = relative.strip().replace("\\", "/").lstrip("/").rstrip("/")
    return norm in (".openkms", ".openkms/skills")


def delete_path(project_id: str, relative: str) -> None:
    if _is_protected_delete_path(relative):
        raise HTTPException(status_code=400, detail="Cannot delete required project folder")
    path = resolve_project_path(project_id, relative)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    base = project_root(project_id)
    if path == base:
        raise HTTPException(status_code=400, detail="Cannot delete project root")
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


def read_agents_md(project_id: str) -> str:
    path = resolve_project_path(project_id, "AGENTS.md")
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""
