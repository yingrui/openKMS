"""Schemas for the workforce skill registry (authoring, publishing, installing)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class WorkforceSkillCreate(BaseModel):
    #: Slug. Also the `name` the `SKILL.md` frontmatter must agree with.
    id: str
    name: str = ""
    description: str = ""


class WorkforceSkillFileWrite(BaseModel):
    path: str = Field(min_length=1)
    content: str


class WorkforceSkillFileDelete(BaseModel):
    path: str = Field(min_length=1)


class WorkforceSkillVersionOut(BaseModel):
    version: str
    status: str
    size_bytes: int = 0
    content_hash: str | None = None
    entrypoint: str | None = None
    subcommands: list[str] = []
    published_at: datetime | None = None
    published_by_name: str | None = None


class WorkforceSkillListItem(BaseModel):
    id: str
    name: str
    description: str | None = None
    #: Newest release. `None` until the first publish.
    latest_version: str | None = None
    latest_status: str | None = None
    #: A draft exists, i.e. someone edited after the last release.
    has_draft: bool = False
    updated_at: datetime | None = None


class WorkforceSkillListResponse(BaseModel):
    items: list[WorkforceSkillListItem] = []


class WorkforceSkillDetail(BaseModel):
    id: str
    name: str
    description: str | None = None
    has_draft: bool
    #: The version the open draft would publish as.
    draft_version: str
    #: The files the editor shows: the draft, or the newest release when no draft is open.
    files: dict[str, str] = {}
    entrypoint: str | None = None
    subcommands: list[str] = []
    #: Publish refuses on these; the editor shows them in the validation bar.
    blocking: list[str] = []
    warnings: list[str] = []
    versions: list[WorkforceSkillVersionOut] = []
    updated_at: datetime | None = None
