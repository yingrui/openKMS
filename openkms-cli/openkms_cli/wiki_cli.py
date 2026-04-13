"""Wiki CLI: upsert pages and upload assets to OpenKMS wiki spaces."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import requests
import typer
from rich.console import Console

from .settings import get_cli_settings

console = Console()

wiki_app = typer.Typer(help="Wiki spaces: put pages, sync .md trees, upload files")


def _path_to_wiki_path(relative_md: Path) -> str:
    """Turn relative path foo/bar.md into wiki path foo/bar."""
    p = relative_md.with_suffix("")
    parts = p.parts
    return "/".join(parts) if parts else p.name


def _encode_path_segments(path: str) -> str:
    from urllib.parse import quote

    return "/".join(quote(seg, safe="") for seg in path.split("/") if seg)


def _request_auth():
    from .auth import api_request_auth

    return api_request_auth()


@wiki_app.command("put")
def wiki_put(
    space_id: str = typer.Option(..., "--space-id", help="Wiki space UUID"),
    path: str = typer.Option(..., "--path", help="Logical page path (e.g. guides/onboarding)"),
    file: Path = typer.Option(..., "--file", path_type=Path, help="Markdown file to upload"),
    title: Optional[str] = typer.Option(None, "--title", help="Page title (default: first # heading or path)"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend base URL (default OPENKMS_API_URL)"),
) -> None:
    """Upsert a single wiki page from a markdown file (PUT by path)."""
    if not file.is_file():
        console.print(f"[red]Not a file: {file}[/red]")
        raise typer.Exit(1)
    text = file.read_text(encoding="utf-8")
    eff_title = title
    if not eff_title:
        for line in text.splitlines():
            s = line.strip()
            if s.startswith("#"):
                eff_title = s.lstrip("#").strip() or path
                break
        else:
            eff_title = path.split("/")[-1] or path

    cfg = get_cli_settings()
    base = (api_url or cfg.openkms_api_url).rstrip("/")
    enc = _encode_path_segments(path.strip().strip("/"))
    url = f"{base}/api/wiki-spaces/{space_id}/pages/by-path/{enc}"
    headers, basic = _request_auth()
    headers = {**headers, "Content-Type": "application/json"}
    r = requests.put(
        url,
        json={"title": eff_title, "body": text},
        headers=headers,
        auth=basic,
        timeout=120,
    )
    if not r.ok:
        console.print(f"[red]{r.status_code} {r.text[:500]}[/red]")
        raise typer.Exit(1)
    console.print("[green]Page upserted[/green]")


@wiki_app.command("sync")
def wiki_sync(
    space_id: str = typer.Option(..., "--space-id", help="Wiki space UUID"),
    directory: Path = typer.Option(..., "--dir", path_type=Path, help="Root directory of markdown files"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend base URL (default OPENKMS_API_URL)"),
) -> None:
    """Walk DIRECTORY for **/*.md and upsert each file; wiki path = relative path without .md suffix."""
    if not directory.is_dir():
        console.print(f"[red]Not a directory: {directory}[/red]")
        raise typer.Exit(1)
    cfg = get_cli_settings()
    base = (api_url or cfg.openkms_api_url).rstrip("/")
    headers, basic = _request_auth()
    headers_json = {**headers, "Content-Type": "application/json"}
    root = directory.resolve()
    count = 0
    errors = 0
    for md in sorted(root.rglob("*.md")):
        rel = md.relative_to(root)
        wiki_path = _path_to_wiki_path(rel)
        text = md.read_text(encoding="utf-8")
        eff_title = wiki_path.split("/")[-1] or wiki_path
        for line in text.splitlines():
            s = line.strip()
            if s.startswith("#"):
                eff_title = s.lstrip("#").strip() or eff_title
                break
        enc = _encode_path_segments(wiki_path)
        url = f"{base}/api/wiki-spaces/{space_id}/pages/by-path/{enc}"
        r = requests.put(
            url,
            json={"title": eff_title, "body": text},
            headers=headers_json,
            auth=basic,
            timeout=120,
        )
        if r.ok:
            count += 1
            console.print(f"[dim]OK[/dim] {wiki_path}")
        else:
            errors += 1
            console.print(f"[yellow]FAIL[/yellow] {wiki_path}: {r.status_code} {r.text[:120]}")
    console.print(f"[green]Synced {count} page(s)[/green]" + (f", [red]{errors} error(s)[/red]" if errors else ""))
    if errors:
        raise typer.Exit(1)


@wiki_app.command("upload-file")
def wiki_upload_file(
    space_id: str = typer.Option(..., "--space-id", help="Wiki space UUID"),
    file: Path = typer.Option(..., "--file", path_type=Path, help="File to upload (e.g. image)"),
    wiki_page_id: Optional[str] = typer.Option(None, "--wiki-page-id", help="Optional page id to attach metadata"),
    api_url: Optional[str] = typer.Option(None, "--api-url", help="Backend base URL"),
) -> None:
    """Upload a binary file; prints canonical markdown image URL for use in pages."""
    if not file.is_file():
        console.print(f"[red]Not a file: {file}[/red]")
        raise typer.Exit(1)
    cfg = get_cli_settings()
    base = (api_url or cfg.openkms_api_url).rstrip("/")
    url = f"{base}/api/wiki-spaces/{space_id}/files"
    headers, basic = _request_auth()
    data = {}
    if wiki_page_id:
        data["wiki_page_id"] = wiki_page_id
    with file.open("rb") as f:
        r = requests.post(
            url,
            files={"file": (file.name, f, "application/octet-stream")},
            data=data,
            headers=headers,
            auth=basic,
            timeout=300,
        )
    if not r.ok:
        console.print(f"[red]{r.status_code} {r.text[:500]}[/red]")
        raise typer.Exit(1)
    body = r.json()
    fid = body.get("id")
    img_url = f"{base}/api/wiki-spaces/{space_id}/files/{fid}/content"
    console.print("[green]Uploaded[/green]")
    console.print(f"[cyan]{img_url}[/cyan]")
    console.print(f"[dim]Markdown: ![]({img_url})[/dim]")
