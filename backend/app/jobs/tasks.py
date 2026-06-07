"""Procrastinate task definitions for document processing."""
import asyncio
import json
import logging
import os
import shlex
import subprocess
import traceback

from procrastinate.job_context import JobContext

from app.config import settings
from app.constants import DocumentStatus
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
        "vlm_url": model_base_url or settings.vlm_url.rstrip("/"),
        "model_name": model_name or settings.paddleocr_vl_model,
        "document_id": document_id,
        "api_url": base_api_url,
        "extraction_args": extraction_args,
        "extraction_model_name": extraction_model_name,
        "extraction_schema": extraction_schema,
    }
    return command.format(**context)


@job_app.task(name="run_pipeline", pass_context=True)
async def run_pipeline(
    context: JobContext,
    document_id: str,
    pipeline_id: str,
    file_hash: str,
    file_ext: str,
    command: str,
    default_args: dict | None = None,
    model_id: str | None = None,
    force_reparse: bool = False,
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
    extraction_schema_data: list | dict | None = None

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
                extraction_schema_data = channel.extraction_schema
                ext_result = await session.execute(
                    select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == channel.extraction_model_id)
                )
                extraction_model_row = ext_result.scalar_one_or_none()
                if extraction_model_row and extraction_model_row.api_kind == "chat-completions":
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
                        extraction_model_name = model_name
                        # Command template already includes `--api-url {api_url}`; do not duplicate.
                        extraction_args = (
                            f" --extract-metadata --extraction-model-name {model_name}"
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

    job_pk = context.job.id
    log_cmd = rendered
    log_out = ""
    log_err = ""

    subprocess_env = {
        **os.environ,
        "AWS_ACCESS_KEY_ID": settings.aws_access_key_id,
        "AWS_SECRET_ACCESS_KEY": settings.aws_secret_access_key,
        "OPENKMS_API_URL": settings.openkms_backend_url.rstrip("/"),
        "OPENKMS_FRONTEND_URL": settings.frontend_url.rstrip("/"),
        "OPENKMS_BAIDU_FILE_URL_SUBMIT_RETRIES": str(settings.baidu_file_url_submit_retries),
        "OPENKMS_BAIDU_FILE_URL_RETRY_DELAY_SECONDS": str(settings.baidu_file_url_retry_delay_seconds),
        "OPENKMS_BAIDU_FILE_URL_SUBMIT_TIMEOUT_SECONDS": str(settings.baidu_file_url_submit_timeout_seconds),
        "OPENKMS_BAIDU_BOS_BUCKET": settings.baidu_bos_bucket,
        "OPENKMS_BAIDU_BOS_ACCESS_KEY": settings.baidu_bos_access_key,
        "OPENKMS_BAIDU_BOS_SECRET_KEY": settings.baidu_bos_secret_key,
        "OPENKMS_BAIDU_BOS_ENDPOINT": settings.baidu_bos_endpoint,
        "OPENKMS_BAIDU_BOS_PREFIX": settings.baidu_bos_prefix,
        "OPENKMS_BAIDU_BOS_PRESIGN_TTL_SECONDS": str(settings.baidu_bos_presign_ttl_seconds),
        # openkms-cli reads these for try_api_request_auth() (local: HTTP Basic; OIDC: still from os.environ).
        "OPENKMS_AUTH_MODE": (settings.auth_mode or "oidc").strip().lower(),
        "OPENKMS_CLI_BASIC_USER": settings.cli_basic_user,
        "OPENKMS_CLI_BASIC_PASSWORD": settings.cli_basic_password,
    }

    if "--extract-metadata" in rendered and settings.auth_mode.strip().lower() == "local":
        if not (settings.cli_basic_user.strip() and settings.cli_basic_password):
            logger.warning(
                "Pipeline runs with --extract-metadata in local mode but OPENKMS_CLI_BASIC_USER / "
                "OPENKMS_CLI_BASIC_PASSWORD are empty in backend settings. Set them in backend/.env "
                "(same credentials the API accepts for HTTP Basic); see backend/.env.example."
            )

    from app.services.job_run_worker_log import persist_job_run_worker_log_best_effort

    try:
        async with async_session_maker() as session:
            await session.execute(
                update(Document).where(Document.id == document_id).values(status=DocumentStatus.RUNNING)
            )
            await session.commit()

        if not force_reparse and file_hash:
            cached = await asyncio.to_thread(_load_parse_cache_from_s3, file_hash)
            async with async_session_maker() as session:
                doc_row = await session.get(Document, document_id)
                current_meta = dict(doc_row.doc_metadata) if doc_row and doc_row.doc_metadata else None
            needs_metadata = _needs_metadata_extraction_after_parse_cache(
                rendered, current_meta, extraction_schema_data
            )
            if cached is not None and not needs_metadata:
                parsing_result, markdown = cached
                await _apply_cached_parse_to_document(document_id, file_hash, parsing_result, markdown)
                log_out = (
                    f"Skipped openkms-cli: reused existing parse output on storage "
                    f"(prefix {file_hash}/). Document marked completed."
                )
                if _metadata_extraction_requested(rendered):
                    log_out += " Metadata already has values."
                logger.info(
                    "Skipped VLM re-parse for document %s; reused storage output under %s/",
                    document_id,
                    file_hash,
                )
                return

        cmd = shlex.split(rendered)

        pipeline_timeout = float(settings.pipeline_timeout_seconds)
        logger.info(
            "Running pipeline for document %s (timeout %ss): %s",
            document_id,
            settings.pipeline_timeout_seconds,
            rendered,
        )

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=subprocess_env,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=pipeline_timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            log_err = (
                f"Subprocess timed out after {settings.pipeline_timeout_seconds}s "
                f"(OPENKMS_PIPELINE_TIMEOUT_SECONDS)."
            )
            logger.error(
                "Pipeline timed out for document %s after %ss",
                document_id,
                settings.pipeline_timeout_seconds,
            )
            async with async_session_maker() as session:
                await session.execute(
                    update(Document).where(Document.id == document_id).values(status=DocumentStatus.FAILED)
                )
                await session.commit()
            raise RuntimeError(
                f"Pipeline timed out after {settings.pipeline_timeout_seconds}s "
                f"(OPENKMS_PIPELINE_TIMEOUT_SECONDS)"
            ) from None

        stderr = stderr_bytes.decode("utf-8", errors="replace") if stderr_bytes else ""
        stdout = stdout_bytes.decode("utf-8", errors="replace") if stdout_bytes else ""
        log_out, log_err = stdout, stderr

        if proc.returncode != 0:
            # openkms-cli uses Rich on stderr for errors, but imports may warn on stderr only;
            # always log both streams so auth / Typer failures are visible.
            logger.error(
                "Pipeline failed (exit %d)\n--- stderr ---\n%s\n--- stdout ---\n%s",
                proc.returncode,
                stderr.strip() or "(empty)",
                stdout.strip() or "(empty)",
            )
            async with async_session_maker() as session:
                await session.execute(
                    update(Document).where(Document.id == document_id).values(status=DocumentStatus.FAILED)
                )
                await session.commit()
            tail = f"{stderr}\n{stdout}".strip()
            hint = _pipeline_exit_human_hint(proc.returncode)
            msg = f"Pipeline exited with code {proc.returncode}: {tail[:1200]}"
            if hint:
                msg = f"{msg}\n\n{hint}"
            log_err = (log_err + "\n\n" + msg).strip() if log_err.strip() else msg
            raise RuntimeError(msg)

        logger.info("Pipeline completed for document %s", document_id)

        parsing_result = _load_result_from_s3(file_hash)
        markdown = parsing_result.get("markdown", "")
        extracted_metadata = _load_extracted_metadata_from_s3(file_hash)

        async with async_session_maker() as session:
            doc = await session.get(Document, document_id)
            values: dict = {
                "status": DocumentStatus.COMPLETED,
                "parsing_result": parsing_result,
                "markdown": markdown,
            }
            if extracted_metadata and doc is not None:
                current = dict(doc.doc_metadata) if doc.doc_metadata else {}
                values["doc_metadata"] = {**current, **extracted_metadata}
            await session.execute(
                update(Document).where(Document.id == document_id).values(**values)
            )
            await session.commit()
            if extracted_metadata:
                logger.info(
                    "Applied extracted metadata from storage for document %s (%d keys)",
                    document_id,
                    len(extracted_metadata),
                )

    except RuntimeError:
        raise
    finally:
        await persist_job_run_worker_log_best_effort(job_pk, log_cmd, log_out, log_err)


@job_app.task(name="run_spreadsheet_preview", pass_context=True)
async def run_spreadsheet_preview(
    context: JobContext,
    document_id: str,
    file_hash: str,
    file_ext: str,
) -> None:
    """Rebuild .xlsx grid preview from S3 (no VLM pipeline)."""
    from sqlalchemy import update

    from app.database import async_session_maker
    from app.models.document import Document
    from app.services.job_run_worker_log import persist_job_run_worker_log_best_effort
    from app.services.spreadsheet_preview import build_xlsx_preview
    from app.services.storage import get_object

    job_pk = context.job.id
    log_cmd = f"run_spreadsheet_preview document_id={document_id} file_hash={file_hash} ext={file_ext}"
    log_out = ""
    log_err = ""
    try:
        async with async_session_maker() as session:
            await session.execute(
                update(Document).where(Document.id == document_id).values(status=DocumentStatus.RUNNING)
            )
            await session.commit()

        try:
            raw = await asyncio.to_thread(get_object, f"{file_hash}/original.{file_ext}")
            preview, md = await asyncio.to_thread(build_xlsx_preview, raw, file_hash=file_hash)
        except Exception as exc:
            logger.exception("Spreadsheet preview failed for document %s", document_id)
            log_err = traceback.format_exc()
            async with async_session_maker() as session:
                await session.execute(
                    update(Document)
                    .where(Document.id == document_id)
                    .values(
                        status=DocumentStatus.FAILED,
                        parsing_result={
                            "document_kind": "spreadsheet",
                            "file_hash": file_hash,
                            "error": str(exc)[:800],
                        },
                    )
                )
                await session.commit()
            raise

        async with async_session_maker() as session:
            await session.execute(
                update(Document)
                .where(Document.id == document_id)
                .values(status=DocumentStatus.COMPLETED, parsing_result=preview, markdown=md)
            )
            await session.commit()
        log_out = "Spreadsheet preview completed (openpyxl); document status set to completed."
        logger.info("Spreadsheet preview completed for document %s", document_id)
    finally:
        await persist_job_run_worker_log_best_effort(job_pk, log_cmd, log_out, log_err)


@job_app.task(name="run_mindmap_preview", pass_context=True)
async def run_mindmap_preview(
    context: JobContext,
    document_id: str,
    file_hash: str,
    file_ext: str,
) -> None:
    """Rebuild .xmind outline markdown from S3 (no VLM pipeline)."""
    from sqlalchemy import update

    from app.database import async_session_maker
    from app.models.document import Document
    from app.services.job_run_worker_log import persist_job_run_worker_log_best_effort
    from app.services.mindmap_preview import build_xmind_preview
    from app.services.storage import get_object

    job_pk = context.job.id
    log_cmd = f"run_mindmap_preview document_id={document_id} file_hash={file_hash} ext={file_ext}"
    log_out = ""
    log_err = ""
    try:
        async with async_session_maker() as session:
            await session.execute(
                update(Document).where(Document.id == document_id).values(status=DocumentStatus.RUNNING)
            )
            await session.commit()

        try:
            raw = await asyncio.to_thread(get_object, f"{file_hash}/original.{file_ext}")
            preview, md = await asyncio.to_thread(build_xmind_preview, raw, file_hash=file_hash)
        except Exception as exc:
            logger.exception("Mind map preview failed for document %s", document_id)
            log_err = traceback.format_exc()
            async with async_session_maker() as session:
                await session.execute(
                    update(Document)
                    .where(Document.id == document_id)
                    .values(
                        status=DocumentStatus.FAILED,
                        parsing_result={
                            "document_kind": "mindmap",
                            "file_hash": file_hash,
                            "error": str(exc)[:800],
                        },
                    )
                )
                await session.commit()
            raise

        async with async_session_maker() as session:
            await session.execute(
                update(Document)
                .where(Document.id == document_id)
                .values(status=DocumentStatus.COMPLETED, parsing_result=preview, markdown=md)
            )
            await session.commit()
        log_out = "Mind map preview completed; document status set to completed."
        logger.info("Mind map preview completed for document %s", document_id)
    finally:
        await persist_job_run_worker_log_best_effort(job_pk, log_cmd, log_out, log_err)


@job_app.task(name="run_kb_index", pass_context=True)
async def run_kb_index(
    context: JobContext,
    knowledge_base_id: str,
) -> None:
    """
    Run knowledge base indexing via openkms-cli subprocess.

    Splits documents into chunks, generates embeddings, and indexes FAQs.
    """
    from app.database import async_session_maker
    from app.models.knowledge_base import KnowledgeBase
    from app.services.job_run_worker_log import persist_job_run_worker_log_best_effort

    job_pk = context.job.id
    log_cmd: str | None = f"run_kb_index knowledge_base_id={knowledge_base_id}"
    log_out = ""
    log_err = ""

    try:
        async with async_session_maker() as session:
            kb = await session.get(KnowledgeBase, knowledge_base_id)
            if not kb:
                logger.error("Knowledge base %s not found", knowledge_base_id)
                log_err = f"Knowledge base {knowledge_base_id} not found"
                raise RuntimeError(f"Knowledge base {knowledge_base_id} not found")

        base_api_url = settings.openkms_backend_url.rstrip("/")
        cmd_str = (
            f"openkms-cli pipeline run --pipeline-name kb-index"
            f" --knowledge-base-id {knowledge_base_id}"
            f" --api-url {base_api_url}"
        )

        subprocess_env = {
            **os.environ,
            "OPENKMS_API_URL": base_api_url,
            "OPENKMS_AUTH_MODE": (settings.auth_mode or "oidc").strip().lower(),
            "OPENKMS_CLI_BASIC_USER": settings.cli_basic_user,
            "OPENKMS_CLI_BASIC_PASSWORD": settings.cli_basic_password,
        }

        cmd = shlex.split(cmd_str)
        log_cmd = cmd_str
        logger.info("Running KB index for %s: %s", knowledge_base_id, cmd_str)

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=1800,
                env=subprocess_env,
            )
            log_out = result.stdout or ""
            log_err = result.stderr or ""
            if result.returncode != 0:
                logger.error("KB indexing failed (exit %d): %s", result.returncode, result.stderr)
                log_err = (log_err + f"\n\nexit code {result.returncode}").strip()
                raise RuntimeError(f"KB indexing exited with code {result.returncode}: {result.stderr[:500]}")
            logger.info("KB indexing completed for %s", knowledge_base_id)
        except subprocess.TimeoutExpired:
            log_err = "KB indexing subprocess timed out (1800s)."
            logger.error("KB indexing timed out for %s", knowledge_base_id)
            raise
    finally:
        await persist_job_run_worker_log_best_effort(job_pk, log_cmd, log_out, log_err)


