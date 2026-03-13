"""Application configuration."""
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_FILE)


class Settings(BaseSettings):
    openkms_backend_url: str = "http://localhost:8102"

    llm_base_url: str = "http://localhost:11434/v1"
    llm_api_key: str = "no-key"
    llm_model_name: str = "qwen2.5"

    host: str = "0.0.0.0"
    port: int = 8103

    model_config = {"env_file": _ENV_FILE, "extra": "ignore"}


settings = Settings()
