"""ApiProvider schemas."""
from datetime import datetime
import json
from typing import Any

from pydantic import BaseModel, model_validator

#: Max size of one body fragment, in JSON characters. A fragment is a few keys, so this is a typo guard rather
#: than a limit anyone should hit.
_FRAGMENT_CHARS = 2_000


def normalise_thinking(raw: object) -> dict[str, dict[str, Any]] | None:
    """Validate the two body fragments a provider uses to ask for thinking on and off.

    A single enum ("deepseek" / "none") could not describe the vendors: DeepSeek takes
    `{"thinking": {"type": "disabled"}}`, DashScope `{"enable_thinking": false}`, OpenAI has no toggle at all
    (`reasoning_effort: none`), Anthropic has a token budget rather than a boolean. So the provider stores *what to
    send* for each choice, and the runtime only decides which fragment to merge. A vendor with no way to switch
    thinking off simply has no `off` fragment — the honest expression of that.
    """
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("thinking must be an object with optional `on` and `off` fragments")
    out: dict[str, dict[str, Any]] = {}
    for key, value in raw.items():
        if key not in {"on", "off"}:
            raise ValueError("thinking accepts only `on` and `off`")
        if value is None:
            continue
        if not isinstance(value, dict):
            raise ValueError(f"thinking.{key} must be a JSON object")
        if len(json.dumps(value)) > _FRAGMENT_CHARS:
            raise ValueError(f"thinking.{key} is larger than {_FRAGMENT_CHARS} characters")
        out[key] = value
    return out or None


def _merge_thinking(config: dict[str, Any] | None, thinking: dict[str, dict[str, Any]] | None) -> dict[str, Any] | None:
    """Store the fragments in the provider's `config`; `None` leaves them alone, `{}` clears them."""
    if thinking is None:
        return config
    merged = dict(config or {})
    if thinking:
        merged["thinking"] = thinking
    else:
        merged.pop("thinking", None)
    # The old single-choice spelling is gone; drop it wherever it was stored.
    merged.pop("thinking_style", None)
    return merged or None


class ApiProviderCreate(BaseModel):
    name: str
    base_url: str
    api_key: str | None = None
    config: dict[str, Any] | None = None
    thinking: dict[str, dict[str, Any]] | None = None


class ApiProviderUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    config: dict[str, Any] | None = None
    thinking: dict[str, dict[str, Any]] | None = None

    @model_validator(mode="after")
    def _check_thinking(self):
        if self.thinking is not None:
            self.thinking = normalise_thinking(self.thinking)
        return self


class ApiProviderResponse(BaseModel):
    id: str
    name: str
    base_url: str
    api_key_set: bool = False
    config: dict[str, Any] | None = None
    #: Echoed from `config` so the provider form can show it; `auto` when unset.
    thinking: dict[str, dict[str, Any]] | None = None
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
                "thinking": (data.config or {}).get("thinking"),
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
