"""DataSource schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DataSourceCreate(BaseModel):
    name: str
    kind: str  # postgresql | neo4j
    host: str
    port: int | None = None
    database: str | None = None
    username: str
    password: str | None = None
    options: dict[str, Any] | None = None


class DataSourceUpdate(BaseModel):
    name: str | None = None
    kind: str | None = None
    host: str | None = None
    port: int | None = None
    database: str | None = None
    username: str | None = None
    password: str | None = None  # None = keep current
    options: dict[str, Any] | None = None


class DataSourceResponse(BaseModel):
    id: str
    name: str
    kind: str
    host: str
    port: int | None = None
    database: str | None = None
    username: str
    password_masked: bool = False
    options: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class DataSourceListResponse(BaseModel):
    items: list[DataSourceResponse]
    total: int
