"""Application configuration."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # Database
    database_host: str = "localhost"
    database_port: int = 5432
    database_user: str = "postgres"
    database_password: str = ""
    database_name: str = "openkms"

    # VLM Server (mlx-vlm for document parsing)
    vlm_server_url: str = "http://localhost:8101"
    vlm_model: str = "mlx-community/Qwen2-VL-2B-Instruct-4bit"

    # PaddleOCRVL (uses mlx-vlm-server as VLM backend for document parsing)
    paddleocr_vl_server_url: str = "http://localhost:8101/"
    paddleocr_vl_model: str = "PaddlePaddle/PaddleOCR-VL-1.5"
    paddleocr_vl_max_concurrency: int = 3

    # App
    app_title: str = "openKMS Backend"
    app_version: str = "0.1.0"
    debug: bool = False

    @property
    def database_url(self) -> str:
        """Build async PostgreSQL connection URL."""
        return (
            f"postgresql+asyncpg://{self.database_user}:{self.database_password}"
            f"@{self.database_host}:{self.database_port}/{self.database_name}"
        )

    @property
    def database_url_sync(self) -> str:
        """Build sync PostgreSQL connection URL (for migrations)."""
        return (
            f"postgresql://{self.database_user}:{self.database_password}"
            f"@{self.database_host}:{self.database_port}/{self.database_name}"
        )

    model_config = {"env_prefix": "OPENKMS_", "env_file": ".env"}


settings = Settings()
