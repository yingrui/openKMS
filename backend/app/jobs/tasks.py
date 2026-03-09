"""Procrastinate task definitions for document processing."""
import json
import logging
import os
import shlex
import subprocess

from app.config import settings
from app.jobs import job_app

logger = logging.getLogger(__name__)

TEMPLATE_VARIABLES = {
    "input": "S3 URI of the uploaded file (s3://bucket/hash/original.ext)",
    "s3_prefix": "Document file hash, used as the S3 key prefix",
    "file_hash": "Raw SHA-256 file hash",
    "file_ext": "File extension (e.g. pdf, png)",
    "bucket": "S3/MinIO bucket name",
    "endpoint_url": "S3/MinIO endpoint URL",
    "region": "AWS region",
    "vlm_url": "VLM server URL (from linked model or settings)",
    "model_name": "Model identifier (from linked model or settings)",
    "document_id": "Document UUID",
}


def render_command(
    command: str,
    document_id: str,
    file_hash: str,
    file_ext: str,
    *,
    model_base_url: str | None = None,
    model_name: str | None = None,
) -> str:
    """Render a command template by substituting known variables.

    If a model is linked, its base_url/model_name override the defaults
    from settings.
    """
    context = {
        "input": f"s3://{settings.aws_bucket_name}/{file_hash}/original.{file_ext}",
        "s3_prefix": file_hash,
        "file_hash": file_hash,
        "file_ext": file_ext,
        "bucket": settings.aws_bucket_name,
        "endpoint_url": settings.aws_endpoint_url or "",
        "region": settings.aws_region,
        "vlm_url": model_base_url or settings.paddleocr_vl_server_url,
        "model_name": model_name or settings.paddleocr_vl_model,
        "document_id": document_id,
    }
    return command.format(**context)


@job_app.task(name="run_pipeline")
async def run_pipeline(
    document_id: str,
    pipeline_id: str,
    file_hash: str,
    file_ext: str,
    command: str,
    default_args: dict | None = None,
    model_id: str | None = None,
) -> None:
    """
    Execute a document processing pipeline via openkms-cli subprocess.

    The ``command`` field is a template string with {variable} placeholders
    that are resolved from document metadata, linked model (if any), and settings.

    Updates document status in DB: running -> completed/failed.
    """
    from sqlalchemy import update
    from app.database import async_session_maker
    from app.models.document import Document
    from app.models.api_model import ApiModel

    model_base_url: str | None = None
    model_name_val: str | None = None
    if model_id:
        async with async_session_maker() as session:
            model_row = await session.get(ApiModel, model_id)
            if model_row:
                model_base_url = model_row.base_url
                model_name_val = model_row.model_name

    rendered = render_command(
        command, document_id, file_hash, file_ext,
        model_base_url=model_base_url, model_name=model_name_val,
    )

    async with async_session_maker() as session:
        await session.execute(
            update(Document).where(Document.id == document_id).values(status="running")
        )
        await session.commit()
    cmd = shlex.split(rendered)

    logger.info("Running pipeline for document %s: %s", document_id, rendered)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,
            env={
                **os.environ,
                "AWS_ACCESS_KEY_ID": settings.aws_access_key_id,
                "AWS_SECRET_ACCESS_KEY": settings.aws_secret_access_key,
            },
        )

        if result.returncode != 0:
            logger.error("Pipeline failed (exit %d): %s", result.returncode, result.stderr)
            async with async_session_maker() as session:
                await session.execute(
                    update(Document).where(Document.id == document_id).values(status="failed")
                )
                await session.commit()
            raise RuntimeError(f"Pipeline exited with code {result.returncode}: {result.stderr[:500]}")

        logger.info("Pipeline completed for document %s", document_id)

        parsing_result = _load_result_from_s3(file_hash)
        markdown = parsing_result.get("markdown", "")

        async with async_session_maker() as session:
            await session.execute(
                update(Document)
                .where(Document.id == document_id)
                .values(status="completed", parsing_result=parsing_result, markdown=markdown)
            )
            await session.commit()

    except subprocess.TimeoutExpired:
        logger.error("Pipeline timed out for document %s", document_id)
        async with async_session_maker() as session:
            await session.execute(
                update(Document).where(Document.id == document_id).values(status="failed")
            )
            await session.commit()
        raise


def _load_result_from_s3(file_hash: str) -> dict:
    """Load result.json from S3 after pipeline completes."""
    from app.services.storage import get_object

    try:
        data = get_object(f"{file_hash}/result.json")
        return json.loads(data)
    except Exception:
        logger.warning("Could not load result.json for %s", file_hash)
        return {}
