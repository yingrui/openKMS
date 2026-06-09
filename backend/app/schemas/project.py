"""API schemas for agent workspace projects."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    description: str | None = Field(default=None, max_length=8000)
    slug: str | None = Field(default=None, max_length=128)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=512)
    description: str | None = Field(default=None, max_length=8000)
    slug: str | None = Field(default=None, max_length=128)
    settings: dict[str, Any] | None = None


class ProjectResponse(BaseModel):
    id: str
    user_sub: str
    name: str
    description: str | None
    slug: str
    settings: dict[str, Any]
    git_initialized: bool
    created_at: datetime
    updated_at: datetime


class ProjectFileEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int | None = None
    modified_at: datetime | None = None


class ProjectFileListResponse(BaseModel):
    path: str
    entries: list[ProjectFileEntry]


class ProjectFileContentResponse(BaseModel):
    path: str
    content: str | None = None
    is_binary: bool = False
    size: int = 0


class ProjectFileWriteRequest(BaseModel):
    path: str = Field(min_length=1, max_length=2048)
    content: str = ""


class ProjectFileDeleteRequest(BaseModel):
    path: str = Field(min_length=1, max_length=2048)


class ProjectConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=512)


class ProjectConversationPatch(BaseModel):
    title: str | None = Field(default=None, max_length=512)


class ProjectMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=48000)
    stream: bool = False
    session_id: str | None = Field(
        default=None,
        max_length=256,
        description="Opaque id for optional Langfuse Session grouping on Deep Agents; defaults to conversation id.",
    )
    mode: str | None = Field(default=None, max_length=32)  # "plan" | "agent"


class ProjectMessageResume(BaseModel):
    decision: str = Field(min_length=1, max_length=32)  # approve | reject | edit | respond
    edited_args: dict[str, Any] | None = None
    message: str | None = None


class GitInitResponse(BaseModel):
    git_initialized: bool


class GitStatusEntry(BaseModel):
    path: str
    status: str


class GitStatusResponse(BaseModel):
    entries: list[GitStatusEntry]
    branch: str | None = None


class GitLogEntry(BaseModel):
    hash: str
    message: str
    author: str
    date: str


class GitLogResponse(BaseModel):
    entries: list[GitLogEntry]


class GitCommitRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    paths: list[str] | None = None


class UserGitCredentialCreate(BaseModel):
    provider: str = Field(min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=128)
    username: str = Field(min_length=1, max_length=256)
    token: str = Field(min_length=1, max_length=4096)
    scopes_hint: str | None = Field(default=None, max_length=512)


class UserGitCredentialResponse(BaseModel):
    id: str
    provider: str
    label: str
    username: str
    scopes_hint: str | None
    created_at: datetime
    updated_at: datetime


class GitRemoteRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    credential_id: str | None = None


class GitCloneRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    credential_id: str | None = None
