"""Schemas for App Builder / Apps runtime."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class AppBuilderBindings(BaseModel):
    """Resource allowlist for an app (all lanes). Not a UI layout."""

    objectTypes: list[str] | None = None
    actions: list[str] | None = None
    functions: list[str] | None = None


AppKind = Literal["a2ui", "module"]


class AppBuilderComponent(BaseModel):
    """One artifact: an A2UI surface (messages) with name / order / default flag."""

    id: str
    name: str = ""
    position: int = 0
    is_default: bool = False
    messages: list[dict[str, Any]] = Field(default_factory=list)


class AppBuilderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    api_name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    template_id: str = "a2ui"
    """Stored app kind for now (a2ui | module). module runner is not implemented yet."""
    bindings: AppBuilderBindings | None = None


class AppBuilderUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    bindings: AppBuilderBindings | None = None
    components: list[AppBuilderComponent] | None = None


class AppBuilderPublishIn(BaseModel):
    components: list[AppBuilderComponent] | None = None


class AppBuilderResponse(BaseModel):
    id: str
    name: str
    api_name: str
    description: str | None = None
    template_id: str
    app_kind: str = "a2ui"
    bindings: dict[str, Any]
    status: str
    bindings_hash: str | None = None
    bindings_stale: bool = False
    missing_bindings: list[str] = Field(default_factory=list)
    created_by: str | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    published_version: int | None = None
    has_draft: bool = False
    has_published: bool = False


class AppBuilderVersionOut(BaseModel):
    id: str
    version: int
    created_at: datetime
    created_by_name: str | None = None
    is_current: bool = False


class AppBuilderDesignResponse(AppBuilderResponse):
    components: list[AppBuilderComponent] = Field(default_factory=list)


class AppBuilderRunResponse(AppBuilderResponse):
    components: list[AppBuilderComponent] = Field(default_factory=list)


class AppBuilderDesignerChatIn(BaseModel):
    messages: list[dict[str, str]]
    working_a2ui_messages: list[dict[str, Any]] | None = None
    conversation_id: str | None = None
    component_id: str | None = None
    stream: bool = True
