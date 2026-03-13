"""Knowledge base CLI: index documents and FAQs for vector search.

Usage: openkms-cli kb index --knowledge-base-id <id> --api-url http://localhost:8102
"""
from typing import Optional

import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

console = Console()

kb_app = typer.Typer(
    help="Knowledge base indexing commands",
)


@kb_app.command("index")
def kb_index(
    knowledge_base_id: str = typer.Option(
        ...,
        "--knowledge-base-id",
        help="Knowledge base ID to index",
    ),
    api_url: str = typer.Option(
        "http://localhost:8102",
        "--api-url",
        envvar="OPENKMS_API_URL",
        help="Backend API URL",
    ),
    db_host: str = typer.Option(
        "localhost",
        "--db-host",
        envvar="OPENKMS_DATABASE_HOST",
        help="PostgreSQL host",
    ),
    db_port: int = typer.Option(
        5432,
        "--db-port",
        envvar="OPENKMS_DATABASE_PORT",
        help="PostgreSQL port",
    ),
    db_user: str = typer.Option(
        "postgres",
        "--db-user",
        envvar="OPENKMS_DATABASE_USER",
        help="PostgreSQL user",
    ),
    db_password: str = typer.Option(
        "",
        "--db-password",
        envvar="OPENKMS_DATABASE_PASSWORD",
        help="PostgreSQL password",
    ),
    db_name: str = typer.Option(
        "openkms",
        "--db-name",
        envvar="OPENKMS_DATABASE_NAME",
        help="PostgreSQL database name",
    ),
    embedding_model_base_url: Optional[str] = typer.Option(
        None,
        "--embedding-model-base-url",
        help="Override embedding model base URL",
    ),
    embedding_model_api_key: Optional[str] = typer.Option(
        None,
        "--embedding-model-api-key",
        help="Override embedding model API key",
    ),
    embedding_model_name: Optional[str] = typer.Option(
        None,
        "--embedding-model-name",
        help="Override embedding model name",
    ),
) -> None:
    """Index knowledge base: split documents into chunks, generate embeddings, index FAQs."""
    try:
        from .kb_indexer import run_indexer
    except ImportError as e:
        console.print(f"[red]Missing dependencies: {e}. Install with: pip install openkms-cli[kb][/red]")
        raise typer.Exit(1)

    token: Optional[str] = None
    try:
        from .auth import get_access_token
        token = get_access_token()
        console.print("[dim]Got Keycloak token[/dim]")
    except Exception:
        console.print("[yellow]No auth token (proceeding without auth)[/yellow]")

    db_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"

    embedding_override = None
    if embedding_model_base_url:
        embedding_override = {
            "base_url": embedding_model_base_url,
            "api_key": embedding_model_api_key or "",
            "model_name": embedding_model_name or "text-embedding-ada-002",
        }

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Indexing knowledge base...", total=None)

        try:
            stats = run_indexer(
                knowledge_base_id=knowledge_base_id,
                api_url=api_url,
                db_url=db_url,
                token=token,
                embedding_override=embedding_override,
                progress=progress,
                task=task,
            )
            progress.update(task, description="Done!")
            console.print(
                f"[green]Indexing complete: "
                f"{stats['chunks_created']} chunks, "
                f"{stats['faqs_indexed']} FAQs indexed[/green]"
            )
        except Exception as e:
            console.print(f"[red]Indexing failed: {e}[/red]")
            raise typer.Exit(1)
