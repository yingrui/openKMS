"""MinIO key helpers for media assets."""

from __future__ import annotations

MEDIA_KIND_IMAGE = "image"
MEDIA_KIND_VIDEO = "video"

ALLOWED_IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})
ALLOWED_VIDEO_EXTENSIONS = frozenset({".mp4", ".webm", ".mov", ".m4v"})


def media_prefix(asset_id: str) -> str:
    return f"media/{asset_id}"


def media_original_key(asset_id: str, ext: str) -> str:
    return f"{media_prefix(asset_id)}/original.{ext.lstrip('.')}"


def media_thumbnail_key(asset_id: str) -> str:
    return f"{media_prefix(asset_id)}/thumb.webp"


def media_poster_key(asset_id: str) -> str:
    return f"{media_prefix(asset_id)}/poster.webp"


def is_allowed_media_file_path(path: str) -> bool:
    if not path or ".." in path or path.startswith("/"):
        return False
    allowed = ("original.", "thumb.webp", "poster.webp")
    return any(path.startswith(f"media/") and part in path for part in allowed) or path.endswith(allowed)
