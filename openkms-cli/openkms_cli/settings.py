"""Central CLI configuration: every environment variable is mapped explicitly via ``validation_alias``.

Load order: ``openkms-cli/.env`` then current working directory ``.env`` (later overrides).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_pkg_root = Path(__file__).resolve().parent.parent
load_dotenv(_pkg_root / ".env")
load_dotenv(Path.cwd() / ".env", override=True)


class CliSettings(BaseSettings):
    """openkms-cli environment variables (explicit names only, no implicit prefix)."""

    model_config = SettingsConfigDict(extra="ignore")

    # --- Auth (must align with backend when using local mode or OIDC client credentials) ---
    auth_mode: str = Field(default="", validation_alias="OPENKMS_AUTH_MODE")
    oidc_token_url: str = Field(default="", validation_alias="OPENKMS_OIDC_TOKEN_URL")
    oidc_client_id: str = Field(default="openkms-cli", validation_alias="OPENKMS_CLI_OIDC_CLIENT_ID")
    oidc_client_secret: str = Field(default="", validation_alias="OPENKMS_CLI_OIDC_CLIENT_SECRET")
    cli_basic_user: str = Field(default="", validation_alias="OPENKMS_CLI_BASIC_USER")
    cli_basic_password: str = Field(default="", validation_alias="OPENKMS_CLI_BASIC_PASSWORD")

    # --- VLM (parse + pipeline) ---
    vlm_url: str = Field(default="http://localhost:8101/", validation_alias="OPENKMS_VLM_URL")
    vlm_api_key: str = Field(default="", validation_alias="OPENKMS_VLM_API_KEY")
    vlm_model: str = Field(
        default="PaddlePaddle/PaddleOCR-VL-1.5",
        validation_alias="OPENKMS_VLM_MODEL",
    )
    vlm_max_concurrency: int = Field(default=3, validation_alias="OPENKMS_VLM_MAX_CONCURRENCY")

    # --- Backend API (pipeline metadata sync, kb-index, etc.) ---
    openkms_api_url: str = Field(default="http://localhost:8102", validation_alias="OPENKMS_API_URL")
    frontend_url: str = Field(default="", validation_alias="OPENKMS_FRONTEND_URL")

    # --- Embedding overrides (kb-index pipeline) ---
    embedding_model_base_url: str = Field(default="", validation_alias="OPENKMS_EMBEDDING_MODEL_BASE_URL")
    embedding_model_name: str = Field(default="", validation_alias="OPENKMS_EMBEDDING_MODEL_NAME")
    embedding_model_api_key: str = Field(default="", validation_alias="OPENKMS_EMBEDDING_MODEL_API_KEY")

    # --- Metadata extraction (pipeline --extraction-model-base-url path) ---
    extraction_model_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "OPENKMS_EXTRACTION_MODEL_API_KEY",
            "EXTRACTION_MODEL_API_KEY",
        ),
    )

    # --- Baidu Cloud OCR (baidu-doc-parse pipeline) ---
    baidu_cloud_api_key: str = Field(default="", validation_alias="OPENKMS_BAIDU_CLOUD_API_KEY")
    baidu_cloud_secret_key: str = Field(default="", validation_alias="OPENKMS_BAIDU_CLOUD_SECRET_KEY")
    baidu_token_url: str = Field(
        default="https://aip.baidubce.com/oauth/2.0/token",
        validation_alias="BAIDU_TOKEN_URL",
    )
    baidu_task_url: str = Field(
        default="https://aip.baidubce.com/rest/2.0/brain/online/v2/paddle-vl-parser/task",
        validation_alias="BAIDU_TASK_URL",
    )
    baidu_query_url: str = Field(
        default="https://aip.baidubce.com/rest/2.0/brain/online/v2/paddle-vl-parser/task/query",
        validation_alias="BAIDU_QUERY_URL",
    )
    baidu_file_url_submit_retries: int = Field(
        default=3,
        ge=1,
        le=10,
        validation_alias="OPENKMS_BAIDU_FILE_URL_SUBMIT_RETRIES",
    )
    baidu_file_url_retry_delay_seconds: int = Field(
        default=20,
        ge=0,
        le=300,
        validation_alias="OPENKMS_BAIDU_FILE_URL_RETRY_DELAY_SECONDS",
    )
    baidu_file_url_submit_timeout_seconds: int = Field(
        default=600,
        ge=60,
        le=1800,
        validation_alias="OPENKMS_BAIDU_FILE_URL_SUBMIT_TIMEOUT_SECONDS",
    )
    baidu_bos_bucket: str = Field(default="", validation_alias="OPENKMS_BAIDU_BOS_BUCKET")
    baidu_bos_access_key: str = Field(default="", validation_alias="OPENKMS_BAIDU_BOS_ACCESS_KEY")
    baidu_bos_secret_key: str = Field(default="", validation_alias="OPENKMS_BAIDU_BOS_SECRET_KEY")
    baidu_bos_endpoint: str = Field(
        default="bj.bcebos.com",
        validation_alias="OPENKMS_BAIDU_BOS_ENDPOINT",
    )
    baidu_bos_prefix: str = Field(
        default="openkms-temp",
        validation_alias="OPENKMS_BAIDU_BOS_PREFIX",
    )
    baidu_bos_presign_ttl_seconds: int = Field(
        default=3600,
        ge=300,
        le=86_400,
        validation_alias="OPENKMS_BAIDU_BOS_PRESIGN_TTL_SECONDS",
    )

    # --- AWS / S3 (standard names) ---
    aws_access_key_id: str = Field(default="", validation_alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str = Field(default="", validation_alias="AWS_SECRET_ACCESS_KEY")
    aws_endpoint_url: str = Field(default="", validation_alias="AWS_ENDPOINT_URL")
    aws_bucket_name: str = Field(default="openkms", validation_alias="AWS_BUCKET_NAME")
    aws_region: str = Field(default="us-east-1", validation_alias="AWS_REGION")


@lru_cache(maxsize=1)
def get_cli_settings() -> CliSettings:
    return CliSettings()
