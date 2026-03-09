"""ApiModel schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator, model_validator

VALID_CATEGORIES = {"ocr", "vl", "llm", "embedding", "text-classification"}


class ApiModelCreate(BaseModel):
    name: str
    provider: str
    category: str
    base_url: str
    api_key: str | None = None
    model_name: str | None = None
    config: dict[str, Any] | None = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of {sorted(VALID_CATEGORIES)}")
        return v


class ApiModelUpdate(BaseModel):
    name: str | None = None
    provider: str | None = None
    category: str | None = None
    base_url: str | None = None
    api_key: str | None = None
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
    name: str
    provider: str
    category: str
    base_url: str
    api_key_set: bool = False
    model_name: str | None = None
    config: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def mask_api_key(cls, data: Any) -> Any:
        """Set api_key_set flag and strip the actual key from responses."""
        if hasattr(data, "api_key"):
            obj = dict(
                id=data.id, name=data.name, provider=data.provider,
                category=data.category, base_url=data.base_url,
                api_key_set=bool(data.api_key),
                model_name=data.model_name, config=data.config,
                created_at=data.created_at, updated_at=data.updated_at,
            )
            return obj
        if isinstance(data, dict):
            data["api_key_set"] = bool(data.get("api_key"))
            data.pop("api_key", None)
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
