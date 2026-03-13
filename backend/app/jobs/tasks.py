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
    "api_url": "Backend API URL for metadata PUT",
    "extraction_model_name": "LLM model name (e.g. qwen3.5) for metadata extraction (from channel)",
    "extraction_schema": "Extraction schema as JSON string (from channel)",
    "extraction_args": "Full extraction flags when channel has extraction; empty otherwise",
}


def render_command(
    command: str,
    document_id: str,
    file_hash: str,
    file_ext: str,
    *,
    model_base_url: str | None = None,
    model_name: str | None = None,
    api_url: str | None = None,
    extraction_args: str = "",
    extraction_model_name: str = "",
    extraction_schema: str = "",
) -> str:
    """Render a command template by substituting known variables.

    If a model is linked, its base_url/model_name override the defaults
    from settings. extraction_args is the full extraction flags block when
    channel has extraction config; empty otherwise.
    """
    base_api_url = (api_url or settings.openkms_backend_url).rstrip("/")
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
        "api_url": base_api_url,
        "extraction_args": extraction_args,
        "extraction_model_name": extraction_model_name,
        "extraction_schema": extraction_schema,
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
    that are resolved from document metadata, linked model (if any), channel
    extraction config, and settings.

    Template variables include: input, s3_prefix, document_id, api_url,
    extraction_model, extraction_schema, extraction_args (full block when enabled).

    Updates document status in DB: running -> completed/failed.
    """
    from sqlalchemy import select, update
    from app.database import async_session_maker
    from app.models.document import Document
    from app.models.document_channel import DocumentChannel
    from app.models.api_model import ApiModel

    model_base_url: str | None = None
    model_name_val: str | None = None
    extraction_args = ""
    extraction_model_name = ""
    extraction_schema_val = ""

    from sqlalchemy.orm import selectinload

    async with async_session_maker() as session:
        if model_id:
            result = await session.execute(
                select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == model_id)
            )
            model_row = result.scalar_one_or_none()
            if model_row:
                model_base_url = model_row.provider_rel.base_url
                model_name_val = model_row.model_name

        doc = await session.get(Document, document_id)
        if doc and doc.channel_id:
            channel = await session.get(DocumentChannel, doc.channel_id)
            if channel and channel.extraction_model_id and channel.extraction_schema:
                ext_result = await session.execute(
                    select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == channel.extraction_model_id)
                )
                extraction_model_row = ext_result.scalar_one_or_none()
                if extraction_model_row and extraction_model_row.category == "llm":
                    model_name = (extraction_model_row.model_name or "").strip()
                    if not model_name:
                        logger.warning(
                            "ApiModel %s has no model_name; skipping extraction. Set model_name (e.g. qwen3.5) in Models.",
                            channel.extraction_model_id,
                        )
                    else:
                        schema_data = channel.extraction_schema
                        if isinstance(schema_data, dict):
                            schema_json = json.dumps(schema_data, ensure_ascii=False)
                        else:
                            schema_json = json.dumps(schema_data or [], ensure_ascii=False)
                        extraction_schema_val = shlex.quote(schema_json)
                        api_url_val = settings.openkms_backend_url.rstrip("/")
                        extraction_model_name = model_name
                        extraction_args = (
                            f" --extract-metadata --api-url {api_url_val}"
                            f" --extraction-model-name {model_name}"
                            f" --extraction-schema {extraction_schema_val}"
                        )
                        logger.info("Including metadata extraction in pipeline for document %s", document_id)

    rendered = render_command(
        command,
        document_id,
        file_hash,
        file_ext,
        model_base_url=model_base_url,
        model_name=model_name_val,
        api_url=settings.openkms_backend_url.rstrip("/"),
        extraction_args=extraction_args,
        extraction_model_name=extraction_model_name,
        extraction_schema=extraction_schema_val if extraction_args else "",
    )

    subprocess_env = {
        **os.environ,
        "AWS_ACCESS_KEY_ID": settings.aws_access_key_id,
        "AWS_SECRET_ACCESS_KEY": settings.aws_secret_access_key,
        "OPENKMS_API_URL": settings.openkms_backend_url.rstrip("/"),
    }

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
            env=subprocess_env,
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


@job_app.task(name="run_kb_index")
async def run_kb_index(
    knowledge_base_id: str,
) -> None:
    """
    Run knowledge base indexing via openkms-cli subprocess.

    Splits documents into chunks, generates embeddings, and indexes FAQs.
    """
    from app.database import async_session_maker
    from app.models.knowledge_base import KnowledgeBase
    from app.models.api_model import ApiModel
    from sqlalchemy.orm import selectinload

    embedding_args = ""

    async with async_session_maker() as session:
        kb = await session.get(KnowledgeBase, knowledge_base_id)
        if not kb:
            logger.error("Knowledge base %s not found", knowledge_base_id)
            raise RuntimeError(f"Knowledge base {knowledge_base_id} not found")

        if kb.embedding_model_id:
            from sqlalchemy import select as sa_select
            result = await session.execute(
                sa_select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == kb.embedding_model_id)
            )
            model = result.scalar_one_or_none()
            if model and model.provider_rel:
                embedding_args = (
                    f" --embedding-model-base-url {shlex.quote(model.provider_rel.base_url)}"
                    f" --embedding-model-api-key {shlex.quote(model.provider_rel.api_key or '')}"
                    f" --embedding-model-name {shlex.quote(model.model_name or model.name)}"
                )

    base_api_url = settings.openkms_backend_url.rstrip("/")
    cmd_str = (
        f"openkms-cli kb index"
        f" --knowledge-base-id {knowledge_base_id}"
        f" --api-url {base_api_url}"
        f" --db-host {settings.database_host}"
        f" --db-port {settings.database_port}"
        f" --db-user {settings.database_user}"
        f" --db-password {shlex.quote(settings.database_password)}"
        f" --db-name {settings.database_name}"
        f"{embedding_args}"
    )

    subprocess_env = {
        **os.environ,
        "OPENKMS_API_URL": base_api_url,
    }

    cmd = shlex.split(cmd_str)
    logger.info("Running KB index for %s: %s", knowledge_base_id, cmd_str)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=1800,
            env=subprocess_env,
        )
        if result.returncode != 0:
            logger.error("KB indexing failed (exit %d): %s", result.returncode, result.stderr)
            raise RuntimeError(f"KB indexing exited with code {result.returncode}: {result.stderr[:500]}")
        logger.info("KB indexing completed for %s", knowledge_base_id)
    except subprocess.TimeoutExpired:
        logger.error("KB indexing timed out for %s", knowledge_base_id)
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
