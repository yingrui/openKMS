"""Document storage: save uploaded files and parsing outputs to S3 bucket, keyed by file hash.

Output structure matches tmp/ for DocumentDetail compatibility:
  {file_hash}/result.json
  {file_hash}/markdown.md
  {file_hash}/layout_det_{N}_input_img_0.png  - page/layout input images
  {file_hash}/block_{N}.png                   - block images (parsing_res_list)
  {file_hash}/markdown_out/*.md, imgs/*.jpg   - PaddleOCR markdown output

Paths in result.json use {file_hash}/filename format (e.g. da46.../block_0.png).
"""

import hashlib
import json
import tempfile
from pathlib import Path
from typing import Any

from app.services.document_parser import parse_document
from app.services.storage import upload_object


def _content_type_for_path(path: str) -> str:
    """Return content type for a file path."""
    p = Path(path)
    suffixes = {".md": "text/markdown", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
    return suffixes.get(p.suffix.lower(), "application/octet-stream")


def _extract_page_images(content: bytes, filename: str) -> list[bytes]:
    """Extract page images from PDF or single image. Returns list of PNG bytes per page."""
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        try:
            import fitz  # PyMuPDF
        except ImportError:
            raise RuntimeError("PyMuPDF is required for PDF. Install with: pip install pymupdf")

        doc = fitz.open(stream=content, filetype="pdf")
        images: list[bytes] = []
        try:
            for i in range(len(doc)):
                page = doc.load_page(i)
                pix = page.get_pixmap(dpi=150)
                images.append(pix.tobytes("png"))
        finally:
            doc.close()
        return images

    # Single image - treat as one page
    if suffix in (".png", ".jpg", ".jpeg", ".webp"):
        return [content]
    return []


async def parse_and_store(
    content: bytes,
    filename: str,
) -> dict[str, Any]:
    """
    Parse document and store all artifacts in S3 bucket under {file_hash}/.
    Output format matches tmp/ for DocumentDetail compatibility.
    """
    file_hash = hashlib.sha256(content).hexdigest()
    suffix = Path(filename).suffix.lower()
    ext = suffix.lstrip(".") or "bin"

    # 1. Upload original file
    upload_object(f"{file_hash}/original.{ext}", content)

    # 2. Parse via PaddleOCR - captures layout_det_*, block_*, markdown_out
    page_images = _extract_page_images(content, filename)
    with tempfile.TemporaryDirectory() as tmpdir:
        out_dir = Path(tmpdir)
        parsing_result, extra_files, markdown_out_files = await parse_document(
            content, filename, output_dir=out_dir
        )

        # Upload root-level files (layout_det_*_input_img_0.png, block_*.png, etc.)
        extra_by_name = dict(extra_files)
        for name, file_bytes in extra_files:
            key = f"{file_hash}/{name}"
            ct = _content_type_for_path(name)
            upload_object(key, file_bytes, content_type=ct)

        # Upload markdown_out (xxx.md, imgs/xxx.jpg)
        for rel_path, file_bytes in markdown_out_files:
            key = f"{file_hash}/markdown_out/{rel_path}"
            ct = _content_type_for_path(rel_path)
            upload_object(key, file_bytes, content_type=ct)

    # 3. Ensure layout_det_N_input_img_0.png exists (use parser output or PyMuPDF fallback)
    page_count = max(
        parsing_result.get("page_count", 0),
        len(page_images),
        len(parsing_result.get("layout_det_res", [])),
    )
    original_layout = parsing_result.get("layout_det_res", [])
    layout_det_res: list[dict[str, Any]] = []
    for i in range(page_count):
        item: dict[str, Any] = (
            dict(original_layout[i]) if i < len(original_layout) else {"page_index": i, "boxes": []}
        )
        layout_img = f"layout_det_{i}_input_img_0.png"
        if layout_img not in extra_by_name and i < len(page_images):
            upload_object(
                f"{file_hash}/{layout_img}",
                page_images[i],
                content_type="image/png",
            )
        item["input_img"] = f"{file_hash}/{layout_img}"
        layout_det_res.append(item)
    parsing_result["layout_det_res"] = layout_det_res

    # 4. Rewrite parsing_res_list image_path to {file_hash}/block_N.png format
    block_idx = 0
    for item in parsing_result.get("parsing_res_list", []):
        old_path = item.get("image_path")
        if not old_path:
            continue
        name = Path(old_path).name
        if name.startswith("block_") and name.endswith(".png"):
            item["image_path"] = f"{file_hash}/{name}"
        else:
            item["image_path"] = f"{file_hash}/block_{block_idx}.png"
            block_idx += 1

    # 5. Upload result.json (paths use {file_hash}/filename)
    result_json = json.dumps(parsing_result, ensure_ascii=False, indent=2).encode("utf-8")
    upload_object(f"{file_hash}/result.json", result_json, content_type="application/json")

    # 6. Upload combined markdown
    markdown = parsing_result.get("markdown", "")
    if markdown:
        upload_object(
            f"{file_hash}/markdown.md",
            markdown.encode("utf-8"),
            content_type="text/markdown",
        )

    return parsing_result
