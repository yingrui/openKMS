"""Document parser using Baidu Cloud PaddleOCR-VL API (async).

Requires OPENKMS_BAIDU_CLOUD_API_KEY, OPENKMS_BAIDU_CLOUD_SECRET_KEY, and
OPENKMS_BAIDU_BOS_BUCKET. Documents are staged on Baidu BOS with a presigned URL
for ``file_url`` submit.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import requests

logger = logging.getLogger("openkms_cli.baidu")

_DEFAULT_POLL_INTERVAL = 8
_DEFAULT_MAX_WAIT = 600
# Baidu API page_meta and paddle/VLM layout coords both use 2× logical page pixels.
# PyMuPDF dpi=150 (≈2.083×) produces a different grid and ~4% bbox drift.
_BAIDU_COORD_TO_PNG_SCALE = 2.0

# Baidu file_url URL length limit (bytes).
BAIDU_MAX_FILE_URL_BYTES = 1024
_BAIDU_ERR_URL_DOWNLOAD_TIMEOUT = 282112
_BAIDU_POST_RETRIES = 3
_BAIDU_POST_BACKOFF_SEC = (2, 5, 10)

_BAIDU_IMAGE_EXT = frozenset({".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"})
_BAIDU_STREAMING_EXT = frozenset({".doc", ".docx", ".txt", ".wps"})
_BAIDU_LAYOUT_EXT = frozenset({".pdf", ".ofd", ".ppt", ".pptx"})
_BAIDU_NATIVE_EXT = _BAIDU_IMAGE_EXT | _BAIDU_STREAMING_EXT | _BAIDU_LAYOUT_EXT


class BaiduParseError(RuntimeError):
    """Raised when Baidu Cloud document parsing fails."""


def _baidu_http_json(resp: requests.Response, operation: str) -> dict[str, Any]:
    """Parse Baidu API JSON body; raise BaiduParseError with HTTP/body diagnostics."""
    text = (resp.text or "").strip()
    ctype = resp.headers.get("Content-Type", "")
    if not text:
        logger.error(
            "baidu_%s empty_body status=%s content_type=%s url=%s",
            operation,
            resp.status_code,
            ctype,
            resp.url[:200] if resp.url else "",
        )
        raise BaiduParseError(
            f"Baidu {operation} returned empty body (HTTP {resp.status_code}). "
            f"Check BAIDU_*_URL, network egress, and OPENKMS_BAIDU_CLOUD_* credentials."
        )
    try:
        data = resp.json()
    except requests.exceptions.JSONDecodeError as e:
        preview = text[:500].replace("\n", " ")
        logger.error(
            "baidu_%s non_json status=%s content_type=%s preview=%s",
            operation,
            resp.status_code,
            ctype,
            preview,
        )
        raise BaiduParseError(
            f"Baidu {operation} returned non-JSON (HTTP {resp.status_code}): {preview}"
        ) from e
    if not isinstance(data, dict):
        raise BaiduParseError(f"Baidu {operation} returned unexpected JSON: {type(data).__name__}")
    return data


def _baidu_urls() -> tuple[str, str, str]:
    from .settings import get_cli_settings

    s = get_cli_settings()
    return s.baidu_token_url, s.baidu_task_url, s.baidu_query_url


def _baidu_post(
    http: requests.Session | requests.api,
    url: str,
    *,
    operation: str,
    **kwargs: Any,
) -> requests.Response:
    """POST with retries on transient TLS/connection errors."""
    last: requests.RequestException | None = None
    for attempt in range(_BAIDU_POST_RETRIES):
        try:
            return http.post(url, **kwargs)
        except requests.RequestException as e:
            last = e
            if attempt + 1 >= _BAIDU_POST_RETRIES:
                break
            wait = _BAIDU_POST_BACKOFF_SEC[min(attempt, len(_BAIDU_POST_BACKOFF_SEC) - 1)]
            logger.warning(
                "baidu_%s transport error attempt=%s/%s wait=%ss err=%s",
                operation,
                attempt + 1,
                _BAIDU_POST_RETRIES,
                wait,
                e,
            )
            time.sleep(wait)
    raise BaiduParseError(
        f"Baidu {operation} request failed after {_BAIDU_POST_RETRIES} attempts: {last}"
    ) from last



def get_access_token(api_key: str, secret_key: str, *, session: requests.Session | None = None) -> str:
    """Exchange API key + secret for an access_token."""
    if not api_key or not secret_key:
        raise BaiduParseError(
            "OPENKMS_BAIDU_CLOUD_API_KEY and OPENKMS_BAIDU_CLOUD_SECRET_KEY are required"
        )
    http = session or requests
    token_url, _, _ = _baidu_urls()
    resp = _baidu_post(
        http,
        token_url,
        operation="access_token",
        params={
            "grant_type": "client_credentials",
            "client_id": api_key,
            "client_secret": secret_key,
        },
        timeout=30,
    )
    data = _baidu_http_json(resp, "access_token")
    if resp.status_code != 200 or "access_token" not in data:
        err = data.get("error_description") or data.get("error") or resp.text[:200]
        raise BaiduParseError(f"Baidu access_token request failed: {err}")
    return str(data["access_token"])


def _worker_output(line: str) -> None:
    """Emit a line via CLI logger (stderr → job worker output)."""
    from .logging_config import configure_cli_logging

    configure_cli_logging()
    logger.info(line)


def _redact_file_url(url: str | bytes) -> str:
    if isinstance(url, bytes):
        url = url.decode("utf-8")
    lower = url.lower()
    if "authorization=" in lower or "sig=" in lower:
        p = urlparse(url)
        return f"{p.scheme}://{p.netloc}{p.path}?…"
    return url


def _is_baidu_url_download_timeout(err: BaseException) -> bool:
    if not isinstance(err, BaiduParseError):
        return False
    msg = str(err).lower()
    return "282112" in msg or "url download timeout" in msg


def _baidu_file_url_submit_settings() -> tuple[int, int, int]:
    from .settings import get_cli_settings

    s = get_cli_settings()
    return (
        s.baidu_file_url_submit_retries,
        s.baidu_file_url_retry_delay_seconds,
        s.baidu_file_url_submit_timeout_seconds,
    )


def _submit_parse_task_file_url_with_retries(
    access_token: str,
    file_name: str,
    *,
    get_file_url: Callable[[], str],
    file_size: int | None,
    session: requests.Session,
) -> str:
    """
    Submit file_url task; on Baidu url-download timeout (282112), mint a fresh presigned URL and retry.

    Baidu fetches file_url server-side; their download timeout is not configurable via API.
    """
    retries, delay, submit_timeout = _baidu_file_url_submit_settings()
    last_err: BaiduParseError | None = None
    for attempt in range(retries):
        attempt_no = attempt + 1
        file_url = get_file_url()
        if attempt == 0:
            _worker_output(f"baidu_file_url={_redact_file_url(file_url)}")
        else:
            _worker_output(
                f"baidu_file_url retry={attempt_no}/{retries} url={_redact_file_url(file_url)}"
            )
        try:
            return create_parse_task(
                access_token,
                file_name,
                file_url=file_url,
                file_size=file_size,
                session=session,
                submit_timeout=submit_timeout,
            )
        except BaiduParseError as e:
            last_err = e
            if _is_baidu_url_download_timeout(e):
                if attempt_no < retries:
                    logger.warning(
                        "baidu_file_url submit timeout (attempt %s/%s): %s; retry in %ss",
                        attempt_no,
                        retries,
                        e,
                        delay,
                    )
                    _worker_output(
                        f"baidu_file_url_download_timeout attempt={attempt_no}/{retries} "
                        f"retry_in={delay}s err={e}"
                    )
                    if delay > 0:
                        time.sleep(delay)
                    continue
                raise BaiduParseError(
                    f"Baidu file_url submit failed after {retries} attempts "
                    f"(url download timeout): {e}"
                ) from e
            raise
    raise BaiduParseError(
        f"Baidu file_url submit failed after {retries} attempts (url download timeout): {last_err}"
    ) from last_err


def create_parse_task(
    access_token: str,
    file_name: str,
    *,
    file_url: str,
    file_size: int | None = None,
    session: requests.Session | None = None,
    submit_timeout: int | None = None,
    **options: bool,
) -> str:
    """Submit a document parse task via BOS presigned ``file_url``; return task_id."""
    http = session or requests
    payload: dict[str, str] = {"file_name": file_name}

    file_url = file_url.strip()
    url_len = len(file_url.encode("utf-8"))
    if url_len > BAIDU_MAX_FILE_URL_BYTES:
        raise BaiduParseError(
            f"Baidu file_url exceeds {BAIDU_MAX_FILE_URL_BYTES} bytes ({url_len}). "
            f"Use a shorter OPENKMS_BAIDU_BOS_PREFIX or bucket name."
        )
    payload["file_url"] = file_url
    if file_size is not None:
        logger.info(
            "baidu_task_submit mode=file_url file_name=%s size=%s url=%s",
            file_name,
            file_size,
            _redact_file_url(file_url),
        )
    else:
        logger.info(
            "baidu_task_submit mode=file_url file_name=%s url=%s",
            file_name,
            _redact_file_url(file_url),
        )

    for key, val in options.items():
        if val is not None:
            payload[key] = str(val).lower() if isinstance(val, bool) else str(val)

    _, task_url, _ = _baidu_urls()
    if submit_timeout is None:
        _, _, submit_timeout = _baidu_file_url_submit_settings()
    logger.info(
        "baidu_task_submit POST %s mode=file_url timeout=%ss",
        task_url.split("?")[0],
        submit_timeout,
    )
    resp = _baidu_post(
        http,
        f"{task_url}?access_token={access_token}",
        operation="task_submit",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=submit_timeout,
    )
    data = _baidu_http_json(resp, "task_submit")
    if data.get("error_code") != 0:
        logger.error(
            "baidu_task_submit failed error_code=%s msg=%s",
            data.get("error_code"),
            (data.get("error_msg") or "")[:200],
        )
        raise BaiduParseError(
            f"Baidu task submit failed ({data.get('error_code')}): {data.get('error_msg', resp.text[:200])}"
        )
    task_id = (data.get("result") or {}).get("task_id")
    if not task_id:
        raise BaiduParseError(f"Baidu task submit returned no task_id: {data}")
    logger.info("baidu_task_submit ok task_id=%s", task_id)
    _worker_output(f"baidu_task_id={task_id}")
    return str(task_id)


def query_parse_task(
    access_token: str,
    task_id: str,
    *,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    """Query task status and result URLs."""
    http = session or requests
    _, _, query_url = _baidu_urls()
    resp = _baidu_post(
        http,
        f"{query_url}?access_token={access_token}",
        operation="task_query",
        data={"task_id": task_id},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=60,
    )
    data = _baidu_http_json(resp, "task_query")
    if data.get("error_code") != 0:
        raise BaiduParseError(
            f"Baidu task query failed ({data.get('error_code')}): {data.get('error_msg', resp.text[:200])}"
        )
    result = data.get("result")
    if not isinstance(result, dict):
        raise BaiduParseError(f"Baidu task query returned unexpected result: {data}")
    return result


def poll_parse_task(
    access_token: str,
    task_id: str,
    *,
    poll_interval: int = _DEFAULT_POLL_INTERVAL,
    max_wait: int = _DEFAULT_MAX_WAIT,
    on_status: Callable[[str], None] | None = None,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    """Poll until task succeeds or fails."""
    deadline = time.monotonic() + max_wait
    while time.monotonic() < deadline:
        result = query_parse_task(access_token, task_id, session=session)
        status = str(result.get("status", "")).lower()
        if on_status:
            on_status(status)
        if status == "success":
            return result
        if status == "failed":
            err = result.get("task_error") or "unknown error"
            raise BaiduParseError(f"Baidu parse task failed: {err}")
        time.sleep(poll_interval)
    raise BaiduParseError(f"Baidu parse task timed out after {max_wait}s (task_id={task_id})")


def _position_to_bbox(position: list[Any]) -> list[float]:
    """Convert Baidu [x, y, w, h] to [x1, y1, x2, y2]."""
    if len(position) < 4:
        return []
    x, y, w, h = (float(position[0]), float(position[1]), float(position[2]), float(position[3]))
    return [x, y, x + w, y + h]


def _layout_bbox(layout: dict[str, Any]) -> list[float]:
    """Prefer API polygon corners; fall back to position [x, y, w, h]."""
    polygon = layout.get("polygon")
    if isinstance(polygon, list) and len(polygon) >= 2:
        xs: list[float] = []
        ys: list[float] = []
        for pt in polygon:
            if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                xs.append(float(pt[0]))
                ys.append(float(pt[1]))
        if xs and ys:
            return [min(xs), min(ys), max(xs), max(ys)]
    return _position_to_bbox(layout.get("position") or [])


def _bbox_to_polygon(bbox: list[float]) -> list[list[float]]:
    if len(bbox) < 4:
        return []
    x1, y1, x2, y2 = bbox[0], bbox[1], bbox[2], bbox[3]
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]


def _scale_bbox(bbox: list[float], sx: float, sy: float) -> list[float]:
    if len(bbox) < 4:
        return bbox
    return [bbox[0] * sx, bbox[1] * sy, bbox[2] * sx, bbox[3] * sy]


def _read_png_size(path: Path) -> tuple[float, float] | None:
    """Return PNG width/height in pixels, or None if unreadable."""
    if not path.is_file():
        return None
    try:
        import struct

        with path.open("rb") as f:
            head = f.read(24)
        if len(head) >= 24 and head[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", head[16:24])
            return float(w), float(h)
    except OSError:
        pass
    try:
        from PIL import Image

        with Image.open(path) as im:
            return float(im.width), float(im.height)
    except Exception:
        return None
    return None


def _scale_layout_coordinates_to_preview(
    blocks: list[dict[str, Any]],
    layout_list: list[dict[str, Any]],
    out_dir: Path,
    pages_meta: list[tuple[float | None, float | None]],
) -> tuple[float | None, float | None]:
    """Scale Baidu API coords to match layout_det_* preview PNGs (frontend uses img.naturalWidth/Height)."""
    doc_w: float | None = None
    doc_h: float | None = None
    for page_index, layout_entry in enumerate(layout_list):
        api_w, api_h = pages_meta[page_index] if page_index < len(pages_meta) else (None, None)
        png_path = out_dir / f"layout_det_{page_index}_input_img_0.png"
        png_size = _read_png_size(png_path)
        if png_size and doc_w is None:
            doc_w, doc_h = png_size
        if not png_size or not api_w or not api_h or api_w <= 0 or api_h <= 0:
            if api_w and api_h and api_w > 0 and api_h > 0:
                sx = sy = _BAIDU_COORD_TO_PNG_SCALE
                layout_entry["width"] = api_w * sx
                layout_entry["height"] = api_h * sy
                for box in layout_entry.get("boxes") or []:
                    coord = box.get("coordinate")
                    if isinstance(coord, list) and len(coord) >= 4:
                        scaled = _scale_bbox(coord, sx, sy)
                        box["coordinate"] = scaled
                        box["polygon_points"] = _bbox_to_polygon(scaled)
                    block_idx = box.get("block_index")
                    if isinstance(block_idx, int) and 0 <= block_idx < len(blocks):
                        bbox = blocks[block_idx].get("bbox")
                        if isinstance(bbox, list) and len(bbox) >= 4:
                            blocks[block_idx]["bbox"] = _scale_bbox(bbox, sx, sy)
                if doc_w is None:
                    doc_w, doc_h = api_w * sx, api_h * sy
            continue
        png_w, png_h = png_size
        sx, sy = png_w / float(api_w), png_h / float(api_h)
        layout_entry["width"] = png_w
        layout_entry["height"] = png_h
        for box in layout_entry.get("boxes") or []:
            coord = box.get("coordinate")
            if isinstance(coord, list) and len(coord) >= 4:
                scaled = _scale_bbox(coord, sx, sy)
                box["coordinate"] = scaled
                box["polygon_points"] = _bbox_to_polygon(scaled)
            block_idx = box.get("block_index")
            if isinstance(block_idx, int) and 0 <= block_idx < len(blocks):
                bbox = blocks[block_idx].get("bbox")
                if isinstance(bbox, list) and len(bbox) >= 4:
                    blocks[block_idx]["bbox"] = _scale_bbox(bbox, sx, sy)
    return doc_w, doc_h


def _download_bytes(url: str, *, session: requests.Session | None = None, timeout: int = 300) -> bytes:
    http = session or requests
    resp = http.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.content


def _rewrite_markdown_image_urls(markdown: str, url_to_rel: dict[str, str]) -> str:
    if not url_to_rel:
        return markdown
    out = markdown
    for url, rel in sorted(url_to_rel.items(), key=lambda kv: len(kv[0]), reverse=True):
        out = out.replace(url, rel)
    return out


def _layout_content(
    layout: dict[str, Any],
    *,
    tables_by_layout_id: dict[str, str],
) -> str:
    layout_type = (layout.get("type") or "").lower()
    text = (layout.get("text") or "").strip()
    layout_id = layout.get("layout_id") or ""
    if layout_type == "table" and layout_id in tables_by_layout_id:
        return tables_by_layout_id[layout_id]
    return text


def _ensure_page_preview_images(
    input_path: Path,
    file_hash: str,
    out_dir: Path,
    page_count: int,
    pages_meta: list[tuple[float | None, float | None]] | None = None,
) -> None:
    """Write layout_det_{i}_input_img_0.png previews (same pixel grid as paddle/VLM: 2× page_meta)."""
    if page_count <= 0:
        return
    suffix = input_path.suffix.lower()
    input_bytes = input_path.read_bytes()
    for i in range(page_count):
        name = f"layout_det_{i}_input_img_0.png"
        dest = out_dir / name
        if suffix == ".pdf":
            try:
                import fitz

                doc = fitz.open(stream=input_bytes, filetype="pdf")
                try:
                    if i < len(doc):
                        page = doc.load_page(i)
                        meta_w, meta_h = (
                            pages_meta[i] if pages_meta and i < len(pages_meta) else (None, None)
                        )
                        if meta_w and meta_w > 0 and page.rect.width > 0:
                            zoom = (meta_w * _BAIDU_COORD_TO_PNG_SCALE) / page.rect.width
                            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
                        else:
                            pix = page.get_pixmap(dpi=150)
                        dest.write_bytes(pix.tobytes("png"))
                finally:
                    doc.close()
            except ImportError:
                pass
        elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"} and i == 0:
            if dest.is_file():
                continue
            try:
                import io

                from PIL import Image

                img = Image.open(io.BytesIO(input_bytes))
                if img.mode != "RGB":
                    img = img.convert("RGB")
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                dest.write_bytes(buf.getvalue())
            except Exception:
                pass


def _save_block_image(
    data_url: str,
    file_hash: str,
    out_dir: Path,
    block_counter: int,
    *,
    session: requests.Session | None = None,
) -> tuple[str, str] | None:
    """Download image bytes; return (markdown rel name, storage path under markdown_out/)."""
    try:
        img_bytes = _download_bytes(data_url, session=session)
    except Exception:
        return None
    name = f"block_{block_counter}.png"
    md_dir = out_dir / "markdown_out"
    md_dir.mkdir(parents=True, exist_ok=True)
    (md_dir / name).write_bytes(img_bytes)
    return name, f"{file_hash}/markdown_out/{name}"


def _build_result_from_baidu_json(
    baidu_json: dict[str, Any],
    markdown: str,
    file_hash: str,
    out_dir: Path,
    *,
    input_path: Path | None = None,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    """Map Baidu parse JSON + markdown into openKMS-compatible result.json shape."""
    pages = baidu_json.get("pages") or []
    if not pages:
        raise BaiduParseError("Baidu parse_result JSON has no pages; cannot build result.json")

    blocks: list[dict[str, Any]] = []
    layout_list: list[dict[str, Any]] = []
    url_to_rel: dict[str, str] = {}
    block_img_counter = 0
    doc_width: int | float | None = None
    doc_height: int | float | None = None
    pages_meta: list[tuple[float | None, float | None]] = []

    for page in pages:
        page_num = int(page.get("page_num", len(layout_list)))
        layouts = page.get("layouts") or []
        tables_by_layout_id = {
            str(t.get("layout_id")): (t.get("markdown") or "").strip()
            for t in (page.get("tables") or [])
            if t.get("layout_id")
        }
        images_by_layout_id = {
            str(img.get("layout_id")): img
            for img in (page.get("images") or [])
            if img.get("layout_id")
        }
        page_boxes: list[dict[str, Any]] = []

        for layout in layouts:
            layout_id = str(layout.get("layout_id") or "")
            layout_type = layout.get("type") or ""
            bbox = _layout_bbox(layout)
            content = _layout_content(layout, tables_by_layout_id=tables_by_layout_id)

            image_path: str | None = None
            layout_type_lower = layout_type.lower()
            if layout_id in images_by_layout_id or layout_type_lower in {"image", "chart", "header_image", "footer_image"}:
                img_entry = images_by_layout_id.get(layout_id) or {}
                data_url = (img_entry.get("data_url") or "").strip()
                if data_url:
                    saved = _save_block_image(
                        data_url,
                        file_hash,
                        out_dir,
                        block_img_counter,
                        session=session,
                    )
                    if saved:
                        rel_name, storage_path = saved
                        block_img_counter += 1
                        image_path = storage_path
                        url_to_rel[data_url] = rel_name

            block: dict[str, Any] = {
                "label": layout_type,
                "content": content,
                "bbox": bbox,
                "image_path": image_path,
            }
            blocks.append(block)

            page_boxes.append(
                {
                    "label": layout_type,
                    "coordinate": bbox,
                    "bbox": None,
                    "content": None,
                    "order": None,
                    "polygon_points": _bbox_to_polygon(bbox),
                    "block_index": len(blocks) - 1,
                }
            )

        meta = page.get("meta") or {}
        page_width = meta.get("page_width")
        page_height = meta.get("page_height")
        pages_meta.append((page_width, page_height))
        if doc_width is None and page_width is not None:
            doc_width = page_width
        if doc_height is None and page_height is not None:
            doc_height = page_height

        layout_entry: dict[str, Any] = {
            "page_index": page_num,
            "boxes": page_boxes,
            "input_path": None,
            "input_img": f"{file_hash}/layout_det_{page_num}_input_img_0.png",
        }
        layout_list.append(layout_entry)

    page_count = len(pages)
    if input_path is not None:
        _ensure_page_preview_images(input_path, file_hash, out_dir, page_count, pages_meta)
        preview_w, preview_h = _scale_layout_coordinates_to_preview(
            blocks, layout_list, out_dir, pages_meta
        )
        if preview_w is not None and preview_h is not None:
            doc_width = preview_w
            doc_height = preview_h

    markdown = _rewrite_markdown_image_urls(markdown, url_to_rel)

    from .parse_result import validate_parse_result

    return validate_parse_result(
        {
            "file_hash": file_hash,
            "parsing_res_list": blocks,
            "layout_det_res": layout_list,
            "markdown": markdown.strip(),
            "page_count": page_count,
            "width": doc_width,
            "height": doc_height,
            "parser": "baidu-cloud-paddle-vl",
            "baidu_file_id": baidu_json.get("file_id"),
            "baidu_file_name": baidu_json.get("file_name"),
        }
    )


def prepare_for_baidu_parse(stored_input: Path, convert_parent: Path) -> tuple[Path, Path]:
    """Return (path to upload, path for content hash). Only EPUB needs conversion."""
    from .office_convert import convert_epub_to_pdf

    suf = stored_input.suffix.lower()
    if suf == ".epub":
        work = convert_parent / "mupdf_out"
        work.mkdir(parents=True, exist_ok=True)
        pdf = convert_epub_to_pdf(stored_input, work)
        return pdf, stored_input
    if suf not in _BAIDU_NATIVE_EXT:
        raise BaiduParseError(
            f"Unsupported file type for Baidu parse: {suf}. "
            f"Supported: {', '.join(sorted(_BAIDU_NATIVE_EXT))} (EPUB is converted to PDF)."
        )
    return stored_input, stored_input


def run_baidu_parser(
    input_path: Path,
    output_dir: Path,
    api_key: str,
    secret_key: str,
    *,
    content_hash_source: Path | None = None,
    document_id: str | None = None,
    original_file_ext: str | None = None,
    poll_interval: int = _DEFAULT_POLL_INTERVAL,
    max_wait: int = _DEFAULT_MAX_WAIT,
    on_status: Callable[[str], None] | None = None,
) -> tuple[dict[str, Any], list[tuple[str, bytes]], list[tuple[str, bytes]]]:
    """
    Parse document via Baidu Cloud API (BOS presigned file_url).

    Returns (result_dict, extra_files, markdown_out_files) matching paddle parser shape.
    """
    from .baidu_bos import cleanup_bos_object, make_presign_refresher, stage_file_on_bos

    hash_path = content_hash_source or input_path
    file_hash = hashlib.sha256(hash_path.read_bytes()).hexdigest()
    file_name = input_path.name
    file_bytes = input_path.read_bytes()
    file_ext = (original_file_ext or input_path.suffix.lower().lstrip(".") or "bin").lower().lstrip(".")

    logger.info(
        "baidu_parse start file_name=%s size=%s document_id=%s file_hash_prefix=%s",
        file_name,
        len(file_bytes),
        document_id or "",
        file_hash[:12],
    )
    _worker_output(
        f"baidu_upload_mode=bos_file_url file_name={file_name} file_size={len(file_bytes)}"
        + (f" document_id={document_id}" if document_id else "")
    )

    bos_key: str | None = None
    session = requests.Session()
    try:
        bos_key, _ = stage_file_on_bos(file_bytes, file_hash, file_ext, file_name)
        _worker_output(f"baidu_bos_key={bos_key}")

        token = get_access_token(api_key, secret_key, session=session)
        logger.info("baidu_parse access_token obtained")

        get_file_url = make_presign_refresher(bos_key)
        task_id = _submit_parse_task_file_url_with_retries(
            token,
            file_name,
            get_file_url=get_file_url,
            file_size=len(file_bytes),
            session=session,
        )
        _worker_output(f"baidu_submit_ok mode=bos_file_url task_id={task_id}")

        if bos_key:
            cleanup_bos_object(bos_key)
            _worker_output(f"baidu_bos_cleanup key={bos_key}")
            bos_key = None

        task_result = poll_parse_task(
            token,
            task_id,
            poll_interval=poll_interval,
            max_wait=max_wait,
            on_status=on_status,
            session=session,
        )
    finally:
        if bos_key:
            cleanup_bos_object(bos_key)
            _worker_output(f"baidu_bos_cleanup key={bos_key}")

    markdown_url = task_result.get("markdown_url") or ""
    parse_result_url = task_result.get("parse_result_url") or ""
    if not markdown_url:
        raise BaiduParseError(f"Baidu task succeeded but no markdown_url (task_id={task_id})")
    if not parse_result_url:
        raise BaiduParseError(
            f"Baidu task succeeded but no parse_result_url (task_id={task_id}); "
            "structured JSON is required for result.json"
        )

    markdown = _download_bytes(markdown_url, session=session).decode("utf-8", errors="replace")
    raw = _download_bytes(parse_result_url, session=session)
    baidu_json = json.loads(raw.decode("utf-8"))

    out_dir = output_dir / file_hash
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "baidu_task.json").write_text(
        json.dumps(task_result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    if baidu_json:
        (out_dir / "baidu_parse_result.json").write_text(
            json.dumps(baidu_json, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    result = _build_result_from_baidu_json(
        baidu_json,
        markdown,
        file_hash,
        out_dir,
        input_path=input_path,
        session=session,
    )
    (out_dir / "result.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    extra_files: list[tuple[str, bytes]] = []
    for f in out_dir.iterdir():
        if f.is_file() and f.suffix.lower() in {".png", ".jpg", ".jpeg"}:
            extra_files.append((f.name, f.read_bytes()))

    md_dir = out_dir / "markdown_out"
    md_dir.mkdir(parents=True, exist_ok=True)
    md_name = "input.md"
    (md_dir / md_name).write_text(result["markdown"], encoding="utf-8")
    markdown_out_files: list[tuple[str, bytes]] = []
    for f in md_dir.rglob("*"):
        if f.is_file():
            rel = f.relative_to(md_dir).as_posix()
            markdown_out_files.append((rel, f.read_bytes()))

    return result, extra_files, markdown_out_files
