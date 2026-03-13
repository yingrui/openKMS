"""Service for testing registered API model endpoints."""
import logging
import time

import httpx

from app.schemas.api_model import ApiModelTestResponse

logger = logging.getLogger(__name__)


def _build_url(base_url: str, category: str) -> str:
    base = base_url.rstrip("/")
    if category == "embedding":
        return f"{base}/embeddings"
    elif category == "llm":
        return f"{base}/chat/completions"
    elif category == "vl":
        return f"{base}/chat/completions"
    # Otherwise, use url as is
    return base


def _build_headers(api_key: str | None) -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _build_vl_content(prompt: str, image: str | None) -> list[dict]:
    """Build multimodal content array for vision-language models."""
    parts: list[dict] = []
    if image:
        parts.append({
            "type": "image_url",
            "image_url": {"url": image},
        })
    parts.append({"type": "text", "text": prompt})
    return parts


def _build_payload(
    category: str,
    prompt: str,
    model_name: str | None,
    max_tokens: int,
    temperature: float,
    image: str | None = None,
) -> dict:
    if category == "embedding":
        payload: dict = {"input": prompt}
    elif category == "vl":
        content = _build_vl_content(prompt, image)
        payload = {
            "messages": [{"role": "user", "content": content}],
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


def parse_response(data: dict, category: str, prompt: str) -> str:
    """Parse model API response based on category."""
    if category == "embedding":
        return _parse_embedding_response(data, prompt)
    return _parse_chat_response(data)


async def execute_test(
    *,
    base_url: str,
    category: str,
    api_key: str | None,
    model_name: str | None,
    prompt: str,
    image: str | None = None,
    max_tokens: int = 512,
    temperature: float = 0.7,
) -> ApiModelTestResponse:
    """Send a test request to a model endpoint and return a structured result."""
    url = _build_url(base_url, category)
    headers = _build_headers(api_key)
    payload = _build_payload(category, prompt, model_name, max_tokens, temperature, image=image)

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
        content = parse_response(data, category, prompt)
        return ApiModelTestResponse(success=True, content=content, elapsed_ms=elapsed)

    except httpx.ConnectError as e:
        elapsed = int((time.monotonic() - t0) * 1000)
        return ApiModelTestResponse(success=False, error=f"Connection refused: {e}", elapsed_ms=elapsed)
    except Exception as e:
        elapsed = int((time.monotonic() - t0) * 1000)
        logger.warning("Model test request failed: %s", e)
        return ApiModelTestResponse(success=False, error=str(e), elapsed_ms=elapsed)
