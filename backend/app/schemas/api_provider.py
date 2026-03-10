"""ApiProvider schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, model_validator


class ApiProviderCreate(BaseModel):
    name: str
    base_url: str
    api_key: str | None = None
    config: dict[str, Any] | None = None


class ApiProviderUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    config: dict[str, Any] | None = None


class ApiProviderResponse(BaseModel):
    id: str
    name: str
    base_url: str
    api_key_set: bool = False
    config: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def mask_api_key(cls, data: Any) -> Any:
        if hasattr(data, "api_key"):
            return {
                "id": data.id,
                "name": data.name,
                "base_url": data.base_url,
                "api_key_set": bool(data.api_key),
                "config": data.config,
                "created_at": data.created_at,
                "updated_at": data.updated_at,
            }
        if isinstance(data, dict):
            data["api_key_set"] = bool(data.get("api_key"))
            data.pop("api_key", None)
        return data


class ApiProviderListResponse(BaseModel):
    items: list[ApiProviderResponse]
    total: int
