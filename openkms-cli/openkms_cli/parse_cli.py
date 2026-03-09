"""Document parsing CLI commands."""

import json
from pathlib import Path
from typing import Any, Optional

import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn

console = Console()

parse_app = typer.Typer(help="Parse documents (PDF, images) using PaddleOCR-VL")


def _json_default(obj: Any) -> Any:
    """Fallback for any remaining non-JSON-serializable values (e.g. ndarray)."""
    try:
        import numpy as np

        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.integer, np.floating)):
            return float(obj) if isinstance(obj, np.floating) else int(obj)
    except ImportError:
        pass
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


@parse_app.command("run")
def parse_run(
    input_path: Path = typer.Argument(
        ...,
        path_type=Path,
        exists=True,
        help="Input file (PDF, PNG, JPG, JPEG, WEBP) or directory for batch",
    ),
    output_dir: Optional[Path] = typer.Option(
        None,
        "--output",
        "-o",
        path_type=Path,
        help="Output directory. Default: <input_dir>/parsed or ./parsed",
    ),
    vlm_url: str = typer.Option(
        "http://localhost:8101/",
        "--vlm-url",
        envvar="OPENKMS_VLM_URL",
        help="VLM server URL (mlx-vlm-server)",
    ),
    model: str = typer.Option(
        "PaddlePaddle/PaddleOCR-VL-1.5",
        "--model",
        envvar="OPENKMS_VLM_MODEL",
        help="VLM model name",
    ),
    max_concurrency: int = typer.Option(
        3,
        "--max-concurrency",
        envvar="OPENKMS_VLM_MAX_CONCURRENCY",
        help="Max concurrent VLM requests",
    ),
    config_path: Optional[Path] = typer.Option(
        None,
        "--config",
        "-c",
        path_type=Path,
        exists=True,
        help="Config file (JSON) to override defaults",
    ),
) -> None:
    """
    Parse document(s). Output structure matches openKMS backend:
      {file_hash}/original.{ext}
      {file_hash}/result.json
      {file_hash}/markdown.md
      {file_hash}/layout_det_*_input_img_0.png
      {file_hash}/block_*.png
      {file_hash}/markdown_out/*.md, imgs/*.jpg
    """
    if config_path:
        try:
            cfg = json.loads(config_path.read_text())
            vlm_url = cfg.get("vlm_url", vlm_url)
            model = cfg.get("model", model)
            max_concurrency = cfg.get("max_concurrency", max_concurrency)
        except Exception as e:
            console.print(f"[red]Failed to load config: {e}[/red]")
            raise typer.Exit(1)

    if input_path.is_file():
        files = [input_path]
        out_base = output_dir or input_path.parent / "parsed"
    else:
        exts = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
        files = [p for p in input_path.rglob("*") if p.is_file() and p.suffix.lower() in exts]
        if not files:
            console.print("[yellow]No supported files found[/yellow]")
            raise typer.Exit(0)
        out_base = output_dir or input_path / "parsed"

    out_base.mkdir(parents=True, exist_ok=True)

    try:
        from .parser import run_parser
    except ImportError as e:
        console.print(
            "[red]Parser not available. Install optional dependencies:[/red]\n"
            "  pip install openkms-cli[parse]"
        )
        console.print(f"[dim]{e}[/dim]")
        raise typer.Exit(1)

    with Progress(
        SpinnerColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Parsing...", total=len(files))
        for fp in files:
            progress.update(task, description=f"Parsing {fp.name}")
            try:
                result, extra_files, markdown_out_files = run_parser(
                    input_path=fp,
                    output_dir=out_base,
                    vlm_url=vlm_url,
                    model=model,
                    max_concurrency=max_concurrency,
                )
                file_hash = result["file_hash"]
                hash_dir = out_base / file_hash

                # Copy original file
                ext = fp.suffix.lower().lstrip(".") or "bin"
                (hash_dir / f"original.{ext}").write_bytes(fp.read_bytes())

                # result.json and markdown.md already written by parser
                result_json = json.dumps(result, indent=2, ensure_ascii=False, default=_json_default)
                (hash_dir / "result.json").write_text(result_json, encoding="utf-8")
                if result.get("markdown"):
                    (hash_dir / "markdown.md").write_text(result["markdown"], encoding="utf-8")

                # extra_files and markdown_out_files are already written by parser
                # (parser writes to out_dir = output_dir/file_hash)
            except Exception as e:
                console.print(f"[red]Failed {fp}: {e}[/red]")
                raise typer.Exit(1)
            progress.advance(task)

    console.print(f"[green]Parsed {len(files)} file(s) to {out_base}[/green]")
