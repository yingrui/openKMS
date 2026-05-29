"""Document parser using Baidu Cloud PaddleOCR-VL API (async, file_data upload).

Requires OPENKMS_BAIDU_CLOUD_API_KEY and OPENKMS_BAIDU_CLOUD_SECRET_KEY.
Sends base64-encoded file bytes in the submit request (file_data mode).
"""

from __future__ import annotations

import base64
import hashlib
import json
import time
from pathlib import Path
from typing import Any, Callable

import requests

_DEFAULT_POLL_INTERVAL = 8
_DEFAULT_MAX_WAIT = 600
# Baidu API page_meta and paddle/VLM layout coords both use 2× logical page pixels.
# PyMuPDF dpi=150 (≈2.083×) produces a different grid and ~4% bbox drift.
_BAIDU_COORD_TO_PNG_SCALE = 2.0

# Baidu file_data size limits (bytes). file_url (>50MB) is not implemented yet.
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_FILE_DATA_BYTES = 50 * 1024 * 1024

_BAIDU_IMAGE_EXT = frozenset({".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"})
_BAIDU_STREAMING_EXT = frozenset({".doc", ".docx", ".txt", ".wps"})
_BAIDU_LAYOUT_EXT = frozenset({".pdf", ".ofd", ".ppt", ".pptx"})
_BAIDU_NATIVE_EXT = _BAIDU_IMAGE_EXT | _BAIDU_STREAMING_EXT | _BAIDU_LAYOUT_EXT


class BaiduParseError(RuntimeError):
    """Raised when Baidu Cloud document parsing fails."""


def _baidu_urls() -> tuple[str, str, str]:
    from .settings import get_cli_settings

    s = get_cli_settings()
    return s.baidu_token_url, s.baidu_task_url, s.baidu_query_url


def max_file_data_bytes_for_suffix(suffix: str) -> int:
    if suffix in _BAIDU_IMAGE_EXT:
        return MAX_IMAGE_BYTES
    return MAX_FILE_DATA_BYTES


def validate_file_data_size(file_bytes: bytes, file_name: str) -> None:
    """Reject files that exceed baidu-doc-parse file_data limits (images 10MB, documents 50MB)."""
    suffix = Path(file_name).suffix.lower()
    limit = max_file_data_bytes_for_suffix(suffix)
    size = len(file_bytes)
    if size <= limit:
        return
    size_mb = size / (1024 * 1024)
    limit_mb = limit / (1024 * 1024)
    if suffix in _BAIDU_IMAGE_EXT:
        raise BaiduParseError(
            f"Image too large for baidu-doc-parse ({size_mb:.1f}MB > {limit_mb:.0f}MB). "
            f"Baidu file_data limit for images is 10MB."
        )
    raise BaiduParseError(
        f"Document too large for baidu-doc-parse ({size_mb:.1f}MB > {limit_mb:.0f}MB). "
        f"This pipeline only supports file_data upload (max 50MB)."
    )


def get_access_token(api_key: str, secret_key: str, *, session: requests.Session | None = None) -> str:
    """Exchange API key + secret for an access_token."""
    if not api_key or not secret_key:
        raise BaiduParseError(
            "OPENKMS_BAIDU_CLOUD_API_KEY and OPENKMS_BAIDU_CLOUD_SECRET_KEY are required"
        )
    http = session or requests
    token_url, _, _ = _baidu_urls()
    resp = http.post(
        token_url,
        params={
            "grant_type": "client_credentials",
            "client_id": api_key,
            "client_secret": secret_key,
        },
        timeout=30,
    )
    data = resp.json()
    if resp.status_code != 200 or "access_token" not in data:
        err = data.get("error_description") or data.get("error") or resp.text[:200]
        raise BaiduParseError(f"Baidu access_token request failed: {err}")
    return str(data["access_token"])


def create_parse_task(
    access_token: str,
    file_bytes: bytes,
    file_name: str,
    *,
    session: requests.Session | None = None,
    **options: bool,
) -> str:
    """Submit a document parse task with base64 file_data; return task_id."""
    validate_file_data_size(file_bytes, file_name)
    http = session or requests
    payload: dict[str, str] = {
        "file_data": base64.b64encode(file_bytes).decode("ascii"),
        "file_name": file_name,
    }
    for key, val in options.items():
        if val is not None:
            payload[key] = str(val).lower() if isinstance(val, bool) else str(val)

    _, task_url, _ = _baidu_urls()
    resp = http.post(
        f"{task_url}?access_token={access_token}",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=300,
    )
    data = resp.json()
    if data.get("error_code") != 0:
        raise BaiduParseError(
            f"Baidu task submit failed ({data.get('error_code')}): {data.get('error_msg', resp.text[:200])}"
        )
    task_id = (data.get("result") or {}).get("task_id")
    if not task_id:
        raise BaiduParseError(f"Baidu task submit returned no task_id: {data}")
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
    resp = http.post(
        f"{query_url}?access_token={access_token}",
        data={"task_id": task_id},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=60,
    )
    data = resp.json()
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
    """Download image bytes; return (local filename, storage path {file_hash}/block_N.png)."""
    try:
        img_bytes = _download_bytes(data_url, session=session)
    except Exception:
        return None
    name = f"block_{block_counter}.png"
    (out_dir / name).write_bytes(img_bytes)
    return name, f"{file_hash}/{name}"


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
    poll_interval: int = _DEFAULT_POLL_INTERVAL,
    max_wait: int = _DEFAULT_MAX_WAIT,
    on_status: Callable[[str], None] | None = None,
) -> tuple[dict[str, Any], list[tuple[str, bytes]], list[tuple[str, bytes]]]:
    """
    Parse document via Baidu Cloud API (file_data / base64 mode).

    Returns (result_dict, extra_files, markdown_out_files) matching paddle parser shape.
    """
    hash_path = content_hash_source or input_path
    file_hash = hashlib.sha256(hash_path.read_bytes()).hexdigest()
    file_name = input_path.name
    file_bytes = input_path.read_bytes()
    validate_file_data_size(file_bytes, file_name)

    session = requests.Session()
    token = get_access_token(api_key, secret_key, session=session)
    task_id = create_parse_task(token, file_bytes, file_name, session=session)
    task_result = poll_parse_task(
        token,
        task_id,
        poll_interval=poll_interval,
        max_wait=max_wait,
        on_status=on_status,
        session=session,
    )

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
    markdown_out_files = [(md_name, result["markdown"].encode("utf-8"))]

    return result, extra_files, markdown_out_files
