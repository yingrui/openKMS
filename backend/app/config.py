"""Application configuration."""
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings

# .env next to backend root (parent of app/)
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_FILE)


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # Database
    database_host: str = "localhost"
    database_port: int = 5432
    database_user: str = "postgres"
    database_password: str = ""
    database_name: str = "openkms"

    # VLM Server (mlx-vlm for document parsing)
    vlm_url: str = "http://localhost:8101"
    vlm_model: str = "mlx-community/Qwen2-VL-2B-Instruct-4bit"

    # PaddleOCRVL (uses vlm_url / mlx-vlm-server as VLM backend for document parsing)
    paddleocr_vl_server_url: str = "http://localhost:8101/"  # deprecated: use vlm_url
    paddleocr_vl_model: str = "PaddlePaddle/PaddleOCR-VL-1.5"

    # Metadata extraction (LLM for document metadata)
    extraction_model_id: str | None = None

    # Backend URL for CLI (worker passes to openkms-cli --api-url)
    openkms_backend_url: str = Field(default="http://localhost:8102", validation_alias="OPENKMS_BACKEND_URL")

    # App
    app_title: str = "openKMS Backend"
    app_version: str = "0.1.0"
    debug: bool = False

    # Authentication: oidc (external OpenID Connect IdP, e.g. Keycloak) | local (PostgreSQL users)
    auth_mode: str = Field(default="oidc")
    allow_signup: bool = Field(default=True)
    initial_admin_user: str | None = Field(default=None)
    local_jwt_exp_hours: int = Field(default=168)
    cli_basic_user: str = Field(default="")
    cli_basic_password: str = Field(default="")

    @field_validator("auth_mode")
    @classmethod
    def validate_auth_mode(cls, v: str) -> str:
        if v not in ("oidc", "local"):
            raise ValueError("OPENKMS_AUTH_MODE must be 'oidc' or 'local'")
        return v

    # Keycloak / OIDC provider (env vars: KEYCLOAK_*, no OPENKMS_ prefix)
    keycloak_auth_server_url: str = Field(default="http://localhost:8081", validation_alias="KEYCLOAK_AUTH_SERVER_URL")
    keycloak_realm: str = Field(default="openkms", validation_alias="KEYCLOAK_REALM")
    keycloak_client_id: str = Field(default="openkms-backend", validation_alias="KEYCLOAK_CLIENT_ID")
    keycloak_client_secret: str = Field(default="", validation_alias="KEYCLOAK_CLIENT_SECRET")
    keycloak_redirect_uri: str = Field(
        default="http://localhost:8102/login/oauth2/code/keycloak",
        validation_alias="KEYCLOAK_REDIRECT_URI",
    )
    keycloak_frontend_url: str = Field(
        default="http://localhost:5173",
        validation_alias="KEYCLOAK_FRONTEND_URL",
    )
    keycloak_logout_client_id: str = Field(
        default="openkms-frontend",
        validation_alias="KEYCLOAK_LOGOUT_CLIENT_ID",
    )
    keycloak_service_client_id: str = Field(
        default="openkms-cli",
        validation_alias="KEYCLOAK_SERVICE_CLIENT_ID",
    )

    # Session (for OAuth2 state and post-login)
    secret_key: str = "openkms-dev-secret-change-in-production"

    # DataSource credential encryption (Fernet key, base64). If unset, derived from secret_key (dev only).
    datasource_encryption_key: str | None = None

    # S3/MinIO (env vars: AWS_*, no OPENKMS_ prefix)
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
    def database_url_sync(self) -> str:
        """Build sync PostgreSQL connection URL (for migrations)."""
        return (
            f"postgresql://{self.database_user}:{self.database_password}"
            f"@{self.database_host}:{self.database_port}/{self.database_name}"
        )

    model_config = {"env_prefix": "OPENKMS_", "env_file": _ENV_FILE, "extra": "ignore"}


settings = Settings()
