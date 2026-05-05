"""Schemas for GET /api/search (unified metadata search)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class GlobalSearchHit(BaseModel):
    """One row in a search section (documents, articles, wiki spaces, or KBs)."""

    id: str
    name: str
    title: str | None = None
    kind: Literal["document", "article", "wiki_space", "knowledge_base"]
    url_path: str
    channel_id: str | None = None
    channel_name: str | None = None
    updated_at: datetime


class GlobalSearchSection(BaseModel):
    items: list[GlobalSearchHit] = Field(default_factory=list)
    total: int = 0


class GlobalSearchResponse(BaseModel):
    query: str
    types_requested: list[str]
    documents: GlobalSearchSection
    articles: GlobalSearchSection
    wiki_spaces: GlobalSearchSection
    knowledge_bases: GlobalSearchSection
