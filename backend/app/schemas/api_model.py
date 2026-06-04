"""ApiModel schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator, model_validator

from app.models.api_model import VALID_API_KINDS, VALID_CAPABILITIES


def _normalize_capabilities(value: list[str] | None) -> list[str]:
    if not value:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for raw in value:
        tag = (raw or "").strip()
        if not tag or tag in seen:
            continue
        if tag not in VALID_CAPABILITIES:
            raise ValueError(f"unknown capability {tag!r}; allowed: {sorted(VALID_CAPABILITIES)}")
        seen.add(tag)
        out.append(tag)
    return out


def _model_response_from_orm(model: Any) -> dict[str, Any]:
    """Build ApiModelResponse dict from ORM with provider_rel loaded."""
    caps = list(model.capabilities or [])
    return {
        "id": model.id,
        "provider_id": model.provider_id,
        "provider_name": getattr(model.provider_rel, "name", ""),
        "name": model.name,
        "api_kind": model.api_kind,
        "capabilities": caps,
        "is_default_in_category": getattr(model, "is_default_in_category", False),
        "base_url": getattr(model.provider_rel, "base_url", ""),
        "model_name": model.model_name,
        "config": model.config,
        "created_at": model.created_at,
        "updated_at": model.updated_at,
    }


class ApiModelCreate(BaseModel):
    provider_id: str
    name: str
    api_kind: str
    capabilities: list[str] = []
    is_default_in_category: bool = False
    model_name: str | None = None
    config: dict[str, Any] | None = None

    @field_validator("api_kind")
    @classmethod
    def validate_api_kind(cls, v: str) -> str:
        if v not in VALID_API_KINDS:
            raise ValueError(f"api_kind must be one of {sorted(VALID_API_KINDS)}")
        return v

    @field_validator("capabilities")
    @classmethod
    def validate_capabilities(cls, v: list[str]) -> list[str]:
        return _normalize_capabilities(v)


class ApiModelUpdate(BaseModel):
    provider_id: str | None = None
    name: str | None = None
    api_kind: str | None = None
    capabilities: list[str] | None = None
    is_default_in_category: bool | None = None
    model_name: str | None = None
    config: dict[str, Any] | None = None

    @field_validator("api_kind")
    @classmethod
    def validate_api_kind(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_API_KINDS:
            raise ValueError(f"api_kind must be one of {sorted(VALID_API_KINDS)}")
        return v

    @field_validator("capabilities")
    @classmethod
    def validate_capabilities(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        return _normalize_capabilities(v)


class ApiModelResponse(BaseModel):
    id: str
    provider_id: str
    provider_name: str
    name: str
    api_kind: str
    capabilities: list[str] = []
    is_default_in_category: bool = False
    base_url: str
    api_key_set: bool = False
    model_name: str | None = None
    config: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def build_from_orm(cls, data: Any) -> Any:
        if hasattr(data, "provider_rel") and data.provider_rel is not None:
            d = _model_response_from_orm(data)
            d["api_key_set"] = bool(getattr(data.provider_rel, "api_key", None))
            return d
        return data


class ApiModelListResponse(BaseModel):
    items: list[ApiModelResponse]
    total: int
    limit: int
    offset: int


class ApiModelTestRequest(BaseModel):
    prompt: str
    image: str | None = None  # base64 data URI when model supports vision
    max_tokens: int = 512
    temperature: float = 0.7


class ApiModelTestResponse(BaseModel):
    success: bool
    content: str | None = None
    error: str | None = None
    elapsed_ms: int = 0
