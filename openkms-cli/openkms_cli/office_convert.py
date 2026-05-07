"""Convert Office formats to PDF for VLM parsing (LibreOffice headless)."""

import shutil
import subprocess
from pathlib import Path

_OFFICE_TO_PDF_EXT = frozenset({".docx", ".pptx"})


class OfficeConvertError(RuntimeError):
    """Raised when LibreOffice conversion fails or is unavailable."""


def _soffice_binary() -> str:
    for name in ("soffice", "libreoffice"):
        path = shutil.which(name)
        if path:
            return path
    raise OfficeConvertError(
        "LibreOffice not found (tried soffice, libreoffice). "
        "Install LibreOffice to parse .docx and .pptx like PDFs."
    )


def convert_office_to_pdf(src: Path, out_dir: Path) -> Path:
    """Run headless LibreOffice to produce ``<stem>.pdf`` under ``out_dir``."""
    if not src.is_file():
        raise OfficeConvertError(f"Input not found: {src}")
    out_dir.mkdir(parents=True, exist_ok=True)
    bin_path = _soffice_binary()
    cmd = [
        bin_path,
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--norestore",
        "--convert-to",
        "pdf",
        "--outdir",
        str(out_dir),
        str(src.resolve()),
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        raise OfficeConvertError("LibreOffice conversion timed out") from e
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip()[:800]
        raise OfficeConvertError(f"LibreOffice failed (exit {proc.returncode}): {tail}")

    pdf = out_dir / f"{src.stem}.pdf"
    if not pdf.is_file():
        raise OfficeConvertError(f"Expected PDF not created at {pdf}")
    return pdf


def prepare_for_vlm_parse(stored_input: Path, convert_parent: Path) -> tuple[Path, Path]:
    """Return ``(path_for_predict, path_for_content_hash)``.

    For .docx / .pptx, ``path_for_predict`` is a converted PDF; the hash path is always
    ``stored_input`` (original bytes) so the document ``file_hash`` matches S3 layout.
    """
    suf = stored_input.suffix.lower()
    if suf in _OFFICE_TO_PDF_EXT:
        work = convert_parent / "libreoffice_out"
        work.mkdir(parents=True, exist_ok=True)
        pdf = convert_office_to_pdf(stored_input, work)
        return pdf, stored_input
    return stored_input, stored_input
