"""Application configuration."""
from pathlib import Path

from dotenv import load_dotenv
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
if _ENV_FILE.is_file():
    load_dotenv(_ENV_FILE)


def openai_v1_base(url: str) -> str:
    """Normalize an OpenAI-compatible API root ending in ``/v1`` (chat + rerank paths)."""
    u = (url or "").strip().rstrip("/")
    if not u:
        return "http://localhost:11434/v1"
    if u.endswith("/v1"):
        return u
    return f"{u}/v1"


class Settings(BaseSettings):
    openkms_backend_url: str = Field(default="http://localhost:8102", validation_alias="OPENKMS_BACKEND_URL")

    # --- Service auth (shared OPENKMS_AUTH_MODE / OPENKMS_OIDC_TOKEN_URL with openkms-cli) ---
    auth_mode: str = Field(default="", validation_alias="OPENKMS_AUTH_MODE")
    oidc_token_url: str = Field(default="", validation_alias="OPENKMS_OIDC_TOKEN_URL")
    oidc_client_id: str = Field(
        default="qa-agent",
        validation_alias="OPENKMS_QA_AGENT_OIDC_CLIENT_ID",
    )
    oidc_client_secret: str = Field(
        default="",
        validation_alias="OPENKMS_QA_AGENT_OIDC_CLIENT_SECRET",
    )
    basic_user: str = Field(default="", validation_alias="OPENKMS_QA_AGENT_BASIC_USER")
    basic_password: str = Field(default="", validation_alias="OPENKMS_QA_AGENT_BASIC_PASSWORD")

    # Optional overrides; when unset, resolve from existing backend model APIs.
    llm_base_url: str = Field(default="", validation_alias="OPENKMS_LLM_MODEL_BASE_URL")
    llm_api_key: str = Field(default="", validation_alias="OPENKMS_LLM_MODEL_API_KEY")
    llm_model_name: str = Field(default="", validation_alias="OPENKMS_LLM_MODEL_NAME")
    llm_extra_body_json: str | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENKMS_LLM_EXTRA_BODY", "OPENKMS_AGENT_LLM_EXTRA_BODY"),
    )
    llm_reasoning_content_shim: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "OPENKMS_LLM_REASONING_CONTENT_SHIM",
            "OPENKMS_AGENT_LLM_REASONING_CONTENT_SHIM",
            "OPENKMS_AGENT_DASHSCOPE_REASONING_SHIM",
        ),
    )

    #: Default off: many OpenAI-compatible gateways have no ``POST …/v1/rerank`` (404). Set true when you have a rerank endpoint.
    rerank_enabled: bool = Field(default=False, validation_alias="OPENKMS_RERANK_ENABLED")
    rerank_base_url: str | None = Field(default=None, validation_alias="OPENKMS_RERANK_BASE_URL")
    rerank_model_name: str = Field(default="BAAI/bge-reranker-v2-m3", validation_alias="OPENKMS_RERANK_MODEL_NAME")
    rerank_recall_top_k: int = Field(default=25, validation_alias="OPENKMS_RERANK_RECALL_TOP_K")

    bm25_enabled: bool = Field(default=True, validation_alias="OPENKMS_BM25_ENABLED")
    bm25_ttl_seconds: int = Field(default=300, validation_alias="OPENKMS_BM25_TTL_SECONDS")
    rrf_k: int = Field(default=60, validation_alias="OPENKMS_RRF_K")
    hybrid_recall_top_k: int = Field(default=50, validation_alias="OPENKMS_HYBRID_RECALL_TOP_K")

    host: str = "0.0.0.0"
    port: int = 8103

    langfuse_secret_key: str | None = Field(default=None, validation_alias="LANGFUSE_SECRET_KEY")
    langfuse_public_key: str | None = Field(default=None, validation_alias="LANGFUSE_PUBLIC_KEY")
    langfuse_base_url: str | None = Field(default=None, validation_alias="LANGFUSE_BASE_URL")
    #: When Langfuse is enabled, attach its callback to ``astream_events`` unless false (avoids rare OpenTelemetry context warnings on some setups).
    langfuse_trace_streaming: bool = Field(default=True, validation_alias="LANGFUSE_TRACE_STREAMING")
    #: If true (default), probe ``{LANGFUSE_BASE_URL}/api/public/health`` before attaching callbacks; on failure back off and retry on that interval until the host recovers.
    langfuse_healthcheck: bool = Field(default=True, validation_alias="LANGFUSE_HEALTHCHECK")
    #: Seconds between health probes while Langfuse is considered down (circuit open).
    langfuse_healthcheck_retry_seconds: int = Field(
        default=60,
        ge=5,
        le=86400,
        validation_alias="LANGFUSE_HEALTHCHECK_RETRY_SECONDS",
    )

    model_config = {"env_file": _ENV_FILE, "extra": "ignore"}

    @property
    def langfuse_enabled(self) -> bool:
        """Tracing keys plus an explicit host; without ``LANGFUSE_BASE_URL`` we do not use Langfuse."""
        return bool(
            (self.langfuse_secret_key or "").strip()
            and (self.langfuse_public_key or "").strip()
            and (self.langfuse_base_url or "").strip()
        )


settings = Settings()
