"""Test connectivity to registered data sources (PostgreSQL, Neo4j)."""

from __future__ import annotations

import asyncio

from app.models.data_source import DataSource
from app.services.credentials.credential_encryption import decrypt


def test_data_source_connection(ds: DataSource) -> tuple[bool, str]:
    """Return (ok, message) for a data source row."""
    if ds.kind == "postgresql":
        try:
            from urllib.parse import quote_plus

            from sqlalchemy import create_engine, text

            username = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
            password = decrypt(ds.password_encrypted) if ds.password_encrypted else ""
            host = ds.host
            port = ds.port or 5432
            database = ds.database or "postgres"
            password_escaped = quote_plus(password) if password else ""
            url = f"postgresql://{username}:{password_escaped}@{host}:{port}/{database}"
            engine = create_engine(url, pool_pre_ping=True, pool_recycle=10)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            engine.dispose()
            return True, "Connection successful"
        except Exception as e:
            return False, str(e)
    if ds.kind == "neo4j":
        try:
            from neo4j import GraphDatabase

            username = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
            password = decrypt(ds.password_encrypted) if ds.password_encrypted else ""
            uri = f"bolt://{ds.host}:{ds.port or 7687}"
            driver = GraphDatabase.driver(uri, auth=(username, password))
            driver.verify_connectivity()
            driver.close()
            return True, "Connection successful"
        except ImportError:
            return False, "Neo4j driver not installed"
        except Exception as e:
            return False, str(e)
    return False, f"Unsupported data source kind: {ds.kind}"


async def test_data_source_connection_async(ds: DataSource) -> tuple[bool, str]:
    return await asyncio.to_thread(test_data_source_connection, ds)
