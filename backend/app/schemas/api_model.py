"""ApiModel schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator, model_validator

VALID_CATEGORIES = {"ocr", "vl", "llm", "embedding", "text-classification"}


def _model_response_from_orm(model: Any) -> dict[str, Any]:
    """Build ApiModelResponse dict from ORM with provider_rel loaded."""
    return {
        "id": model.id,
        "provider_id": model.provider_id,
        "provider_name": getattr(model.provider_rel, "name", ""),
        "name": model.name,
        "category": model.category,
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
    category: str
    is_default_in_category: bool = False
    model_name: str | None = None
    config: dict[str, Any] | None = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of {sorted(VALID_CATEGORIES)}")
        return v


class ApiModelUpdate(BaseModel):
    provider_id: str | None = None
    name: str | None = None
    category: str | None = None
    is_default_in_category: bool | None = None
    model_name: str | None = None
    config: dict[str, Any] | None = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of {sorted(VALID_CATEGORIES)}")
        return v


class ApiModelResponse(BaseModel):
    id: str
    provider_id: str
    provider_name: str
    name: str
    category: str
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


class ApiModelTestRequest(BaseModel):
    prompt: str
    image: str | None = None  # base64 data URI for vision-language models
    max_tokens: int = 512
    temperature: float = 0.7


class ApiModelTestResponse(BaseModel):
    success: bool
    content: str | None = None
    error: str | None = None
    elapsed_ms: int = 0
