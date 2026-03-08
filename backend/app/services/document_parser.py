"""
Document parsing service using PaddleOCRVL with mlx-vlm-server backend.
Logic adapted from tmp/document_extraction_service.py.
Output matches tmp/ structure for DocumentDetail compatibility.
"""

import asyncio
import hashlib
import io
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any

from app.config import settings
from app.services.document_extraction_utils import (
    annotate_layout_boxes_with_block_index,
    to_serializable,
)

logger = logging.getLogger(__name__)

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_IMAGE_KEYS = frozenset({"input_img", "img", "res"})


def _array_or_pil_to_png_bytes(arr_or_img: Any) -> bytes | None:
    """Convert numpy array or PIL Image to PNG bytes. Returns None on failure."""
    try:
        from PIL import Image as PILImage

        if hasattr(arr_or_img, "ndim"):  # numpy
            import numpy as np

            img = arr_or_img
            if img.size == 0 or img.ndim not in (2, 3):
                return None
            if img.dtype != np.uint8:
                img = np.clip(img, 0, 255).astype(np.uint8)
            if img.ndim == 2:
                pil_img = PILImage.fromarray(img, mode="L").convert("RGB")
            else:
                pil_img = PILImage.fromarray(img)
        elif hasattr(arr_or_img, "save"):  # PIL
            pil_img = (
                arr_or_img.convert("RGB")
                if getattr(arr_or_img, "mode", "") != "RGB"
                else arr_or_img
            )
        else:
            return None
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception as e:
        logger.debug("PIL image save failed: %s", e)
        try:
            import cv2
            import numpy as np

            if hasattr(arr_or_img, "ndim"):
                img = arr_or_img
            else:
                img = np.array(arr_or_img)
            if img.ndim == 2:
                img = np.stack([img] * 3, axis=-1)
            if img.dtype != np.uint8:
                img = np.clip(img, 0, 255).astype(np.uint8)
            _, buf = cv2.imencode(".png", img[:, :, ::-1] if img.shape[-1] == 3 else img)
            return buf.tobytes()
        except Exception as e2:
            logger.warning("Image conversion failed: %s", e2)
            return None


def _get_block_field(item: Any, dict_key: str, attr_name: str, default=None):
    """Get field from block (dict or object)."""
    if hasattr(item, attr_name):
        return getattr(item, attr_name)
    if isinstance(item, dict):
        return item.get(dict_key, default)
    return default


def _extract_markdown_from_pages(
    pages_res: list, output_dir: Path, file_hash: str
) -> tuple[str, dict[str, bytes]]:
    """
    Extract markdown via save_to_markdown (pretty=True, show_formula_number=False).
    Returns (markdown_text, markdown_out_files).
    """
    md_dir = output_dir / "markdown_out"
    md_dir.mkdir(parents=True, exist_ok=True)
    markdown_out_map: dict[str, bytes] = {}

    try:
        for res in pages_res:
            if hasattr(res, "save_to_markdown"):
                res.save_to_markdown(
                    save_path=str(md_dir),
                    pretty=True,
                    show_formula_number=False,
                )
        md_files = sorted(md_dir.glob("*.md"))
        parts = []
        for f in md_files:
            content = f.read_text(encoding="utf-8")
            parts.append(content)
            rel = f.relative_to(md_dir).as_posix()
            markdown_out_map[rel] = content.encode("utf-8")
        for f in md_dir.rglob("*"):
            if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png"}:
                rel = f.relative_to(md_dir).as_posix()
                markdown_out_map[rel] = f.read_bytes()
        markdown = "\n\n".join(parts).strip()
        return markdown, markdown_out_map
    except Exception as e:
        logger.info("save_to_markdown failed: %s", e)

    # Fallback: build from parsing_res_list
    first = pages_res[0] if pages_res else None
    if first is None:
        return "", {}
    res = first.get("res", first) if hasattr(first, "get") else getattr(first, "res", first)
    parsing_list = (
        res.get("parsing_res_list", [])
        if isinstance(res, dict)
        else getattr(res, "parsing_res_list", [])
    )
    fallback_parts = []
    for item in parsing_list:
        label = _get_block_field(item, "block_label", "label", "") or ""
        content = (_get_block_field(item, "block_content", "content", "") or "").strip()
        if content:
            if label == "doc_title":
                fallback_parts.append(f"# {content}\n")
            elif label == "paragraph_title":
                fallback_parts.append(f"## {content}\n")
            else:
                fallback_parts.append(f"{content}\n")
    return "\n".join(fallback_parts).strip(), {}