@job_app.task(name="run_kb_wiki_space_index", pass_context=True)
async def run_kb_wiki_space_index(
    context: JobContext,
    knowledge_base_id: str,
    wiki_space_id: str,
) -> None:
    """Re-index wiki pages from one linked wiki space (openkms-cli kb-index --wiki-space-id)."""
    from sqlalchemy import select

    from app.database import async_session_maker
    from app.models.knowledge_base import KnowledgeBase
    from app.models.kb_wiki_space import KBWikiSpace
    from app.services.job_run_worker_log import persist_job_run_worker_log_best_effort

    job_pk = context.job.id
    log_cmd: str | None = (
        f"run_kb_wiki_space_index knowledge_base_id={knowledge_base_id} wiki_space_id={wiki_space_id}"
    )
    log_out = ""
    log_err = ""

    try:
        async with async_session_maker() as session:
            kb = await session.get(KnowledgeBase, knowledge_base_id)
            if not kb:
                logger.error("Knowledge base %s not found", knowledge_base_id)
                log_err = f"Knowledge base {knowledge_base_id} not found"
                raise RuntimeError(f"Knowledge base {knowledge_base_id} not found")
            link = (
                await session.execute(
                    select(KBWikiSpace.id).where(
                        KBWikiSpace.knowledge_base_id == knowledge_base_id,
                        KBWikiSpace.wiki_space_id == wiki_space_id,
                    )
                )
            ).scalar_one_or_none()
            if not link:
                log_err = f"Wiki space {wiki_space_id} not linked to KB {knowledge_base_id}"
                raise RuntimeError(log_err)

        base_api_url = settings.openkms_backend_url.rstrip("/")
        cmd_str = (
            f"openkms-cli pipeline run --pipeline-name kb-index"
            f" --knowledge-base-id {knowledge_base_id}"
            f" --wiki-space-id {wiki_space_id}"
            f" --api-url {base_api_url}"
        )

        subprocess_env = {
            **os.environ,
            "OPENKMS_API_URL": base_api_url,
            "OPENKMS_AUTH_MODE": (settings.auth_mode or "oidc").strip().lower(),
            "OPENKMS_CLI_BASIC_USER": settings.cli_basic_user,
            "OPENKMS_CLI_BASIC_PASSWORD": settings.cli_basic_password,
        }

        cmd = shlex.split(cmd_str)
        log_cmd = cmd_str
        logger.info("Running KB wiki-space index for %s / %s: %s", knowledge_base_id, wiki_space_id, cmd_str)

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=1800,
                env=subprocess_env,
            )
            log_out = result.stdout or ""
            log_err = result.stderr or ""
            if result.returncode != 0:
                logger.error(
                    "KB wiki-space indexing failed (exit %d): %s",
                    result.returncode,
                    result.stderr,
                )
                log_err = (log_err + f"\n\nexit code {result.returncode}").strip()
                raise RuntimeError(
                    f"KB wiki-space indexing exited with code {result.returncode}: {result.stderr[:500]}"
                )
            logger.info("KB wiki-space indexing completed for %s / %s", knowledge_base_id, wiki_space_id)
        except subprocess.TimeoutExpired:
            log_err = "KB wiki-space indexing subprocess timed out (1800s)."
            logger.error("KB wiki-space indexing timed out for %s / %s", knowledge_base_id, wiki_space_id)
            raise
    finally:
        await persist_job_run_worker_log_best_effort(job_pk, log_cmd, log_out, log_err)


