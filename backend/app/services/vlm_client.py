"""Client for vlm-server (MLX-VLM) document parsing via OpenAI-compatible API."""

import base64
import hashlib
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

from app.config import settings


class VLMClient:
    """Client to call vlm-server for document parsing via OpenAI-compatible API."""

    def __init__(self, base_url: str | None = None) -> None:
        base = (base_url or settings.vlm_server_url).rstrip("/")
        self.base_url = base
        self._client = AsyncOpenAI(
            base_url=f"{base}/v1",
            api_key="not-needed",
            timeout=120.0,
        )

    async def parse_document(
        self,
        file_content: bytes,
        filename: str,
        prompt: str = "Extract all text and structure from this document page. Return markdown format.",
    ) -> dict[str, Any]:
        """
        Parse a document using the vlm-server.
        For PDFs, the caller should convert pages to images first and call parse_image.
        For single images, use parse_image directly.
        """
        suffix = Path(filename).suffix.lower()
        if suffix == ".pdf":
            # PDF: convert to images and parse each page
            return await self._parse_pdf(file_content, filename, prompt)
        if suffix in (".png", ".jpg", ".jpeg", ".webp"):
            return await self._parse_image(file_content, filename, prompt)
        raise ValueError(f"Unsupported file type: {suffix}")

    async def _parse_image(
        self,
        image_bytes: bytes,
        filename: str,
        prompt: str,
    ) -> dict[str, Any]:
        """Send a single image to vlm-server for parsing via OpenAI client."""
        b64 = base64.b64encode(image_bytes).decode("ascii")
        data_url = f"data:image/png;base64,{b64}"

        response = await self._client.chat.completions.create(
            model=settings.vlm_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url}},
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
            max_tokens=4096,
            temperature=0,
        )
        output_text = (response.choices[0].message.content or "").strip()

        file_hash = hashlib.sha256(image_bytes).hexdigest()
        return {
            "file_hash": file_hash,
            "markdown": output_text,
            "parsing_res_list": [{"label": "text", "content": output_text}],
            "layout_det_res": [],
        }

    async def _parse_pdf(
        self,
        pdf_bytes: bytes,
        filename: str,
        prompt: str,
    ) -> dict[str, Any]:
        """Convert PDF to images and parse each page via vlm-server."""
        try:
            import fitz  # PyMuPDF
        except ImportError:
            raise RuntimeError(
                "PyMuPDF (fitz) is required for PDF parsing. Install with: pip install pymupdf"
            )

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_markdown: list[str] = []
        parsing_res_list: list[dict[str, Any]] = []
        layout_det_res: list[dict[str, Any]] = []

        try:
            for i in range(len(doc)):
                page = doc.load_page(i)
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("png")

                result = await self._parse_image(img_bytes, f"{filename}_page{i}.png", prompt)
                pages_markdown.append(result.get("markdown", ""))
                for item in result.get("parsing_res_list", []):
                    item["page_index"] = i
                    parsing_res_list.append(item)
                layout_det_res.append({"page_index": i, "boxes": []})
        finally:
            doc.close()

        full_markdown = "\n\n---\n\n".join(pages_markdown)
        file_hash = hashlib.sha256(pdf_bytes).hexdigest()

        return {
            "file_hash": file_hash,
            "markdown": full_markdown,
            "parsing_res_list": parsing_res_list,
            "layout_det_res": layout_det_res,
        }

    async def health_check(self) -> bool:
        """Check if vlm-server is reachable."""
        import httpx
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/health")
                return resp.status_code == 200
        except Exception:
            return False


vlm_client = VLMClient()
