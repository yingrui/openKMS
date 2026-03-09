"""
Document parser using PaddleOCR-VL (mlx-vlm-server backend).
Output structure matches openKMS backend for DocumentDetail compatibility.
Requires: pip install openkms-cli[parse]
"""

import hashlib
import io
from pathlib import Path
from typing import Any

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_IMAGE_KEYS = frozenset({"input_img", "img", "res"})


def _to_serializable(obj: Any) -> Any:
    """Convert numpy arrays and other non-JSON-serializable types to JSON-safe values."""
    try:
        import numpy as np

        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.integer, np.floating)):
            return float(obj) if isinstance(obj, np.floating) else int(obj)
        if isinstance(obj, (np.str_, np.bytes_)):
            return str(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
    except ImportError:
        pass
    if isinstance(obj, dict):
        return {k: _to_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_serializable(v) for v in obj]
    if hasattr(obj, "__dict__"):
        return _to_serializable(vars(obj))
    if hasattr(obj, "tolist"):
        return obj.tolist()
    return obj


def _array_or_pil_to_png_bytes(arr_or_img: Any) -> bytes | None:
    """Convert numpy array or PIL Image to PNG bytes."""
    try:
        from PIL import Image as PILImage

        if hasattr(arr_or_img, "ndim"):
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
        elif hasattr(arr_or_img, "save"):
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
    except Exception:
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
        except Exception:
            return None


def _get_block_field(item: Any, dict_key: str, attr_name: str, default=None):
    if hasattr(item, attr_name):
        return getattr(item, attr_name)
    if isinstance(item, dict):
        return item.get(dict_key, default)
    return default


def _bbox_iou(a: list[float], b: list[float]) -> float:
    if len(a) < 4 or len(b) < 4:
        return 0.0
    ax1, ay1, ax2, ay2 = float(a[0]), float(a[1]), float(a[2]), float(a[3])
    bx1, by1, bx2, by2 = float(b[0]), float(b[1]), float(b[2]), float(b[3])
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _find_best_matching_block(layout_coord: list[float], blocks: list[dict], iou_threshold: float = 0.1) -> int:
    if not layout_coord or len(layout_coord) < 4:
        return -1
    best_idx, best_iou = -1, 0.0
    for idx, block in enumerate(blocks):
        block_bbox = block.get("bbox", []) if isinstance(block, dict) else []
        if not block_bbox or len(block_bbox) < 4:
            continue
        iou = _bbox_iou(block_bbox, layout_coord)
        if iou > best_iou and iou > iou_threshold:
            best_iou, best_idx = iou, idx
    return best_idx


def _iter_layout_boxes(layout_det: Any) -> list[dict]:
    boxes: list[dict] = []
    if isinstance(layout_det, list):
        for page_item in layout_det:
            if isinstance(page_item, dict) and "boxes" in page_item:
                for b in page_item.get("boxes") or []:
                    if isinstance(b, dict):
                        boxes.append(b)
    elif isinstance(layout_det, dict) and "boxes" in layout_det:
        for b in layout_det.get("boxes") or []:
            if isinstance(b, dict):
                boxes.append(b)
    return boxes


def _annotate_layout_boxes(layout_det: Any, blocks: list[dict], iou_threshold: float = 0.1) -> None:
    if not blocks:
        return
    for box in _iter_layout_boxes(layout_det):
        coord = box.get("coordinate")
        idx = _find_best_matching_block(coord, blocks, iou_threshold)
        if idx >= 0:
            box["block_index"] = idx


def _extract_markdown_from_pages(pages_res: list, output_dir: Path) -> tuple[str, dict[str, bytes]]:
    md_dir = output_dir / "markdown_out"
    md_dir.mkdir(parents=True, exist_ok=True)
    markdown_out_map: dict[str, bytes] = {}
    try:
        for res in pages_res:
            if hasattr(res, "save_to_markdown"):
                res.save_to_markdown(save_path=str(md_dir), pretty=True, show_formula_number=False)
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
        return "\n\n".join(parts).strip(), markdown_out_map
    except Exception:
        pass
    first = pages_res[0] if pages_res else None
    if first is None:
        return "", {}
    res = first.get("res", first) if hasattr(first, "get") else getattr(first, "res", first)
    parsing_list = res.get("parsing_res_list", []) if isinstance(res, dict) else getattr(res, "parsing_res_list", [])
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


def run_parser(
    input_path: Path,
    output_dir: Path,
    vlm_url: str = "http://localhost:8101/",
    model: str = "PaddlePaddle/PaddleOCR-VL-1.5",
    max_concurrency: int = 3,
) -> tuple[dict[str, Any], list[tuple[str, bytes]], list[tuple[str, bytes]]]:
    """
    Parse document. Returns (parsing_result, extra_files, markdown_out_files).
    Output format is compatible with openKMS DocumentDetail (result.json, markdown.md, layout_det_*, block_*, markdown_out/*).
    """
    from paddleocr import PaddleOCRVL

    content = input_path.read_bytes()
    file_hash = hashlib.sha256(content).hexdigest()
    suffix = input_path.suffix.lower()

    pipeline = PaddleOCRVL(
        use_layout_detection=True,
        use_queues=False,
        vl_rec_backend="mlx-vlm-server",
        vl_rec_server_url=vlm_url.rstrip("/") + "/",
        vl_rec_api_model_name=model,
        vl_rec_max_concurrency=max_concurrency,
    )

    pages_res = list(pipeline.predict(input=str(input_path)))
    if not pages_res:
        return (
            {"file_hash": file_hash, "parsing_res_list": [], "layout_det_res": [], "markdown": "", "page_count": 0},
            [],
            [],
        )

    if len(pages_res) > 1 and suffix == ".pdf":
        try:
            pages_res = list(
                pipeline.restructure_pages(
                    pages_res, merge_tables=True, relevel_titles=True, concatenate_pages=True
                )
            )
        except TypeError:
            pages_res = list(pipeline.restructure_pages(pages_res))
    else:
        pages_res = list(pipeline.restructure_pages(pages_res))

    out_dir = output_dir / file_hash
    out_dir.mkdir(parents=True, exist_ok=True)
    extra_files_map: dict[str, bytes] = {}
    img_counter: dict[str, int] = {}

    def _next_idx(k: str) -> int:
        idx = img_counter.get(k, 0)
        img_counter[k] = idx + 1
        return idx

    def _save_img(val: Any, key: str) -> str | None:
        if val is None:
            return None
        png = _array_or_pil_to_png_bytes(val)
        if not png:
            return None
        name = f"{key}_{_next_idx(key)}.png"
        extra_files_map[name] = png
        (out_dir / name).write_bytes(png)
        return f"{file_hash}/{name}"

    first = pages_res[0]
    res = first.get("res", first) if hasattr(first, "get") else getattr(first, "res", first)
    parsing_list = res.get("parsing_res_list", []) if isinstance(res, dict) else getattr(res, "parsing_res_list", [])
    layout_det = res.get("layout_det_res", {}) if isinstance(res, dict) else getattr(res, "layout_det_res", {})

    blocks: list[dict[str, Any]] = []
    for item in parsing_list:
        label = _get_block_field(item, "block_label", "label", "") or ""
        content = (_get_block_field(item, "block_content", "content", "") or "").strip()
        bbox = _get_block_field(item, "block_bbox", "bbox", []) or []
        block_img_path: str | None = None
        block_image = _get_block_field(item, "image", "image", None)
        if block_image is not None:
            img_data = block_image.get("img") if isinstance(block_image, dict) else getattr(block_image, "img", None)
            if img_data is not None:
                saved = _save_img(img_data, "block")
                if saved:
                    block_img_path = saved
        block_data: dict[str, Any] = {
            "label": _to_serializable(label),
            "content": _to_serializable(content),
            "bbox": _to_serializable(bbox),
        }
        if block_img_path:
            block_data["image_path"] = block_img_path
        blocks.append(block_data)

    def _process_layout(ld: Any, prefix: str = "layout_det") -> Any:
        if isinstance(ld, dict):
            out = {}
            for k, v in ld.items():
                if k in _IMAGE_KEYS and v is not None:
                    p = _save_img(v, f"{prefix}_{k}")
                    out[k] = p if p else _to_serializable(v)
                elif isinstance(v, (dict, list)):
                    out[k] = _process_layout(v, f"{prefix}_{k}")
                else:
                    out[k] = _to_serializable(v)
            return out
        if isinstance(ld, list):
            return [_process_layout(x, f"{prefix}_{i}") for i, x in enumerate(ld)]
        return _to_serializable(ld)

    layout_list: list[dict[str, Any]] = []
    layout_det_list = layout_det if isinstance(layout_det, list) else [layout_det]
    page_count = max(len(pages_res), len(layout_det_list), 1)

    for i in range(page_count):
        ld = layout_det_list[i] if i < len(layout_det_list) else {}
        item: dict[str, Any] = {"page_index": i, "boxes": []}
        if isinstance(ld, dict):
            item.update(_process_layout(ld, f"layout_det_{i}"))
            boxes = ld.get("boxes", [])
            if boxes:
                item["boxes"] = [_to_serializable(b) for b in boxes]
        else:
            raw = getattr(ld, "res", ld) if hasattr(ld, "res") else ld
            item.update(_process_layout(raw, f"layout_det_{i}"))
            raw_boxes = getattr(raw, "boxes", None) or (raw.get("boxes") if isinstance(raw, dict) else [])
            item["boxes"] = [_to_serializable(b) for b in raw_boxes] if raw_boxes else []
        layout_list.append(item)

    # Ensure each page has input_img (fallback: extract from PDF via PyMuPDF)
    for i in range(page_count):
        layout_img = f"layout_det_{i}_input_img_0.png"
        path_val = f"{file_hash}/{layout_img}"
        if layout_img not in extra_files_map and i < len(pages_res) and suffix == ".pdf":
            try:
                import fitz
                doc = fitz.open(stream=content, filetype="pdf")
                try:
                    if i < len(doc):
                        page = doc.load_page(i)
                        pix = page.get_pixmap(dpi=150)
                        png_bytes = pix.tobytes("png")
                        extra_files_map[layout_img] = png_bytes
                        (out_dir / layout_img).write_bytes(png_bytes)
                finally:
                    doc.close()
            except ImportError:
                pass
        if layout_img not in extra_files_map and suffix in _IMAGE_EXTS and i == 0:
            try:
                from PIL import Image

                img = Image.open(io.BytesIO(content))
                png = _array_or_pil_to_png_bytes(img)
                if png:
                    extra_files_map[layout_img] = png
                    (out_dir / layout_img).write_bytes(png)
            except Exception:
                pass
        if i < len(layout_list):
            it = layout_list[i]
            if isinstance(it, dict) and not it.get("input_img"):
                it["input_img"] = path_val
        else:
            layout_list.append({"page_index": i, "boxes": [], "input_img": path_val})

    _annotate_layout_boxes(layout_list, blocks)

    markdown, markdown_out_map = _extract_markdown_from_pages(pages_res, out_dir)
    if not markdown and blocks:
        markdown_parts = []
        for b in blocks:
            c = (b.get("content") or "").strip()
            if c:
                lb = b.get("label", "")
                if lb == "doc_title":
                    markdown_parts.append(f"# {c}\n")
                elif lb == "paragraph_title":
                    markdown_parts.append(f"## {c}\n")
                else:
                    markdown_parts.append(f"{c}\n")
        markdown = "\n".join(markdown_parts).strip()

    for f in out_dir.iterdir():
        if f.is_file() and (f.suffix.lower() in _IMAGE_EXTS or f.suffix.lower() == ".json"):
            if f.name not in extra_files_map:
                extra_files_map[f.name] = f.read_bytes()
    md_dir = out_dir / "markdown_out"
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
    return _to_serializable(result), extra_files, markdown_out_files
