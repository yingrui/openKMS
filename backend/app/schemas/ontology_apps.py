"""Schemas for Ontology Apps (App Builder / Apps runtime)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class OntologyAppBindings(BaseModel):
    objectType: str = Field(min_length=1)
    columnProperty: str = Field(min_length=1)
    columns: list[str] = Field(min_length=1)
    cardTitleProperty: str = Field(min_length=1)
    createAction: str | None = None
    updateAction: str | None = None
    setStatusAction: str | None = None
    deleteAction: str | None = None
    suggestFunction: str | None = None


class OntologyAppCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    api_name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    template_id: str = "a2ui"
    bindings: OntologyAppBindings


class OntologyAppUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    bindings: OntologyAppBindings | None = None
    draft_a2ui_messages: list[dict[str, Any]] | None = None


class OntologyAppPublishIn(BaseModel):
    a2ui_messages: list[dict[str, Any]] | None = None


class OntologyAppResponse(BaseModel):
    id: str
    name: str
    api_name: str
    description: str | None = None
    template_id: str
    bindings: dict[str, Any]
    status: str
    bindings_hash: str | None = None
    bindings_stale: bool = False
    missing_bindings: list[str] = Field(default_factory=list)
    created_by: str | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    has_draft: bool = False
    has_published: bool = False


class OntologyAppDesignResponse(OntologyAppResponse):
    a2ui_messages: list[dict[str, Any]] = Field(default_factory=list)


class OntologyAppRunResponse(OntologyAppResponse):
    a2ui_messages: list[dict[str, Any]] = Field(default_factory=list)


class OntologyAppDesignerChatIn(BaseModel):
    messages: list[dict[str, str]]
    working_a2ui_messages: list[dict[str, Any]] | None = None
    conversation_id: str | None = None
    stream: bool = True
