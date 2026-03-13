"""Application configuration."""
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_FILE)


class Settings(BaseSettings):
    database_host: str = "localhost"
    database_port: int = 5432
    database_user: str = "postgres"
    database_password: str = ""
    database_name: str = "openkms"

    llm_base_url: str = "http://localhost:11434/v1"
    llm_api_key: str = "no-key"
    llm_model_name: str = "qwen2.5"

    embedding_base_url: str = "http://localhost:11434/v1"
    embedding_api_key: str = "no-key"
    embedding_model_name: str = "nomic-embed-text"

    host: str = "0.0.0.0"
    port: int = 8103

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.database_user}:{self.database_password}"
            f"@{self.database_host}:{self.database_port}/{self.database_name}"
        )

    model_config = {"env_file": _ENV_FILE, "extra": "ignore"}


settings = Settings()
