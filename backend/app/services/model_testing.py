"""Service for testing registered API model endpoints."""
import logging
import time

import httpx

from app.models.api_model import model_has_capability
from app.schemas.api_model import ApiModelTestResponse
from app.services.media_generation.zhipu import extract_result_url, poll_async_result

logger = logging.getLogger(__name__)


def _api_root(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/paas/v4"):
        return base
    if base.endswith("/api"):
        return f"{base}/paas/v4"
    if "/paas/v4" not in base:
        return f"{base}/paas/v4"
    return base


def _build_url(base_url: str, api_kind: str) -> str:
    root = _api_root(base_url)
    if api_kind == "embeddings":
        return f"{base_url.rstrip('/')}/embeddings"
    if api_kind == "chat-completions":
        return f"{base_url.rstrip('/')}/chat/completions"
    if api_kind == "image-generate":
        return f"{root.rstrip('/')}/async/images/generations"
    if api_kind == "video-generate":
        return f"{root.rstrip('/')}/videos/generations"
    return base_url.rstrip("/")


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
    elif api_kind == "image-generate":
        payload = {"prompt": prompt, "size": "1280x1280", "quality": "hd"}
    elif api_kind == "video-generate":
        payload = {"prompt": prompt, "size": "1920x1080", "duration": 5}
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
    if api_kind in ("image-generate", "video-generate"):
        task_id = data.get("id") or data.get("request_id")
        status = data.get("task_status", "unknown")
        return f"Async task submitted.\nTask ID: {task_id}\nStatus: {status}\nPoll GET .../async-result/{{id}} for the result."
    return _parse_chat_response(data)


async def _poll_generation_result(
    *,
    base_url: str,
    api_key: str | None,
    task_id: str,
    api_kind: str,
) -> ApiModelTestResponse:
    if not api_key:
        return ApiModelTestResponse(success=False, error="API key is required for generation polling")
    media_kind = "image" if api_kind == "image-generate" else "video"
    try:
        result = await poll_async_result(base_url=base_url, api_key=api_key, task_id=task_id)
        media_url = extract_result_url(result, media_kind)
    except TimeoutError as e:
        return ApiModelTestResponse(success=False, error=str(e))
    except Exception as e:
        logger.warning("Generation poll failed for task %s: %s", task_id, e)
        return ApiModelTestResponse(success=False, error=str(e))

    label = "Image" if media_kind == "image" else "Video"
    return ApiModelTestResponse(
        success=True,
        content=f"{label} generated successfully.",
        image_url=media_url if media_kind == "image" else None,
        video_url=media_url if media_kind == "video" else None,
    )


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

        if api_kind in ("image-generate", "video-generate"):
            task_id = data.get("id") or data.get("request_id")
            if not task_id:
                return ApiModelTestResponse(
                    success=False,
                    error=f"No task id in generation response: {data}",
                    elapsed_ms=elapsed,
                )
            polled = await _poll_generation_result(
                base_url=base_url,
                api_key=api_key,
                task_id=str(task_id),
                api_kind=api_kind,
            )
            polled.elapsed_ms = int((time.monotonic() - t0) * 1000)
            return polled

        content = parse_response(data, api_kind, prompt)
        return ApiModelTestResponse(success=True, content=content, elapsed_ms=elapsed)

    except httpx.ConnectError as e:
        elapsed = int((time.monotonic() - t0) * 1000)
        return ApiModelTestResponse(success=False, error=f"Connection refused: {e}", elapsed_ms=elapsed)
    except Exception as e:
        elapsed = int((time.monotonic() - t0) * 1000)
        logger.warning("Model test request failed: %s", e)
        return ApiModelTestResponse(success=False, error=str(e), elapsed_ms=elapsed)
