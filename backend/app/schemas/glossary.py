"""Pydantic schemas for glossary management."""
from datetime import datetime

from pydantic import BaseModel, model_validator


# --- Glossary ---

class GlossaryCreate(BaseModel):
    name: str
    description: str | None = None


class GlossaryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class GlossaryResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    term_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GlossaryListResponse(BaseModel):
    items: list[GlossaryResponse]
    total: int


# --- Glossary Term ---

class GlossaryTermCreate(BaseModel):
    primary_en: str | None = None
    primary_cn: str | None = None
    synonyms_en: list[str] = []
    synonyms_cn: list[str] = []

    @model_validator(mode="after")
    def at_least_one_primary(self):
        if not self.primary_en and not self.primary_cn:
            raise ValueError("At least one of primary_en or primary_cn must be provided")
        return self


class GlossaryTermUpdate(BaseModel):
    primary_en: str | None = None
    primary_cn: str | None = None
    synonyms_en: list[str] | None = None
    synonyms_cn: list[str] | None = None


class GlossaryTermResponse(BaseModel):
    id: str
    glossary_id: str
    primary_en: str | None = None
    primary_cn: str | None = None
    synonyms_en: list[str] = []
    synonyms_cn: list[str] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GlossaryTermListResponse(BaseModel):
    items: list[GlossaryTermResponse]
    total: int


# --- Export / Import ---

class GlossaryTermExportItem(BaseModel):
    primary_en: str | None = None
    primary_cn: str | None = None
    synonyms_en: list[str] = []
    synonyms_cn: list[str] = []


class GlossaryExportPayload(BaseModel):
    glossary_id: str
    glossary_name: str
    exported_at: datetime
    terms: list[GlossaryTermExportItem]


class GlossaryImportTermItem(BaseModel):
    primary_en: str | None = None
    primary_cn: str | None = None
    synonyms_en: list[str] = []
    synonyms_cn: list[str] = []

    @model_validator(mode="after")
    def at_least_one_primary(self):
        if not self.primary_en and not self.primary_cn:
            raise ValueError("At least one of primary_en or primary_cn must be provided")
        return self


class GlossaryImportPayload(BaseModel):
    terms: list[GlossaryImportTermItem]
    mode: str = "append"  # "append" | "replace"
