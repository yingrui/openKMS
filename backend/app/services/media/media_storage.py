"""MinIO key helpers for media assets."""

from __future__ import annotations

MEDIA_KIND_IMAGE = "image"
MEDIA_KIND_VIDEO = "video"
MEDIA_KIND_AUDIO = "audio"

ALLOWED_IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})
ALLOWED_VIDEO_EXTENSIONS = frozenset({".mp4", ".webm", ".mov", ".m4v"})
ALLOWED_AUDIO_EXTENSIONS = frozenset({".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg"})


def media_prefix(asset_id: str) -> str:
    return f"media/{asset_id}"


def media_original_key(asset_id: str, ext: str) -> str:
    return f"{media_prefix(asset_id)}/original.{ext.lstrip('.')}"


def media_thumbnail_key(asset_id: str) -> str:
    return f"{media_prefix(asset_id)}/thumb.webp"


def media_poster_key(asset_id: str) -> str:
    return f"{media_prefix(asset_id)}/poster.webp"


def media_frame_key(asset_id: str, index: int) -> str:
    """Storage key for one extracted keyframe (screenshot)."""
    return f"{media_prefix(asset_id)}/frames/{index:03d}.webp"


def is_allowed_media_file_path(path: str) -> bool:
    if not path or ".." in path or path.startswith("/"):
        return False
    allowed = ("original.", "thumb.webp", "poster.webp")
    if "/frames/" in path and path.endswith(".webp"):
        return path.startswith("media/")
    return any(path.startswith(f"media/") and part in path for part in allowed) or path.endswith(allowed)
