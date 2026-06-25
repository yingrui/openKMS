"""Zhipu async image and video generation."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

POLL_INTERVAL_SEC = 3
POLL_MAX_ATTEMPTS = 120


def _api_root(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/paas/v4"):
        return base
    if base.endswith("/api"):
        return f"{base}/paas/v4"
    if "/paas/v4" not in base:
        return f"{base}/paas/v4"
    return base


async def submit_image_generation(
    *,
    base_url: str,
    api_key: str,
    model_name: str,
    prompt: str,
    size: str | None = None,
    quality: str | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    url = f"{_api_root(base_url)}/async/images/generations"
    payload: dict[str, Any] = {"model": model_name, "prompt": prompt}
    if size:
        payload["size"] = size
    if quality:
        payload["quality"] = quality
    if extra:
        payload.update(extra)
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()
    task_id = data.get("id")
    if not task_id:
        raise RuntimeError(f"No task id in image generation response: {data}")
    return str(task_id)


async def submit_video_generation(
    *,
    base_url: str,
    api_key: str,
    model_name: str,
    prompt: str,
    size: str | None = None,
    quality: str | None = None,
    duration: int | None = None,
    fps: int | None = None,
    with_audio: bool | None = None,
    image_url: str | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    url = f"{_api_root(base_url)}/videos/generations"
    payload: dict[str, Any] = {"model": model_name, "prompt": prompt}
    if size:
        payload["size"] = size
    if quality:
        payload["quality"] = quality
    if duration is not None:
        payload["duration"] = duration
    if fps is not None:
        payload["fps"] = fps
    if with_audio is not None:
        payload["with_audio"] = with_audio
    if image_url:
        payload["image_url"] = image_url
    if extra:
        payload.update(extra)
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()
    task_id = data.get("id")
    if not task_id:
        raise RuntimeError(f"No task id in video generation response: {data}")
    return str(task_id)


async def poll_async_result(
    *,
    base_url: str,
    api_key: str,
    task_id: str,
) -> dict[str, Any]:
    url = f"{_api_root(base_url)}/async-result/{task_id}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        for attempt in range(POLL_MAX_ATTEMPTS):
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.is_error:
                data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                raise RuntimeError(
                    f"Async result query failed (HTTP {resp.status_code}): {data.get('error', {}).get('message', resp.text[:200])}"
                )
            data = resp.json()
            status = (data.get("task_status") or "").upper()
            if status == "SUCCESS":
                return data
            if status == "FAIL":
                raise RuntimeError(f"Generation failed: {data}")
            if attempt < POLL_MAX_ATTEMPTS - 1:
                await asyncio.sleep(POLL_INTERVAL_SEC)
        raise TimeoutError(f"Timed out polling task {task_id}")


def extract_result_url(data: dict[str, Any], media_kind: str) -> str:
    if media_kind == "image":
        results = data.get("image_result") or []
        if results and isinstance(results[0], dict) and results[0].get("url"):
            return str(results[0]["url"])
    elif media_kind == "video":
        results = data.get("video_result") or []
        if results and isinstance(results[0], dict) and results[0].get("url"):
            return str(results[0]["url"])
    raise RuntimeError(f"No result URL in async response: {data}")


async def download_url(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content
