"""Run blocking Neo4j driver work off the asyncio event loop."""

from __future__ import annotations

import asyncio
import importlib.util
from collections.abc import Callable
from typing import TypeVar

from app.models.data_source import DataSource
from app.services.credentials.credential_encryption import decrypt

T = TypeVar("T")

# Errors a Neo4j call can raise. The driver is optional at runtime, so the tuple is built
# defensively: without it, only "the import itself" is possible. `GqlError` is the driver's
# base for both server-side (`Neo4jError`) and connectivity (`ServiceUnavailable`) failures.
try:  # pragma: no cover - exercised by whichever deployment has the driver
    from neo4j.exceptions import GqlError

    NEO4J_ERRORS: tuple[type[BaseException], ...] = (ImportError, OSError, GqlError)
except ImportError:  # pragma: no cover - driver not installed
    NEO4J_ERRORS = (ImportError, OSError)


def neo4j_connection_params(ds: DataSource) -> tuple[str, str, str]:
    username = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
    password = decrypt(ds.password_encrypted) if ds.password_encrypted else ""
    uri = f"bolt://{ds.host}:{ds.port or 7687}"
    return uri, username, password


def neo4j_driver_available() -> bool:
    """Whether the optional Neo4j driver can be imported — asked without importing it."""
    return importlib.util.find_spec("neo4j") is not None


def open_neo4j_driver(ds: DataSource):
    from neo4j import GraphDatabase

    uri, username, password = neo4j_connection_params(ds)
    return GraphDatabase.driver(uri, auth=(username, password))


async def run_with_neo4j_driver(ds: DataSource, fn: Callable[[object], T]) -> T:
    """Open a Neo4j driver, call ``fn(driver)`` in a worker thread, then close the driver."""

    def _run() -> T:
        driver = open_neo4j_driver(ds)
        try:
            return fn(driver)
        finally:
            driver.close()

    return await asyncio.to_thread(_run)


async def neo4j_delete_all(ds: DataSource) -> tuple[bool, str]:
    def _run() -> tuple[bool, str]:
        driver = open_neo4j_driver(ds)
        try:
            with driver.session() as session:
                session.run("MATCH (n) DETACH DELETE n")
            return True, "All nodes and relationships deleted"
        except NEO4J_ERRORS as e:
            return False, str(e)
        finally:
            driver.close()

    return await asyncio.to_thread(_run)
