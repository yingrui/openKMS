"""Image attachments for agent sessions (multimodal turns).

Bytes live in object storage — never in the project workspace — so the agent's file
tools and the project's git remotes never see them. A message row only stores
``[{id, name, mime, size}]`` descriptor dicts.
"""

from __future__ import annotations

import base64
import logging
import os
import re
import time
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from app.config import settings
from app.services.storage import (
    delete_object,
    delete_objects_by_prefix,
    get_object,
    get_redirect_url,
    object_exists,
    upload_object,
)

logger = logging.getLogger(__name__)

ATTACHMENT_PREFIX = "agent-attachments"
MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

# Images only: a vision turn is the only thing the model can read inline.
_EXT_BY_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
_MIME_BY_EXT = {ext: mime for mime, ext in _EXT_BY_MIME.items()}
_ALLOWED_MIMES = frozenset(_EXT_BY_MIME)

_ID_RE = re.compile(r"^att_[0-9a-f]{12}$")

#: Presigned thumbnail URLs are valid for an hour; reuse one briefly instead of re-signing on every list/poll.
_URL_CACHE: dict[str, tuple[float, str]] = {}
_URL_TTL_SECONDS = 300.0
_URL_CACHE_MAX = 512


def conversation_prefix(conversation_id: str) -> str:
    return f"{ATTACHMENT_PREFIX}/{conversation_id}"


def attachment_key(conversation_id: str, attachment_id: str, mime: str) -> str:
    ext = _EXT_BY_MIME.get(mime)
    if not _ID_RE.match(attachment_id) or ext is None:
        raise ValueError("Invalid attachment reference")
    return f"{conversation_prefix(conversation_id)}/{attachment_id}{ext}"


def _safe_name(filename: str) -> str:
    name = os.path.basename((filename or "").replace("\\", "/")).strip()
    name = "".join(c for c in name if c.isprintable())
    return (name or "image")[:200]


def _resolve_mime(filename: str, content_type: str | None) -> str | None:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in _ALLOWED_MIMES:
        return ct
    ext = os.path.splitext(filename or "")[1].lower()
    return _MIME_BY_EXT.get(ext)


def _require_storage() -> None:
    if not settings.storage_enabled:
        raise HTTPException(status_code=503, detail="Image attachments require object storage to be configured")


def normalize_attachment_refs(raw: Any, *, conversation_id: str) -> list[dict[str, Any]]:
    """Validate client-echoed descriptors and confirm the objects actually exist."""
    if not raw:
        return []
    if not isinstance(raw, list):
        raise HTTPException(status_code=400, detail="attachments must be a list")
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Invalid attachment entry")
        attachment_id = str(item.get("id") or "")
        mime = str(item.get("mime") or "").lower()
        if not _ID_RE.match(attachment_id) or attachment_id in seen or mime not in _ALLOWED_MIMES:
            raise HTTPException(status_code=400, detail="Invalid attachment reference")
        try:
            key = attachment_key(conversation_id, attachment_id, mime)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="Invalid attachment reference") from e
        if not object_exists(key):
            raise HTTPException(status_code=400, detail=f"Attachment not found: {attachment_id}")
        seen.add(attachment_id)
        out.append(
            {
                "id": attachment_id,
                "name": _safe_name(str(item.get("name") or "")),
                "mime": mime,
                "size": int(item.get("size") or 0),
            }
        )
    return out


def _too_large_detail() -> str:
    return f"Image is too large (max {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB)"


def check_attachment_size(size: int | None) -> None:
    """Reject an oversized upload from the parser-reported size, before reading it into memory."""
    if size is not None and size > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=400, detail=_too_large_detail())


def save_attachment(conversation_id: str, *, filename: str, content_type: str | None, body: bytes) -> dict[str, Any]:
    _require_storage()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(body) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=400, detail=_too_large_detail())
    mime = _resolve_mime(filename, content_type)
    if mime is None:
        raise HTTPException(status_code=400, detail="Only PNG, JPEG, WebP or GIF images are supported")
    attachment_id = f"att_{uuid4().hex[:12]}"
    upload_object(attachment_key(conversation_id, attachment_id, mime), body, content_type=mime)
    return {"id": attachment_id, "name": _safe_name(filename), "mime": mime, "size": len(body)}


def attachment_data_uri(conversation_id: str, attachment: dict[str, Any]) -> str | None:
    """Inline image for a model content block. Missing objects degrade to no image."""
    try:
        key = attachment_key(conversation_id, str(attachment.get("id") or ""), str(attachment.get("mime") or ""))
        body = get_object(key)
    except Exception as e:
        logger.warning("attachment %s unreadable: %s", attachment.get("id"), e)
        return None
    return f"data:{attachment['mime']};base64,{base64.b64encode(body).decode('ascii')}"


def attachment_display_url(conversation_id: str, attachment: dict[str, Any]) -> str | None:
    """Presigned URL for rendering the thumbnail in the UI.

    Memoized briefly: message lists are polled during turns and rebuilt on every poll,
    and re-signing each image on every tick is pure overhead.
    """
    try:
        key = attachment_key(conversation_id, str(attachment.get("id") or ""), str(attachment.get("mime") or ""))
    except Exception:
        return None
    now = time.monotonic()
    cached = _URL_CACHE.get(key)
    if cached and cached[0] > now:
        return cached[1]
    try:
        url = get_redirect_url(key)
    except Exception as e:
        logger.warning("attachment %s url failed: %s", attachment.get("id"), e)
        return None
    if len(_URL_CACHE) >= _URL_CACHE_MAX:
        _URL_CACHE.clear()
    _URL_CACHE[key] = (now + _URL_TTL_SECONDS, url)
    return url


def human_content_with_attachments(
    conversation_id: str,
    text: str,
    attachments: Any,
) -> str | list[dict[str, Any]]:
    """OpenAI-style content blocks for a turn, or plain text when there are no readable images."""
    images: list[dict[str, Any]] = []
    for attachment in attachments or []:
        if not isinstance(attachment, dict):
            continue
        uri = attachment_data_uri(conversation_id, attachment)
        if uri:
            images.append({"type": "image_url", "image_url": {"url": uri}})
    if not images:
        return text
    return [{"type": "text", "text": text}, *images]


def delete_conversation_attachments(conversation_id: str) -> None:
    if not settings.storage_enabled:
        return
    delete_objects_by_prefix(f"{conversation_prefix(conversation_id)}/")


def delete_attachments(conversation_id: str, attachments: Any) -> None:
    """Delete specific attachment objects (e.g. when truncating reverted messages)."""
    if not settings.storage_enabled or not attachments:
        return
    for attachment in attachments or []:
        if not isinstance(attachment, dict):
            continue
        try:
            delete_object(attachment_key(conversation_id, str(attachment.get("id") or ""), str(attachment.get("mime") or "")))
        except Exception as e:
            logger.warning("attachment %s delete failed: %s", attachment.get("id"), e)
