"""Pydantic schemas for wiki spaces, pages, and files."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class WikiSpaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    description: str | None = None


class WikiSpaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None


class WikiSpaceResponse(BaseModel):
    id: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    page_count: int = 0


class WikiSpaceListResponse(BaseModel):
    items: list[WikiSpaceResponse]
    total: int


class WikiPageCreate(BaseModel):
    path: str = Field(min_length=1, max_length=512)
    title: str = Field(min_length=1, max_length=512)
    body: str = ""
    metadata: dict[str, Any] | None = None


class WikiPageUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    body: str | None = None
    metadata: dict[str, Any] | None = None


class WikiPageUpsertBody(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    body: str = ""
    metadata: dict[str, Any] | None = None


class WikiPageResponse(BaseModel):
    id: str
    wiki_space_id: str
    path: str
    title: str
    body: str
    metadata: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class WikiPageListResponse(BaseModel):
    """Page list; ``total`` counts all rows matching ``path_prefix`` when paginating."""

    items: list[WikiPageResponse]
    total: int
    limit: int | None = None  # None = client omitted limit (full ``items``)
    offset: int = 0


class WikiFileResponse(BaseModel):
    id: str
    wiki_space_id: str
    wiki_page_id: str | None
    filename: str
    content_type: str | None
    size_bytes: int
    created_at: datetime


class WikiFileListResponse(BaseModel):
    items: list[WikiFileResponse]
    total: int


class WikiVaultImportResponse(BaseModel):
    pages_upserted: int
    files_uploaded: int
    skipped: list[str]
    warnings: list[str]


class WikiVaultMarkdownFileBody(BaseModel):
    """Single vault markdown file: path relative to vault root (e.g. wiki/note.md)."""

    vault_path: str = Field(min_length=1, max_length=512)
    body: str = ""


class WikiVaultMarkdownImportResponse(BaseModel):
    wiki_path: str
    warnings: list[str]
