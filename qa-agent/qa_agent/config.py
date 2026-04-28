"""Application configuration."""
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_FILE)


class Settings(BaseSettings):
    openkms_backend_url: str = Field(default="http://localhost:8102", validation_alias="OPENKMS_BACKEND_URL")
    llm_base_url: str = Field(default="http://localhost:11434/v1", validation_alias="OPENKMS_LLM_MODEL_BASE_URL")
    llm_api_key: str = Field(default="no-key", validation_alias="OPENKMS_LLM_MODEL_API_KEY")
    llm_model_name: str = Field(default="qwen2.5", validation_alias="OPENKMS_LLM_MODEL_NAME")

    rerank_enabled: bool = Field(default=True, validation_alias="OPENKMS_RERANK_ENABLED")
    rerank_model_name: str = Field(default="BAAI/bge-reranker-v2-m3", validation_alias="OPENKMS_RERANK_MODEL_NAME")
    rerank_recall_top_k: int = Field(default=25, validation_alias="OPENKMS_RERANK_RECALL_TOP_K")

    host: str = "0.0.0.0"
    port: int = 8103

    langfuse_secret_key: str | None = Field(default=None, validation_alias="LANGFUSE_SECRET_KEY")
    langfuse_public_key: str | None = Field(default=None, validation_alias="LANGFUSE_PUBLIC_KEY")
    langfuse_base_url: str | None = Field(default=None, validation_alias="LANGFUSE_BASE_URL")

    model_config = {"env_file": _ENV_FILE, "extra": "ignore"}

    @property
    def langfuse_enabled(self) -> bool:
        return bool(self.langfuse_secret_key and self.langfuse_public_key)


settings = Settings()
