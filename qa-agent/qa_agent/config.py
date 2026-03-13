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

    host: str = "0.0.0.0"
    port: int = 8103

    model_config = {"env_file": _ENV_FILE, "extra": "ignore"}


settings = Settings()
