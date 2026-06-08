"""Schemas for global agent skills registry."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class AgentSkillVersionOut(BaseModel):
    id: str
    version: str
    uploaded_by: str | None = None
    uploaded_by_name: str | None = None
    content_hash: str
    notes: str | None = None
    created_at: datetime | None = None


class AgentSkillOut(BaseModel):
    id: str
    display_name: str
    created_by: str | None = None
    created_by_name: str | None = None
    is_default: bool = False
    default_version: str | None = None
    created_at: datetime | None = None
    versions: list[AgentSkillVersionOut] = Field(default_factory=list)


class AgentSkillPatch(BaseModel):
    display_name: str | None = None
    is_default: bool | None = None
    default_version: str | None = None


class ProjectSkillInstallBody(BaseModel):
    version: str | None = None


class ProjectInstalledSkillOut(BaseModel):
    skill_id: str
    version: str
    content_hash: str
    installed_at: str | None = None
    installed_by: str | None = None
    installed_by_name: str | None = None


class ProjectSkillsOut(BaseModel):
    installed: list[ProjectInstalledSkillOut] = Field(default_factory=list)
