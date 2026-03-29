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
    oidc_auth_server_base_url: str = Field(
        default="http://localhost:8081",
        validation_alias="OPENKMS_OIDC_AUTH_SERVER_BASE_URL",
    )
    oidc_realm: str = Field(default="openkms", validation_alias="OPENKMS_OIDC_REALM")
    oidc_service_client_id: str = Field(default="", validation_alias="OPENKMS_OIDC_SERVICE_CLIENT_ID")
    oidc_service_client_secret: str = Field(
        default="",
        validation_alias="OPENKMS_OIDC_SERVICE_CLIENT_SECRET",
    )
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

    # --- AWS / S3 (standard names) ---
    aws_access_key_id: str = Field(default="", validation_alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str = Field(default="", validation_alias="AWS_SECRET_ACCESS_KEY")
    aws_endpoint_url: str = Field(default="", validation_alias="AWS_ENDPOINT_URL")
    aws_bucket_name: str = Field(default="openkms", validation_alias="AWS_BUCKET_NAME")
    aws_region: str = Field(default="us-east-1", validation_alias="AWS_REGION")


@lru_cache(maxsize=1)
def get_cli_settings() -> CliSettings:
    return CliSettings()
