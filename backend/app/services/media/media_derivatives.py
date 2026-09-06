"""Generate thumbnails and video posters for media assets."""

from __future__ import annotations

import io
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.services.media.media_storage import media_poster_key, media_thumbnail_key
from app.services.storage import upload_object

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


def _webp_from_image_file(path: Path, quality: int = 85) -> bytes | None:
    """Load an image file and re-encode as WebP via Pillow.

    ffmpeg is used only to decode a frame to PNG: many ffmpeg builds (e.g. the
    default Homebrew one) ship without the libwebp encoder, so asking ffmpeg for
    .webp directly fails with "Default encoder for format webp is probably
    disabled". Pillow always has WebP, so the encode step lives here.
    """
    if not _has_pillow():
        logger.warning("Pillow not installed; skipping webp encode")
        return None
    from PIL import Image

    with Image.open(path) as img:
        img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=quality)
        return buf.getvalue()


def _grab_frame(src: Path, at_sec: float, dst_png: Path, width: int = THUMB_MAX) -> bool:
    """Decode a single frame at `at_sec` into a PNG file. Returns True on success."""
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{at_sec:.3f}",
        "-i",
        str(src),
        "-vframes",
        "1",
        "-vf",
        f"scale={width}:-1",
        str(dst_png),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        logger.warning("ffmpeg frame grab at %.1fs failed: %s", at_sec, exc)
        return False
    return dst_png.exists()


def _video_ext(content_type: str | None) -> str:
    if content_type and "webm" in content_type:
        return ".webm"
    if content_type and "quicktime" in content_type:
        return ".mov"
    return ".mp4"


def generate_video_poster(body: bytes, content_type: str | None) -> bytes | None:
    if not _has_ffmpeg():
        logger.warning("ffmpeg not found; skipping video poster")
        return None
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"video{_video_ext(content_type)}"
        png = Path(tmp) / "poster.png"
        src.write_bytes(body)
        if not _grab_frame(src, 1.0, png):
            return None
        return _webp_from_image_file(png)


def probe_duration_sec(src_path: Path) -> float:
    """Read media duration via ffprobe. Returns 0.0 when it cannot be determined."""
    if shutil.which("ffprobe") is None:
        return 0.0
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        str(src_path),
    ]
    try:
        out = subprocess.run(cmd, check=True, capture_output=True, timeout=60)
        return float((out.stdout or b"").decode().strip() or 0)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError) as exc:
        logger.warning("ffprobe duration failed: %s", exc)
        return 0.0


def extract_keyframes(
    src_path: Path, duration_sec: float, count: int = 6
) -> list[tuple[int, bytes]]:
    """Grab `count` evenly spaced frames. Returns [(timestamp_ms, webp_bytes), ...].

    Frames are sampled inside the 5%-95% band so intros and end cards do not
    dominate the strip. Frames that fail to decode are skipped, not fatal.
    """
    if not _has_ffmpeg() or count < 1:
        return []
    if duration_sec <= 0:
        # Transcription may have been skipped, so duration_ms can still be unset.
        duration_sec = probe_duration_sec(src_path)
    if duration_sec <= 0:
        return []
    start, end = duration_sec * 0.05, duration_sec * 0.95
    step = (end - start) / count
    out: list[tuple[int, bytes]] = []
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(count):
            at = start + step * (i + 0.5)
            png = Path(tmp) / f"f{i:03d}.png"
            if not _grab_frame(src_path, at, png, width=640):
                continue
            data = _webp_from_image_file(png, quality=80)
            if data:
                out.append((int(at * 1000), data))
    return out


def build_and_upload_derivatives(
    asset_id: str,
    body: bytes,
    media_kind: str,
    content_type: str | None = None,
) -> tuple[str | None, str | None]:
    """Produce thumb/poster from in-memory bytes and upload. Returns (thumbnail_key, poster_key)."""
    thumb_key: str | None = None
    poster_key: str | None = None
    if media_kind == "audio":
        # No visual to derive from; the detail page falls back to an audio player.
        return None, None
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
