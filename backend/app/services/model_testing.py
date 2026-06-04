"""Service for testing registered API model endpoints."""
import logging
import time

import httpx

from app.models.api_model import model_has_capability
from app.schemas.api_model import ApiModelTestResponse

logger = logging.getLogger(__name__)


def _build_url(base_url: str, api_kind: str) -> str:
    base = base_url.rstrip("/")
    if api_kind == "embeddings":
        return f"{base}/embeddings"
    if api_kind == "chat-completions":
        return f"{base}/chat/completions"
    return base


def _build_headers(api_key: str | None) -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _build_vl_content(prompt: str, image: str | None) -> list[dict]:
    """Build multimodal content array for vision-capable chat models."""
    parts: list[dict] = []
    if image:
        parts.append({
            "type": "image_url",
            "image_url": {"url": image},
        })
    parts.append({"type": "text", "text": prompt})
    return parts


def _build_payload(
    api_kind: str,
    capabilities: list[str] | None,
    prompt: str,
    model_name: str | None,
    max_tokens: int,
    temperature: float,
    image: str | None = None,
) -> dict:
    if api_kind == "embeddings":
        payload: dict = {"input": prompt}
    elif api_kind == "chat-completions" and image and model_has_capability(capabilities, "vision"):
        content = _build_vl_content(prompt, image)
        payload = {
            "messages": [{"role": "user", "content": content}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
    elif api_kind == "chat-completions":
        payload = {
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
    else:
        payload = {
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
    if model_name:
        payload["model"] = model_name
    return payload


def _parse_embedding_response(data: dict, prompt: str) -> str:
    emb_data = data.get("data", [])
    if not emb_data:
        return str(data)
    vec = emb_data[0].get("embedding", [])
    dim = len(vec)
    lines = [
        f"Input: {prompt}",
        f"Dimension: {dim}",
        f"First 5: {vec[:5]}",
    ]
    if dim > 5:
        lines.append(f"Last 5:  {vec[-5:]}")
    return "\n".join(lines)


def _parse_chat_response(data: dict) -> str:
    choices = data.get("choices", [])
    return choices[0]["message"]["content"] if choices else str(data)


def parse_response(data: dict, api_kind: str, prompt: str) -> str:
    """Parse model API response based on api_kind."""
    if api_kind == "embeddings":
        return _parse_embedding_response(data, prompt)
    return _parse_chat_response(data)


async def execute_test(
    *,
    base_url: str,
    api_kind: str,
    capabilities: list[str] | None = None,
    api_key: str | None,
    model_name: str | None,
    prompt: str,
    image: str | None = None,
    max_tokens: int = 512,
    temperature: float = 0.7,
) -> ApiModelTestResponse:
    """Send a test request to a model endpoint and return a structured result."""
    url = _build_url(base_url, api_kind)
    headers = _build_headers(api_key)
    payload = _build_payload(
        api_kind, capabilities, prompt, model_name, max_tokens, temperature, image=image
    )

    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
        elapsed = int((time.monotonic() - t0) * 1000)

        if resp.status_code >= 400:
            return ApiModelTestResponse(
                success=False,
                error=f"HTTP {resp.status_code}: {resp.text[:500]}",
                elapsed_ms=elapsed,
            )

        data = resp.json()
        content = parse_response(data, api_kind, prompt)
        return ApiModelTestResponse(success=True, content=content, elapsed_ms=elapsed)

    except httpx.ConnectError as e:
        elapsed = int((time.monotonic() - t0) * 1000)
        return ApiModelTestResponse(success=False, error=f"Connection refused: {e}", elapsed_ms=elapsed)
    except Exception as e:
        elapsed = int((time.monotonic() - t0) * 1000)
        logger.warning("Model test request failed: %s", e)
        return ApiModelTestResponse(success=False, error=str(e), elapsed_ms=elapsed)
