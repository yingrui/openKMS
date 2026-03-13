"""Main Typer app for openkms-cli."""

import typer
from rich.console import Console

from .parse_cli import parse_app
from .pipeline_cli import pipeline_app
from .kb_cli import kb_app

console = Console()

app = typer.Typer(
    name="openkms-cli",
    help="OpenKMS CLI - document parsing and pipeline tools for backend integration",
    add_completion=False,
)

app.add_typer(parse_app, name="parse", help="Document parsing commands")
app.add_typer(pipeline_app, name="pipeline", help="Pipeline: run (S3 → parse → S3)")
app.add_typer(kb_app, name="kb", help="Knowledge base indexing commands")


@app.command()
def version() -> None:
    """Show CLI version."""
    from . import __version__
    console.print(f"[green]openkms-cli v{__version__}[/green]")
