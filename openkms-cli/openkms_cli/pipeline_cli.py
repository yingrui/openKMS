"""Pipeline CLI: run document parsing pipeline.

Usage: openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input s3://bucket/key/original.pdf --s3-prefix {file_hash}
"""

import json
import os
import re
import traceback
from pathlib import Path
from typing import Optional

import requests
import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

console = Console()

# Built-in pipelines the CLI can run. Key: --pipeline-name value, value: (display name, description)
SUPPORTED_PIPELINES: dict[str, tuple[str, str]] = {
    "paddleocr-doc-parse": (
        "PaddleOCR Document Parse",
        "Parse PDF/document with PaddleOCR-VL; output markdown and images to S3.",
    ),
    "kb-index": (
        "Knowledge Base Index",
        "Chunk documents, generate embeddings, index FAQs; requires --knowledge-base-id.",
    ),
}

pipeline_app = typer.Typer(
    help="Run document parsing pipeline (download from S3 → parse → upload to S3)",
)


def _is_s3_uri(s: str) -> bool:
    """Return True if input looks like an S3 URI."""
    return s.strip().lower().startswith("s3://")


def _parse_s3_uri(uri: str) -> tuple[str, str]:
    """Parse s3://bucket/key into (bucket, key)."""
    m = re.match(r"^s3://([^/]+)/(.+)$", uri.strip())
    if not m:
        raise typer.BadParameter(f"Invalid S3 URI: {uri}. Use s3://bucket/key")
    return m.group(1), m.group(2).rstrip("/")


def _get_s3_client(endpoint_url: Optional[str], access_key: str, secret_key: str, region: str):
    """Create boto3 S3 client."""
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        console.print("[red]boto3 not installed. pip install openkms-cli[pipeline][/red]")
        raise typer.Exit(1)

    kwargs = {
        "aws_access_key_id": access_key,
        "aws_secret_access_key": secret_key,
        "region_name": region,
        "config": Config(signature_version="s3v4"),
    }
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url
    return boto3.client("s3", **kwargs)


def _content_type_for_path(path: str) -> str:
    p = Path(path)
    suffixes = {
        ".md": "text/markdown",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }
    return suffixes.get(p.suffix.lower(), "application/octet-stream")


def _put_document_markdown(api_url: str, document_id: str, token: str, markdown: str) -> bool:
    """Sync parsed markdown to backend (required before POST /versions snapshots DB state)."""
    base = api_url.rstrip("/")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    r = requests.put(
        f"{base}/api/documents/{document_id}/markdown",
        json={"markdown": markdown},
        headers=headers,
        timeout=300,
    )
    if not r.ok:
        console.print(f"[yellow]PUT markdown failed: {r.status_code} {r.text[:200]}[/yellow]")
        return False
    console.print("[dim]Markdown synced to API[/dim]")
    return True


def _post_pipeline_version(api_url: str, document_id: str, token: str) -> bool:
    """Create explicit document version tagged Pipeline (current DB markdown + metadata)."""
    base = api_url.rstrip("/")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    r = requests.post(
        f"{base}/api/documents/{document_id}/versions",
        json={"tag": "Pipeline", "note": None},
        headers=headers,
        timeout=60,
    )
    if r.ok:
        console.print("[green]Pipeline version saved[/green]")
        return True
    console.print(f"[yellow]Save version failed: {r.status_code} {r.text[:200]}[/yellow]")
    return False


@pipeline_app.command("list")
def pipeline_list() -> None:
    """List supported pipelines that can be run with `pipeline run`."""
    table = Table(title="Supported Pipelines")
    table.add_column("Pipeline Name", style="cyan", no_wrap=True)
    table.add_column("Description", style="dim")
    for name, (display, desc) in SUPPORTED_PIPELINES.items():
        table.add_row(name, f"{display}: {desc}")
    console.print(table)
    console.print("\n[dim]Doc parse: pipeline run --pipeline-name paddleocr-doc-parse --input <uri> --s3-prefix <prefix>[/dim]")
    console.print("[dim]KB index:  pipeline run --pipeline-name kb-index --knowledge-base-id <id> --api-url <url>[/dim]")


