"""Explorer dashboard schemas.

A dashboard is the document; `reports` are the tiles in it, each carrying **its own source**, its
query and the result of its last run. Reports stay free-form dicts here (the document is authored by
an agent as often as by a person); the API validates each one's source before it is stored or run.
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ExplorerDashboardCreate(BaseModel):
    name: str
    question: str | None = None
    status: str = "draft"
    narrative: str | None = None
    reports: list[dict[str, Any]] | None = None


class ExplorerDashboardUpdate(BaseModel):
    name: str | None = None
    question: str | None = None
    status: str | None = None
    narrative: str | None = None
    reports: list[dict[str, Any]] | None = None


class ExplorerDashboardResponse(BaseModel):
    id: str
    name: str
    question: str | None = None
    status: str
    narrative: str | None = None
    reports: list[dict[str, Any]] | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class ExplorerDashboardListResponse(BaseModel):
    items: list[ExplorerDashboardResponse]
    total: int
