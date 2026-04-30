#!/usr/bin/env python3
"""Ensure pgvector extension is available (`CREATE EXTENSION IF NOT EXISTS vector`).

Invoked by **`backend/dev.sh`** before `alembic upgrade head`. The FastAPI app does not
create extensions or tables on startup.
"""
import asyncio
import os
import subprocess
import sys

# Add backend to path so we can import app.config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


def get_db_url() -> str:
    """Build async PostgreSQL URL from env."""
    host = os.getenv("OPENKMS_DATABASE_HOST", "localhost")
    port = os.getenv("OPENKMS_DATABASE_PORT", "5432")
    user = os.getenv("OPENKMS_DATABASE_USER", "postgres")
    password = os.getenv("OPENKMS_DATABASE_PASSWORD", "")
    name = os.getenv("OPENKMS_DATABASE_NAME", "openkms")
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{name}?ssl=prefer"


def try_install_in_docker() -> bool:
    """If postgres runs in Docker, try to install pgvector in the container. Returns True if attempted."""
    host = os.getenv("OPENKMS_DATABASE_HOST", "localhost")
    if host not in ("localhost", "127.0.0.1", ""):
        return False
    try:
        out = subprocess.run(
            ["docker", "ps", "--format", "{{.ID}} {{.Ports}}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if out.returncode != 0:
            return False
        for line in out.stdout.strip().split("\n"):
            if "5432" in line:
                cid = line.split()[0]
                pg_major = subprocess.run(
                    ["docker", "exec", cid, "env", "PG_MAJOR"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                major = pg_major.stdout.strip() if pg_major.returncode == 0 else "15"
                print(f"Installing postgresql-{major}-pgvector in container {cid[:12]}...")
                install = subprocess.run(
                    ["docker", "exec", cid, "sh", "-c",
                     f"apt-get update -qq && apt-get install -y postgresql-{major}-pgvector"],
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if install.returncode == 0:
                    print("pgvector package installed.")
                    return True
                print(install.stderr or install.stdout, file=sys.stderr)
                return True  # we attempted
        return False
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


async def main() -> int:
    load_dotenv = None
    try:
        from dotenv import load_dotenv
    except ImportError:
        pass
    if load_dotenv:
        env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        load_dotenv(env_file)

    url = get_db_url()
    engine = create_async_engine(url)

    for attempt in range(2):
        try:
            async with engine.begin() as conn:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            print("pgvector extension OK")
            return 0
        except Exception as e:
            err = str(e).lower()
            if "vector" not in err and "libdir" not in err:
                raise
            if attempt == 0 and try_install_in_docker():
                continue
            print("ERROR: pgvector is not installed in PostgreSQL.", file=sys.stderr)
            print("", file=sys.stderr)
            print("Install it first:", file=sys.stderr)
            print("  Docker: docker exec <container> apt-get update && apt-get install -y postgresql-15-pgvector", file=sys.stderr)
            print("  macOS:  brew install pgvector", file=sys.stderr)
            print("  Linux:  sudo apt install postgresql-15-pgvector", file=sys.stderr)
            print("", file=sys.stderr)
            print("Then run: psql -U <user> -d openkms -c 'CREATE EXTENSION IF NOT EXISTS vector;'", file=sys.stderr)
            return 1
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
