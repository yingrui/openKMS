"""Story schemas.

A story is the document; `findings` are the tiles in it, each carrying **its own source**, its
query and the result of its last run. Findings stay free-form dicts here (the document is authored by
an agent as often as by a person); the API validates each one's source before it is stored or run.
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class StoryCreate(BaseModel):
    name: str
    question: str | None = None
    status: str = "draft"
    narrative: str | None = None
    findings: list[dict[str, Any]] | None = None


class StoryUpdate(BaseModel):
    name: str | None = None
    question: str | None = None
    status: str | None = None
    narrative: str | None = None
    findings: list[dict[str, Any]] | None = None


class StoryResponse(BaseModel):
    id: str
    name: str
    question: str | None = None
    status: str
    narrative: str | None = None
    findings: list[dict[str, Any]] | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class StorySource(BaseModel):
    """One source a story's findings read — enough to label them without the rows."""

    kind: str
    id: str
    label: str


class StorySummary(BaseModel):
    """A story in a list: what it is, how many findings it has, and which sources they read.

    Deliberately **not** the document: listing stories must not carry every finding's rows.
    """

    id: str
    name: str
    question: str | None = None
    status: str
    finding_count: int = 0
    sources: list[StorySource] = []
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class StoryListResponse(BaseModel):
    items: list[StorySummary]
    total: int
