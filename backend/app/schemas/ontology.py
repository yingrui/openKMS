"""Pydantic schemas for ontology (object types, link types, instances)."""
from datetime import datetime

from pydantic import BaseModel


# --- Property definition (for object type schema) ---

class PropertyDef(BaseModel):
    name: str
    type: str = "string"  # string, number, boolean
    required: bool = False


# --- Object Type ---

class ObjectTypeCreate(BaseModel):
    name: str
    description: str | None = None
    properties: list[PropertyDef] = []


class ObjectTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    properties: list[PropertyDef] | None = None


class ObjectTypeResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    properties: list[dict] = []  # e.g. [{"name": "icd_code", "type": "string", "required": False}]
    instance_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ObjectTypeListResponse(BaseModel):
    items: list[ObjectTypeResponse]
    total: int


# --- Object Instance ---

class ObjectInstanceCreate(BaseModel):
    data: dict = {}  # property values keyed by property name


class ObjectInstanceUpdate(BaseModel):
    data: dict | None = None


class ObjectInstanceResponse(BaseModel):
    id: str
    object_type_id: str
    data: dict = {}
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ObjectInstanceListResponse(BaseModel):
    items: list[ObjectInstanceResponse]
    total: int


# --- Link Type ---

class LinkTypeCreate(BaseModel):
    name: str
    description: str | None = None
    source_object_type_id: str
    target_object_type_id: str


class LinkTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    source_object_type_id: str | None = None
    target_object_type_id: str | None = None


class LinkTypeResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    source_object_type_id: str
    target_object_type_id: str
    source_object_type_name: str | None = None
    target_object_type_name: str | None = None
    link_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LinkTypeListResponse(BaseModel):
    items: list[LinkTypeResponse]
    total: int


# --- Link Instance ---

class LinkInstanceCreate(BaseModel):
    source_object_id: str
    target_object_id: str


class LinkInstanceResponse(BaseModel):
    id: str
    link_type_id: str
    source_object_id: str
    target_object_id: str
    source_data: dict | None = None  # for display
    target_data: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LinkInstanceListResponse(BaseModel):
    items: list[LinkInstanceResponse]
    total: int
