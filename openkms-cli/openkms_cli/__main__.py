"""Entry point for python -m openkms_cli."""

from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (openkms-cli/) or cwd
_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env)
load_dotenv()  # also cwd

from .app import app


def run() -> None:
    app()


if __name__ == "__main__":
    run()
