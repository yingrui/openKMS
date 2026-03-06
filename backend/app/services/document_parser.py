"""Document parsing service using PaddleOCRVL with mlx-vlm-server backend."""

import asyncio
import hashlib
import json
import tempfile
from pathlib import Path
from typing import Any

from app.config import settings


def _run_paddleocr(content: bytes, input_path: Path) -> dict[str, Any]:
    """
    Run PaddleOCRVL synchronously (blocking). Called from thread pool.
    """
    from paddleocr import PaddleOCRVL

    pipeline = PaddleOCRVL(
        vl_rec_backend="mlx-vlm-server",
        vl_rec_server_url=settings.paddleocr_vl_server_url,
        vl_rec_api_model_name=settings.paddleocr_vl_model,
        vl_rec_max_concurrency=settings.paddleocr_vl_max_concurrency,
    )

    pages_res = list(pipeline.predict(input=str(input_path)))
    restructured = pipeline.restructure_pages(pages_res)

    parsing_res_list: list[dict[str, Any]] = []
    layout_det_res: list[dict[str, Any]] = []
    markdown_parts: list[str] = []

    for page_idx, res in enumerate(restructured):
        # Save to temp dir to read structured output
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)
            res.save_to_json(save_path=str(tmppath))
            res.save_to_markdown(save_path=str(tmppath))

            # Read JSON (PaddleOCR saves as {stem}_structure.json or similar)
            json_files = list(tmppath.glob("*.json"))
            if json_files:
                with open(json_files[0], encoding="utf-8") as f:
                    data = json.load(f)
                res_data = data.get("res", data)
                ld = res_data.get("layout_det_res", {})
                boxes = ld.get("boxes", [])
                layout_det_res.append({"page_index": page_idx, "boxes": boxes})

                # Build parsing_res_list from boxes + content
                pr_list = res_data.get("parsing_res_list", [])
                if not pr_list and boxes:
                    for box in boxes:
                        coord = box.get("coordinate", [])
                        bbox = [float(x) for x in coord[:4]] if coord else [0, 0, 0, 0]
                        parsing_res_list.append({
                            "label": box.get("label", "text"),
                            "content": box.get("content", ""),
                            "bbox": bbox,
                            "page_index": page_idx,
                        })
                else:
                    for item in pr_list:
                        item["page_index"] = page_idx
                        if "bbox" not in item and "coordinate" in item:
                            item["bbox"] = [float(x) for x in item["coordinate"][:4]]
                        parsing_res_list.append(item)

            # Read markdown
            md_files = list(tmppath.glob("*.md"))
            if md_files:
                with open(md_files[0], encoding="utf-8") as f:
                    markdown_parts.append(f.read())
            elif hasattr(res, "markdown") and res.markdown:
                md = res.markdown
                if isinstance(md, dict):
                    markdown_parts.append(md.get("markdown_text", md.get("text", "")))
                else:
                    markdown_parts.append(str(md))

    file_hash = hashlib.sha256(content).hexdigest()
    return {
        "file_hash": file_hash,
        "parsing_res_list": parsing_res_list,
        "layout_det_res": layout_det_res,
        "markdown": "\n\n---\n\n".join(markdown_parts) if markdown_parts else "",
        "page_count": len(restructured),
    }


async def parse_document(content: bytes, filename: str) -> dict[str, Any]:
    """
    Parse document using PaddleOCRVL with mlx-vlm-server backend.
    Supports PDF and images. Returns structure compatible with frontend result.json.
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
        )
    finally:
        input_path.unlink(missing_ok=True)
