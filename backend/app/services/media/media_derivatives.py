"""Generate thumbnails and video posters for media assets."""

from __future__ import annotations

import io
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.services.media.media_storage import media_poster_key, media_thumbnail_key
from app.services.storage import get_object, upload_object

logger = logging.getLogger(__name__)

THUMB_MAX = 480


def _has_pillow() -> bool:
    try:
        import PIL  # noqa: F401

        return True
    except ImportError:
        return False


def _has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def generate_image_thumbnail(body: bytes) -> bytes | None:
    if not _has_pillow():
        logger.warning("Pillow not installed; skipping image thumbnail")
        return None
    from PIL import Image

    img = Image.open(io.BytesIO(body))
    img.thumbnail((THUMB_MAX, THUMB_MAX))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=85)
    return buf.getvalue()


def generate_video_poster(body: bytes, content_type: str | None) -> bytes | None:
    if not _has_ffmpeg():
        logger.warning("ffmpeg not found; skipping video poster")
        return None
    ext = ".mp4"
    if content_type and "webm" in content_type:
        ext = ".webm"
    elif content_type and "quicktime" in content_type:
        ext = ".mov"
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"video{ext}"
        dst = Path(tmp) / "poster.webp"
        src.write_bytes(body)
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-ss",
            "00:00:01",
            "-vframes",
            "1",
            "-vf",
            f"scale={THUMB_MAX}:-1",
            str(dst),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            logger.warning("ffmpeg poster failed: %s", exc)
            return None
        if not dst.exists():
            return None
        return dst.read_bytes()


def build_and_upload_derivatives(
    asset_id: str,
    body: bytes,
    media_kind: str,
    content_type: str | None = None,
) -> tuple[str | None, str | None]:
    """Produce thumb/poster from in-memory bytes and upload. Returns (thumbnail_key, poster_key)."""
    thumb_key: str | None = None
    poster_key: str | None = None
    if media_kind == "image":
        thumb_bytes = generate_image_thumbnail(body)
        if thumb_bytes:
            thumb_key = media_thumbnail_key(asset_id)
            upload_object(thumb_key, thumb_bytes, content_type="image/webp")
    elif media_kind == "video":
        poster_bytes = generate_video_poster(body, content_type)
        if poster_bytes:
            poster_key = media_poster_key(asset_id)
            upload_object(poster_key, poster_bytes, content_type="image/webp")
            thumb_key = poster_key
    return thumb_key, poster_key


def process_media_derivatives(asset_id: str, storage_key: str, media_kind: str) -> tuple[str | None, str | None]:
    """Download original, produce thumb/poster, upload. Returns (thumbnail_key, poster_key)."""
    body = get_object(storage_key)
    return build_and_upload_derivatives(asset_id, body, media_kind)