@pipeline_app.command("run")
def pipeline_run(
    pipeline_name: str = typer.Option(
        "paddleocr-doc-parse",
        "--pipeline-name",
        help="Pipeline name (e.g. paddleocr-doc-parse, kb-index)",
    ),
    input_uri: Optional[str] = typer.Option(
        None,
        "--input",
        help="Input: S3 URI or local file path (required for doc-parse pipelines)",
    ),
    knowledge_base_id: Optional[str] = typer.Option(
        None,
        "--knowledge-base-id",
        help="Knowledge base ID to index (required for kb-index pipeline)",
    ),
    s3_prefix: Optional[str] = typer.Option(
        None,
        "--s3-prefix",
        help="S3 output prefix. If omitted with S3 input, uses file hash (SHA256 of content).",
    ),
    vlm_url: str = typer.Option(
        "http://localhost:8101/",
        "--vlm-url",
        envvar="OPENKMS_VLM_URL",
        help="VLM server URL",
    ),
    vlm_api_key: Optional[str] = typer.Option(
        None,
        "--vlm-api-key",
        envvar="OPENKMS_VLM_API_KEY",
        help="VLM API key (for authenticated VLM endpoints)",
    ),
    bucket: str = typer.Option(
        "openkms",
        "--bucket",
        envvar="AWS_BUCKET_NAME",
        help="S3 bucket for output",
    ),
    endpoint_url: Optional[str] = typer.Option(
        None,
        "--endpoint-url",
        envvar="AWS_ENDPOINT_URL",
        help="S3/MinIO endpoint",
    ),
    region: str = typer.Option(
        "us-east-1",
        "--region",
        envvar="AWS_REGION",
        help="AWS region",
    ),
    output_dir: Path = typer.Option(
        Path("output"),
        "--output-dir",
        "-o",
        path_type=Path,
        help="Local directory for temp files before upload (default: ./output)",
    ),
    skip_upload: bool = typer.Option(
        False,
        "--skip-upload",
        help="Parse only; do not upload to S3 (no AWS credentials needed for upload)",
    ),
    extract_metadata: bool = typer.Option(
        False,
        "--extract-metadata",
        help="After upload, extract metadata via LLM and PUT to backend API",
    ),
    build_page_index: bool = typer.Option(
        True,
        "--build-page-index/--no-build-page-index",
        help="Build PageIndex tree from markdown (# headings → hierarchical structure)",
    ),
    document_id: Optional[str] = typer.Option(
        None,
        "--document-id",
        help="Document ID: sync markdown + save Pipeline version after upload (Keycloak); required for --extract-metadata",
    ),
    api_url: str = typer.Option(
        "http://localhost:8102",
        "--api-url",
        envvar="OPENKMS_API_URL",
        help="Backend API URL for PUT metadata",
    ),
    extraction_schema: Optional[str] = typer.Option(
        None,
        "--extraction-schema",
        help="Extraction schema as JSON string (required for --extract-metadata)",
    ),
    extraction_model_base_url: Optional[str] = typer.Option(
        None,
        "--extraction-model-base-url",
        help="LLM base URL (when not using --extraction-model-name)",
    ),
    extraction_model_name: Optional[str] = typer.Option(
        None,
        "--extraction-model-name",
        help="LLM model name (e.g. qwen3.5); fetches base_url/api_key from backend",
    ),
    # KB index pipeline options
    embedding_model_base_url: Optional[str] = typer.Option(
        None,
        "--embedding-model-base-url",
        envvar="OPENKMS_EMBEDDING_MODEL_BASE_URL",
        help="Override embedding model base URL (kb-index)",
    ),
    embedding_model_name: Optional[str] = typer.Option(
        None,
        "--embedding-model-name",
        envvar="OPENKMS_EMBEDDING_MODEL_NAME",
        help="Override embedding model name (kb-index)",
    ),
) -> None:
    """
    Run pipeline. Use `pipeline list` to see supported pipeline names.

    Document parse example:
      openkms-cli pipeline run --pipeline-name paddleocr-doc-parse \\
        --input s3://openkms/da46.../original.pdf --s3-prefix da46...

    KB index example:
      openkms-cli pipeline run --pipeline-name kb-index --knowledge-base-id <id> --api-url ...
    """
    if pipeline_name not in SUPPORTED_PIPELINES:
        console.print(
            f"[yellow]Unknown pipeline '{pipeline_name}'. "
            f"Use 'openkms-cli pipeline list' to see supported pipelines.[/yellow]"
        )
        raise typer.Exit(1)

    # --- kb-index pipeline ---
    if pipeline_name == "kb-index":
        if not knowledge_base_id:
            console.print("[red]kb-index pipeline requires --knowledge-base-id[/red]")
            raise typer.Exit(1)
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

        embedding_override = None
        if embedding_model_base_url:
            embedding_override = {
                "base_url": embedding_model_base_url,
                "api_key": os.environ.get("OPENKMS_EMBEDDING_MODEL_API_KEY", ""),
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
                    token=token,
                    embedding_override=embedding_override,
                    progress=progress,
                    task=task,
                    output_dir=output_dir,
                )
                progress.update(task, description="Done!")
                console.print(
                    f"[green]Indexing complete: "
                    f"{stats['chunks_created']} chunks, "
                    f"{stats['faqs_indexed']} FAQs indexed[/green]"
                )
            except Exception as e:
                console.print(f"[red]Indexing failed: {e}[/red]")
                console.print("[dim]Traceback:[/dim]")
                console.print(traceback.format_exc(), style="dim")
                raise typer.Exit(1)
        return

    # --- doc-parse pipelines (e.g. paddleocr-doc-parse) ---
    if not input_uri:
        console.print("[red]Document parse pipelines require --input (S3 URI or local file)[/red]")
        raise typer.Exit(1)

    token: Optional[str] = None
    if extract_metadata:
        if not document_id or not extraction_schema:
            console.print(
                "[red]--extract-metadata requires --document-id and --extraction-schema[/red]"
            )
            raise typer.Exit(1)
        if not extraction_model_name and not extraction_model_base_url:
            console.print(
                "[red]--extract-metadata requires --extraction-model-name or "
                "--extraction-model-base-url[/red]"
            )
            raise typer.Exit(1)
    if document_id:
        try:
            from .auth import get_access_token

            token = get_access_token()
            console.print("[dim]Got Keycloak token[/dim]")
        except ValueError as e:
            if extract_metadata:
                console.print(f"[red]Auth failed: {e}[/red]")
                raise typer.Exit(1)
            console.print(
                f"[yellow]No API token ({e}); skipping markdown sync and pipeline version.[/yellow]"
            )

    access_key = os.environ.get("AWS_ACCESS_KEY_ID", "")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY", "")

    is_local = not _is_s3_uri(input_uri)

    if is_local:
        input_path = Path(input_uri)
        if not input_path.is_file():
            console.print(f"[red]Local file not found: {input_path}[/red]")
            raise typer.Exit(1)
        pdf_path = input_path.resolve()
        content = pdf_path.read_bytes()
        console.print(f"[dim]Input: {pdf_path}[/dim] (local, skip download)")
    else:
        if not access_key or not secret_key:
            console.print("[red]AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY required for S3[/red]")
            raise typer.Exit(1)
        try:
            input_bucket, input_key = _parse_s3_uri(input_uri)
        except typer.BadParameter as e:
            console.print(f"[red]{e}[/red]")
            raise typer.Exit(1)
        work = output_dir.resolve()
        work.mkdir(parents=True, exist_ok=True)
        pdf_path = work / "input.pdf"
        content = _get_s3_client(endpoint_url, access_key, secret_key, region).get_object(
            Bucket=input_bucket, Key=input_key
        )["Body"].read()
        pdf_path.write_bytes(content)
        console.print(f"[dim]Input: s3://{input_bucket}/{input_key}[/dim]")

    if not skip_upload and (not access_key or not secret_key):
        console.print("[red]AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY required for upload[/red]")
        raise typer.Exit(1)

    out_base = output_dir.resolve() / "parsed"
    out_base.mkdir(parents=True, exist_ok=True)
    if skip_upload:
        console.print(f"[dim]Output: {out_base}/ (local only, skip upload)[/dim]")
    else:
        prefix_hint = s3_prefix.rstrip("/") if s3_prefix else "<file_hash>"
        console.print(f"[dim]Output: s3://{bucket}/{prefix_hint}/[/dim]")
    console.print(f"[dim]Local temp: {output_dir.resolve()}[/dim]")

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Parsing...", total=None)

        try:
            from .parser import run_parser
        except ImportError:
            console.print("[red]Parser not available. pip install openkms-cli[parse][/red]")
            raise typer.Exit(1)

        result, _, _ = run_parser(
            input_path=pdf_path,
            output_dir=out_base,
            vlm_url=vlm_url,
            vlm_api_key=vlm_api_key,
        )
        file_hash = result["file_hash"]
        hash_dir = out_base / file_hash

        # Use file hash as s3 prefix when not specified (S3 input) or for consistency
        prefix = (s3_prefix.rstrip("/") if s3_prefix else file_hash)

        ext = pdf_path.suffix.lstrip(".") or "pdf"
        (hash_dir / f"original.{ext}").write_bytes(content)
        result_json = json.dumps(result, indent=2, ensure_ascii=False)
        (hash_dir / "result.json").write_text(result_json, encoding="utf-8")
        if result.get("markdown"):
            (hash_dir / "markdown.md").write_text(result["markdown"], encoding="utf-8")

        if build_page_index and result.get("markdown"):
            md_path = hash_dir / "markdown.md"
            try:
                from .page_index import build_page_index_from_markdown

                progress.update(task, description="Building PageIndex...")
                tree = build_page_index_from_markdown(md_path)
                (hash_dir / "page_index.json").write_text(
                    json.dumps(tree, indent=2, ensure_ascii=False), encoding="utf-8"
                )
                console.print("[dim]PageIndex built[/dim]")
            except Exception as e:
                console.print(f"[yellow]PageIndex build failed: {e}. Skipping.[/yellow]")

        if skip_upload:
            count = sum(1 for f in hash_dir.rglob("*") if f.is_file())
            console.print(f"[green]Pipeline done. {count} files in {hash_dir}[/green]")
        else:
            progress.update(task, description="Uploading to S3...")
            client = _get_s3_client(endpoint_url, access_key, secret_key, region)
            key_base = prefix
            count = 0
            for f in hash_dir.rglob("*"):
                if f.is_file():
                    rel = f.relative_to(hash_dir).as_posix()
                    key = f"{key_base}/{rel}"
                    ct = _content_type_for_path(rel)
                    client.put_object(
                        Bucket=bucket,
                        Key=key,
                        Body=f.read_bytes(),
                        ContentType=ct,
                    )
                    count += 1
            console.print(
                f"[green]Uploaded {count} files to s3://{bucket}/{prefix}/[/green]"
            )

        markdown_synced = False
        if not skip_upload and document_id and token and result.get("markdown"):
            progress.update(task, description="Syncing markdown to API...")
            markdown_synced = _put_document_markdown(
                api_url, document_id, token, result["markdown"]
            )

        if extract_metadata and token and document_id and result.get("markdown"):
            progress.update(task, description="Extracting metadata...")
            try:
                from .extract import extract_metadata_sync
            except ImportError:
                console.print("[red]Metadata extraction requires pip install openkms-cli[metadata][/red]")
                raise typer.Exit(1)

            try:
                schema_data = json.loads(extraction_schema)
            except json.JSONDecodeError as e:
                console.print(f"[red]Invalid --extraction-schema JSON: {e}[/red]")
                raise typer.Exit(1)

            if extraction_model_name:
                from urllib.parse import quote
                base = api_url.rstrip("/")
                config_url = f"{base}/api/models/config-by-name?model_name={quote(extraction_model_name)}"
                config_resp = requests.get(
                    config_url,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=30,
                )
                if not config_resp.ok:
                    try:
                        err = config_resp.json().get("detail", config_resp.text)
                    except Exception:
                        err = config_resp.text or str(config_resp.status_code)
                    console.print(f"[red]Failed to fetch model config: {str(err)[:120]}[/red]")
                    raise typer.Exit(1)
                model_config = config_resp.json()
            else:
                model_config = {
                    "base_url": extraction_model_base_url,
                    "api_key": os.environ.get("EXTRACTION_MODEL_API_KEY", ""),
                    "model_name": extraction_model_name or "gpt-4",
                }
            try:
                extracted = extract_metadata_sync(result["markdown"], model_config, schema_data)
            except ValueError as e:
                console.print(f"[red]Metadata extraction failed: {e}[/red]")
                raise typer.Exit(1)

            base = api_url.rstrip("/")
            put_url = f"{base}/api/documents/{document_id}/metadata"
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            resp = requests.put(put_url, json={"metadata": extracted}, headers=headers, timeout=30)
            if not resp.ok:
                console.print(f"[red]PUT metadata failed: {resp.status_code} {resp.text[:200]}[/red]")
                raise typer.Exit(1)
            console.print("[green]Metadata updated via API[/green]")

        if (
            not skip_upload
            and document_id
            and token
            and result.get("markdown")
            and markdown_synced
        ):
            progress.update(task, description="Saving pipeline version...")
            _post_pipeline_version(api_url, document_id, token)
