"""Application configuration."""
from pathlib import Path

from dotenv import load_dotenv
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
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
    llm_base_url: str = Field(default="http://localhost:11434/v1", validation_alias="OPENKMS_LLM_MODEL_BASE_URL")
    llm_api_key: str = Field(default="no-key", validation_alias="OPENKMS_LLM_MODEL_API_KEY")
    llm_model_name: str = Field(default="qwen2.5", validation_alias="OPENKMS_LLM_MODEL_NAME")
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

    rerank_enabled: bool = Field(default=True, validation_alias="OPENKMS_RERANK_ENABLED")
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
    #: When Langfuse is enabled, still omit its callback from ``astream_events`` unless true (avoids OTEL context errors with async streaming).
    langfuse_trace_streaming: bool = Field(default=False, validation_alias="LANGFUSE_TRACE_STREAMING")

    model_config = {"env_file": _ENV_FILE, "extra": "ignore"}

    @property
    def langfuse_enabled(self) -> bool:
        return bool(self.langfuse_secret_key and self.langfuse_public_key)


settings = Settings()