def _metadata_extraction_requested(command: str) -> bool:
    return "--extract-metadata" in command


def _needs_metadata_extraction_after_parse_cache(
    command: str,
    doc_metadata: dict | None,
    extraction_schema: list | dict | None,
) -> bool:
    """True when parse output can be reused but document metadata fields are still empty."""
    if not _metadata_extraction_requested(command):
        return False
    from app.services.pipeline_metadata_state import document_metadata_needs_extraction

    return document_metadata_needs_extraction(doc_metadata, extraction_schema)


async def _apply_cached_parse_to_document(
    document_id: str,
    file_hash: str,
    parsing_result: dict,
    markdown: str,
) -> None:
    """Write cached parse (+ optional metadata sidecar) to the document row."""
    from sqlalchemy import update

    from app.database import async_session_maker
    from app.models.document import Document

    extracted_metadata = _load_extracted_metadata_from_s3(file_hash)
    async with async_session_maker() as session:
        doc_row = await session.get(Document, document_id)
        doc_name = doc_row.name if doc_row else None
        values: dict = {
            "status": DocumentStatus.COMPLETED,
            "parsing_result": parsing_result,
            "markdown": markdown if (markdown or "").strip() else None,
        }
        if extracted_metadata and doc_row is not None:
            current = dict(doc_row.doc_metadata) if doc_row.doc_metadata else {}
            values["doc_metadata"] = {**current, **extracted_metadata}
        await session.execute(update(Document).where(Document.id == document_id).values(**values))
        await session.commit()
    await asyncio.to_thread(_upload_page_index_from_hash, file_hash, doc_name, markdown)