def _run_paddleocr(
    content: bytes,
    input_path: Path,
    output_dir: Path | None = None,
) -> tuple[dict[str, Any], list[tuple[str, bytes]], list[tuple[str, bytes]]]:
    """
    Run PaddleOCRVL. Output matches tmp/ structure.
    Returns (parsing_result, extra_files, markdown_out_files).
    """
    from paddleocr import PaddleOCRVL

    pipeline = PaddleOCRVL(
        use_layout_detection=True,
        use_queues=False,
        vl_rec_backend="mlx-vlm-server",
        vl_rec_server_url=settings.paddleocr_vl_server_url,
        vl_rec_api_model_name=settings.paddleocr_vl_model,
        vl_rec_max_concurrency=settings.paddleocr_vl_max_concurrency,
    )

    pages_res = list(pipeline.predict(input=str(input_path)))
    if not pages_res:
        file_hash = hashlib.sha256(content).hexdigest()
        return (
            {
                "file_hash": file_hash,
                "parsing_res_list": [],
                "layout_det_res": [],
                "markdown": "",
                "page_count": 0,
            },
            [],
            [],
        )

    # Multi-page PDF: merge tables, relevel titles, concatenate
    suffix = input_path.suffix.lower()
    if len(pages_res) > 1 and suffix == ".pdf":
        try:
            pages_res = list(
                pipeline.restructure_pages(
                    pages_res,
                    merge_tables=True,
                    relevel_titles=True,
                    concatenate_pages=True,
                )
            )
        except TypeError:
            pages_res = list(pipeline.restructure_pages(pages_res))
    else:
        pages_res = list(pipeline.restructure_pages(pages_res))

    file_hash = hashlib.sha256(content).hexdigest()
    use_persistent = output_dir is not None
    tmppath = output_dir if use_persistent and output_dir else Path(tempfile.mkdtemp())

    extra_files_map: dict[str, bytes] = {}
    img_counter: dict[str, int] = {}

    def _next_img_idx(k: str) -> int:
        idx = img_counter.get(k, 0)
        img_counter[k] = idx + 1
        return idx

    def _save_img_val(val: Any, key: str) -> str | None:
        """Save image to output; return filename or None."""
        if val is None:
            return None
        png_bytes = _array_or_pil_to_png_bytes(val)
        if not png_bytes:
            return None
        filename = f"{key}_{_next_img_idx(key)}.png"
        extra_files_map[filename] = png_bytes
        if use_persistent and output_dir:
            (tmppath / filename).write_bytes(png_bytes)
        return f"{file_hash}/{filename}"

    try:
        # Get first/merged result
        first = pages_res[0]
        res = first.get("res", first) if hasattr(first, "get") else getattr(first, "res", first)
        parsing_list = (
            res.get("parsing_res_list", [])
            if isinstance(res, dict)
            else getattr(res, "parsing_res_list", [])
        )
        layout_det = res.get("layout_det_res", {}) if isinstance(res, dict) else getattr(res, "layout_det_res", {})

        # Build blocks, extracting block images from item.image.img
        blocks: list[dict[str, Any]] = []
        for item in parsing_list:
            label = _get_block_field(item, "block_label", "label", "") or ""
            content = (_get_block_field(item, "block_content", "content", "") or "").strip()
            bbox = _get_block_field(item, "block_bbox", "bbox", []) or []
            block_img_path: str | None = None

            block_image = _get_block_field(item, "image", "image", None)
            if block_image is not None:
                img_data = (
                    block_image.get("img")
                    if isinstance(block_image, dict)
                    else getattr(block_image, "img", None)
                )
                if img_data is not None:
                    saved = _save_img_val(img_data, "block")
                    if saved:
                        block_img_path = saved

            block_data: dict[str, Any] = {"label": label, "content": content, "bbox": bbox}
            if block_img_path:
                block_data["image_path"] = block_img_path
            blocks.append(block_data)

        # Process layout_det_res
        def _process_layout_det(ld: Any, prefix: str = "layout_det") -> Any:
            if isinstance(ld, dict):
                out = {}
                for k, v in ld.items():
                    if k in _IMAGE_KEYS and v is not None:
                        p = _save_img_val(v, f"{prefix}_{k}")
                        out[k] = p if p else to_serializable(v)
                    elif isinstance(v, (dict, list)):
                        out[k] = _process_layout_det(v, f"{prefix}_{k}")
                    else:
                        out[k] = to_serializable(v)
                return out
            if isinstance(ld, list):
                return [_process_layout_det(x, f"{prefix}_{i}") for i, x in enumerate(ld)]
            return to_serializable(ld)

        layout_list: list[dict[str, Any]] = []
        page_count = max(len(pages_res), len(layout_det) if isinstance(layout_det, list) else 1)

        if isinstance(layout_det, list):
            for i, ld in enumerate(layout_det):
                item: dict[str, Any] = {"page_index": i, "boxes": []}
                if isinstance(ld, dict):
                    item.update(_process_layout_det(ld, f"layout_det_{i}"))
                    boxes = ld.get("boxes", [])
                    if boxes:
                        item["boxes"] = [to_serializable(b) for b in boxes]
                elif hasattr(ld, "img") and getattr(ld, "img", None):
                    img_dict = ld.img if isinstance(getattr(ld, "img"), dict) else {}
                    img_paths = {}
                    for k, v in img_dict.items():
                        if v is not None:
                            p = _save_img_val(v, f"layout_det_{i}_{k}")
                            if isinstance(p, str):
                                img_paths[k] = p
                    raw = ld.get("res", ld) if hasattr(ld, "get") else ld
                    item.update(_process_layout_det(raw, f"layout_det_{i}"))
                    if img_paths:
                        item["_images"] = img_paths
                    raw_boxes = (
                        getattr(raw, "boxes", None) or (raw.get("boxes") if isinstance(raw, dict) else None)
                    ) or []
                    item["boxes"] = [to_serializable(b) for b in raw_boxes]
                else:
                    processed = _process_layout_det(ld, f"layout_det_{i}")
                    if isinstance(processed, dict):
                        item.update(processed)
                    else:
                        item["boxes"] = processed if isinstance(processed, list) else []
                layout_list.append(item)
        else:
            processed = _process_layout_det(layout_det, "layout_det")
            if isinstance(processed, dict):
                layout_list.append(processed)
            elif isinstance(processed, list):
                layout_list.extend(processed)
            else:
                layout_list.append({"page_index": 0, "boxes": []})

        # Ensure layout items have input_img for DocumentDetail
        for i in range(page_count):
            layout_img = f"layout_det_{i}_input_img_0.png"
            path_val = f"{file_hash}/{layout_img}"
            if i < len(layout_list):
                item = layout_list[i]
                if isinstance(item, dict) and not item.get("input_img"):
                    item["input_img"] = path_val
            else:
                layout_list.append({"page_index": i, "boxes": [], "input_img": path_val})

        # Annotate layout boxes with block_index (bbox IoU matching)
        annotate_layout_boxes_with_block_index(layout_list, blocks)

        # Extract markdown
        markdown, markdown_out_map = _extract_markdown_from_pages(pages_res, tmppath, file_hash)
        if not markdown and blocks:
            markdown_parts = []
            for b in blocks:
                c = (b.get("content") or "").strip()
                if c:
                    label = b.get("label", "")
                    if label == "doc_title":
                        markdown_parts.append(f"# {c}\n")
                    elif label == "paragraph_title":
                        markdown_parts.append(f"## {c}\n")
                    else:
                        markdown_parts.append(f"{c}\n")
            markdown = "\n".join(markdown_parts).strip()

        # Collect any files PaddleOCR wrote (save_to_json output)
        if use_persistent and output_dir:
            for item_path in tmppath.iterdir():
                if item_path.is_file() and (
                    item_path.suffix.lower() in _IMAGE_EXTS or item_path.suffix.lower() == ".json"
                ):
                    extra_files_map[item_path.name] = item_path.read_bytes()
            md_dir = tmppath / "markdown_out"
            if md_dir.is_dir():
                for f in md_dir.rglob("*"):
                    if f.is_file():
                        rel = f.relative_to(md_dir).as_posix()
                        markdown_out_map[rel] = f.read_bytes()

        result = {
            "file_hash": file_hash,
            "parsing_res_list": blocks,
            "layout_det_res": layout_list,
            "markdown": markdown,
            "page_count": page_count,
            "width": res.get("width") if isinstance(res, dict) else getattr(res, "width", None),
            "height": res.get("height") if isinstance(res, dict) else getattr(res, "height", None),
        }
        extra_files = list(extra_files_map.items())
        markdown_out_files = list(markdown_out_map.items())
        return result, extra_files, markdown_out_files
    finally:
        if not use_persistent and tmppath.exists() and tmppath != output_dir:
            shutil.rmtree(tmppath, ignore_errors=True)


async def parse_document(
    content: bytes,
    filename: str,
    output_dir: Path | None = None,
) -> tuple[dict[str, Any], list[tuple[str, bytes]], list[tuple[str, bytes]]]:
    """
    Parse document using PaddleOCRVL. Returns (parsing_result, extra_files, markdown_out_files).
    When output_dir is provided, uses that dir; otherwise temp.
    """
    suffix = Path(filename).suffix.lower()
    if suffix not in (".pdf", ".png", ".jpg", ".jpeg", ".webp"):
        raise ValueError(f"Unsupported file type: {suffix}")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(content)
        input_path = Path(f.name)

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            _run_paddleocr,
            content,
            input_path,
            output_dir,
        )
    finally:
        input_path.unlink(missing_ok=True)
