"""Application configuration.

Every setting that reads from the environment lists its variable name explicitly in
``validation_alias`` (no implicit OPENKMS_ + field name). AWS_* vars keep their standard names.
"""
from pathlib import Path

from dotenv import load_dotenv
from pydantic import AliasChoices, Field, field_validator
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
    agent_llm_extra_body_json: str | None = Field(
        default=None,
        validation_alias="OPENKMS_AGENT_LLM_EXTRA_BODY",
        description=(
            "Optional JSON object merged into ChatOpenAI **extra_body** for the wiki embedded agent. "
            "Wiki Copilot does **not** support provider “thinking” / reasoning round-trip mode: "
            "**enable_thinking** is always forced to **false** after this merge (avoids some OpenAI-compat "
            "`reasoning_content must be passed back` errors during tool loops). Use only for other "
            "provider-specific flags your endpoint documents."
        ),
    )
    agent_llm_reasoning_content_shim: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "OPENKMS_AGENT_LLM_REASONING_CONTENT_SHIM",
            "OPENKMS_AGENT_DASHSCOPE_REASONING_SHIM",
        ),
        description=(
            "Wiki agent (OpenAI SDK only): whether to inject **reasoning_content** on outgoing assistant messages for "
            "OpenAI-compatible gateways that require it in tool loops. **auto** (unset): **on** for every **base_url** "
            "except **api.openai.com**; set **0**/**false** to disable. **1**/**true**: always on (including api.openai.com). "
            "Legacy alias: **OPENKMS_AGENT_DASHSCOPE_REASONING_SHIM**."
        ),
    )

    agent_wiki_max_context_messages: int = Field(
        default=120,
        ge=20,
        le=500,
        validation_alias="OPENKMS_AGENT_WIKI_MAX_CONTEXT_MESSAGES",
        description="Max prior messages loaded into the embedded wiki agent LLM context (tail of thread; GET /messages can paginate beyond this).",
    )

    # --- Agent workspace projects (Deep Agents) ---
    projects_root: str = Field(
        default="data/projects",
        validation_alias="OPENKMS_PROJECTS_ROOT",
        description="Root directory for on-disk agent project workspaces ({root}/{project_id}/).",
    )
    agent_skills_root: str = Field(
        default="data/agent-skills",
        validation_alias="OPENKMS_AGENT_SKILLS_ROOT",
        description="Global agent skills registry ({root}/{skill_id}/{version}/).",
    )
    deep_agent_model_id: str | None = Field(
        default=None,
        validation_alias="OPENKMS_DEEP_AGENT_MODEL_ID",
        description="api_models.id for project Deep Agents; falls back to OPENKMS_AGENT_MODEL_ID.",
    )
    agent_sandbox_timeout_seconds: int = Field(
        default=60,
        ge=5,
        le=600,
        validation_alias="OPENKMS_AGENT_SANDBOX_TIMEOUT_SECONDS",
    )

    agent_kb_qa_max_context_messages: int = Field(
        default=120,
        ge=20,
        le=500,
        validation_alias="OPENKMS_AGENT_KB_QA_MAX_CONTEXT_MESSAGES",
        description="Max prior messages sent as ``conversation_history`` to the external qa-agent for one KB turn (tail of thread).",
    )

    # --- Optional Langfuse (wiki + Deep Agents; same env names as qa-agent for shared .env) ---
    langfuse_secret_key: str | None = Field(default=None, validation_alias="LANGFUSE_SECRET_KEY")
    langfuse_public_key: str | None = Field(default=None, validation_alias="LANGFUSE_PUBLIC_KEY")
    langfuse_base_url: str | None = Field(default=None, validation_alias="LANGFUSE_BASE_URL")
    langfuse_trace_streaming: bool = Field(
        default=True,
        validation_alias="LANGFUSE_TRACE_STREAMING",
        description="When Langfuse is enabled, attach callback to **streaming** agent turns; set false to trace only non-streaming if OTel noise.",
    )
    langfuse_healthcheck: bool = Field(
        default=True,
        validation_alias="LANGFUSE_HEALTHCHECK",
        description="When true and LANGFUSE_BASE_URL is set, probe {base}/api/public/health before tracing callbacks and for Console health.",
    )
    langfuse_healthcheck_retry_seconds: int = Field(
        default=60,
        ge=5,
        le=86400,
        validation_alias="LANGFUSE_HEALTHCHECK_RETRY_SECONDS",
        description="Seconds between Langfuse health probes while the host is considered down.",
    )

    # --- Backend URL for CLI (worker passes to openkms-cli --api-url) ---
    openkms_backend_url: str = Field(default="http://localhost:8102", validation_alias="OPENKMS_BACKEND_URL")

    # --- Worker: document pipeline subprocess (openkms-cli pipeline run) ---
    pipeline_timeout_seconds: int = Field(
        default=3600,
        ge=1,
        validation_alias="OPENKMS_PIPELINE_TIMEOUT_SECONDS",
        description="Max seconds to wait for run_pipeline subprocess (VLM parse + optional metadata extraction).",
    )

    job_log_max_chars: int = Field(
        default=262_144,
        ge=4096,
        validation_alias="OPENKMS_JOB_LOG_MAX_CHARS",
        description="Max characters stored per worker job log (command + stdout + stderr); larger output is truncated.",
    )

    # --- App ---
    app_title: str = Field(default="openKMS Backend", validation_alias="OPENKMS_APP_TITLE")
    app_version: str = Field(default="0.1.0", validation_alias="OPENKMS_APP_VERSION")
    debug: bool = Field(default=False, validation_alias="OPENKMS_DEBUG")
    sql_echo: bool = Field(
        default=False,
        validation_alias="OPENKMS_SQL_ECHO",
        description="When true, SQLAlchemy logs every statement (verbose). Independent of OPENKMS_DEBUG.",
    )
    permission_catalog_cache_seconds: float = Field(
        default=5.0,
        ge=0,
        validation_alias="OPENKMS_PERMISSION_CATALOG_CACHE_SECONDS",
        description="In-process TTL for GET /api/auth/permission-catalog; 0 disables. Coalesces parallel identical reads.",
    )

    # --- Authentication: oidc | local ---
    auth_mode: str = Field(default="oidc", validation_alias="OPENKMS_AUTH_MODE")
    allow_signup: bool = Field(default=True, validation_alias="OPENKMS_ALLOW_SIGNUP")
    local_jwt_exp_hours: int = Field(default=168, validation_alias="OPENKMS_LOCAL_JWT_EXP_HOURS")
    cli_basic_user: str = Field(default="", validation_alias="OPENKMS_CLI_BASIC_USER")
    cli_basic_password: str = Field(default="", validation_alias="OPENKMS_CLI_BASIC_PASSWORD")
    cli_oidc_client_id: str = Field(
        default="openkms-cli",
        validation_alias="OPENKMS_CLI_OIDC_CLIENT_ID",
    )
    cli_oidc_client_secret: str = Field(
        default="",
        validation_alias="OPENKMS_CLI_OIDC_CLIENT_SECRET",
    )
    worker_basic_user: str = Field(default="", validation_alias="OPENKMS_WORKER_BASIC_USER")
    worker_basic_password: str = Field(default="", validation_alias="OPENKMS_WORKER_BASIC_PASSWORD")
    qa_agent_basic_user: str = Field(default="", validation_alias="OPENKMS_QA_AGENT_BASIC_USER")
    qa_agent_basic_password: str = Field(default="", validation_alias="OPENKMS_QA_AGENT_BASIC_PASSWORD")

    # --- Data security (resource ACL; replaces group-scoped visibility) ---
    enforce_resource_acl: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "OPENKMS_ENFORCE_RESOURCE_ACL",
            "OPENKMS_ENFORCE_GROUP_DATA_SCOPES",
        ),
        description=(
            "When true, resources without ACL rows are denied (default-closed). "
            "When false (default), only resources with ACL rows are restricted."
        ),
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
    oidc_post_logout_client_id: str = Field(
        default="openkms-frontend",
        validation_alias="OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID",
    )
    oidc_token_url: str = Field(default="", validation_alias="OPENKMS_OIDC_TOKEN_URL")
    worker_oidc_client_id: str = Field(default="", validation_alias="OPENKMS_WORKER_OIDC_CLIENT_ID")
    worker_oidc_client_secret: str = Field(
        default="",
        validation_alias="OPENKMS_WORKER_OIDC_CLIENT_SECRET",
    )
    # Comma-separated OIDC client ids allowed on /internal-api (openkms-cli, qa-agent, …).
    internal_service_client_ids: str = Field(
        default="openkms-cli,qa-agent",
        validation_alias="OPENKMS_INTERNAL_SERVICE_CLIENT_IDS",
    )

    # --- Session cookie + local JWT signing (Starlette SessionMiddleware; HS256 in local mode) ---
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

    @property
    def langfuse_enabled(self) -> bool:
        """Tracing requires secret, public key, and base URL (same rule as qa-agent)."""
        return bool(
            (self.langfuse_secret_key or "").strip()
            and (self.langfuse_public_key or "").strip()
            and (self.langfuse_base_url or "").strip()
        )

    @property
    def resolved_internal_service_client_ids(self) -> frozenset[str]:
        """OIDC ``azp`` / ``client_id`` values allowed on ``/internal-api``."""
        raw = (self.internal_service_client_ids or "openkms-cli,qa-agent").strip()
        ids = frozenset(part.strip() for part in raw.split(",") if part.strip())
        return ids or frozenset({"openkms-cli"})

    @property
    def primary_internal_service_client_id(self) -> str:
        """First id in ``OPENKMS_INTERNAL_SERVICE_CLIENT_IDS`` (``local-cli`` JWT ``azp``)."""
        raw = (self.internal_service_client_ids or "openkms-cli,qa-agent").strip()
        for part in raw.split(","):
            p = part.strip()
            if p:
                return p
        return "openkms-cli"

    model_config = {"env_file": _ENV_FILE, "extra": "ignore"}


settings = Settings()