def _load_result_from_s3(file_hash: str) -> dict:
    """Load result.json from S3 after pipeline completes."""
    from app.services.storage import get_object

    try:
        data = get_object(f"{file_hash}/result.json")
        return json.loads(data)
    except Exception:
        logger.warning("Could not load result.json for %s", file_hash)
        return {}


def _load_extracted_metadata_from_s3(file_hash: str) -> dict:
    """Load channel-extraction output written by openkms-cli during pipeline run."""
    from app.services.storage import get_object, object_exists

    key = f"{file_hash}/extracted_metadata.json"
    if not object_exists(key):
        return {}
    try:
        data = get_object(key)
        parsed = json.loads(data)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        logger.warning("Could not load extracted_metadata.json for %s", file_hash)
        return {}


def _s3_parse_cache_usable(parsing_result: dict) -> bool:
    """True if cached result.json is enough to skip re-running openkms-cli."""
    if not isinstance(parsing_result, dict) or not parsing_result:
        return False
    if parsing_result.get("document_kind") in ("spreadsheet", "mindmap"):
        return False
    if parsing_result.get("parsing_res_list") or parsing_result.get("layout_det_res"):
        return True
    if (parsing_result.get("markdown") or "").strip():
        return True
    return False


def _load_parse_cache_from_s3(file_hash: str) -> tuple[dict, str] | None:
    """Return (parsing_result, markdown) if storage has a usable prior parse; else None."""
    from app.services.storage import get_object, object_exists

    if not settings.storage_enabled or not file_hash:
        return None
    rkey = f"{file_hash}/result.json"
    if not object_exists(rkey):
        return None
    try:
        parsing_result = json.loads(get_object(rkey).decode("utf-8"))
    except Exception:
        return None
    if not _s3_parse_cache_usable(parsing_result):
        return None
    markdown = (parsing_result.get("markdown") or "").strip()
    if not markdown:
        mkey = f"{file_hash}/markdown.md"
        if object_exists(mkey):
            try:
                markdown = get_object(mkey).decode("utf-8")
            except Exception:
                markdown = ""
    return (parsing_result, markdown)


def _upload_page_index_from_hash(file_hash: str, doc_name: str | None, markdown: str | None) -> None:
    """Rebuild page_index.json on storage from markdown (same as document upload save path)."""
    if not file_hash or not settings.storage_enabled or not markdown or not markdown.strip():
        return
    try:
        from app.services.page_index import md_to_tree_from_markdown
        from app.services.storage import upload_object

        page_index = md_to_tree_from_markdown(markdown, doc_name=doc_name or "document")
        upload_object(
            f"{file_hash}/page_index.json",
            json.dumps(page_index).encode("utf-8"),
            content_type="application/json",
        )
    except Exception:
        pass


def _pipeline_exit_human_hint(code: int) -> str:
    if code == 130:
        return (
            "Exit 130 (SIGINT): the parse subprocess was interrupted (e.g. worker stopped with Ctrl+C, "
            "or the process was killed). It is not caused by file length alone. "
            "For long documents, raise OPENKMS_PIPELINE_TIMEOUT_SECONDS if hits timeout (exit 137/timeout)."
        )
    if code == 143:
        return "Exit 143 (SIGTERM): subprocess was terminated."
    return ""
