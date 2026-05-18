#!/usr/bin/env python3
"""Ensure pgvector extension is available (`CREATE EXTENSION IF NOT EXISTS vector`).

Uses **`app.config.settings`** (same database URL as the FastAPI app and ``backend/.env``).

Invoked by **`backend/dev.sh`** before ``alembic upgrade head``. The FastAPI app does not
create extensions or tables at startup.

If ``CREATE EXTENSION`` succeeds but semantic indexing still fails with ``$libdir/vector``,
you are almost certainly hitting a **different PostgreSQL instance** than this script
(e.g. app points at Docker Postgres while this script hit localhost Homebrew). Check
the printed host/port/database and match them to your running API.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import time

# Add backend to path so we can import app.config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


def _vector_related_error(exc: BaseException) -> bool:
    e: BaseException | None = exc
    while e is not None:
        msg = str(e).lower()
        if "$libdir/vector" in msg:
            return True
        if "vector" in msg and ("extension" in msg or "undefinedfile" in type(e).__name__.lower()):
            return True
        e = e.__cause__ or e.__context__
    return False


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
                    [
                        "docker",
                        "exec",
                        cid,
                        "sh",
                        "-c",
                        f"apt-get update -qq && apt-get install -y postgresql-{major}-pgvector",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if install.returncode != 0:
                    print(install.stderr or install.stdout, file=sys.stderr)
                    return True
                print("Restarting container so PostgreSQL loads the new pgvector library…")
                rst = subprocess.run(
                    ["docker", "restart", cid],
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if rst.returncode != 0:
                    print(rst.stderr or rst.stdout, file=sys.stderr)
                else:
                    print("Waiting for PostgreSQL to come back after restart…")
                    time.sleep(12)
                print("pgvector package installed.")
                return True
        return False
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


async def main() -> int:
    from app.config import settings

    url = settings.database_url
    print(
        "PostgreSQL target for pgvector check:",
        f"{settings.database_user}@{settings.database_host}:{settings.database_port}/{settings.database_name}",
        flush=True,
    )

    engine = create_async_engine(url)

    last_exc: BaseException | None = None
    for attempt in range(2):
        try:
            async with engine.begin() as conn:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                # Prove the server can load vector ops (catches $libdir/vector after a bad CREATE).
                await conn.execute(text("SELECT '[1,2,3]'::vector <=> '[1,2,3]'::vector AS d"))
            print("pgvector OK: extension present and distance query succeeded.", flush=True)
            return 0
        except Exception as e:
            last_exc = e
            if not _vector_related_error(e):
                raise
            if attempt == 0 and try_install_in_docker():
                continue
            print("ERROR: pgvector is not usable on this PostgreSQL server.", file=sys.stderr)
            print("", file=sys.stderr)
            print("Common causes:", file=sys.stderr)
            print("  • The pgvector package is not installed in the Postgres *server* (not only the Python client).", file=sys.stderr)
            print("  • This script connected to a different instance than the API (compare host/port/db above).", file=sys.stderr)
            print("  • After installing pgvector in Docker, the container must restart (this script tries that).", file=sys.stderr)
            print("", file=sys.stderr)
            if last_exc is not None:
                print(f"Last error from database: {last_exc!r}", file=sys.stderr)
                print("", file=sys.stderr)
            print("Install examples:", file=sys.stderr)
            print("  Docker: docker exec <container> apt-get update && apt-get install -y postgresql-15-pgvector", file=sys.stderr)
            print("  macOS:  brew install pgvector  (then use Postgres that loads that build)", file=sys.stderr)
            print("  Linux:  sudo apt install postgresql-15-pgvector", file=sys.stderr)
            print("", file=sys.stderr)
            return 1
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
