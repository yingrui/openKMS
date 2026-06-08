"""Filesystem + DB helpers for the global agent skills registry."""

from __future__ import annotations

import re
import shutil
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.agent_skill import AgentSkill, AgentSkillVersion

_SKILL_ID_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")


def agent_skills_root() -> Path:
    root = Path(settings.agent_skills_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def version_dir(skill_id: str, version: str) -> Path:
    return agent_skills_root() / skill_id / version


def skill_dir(skill_id: str) -> Path:
    return agent_skills_root() / skill_id


def validate_skill_id(skill_id: str) -> str:
    sid = (skill_id or "").strip().lower()
    if not sid or not _SKILL_ID_RE.match(sid):
        raise HTTPException(status_code=400, detail="Invalid skill_id (use lowercase letters, digits, hyphens)")
    return sid


def validate_skill_tree(root: Path) -> None:
    if not (root / "SKILL.md").is_file():
        raise HTTPException(status_code=400, detail="Skill package must contain SKILL.md at the root")


def _safe_zip_extract(archive: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/").lstrip("/")
            if not name or ".." in PurePosixPath(name).parts:
                raise HTTPException(status_code=400, detail="Invalid path in archive")
            target = dest / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, target.open("wb") as out:
                shutil.copyfileobj(src, out)


async def extract_zip_upload(archive: UploadFile, dest: Path) -> None:
    data = await archive.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty archive")
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)
    try:
        _safe_zip_extract(tmp_path, dest)
    except zipfile.BadZipFile as e:
        raise HTTPException(status_code=400, detail="Invalid zip archive") from e
    finally:
        tmp_path.unlink(missing_ok=True)


async def extract_folder_upload(files: list[UploadFile], paths: list[str], dest: Path) -> None:
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    dest.mkdir(parents=True, exist_ok=True)
    for file, rel in zip(files, paths, strict=False):
        rel_norm = (rel or file.filename or "").replace("\\", "/").lstrip("/")
        if not rel_norm or ".." in PurePosixPath(rel_norm).parts:
            raise HTTPException(status_code=400, detail="Invalid relative path")
        target = dest / rel_norm
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(await file.read())


async def resolve_version_for_skill(db: AsyncSession, skill: AgentSkill, version: str | None) -> str:
    if version and version.strip():
        return version.strip()
    if skill.default_version and skill.default_version.strip():
        return skill.default_version.strip()
    r = await db.execute(
        select(AgentSkillVersion.version)
        .where(AgentSkillVersion.skill_id == skill.id)
        .order_by(AgentSkillVersion.created_at.desc())
        .limit(1)
    )
    latest = r.scalar_one_or_none()
    if not latest:
        raise HTTPException(status_code=404, detail="No versions available for this skill")
    return latest
