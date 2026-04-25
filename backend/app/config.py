"""Application configuration.

Every setting that reads from the environment lists its variable name explicitly in
``validation_alias`` (no implicit OPENKMS_ + field name). AWS_* vars keep their standard names.
"""
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings

# .env next to backend root (parent of app/)
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_FILE)


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # --- Database ---
    database_host: str = Field(default="localhost", validation_alias="OPENKMS_DATABASE_HOST")
    database_port: int = Field(default=5432, validation_alias="OPENKMS_DATABASE_PORT")
    database_user: str = Field(default="postgres", validation_alias="OPENKMS_DATABASE_USER")
    database_password: str = Field(default="", validation_alias="OPENKMS_DATABASE_PASSWORD")
    database_name: str = Field(default="openkms", validation_alias="OPENKMS_DATABASE_NAME")

    # --- VLM Server (mlx-vlm for document parsing) ---
    vlm_url: str = Field(default="http://localhost:8101", validation_alias="OPENKMS_VLM_URL")
    vlm_model: str = Field(
        default="mlx-community/Qwen2-VL-2B-Instruct-4bit",
        validation_alias="OPENKMS_VLM_MODEL",
    )

    # --- PaddleOCRVL (deprecated: prefer vlm_url) ---
    paddleocr_vl_server_url: str = Field(
        default="http://localhost:8101/",
        validation_alias="OPENKMS_PADDLEOCR_VL_SERVER_URL",
    )
    paddleocr_vl_model: str = Field(
        default="PaddlePaddle/PaddleOCR-VL-1.5",
        validation_alias="OPENKMS_PADDLEOCR_VL_MODEL",
    )

    # --- Metadata extraction (LLM for document metadata) ---
    extraction_model_id: str | None = Field(default=None, validation_alias="OPENKMS_EXTRACTION_MODEL_ID")

    # --- Embedded agent (LangGraph; wiki / future surfaces) ---
    agent_model_id: str | None = Field(
        default=None,
        validation_alias="OPENKMS_AGENT_MODEL_ID",
        description="api_models.id for the LLM used by POST /api/agent/.../messages. If unset, the first available LLM model is used.",
    )
    agent_max_output_tokens: int = Field(
        default=65_537,
        ge=1,
        le=200_000,
        validation_alias="OPENKMS_AGENT_MAX_OUTPUT_TOKENS",
        description=(
            "Upper bound on **completion length** for the embedded wiki agent: passed as `max_tokens` to OpenAPI-compatible "
            "chat APIs (token-based). Default is conservative so smaller or stricter models do not error; raise via "
            "**OPENKMS_AGENT_MAX_OUTPUT_TOKENS** if your model supports a higher output cap. Effective limit may be lower on the provider."
        ),
    )
    agent_recursion_limit: int = Field(
        default=200,
        ge=20,
        le=10_000,
        validation_alias="OPENKMS_AGENT_RECURSION_LIMIT",
        description="Max LangGraph supersteps for the wiki ReAct agent (each tool+model cycle uses steps; bulk get/upsert needs a high value).",
    )

    # --- Backend URL for CLI (worker passes to openkms-cli --api-url) ---
    openkms_backend_url: str = Field(default="http://localhost:8102", validation_alias="OPENKMS_BACKEND_URL")

    # --- Worker: document pipeline subprocess (openkms-cli pipeline run) ---
    pipeline_timeout_seconds: int = Field(
        default=1800,
        ge=1,
        validation_alias="OPENKMS_PIPELINE_TIMEOUT_SECONDS",
        description="Max seconds to wait for run_pipeline subprocess (VLM parse + optional metadata extraction).",
    )

    # --- App ---
    app_title: str = Field(default="openKMS Backend", validation_alias="OPENKMS_APP_TITLE")
    app_version: str = Field(default="0.1.0", validation_alias="OPENKMS_APP_VERSION")
    debug: bool = Field(default=False, validation_alias="OPENKMS_DEBUG")

    # --- Authentication: oidc | local ---
    auth_mode: str = Field(default="oidc", validation_alias="OPENKMS_AUTH_MODE")
    allow_signup: bool = Field(default=True, validation_alias="OPENKMS_ALLOW_SIGNUP")
    initial_admin_user: str | None = Field(default=None, validation_alias="OPENKMS_INITIAL_ADMIN_USER")
    local_jwt_exp_hours: int = Field(default=168, validation_alias="OPENKMS_LOCAL_JWT_EXP_HOURS")
    cli_basic_user: str = Field(default="", validation_alias="OPENKMS_CLI_BASIC_USER")
    cli_basic_password: str = Field(default="", validation_alias="OPENKMS_CLI_BASIC_PASSWORD")

    # --- Data security (group-scoped visibility; local mode only until IdP group sync) ---
    enforce_group_data_scopes: bool = Field(
        default=False,
        validation_alias="OPENKMS_ENFORCE_GROUP_DATA_SCOPES",
        description="When true, non-admin local users with access-group membership see only allowed resources.",
    )

    enforce_permission_patterns_strict: bool = Field(
        default=False,
        validation_alias="OPENKMS_ENFORCE_PERMISSION_PATTERNS_STRICT",
        description="When true, authenticated /api requests must match a catalog backend_api_pattern and user must hold that key.",
    )
    permission_pattern_cache_ttl_seconds: int = Field(
        default=60,
        ge=5,
        validation_alias="OPENKMS_PERMISSION_PATTERN_CACHE_TTL_SECONDS",
        description="TTL for compiled permission pattern rules loaded from security_permissions.",
    )

    @field_validator("auth_mode")
    @classmethod
    def validate_auth_mode(cls, v: str) -> str:
        if v not in ("oidc", "local"):
            raise ValueError("OPENKMS_AUTH_MODE must be 'oidc' or 'local'")
        return v

    # --- OIDC ---
    oidc_issuer: str = Field(default="", validation_alias="OPENKMS_OIDC_ISSUER")
    oidc_auth_server_base_url: str = Field(
        default="http://localhost:8081",
        validation_alias="OPENKMS_OIDC_AUTH_SERVER_BASE_URL",
    )
    oidc_realm: str = Field(default="openkms", validation_alias="OPENKMS_OIDC_REALM")
    oidc_client_id: str = Field(default="openkms-backend", validation_alias="OPENKMS_OIDC_CLIENT_ID")
    oidc_client_secret: str = Field(default="", validation_alias="OPENKMS_OIDC_CLIENT_SECRET")
    oidc_redirect_uri: str = Field(
        default="http://localhost:8102/login/oauth2/code/oidc",
        validation_alias="OPENKMS_OIDC_REDIRECT_URI",
    )
    frontend_url: str = Field(default="http://localhost:5173", validation_alias="OPENKMS_FRONTEND_URL")
    oidc_post_logout_client_id: str = Field(
        default="openkms-frontend",
        validation_alias="OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID",
    )
    oidc_service_client_id: str = Field(default="openkms-cli", validation_alias="OPENKMS_OIDC_SERVICE_CLIENT_ID")

    # --- Session (OAuth2 session cookie signing) ---
    secret_key: str = Field(
        default="openkms-dev-secret-change-in-production",
        validation_alias="OPENKMS_SECRET_KEY",
    )

    # --- DataSource credential encryption (Fernet key, base64) ---
    datasource_encryption_key: str | None = Field(
        default=None,
        validation_alias="OPENKMS_DATASOURCE_ENCRYPTION_KEY",
    )

    # --- S3/MinIO (standard AWS env names, no OPENKMS_ prefix) ---
    aws_access_key_id: str = Field(default="", validation_alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str = Field(default="", validation_alias="AWS_SECRET_ACCESS_KEY")
    aws_endpoint_url: str | None = Field(default=None, validation_alias="AWS_ENDPOINT_URL")
    aws_bucket_name: str = Field(default="openkms", validation_alias="AWS_BUCKET_NAME")
    aws_region: str = Field(default="us-east-1", validation_alias="AWS_REGION")

    @property
    def storage_enabled(self) -> bool:
        """True if S3/MinIO credentials are configured."""
        return bool(self.aws_access_key_id and self.aws_secret_access_key)

    @property
    def database_url(self) -> str:
        """Build async PostgreSQL connection URL. ssl=prefer for local dev."""
        return (
            f"postgresql+asyncpg://{self.database_user}:{self.database_password}"
            f"@{self.database_host}:{self.database_port}/{self.database_name}?ssl=prefer"
        )

    @property
    def oidc_issuer_url(self) -> str:
        """Canonical issuer URL (explicit OPENKMS_OIDC_ISSUER or base + realm)."""
        explicit = (self.oidc_issuer or "").strip().rstrip("/")
        if explicit:
            return explicit
        base = (self.oidc_auth_server_base_url or "").strip().rstrip("/") or "http://localhost:8081"
        realm = (self.oidc_realm or "").strip() or "openkms"
        return f"{base}/realms/{realm}"

    @property
    def database_url_sync(self) -> str:
        """Build sync PostgreSQL connection URL (for migrations)."""
        return (
            f"postgresql://{self.database_user}:{self.database_password}"
            f"@{self.database_host}:{self.database_port}/{self.database_name}"
        )

    model_config = {"env_file": _ENV_FILE, "extra": "ignore"}


settings = Settings()
