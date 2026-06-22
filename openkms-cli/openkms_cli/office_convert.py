"""Convert Office and EPUB inputs to PDF for VLM parsing.

- DOCX/PPTX: LibreOffice headless
- EPUB: MuPDF ``mutool convert`` (package ``mupdf-tools`` on Debian)
"""

import shutil
import subprocess
from pathlib import Path

_OFFICE_TO_PDF_EXT = frozenset({".docx", ".pptx"})
_EPUB_EXT = frozenset({".epub"})

# Baidu file_url PDF limit is 100MB; EPUB→PDF via mutool can bloat 10×+ without compression.
_EPUB_PDF_MUTOOL_OUTPUT_OPTIONS = "compress-images,compress=flate,garbage=deduplicate"
_BAIDU_PDF_SOFT_LIMIT_BYTES = 95 * 1024 * 1024


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


def _mutool_binary() -> str:
    path = shutil.which("mutool")
    if path:
        return path
    raise OfficeConvertError(
        "mutool not found (MuPDF). Install mupdf-tools (e.g. apt install mupdf-tools; brew install mupdf-tools) "
        "to parse .epub files."
    )


def _mutool_epub_convert_cmd(bin_path: str, pdf: Path, src: Path) -> list[str]:
    return [
        bin_path,
        "convert",
        "-o",
        str(pdf.resolve()),
        "-O",
        _EPUB_PDF_MUTOOL_OUTPUT_OPTIONS,
        str(src.resolve()),
    ]


def _shrink_pdf_with_mutool(bin_path: str, pdf: Path) -> None:
    """Second-pass deflate when convert -O options still leave a huge PDF (e.g. code-heavy EPUB)."""
    if pdf.stat().st_size <= _BAIDU_PDF_SOFT_LIMIT_BYTES:
        return
    shrunk = pdf.with_name(f"{pdf.stem}.shrink.pdf")
    try:
        proc = subprocess.run(
            [bin_path, "clean", "-gg", "-z", str(pdf.resolve()), str(shrunk.resolve())],
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return
    if proc.returncode != 0 or not shrunk.is_file():
        return
    if shrunk.stat().st_size < pdf.stat().st_size:
        shrunk.replace(pdf)
    else:
        shrunk.unlink(missing_ok=True)


def convert_epub_to_pdf(src: Path, out_dir: Path) -> Path:
    """Run ``mutool convert`` to produce ``<stem>.pdf`` under ``out_dir``."""
    if not src.is_file():
        raise OfficeConvertError(f"Input not found: {src}")
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf = out_dir / f"{src.stem}.pdf"
    bin_path = _mutool_binary()
    cmd = _mutool_epub_convert_cmd(bin_path, pdf, src)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        raise OfficeConvertError("MuPDF conversion timed out") from e
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip()[:800]
        raise OfficeConvertError(f"mutool failed (exit {proc.returncode}): {tail}")
    if not pdf.is_file():
        raise OfficeConvertError(f"Expected PDF not created at {pdf}")
    _shrink_pdf_with_mutool(bin_path, pdf)
    return pdf


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

    For .docx / .pptx / .epub, ``path_for_predict`` is a converted PDF; the hash path is always
    ``stored_input`` (original bytes) so the document ``file_hash`` matches S3 layout.
    """
    suf = stored_input.suffix.lower()
    if suf in _OFFICE_TO_PDF_EXT:
        work = convert_parent / "libreoffice_out"
        work.mkdir(parents=True, exist_ok=True)
        pdf = convert_office_to_pdf(stored_input, work)
        return pdf, stored_input
    if suf in _EPUB_EXT:
        work = convert_parent / "mupdf_out"
        work.mkdir(parents=True, exist_ok=True)
        pdf = convert_epub_to_pdf(stored_input, work)
        return pdf, stored_input
    return stored_input, stored_input
