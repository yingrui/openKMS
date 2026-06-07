"""Ontology client: fetch object types, link types, and execute Cypher via backend API."""
import logging
import time
from typing import Any

import httpx

from .config import settings
from .logging_config import preview_text

logger = logging.getLogger(__name__)


def _headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"} if access_token else {}


def get_object_types(access_token: str) -> list[dict[str, Any]]:
    """Fetch all object types from the backend. Returns schema for ontology (labels in Neo4j)."""
    base = settings.openkms_backend_url.rstrip("/")
    url = f"{base}/api/object-types"
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, headers=_headers(access_token))
        resp.raise_for_status()
        data = resp.json()
    items = data.get("items", [])
    return [
        {
            "id": o["id"],
            "name": o["name"],
            "description": o.get("description"),
            "key_property": o.get("key_property", "id"),
            "display_property": o.get("display_property"),
            "properties": o.get("properties", []),
            "instance_count": o.get("instance_count", 0),
            "neo4j_label": _to_neo4j_label(o["name"]),
        }
        for o in items
    ]


def get_link_types(access_token: str) -> list[dict[str, Any]]:
    """Fetch all link types from the backend. Returns schema for relationships in Neo4j."""
    base = settings.openkms_backend_url.rstrip("/")
    url = f"{base}/api/link-types"
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, headers=_headers(access_token))
        resp.raise_for_status()
        data = resp.json()
    items = data.get("items", [])
    return [
        {
            "id": l["id"],
            "name": l["name"],
            "description": l.get("description"),
            "source_object_type_name": l.get("source_object_type_name"),
            "target_object_type_name": l.get("target_object_type_name"),
            "cardinality": l.get("cardinality", "one-to-many"),
            "link_count": l.get("link_count", 0),
            "neo4j_rel_type": _to_neo4j_rel_type(l["name"]),
            "source_neo4j_label": _to_neo4j_label(l.get("source_object_type_name") or ""),
            "target_neo4j_label": _to_neo4j_label(l.get("target_object_type_name") or ""),
        }
        for l in items
    ]


def get_ontology_schema(access_token: str) -> dict[str, Any]:
    """Get full ontology schema: object types and link types. Use this to understand the graph structure before writing Cypher."""
    t0 = time.monotonic()
    object_types = get_object_types(access_token)
    link_types = get_link_types(access_token)
    logger.info(
        "get_ontology_schema object_types=%d link_types=%d elapsed=%.2fs",
        len(object_types),
        len(link_types),
        time.monotonic() - t0,
    )
    return {
        "object_types": object_types,
        "link_types": link_types,
        "summary": (
            f"{len(object_types)} object types (node labels), {len(link_types)} link types (relationships). "
            "In Cypher, copy neo4j_label and neo4j_rel_type **verbatim** from this schema (case-sensitive). "
            "Use key_property and property names from each object type; do not guess labels or uppercase rel types."
        ),
    }


def run_cypher(access_token: str, cypher: str) -> dict[str, Any]:
    """Execute a read-only Cypher query against Neo4j. Returns columns and rows."""
    base = settings.openkms_backend_url.rstrip("/")
    url = f"{base}/api/ontology/explore"
    t0 = time.monotonic()
    logger.debug("run_cypher query=%r", preview_text(cypher, 300))
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            url,
            json={"cypher": cypher},
            headers=_headers(access_token),
        )
        resp.raise_for_status()
        data = resp.json()
    rows = data.get("rows") if isinstance(data, dict) else None
    row_count = len(rows) if isinstance(rows, list) else 0
    logger.info(
        "run_cypher done rows=%d elapsed=%.2fs status=%d",
        row_count,
        time.monotonic() - t0,
        resp.status_code,
    )
    return data


def _to_neo4j_label(name: str) -> str:
    """Convert object type name to Neo4j-safe label (alphanumeric, underscore). Preserves case — matches backend ``_neo4j_safe_label``."""
    import re
    s = re.sub(r"[^a-zA-Z0-9_]", "_", name or "")
    return s.strip("_") or "Node"


def _to_neo4j_rel_type(name: str) -> str:
    """Sanitize link type name for Neo4j relationship type. Preserves case — matches backend ``_neo4j_safe_rel_type``."""
    import re
    s = re.sub(r"[^a-zA-Z0-9_]", "_", (name or "").strip())
    return s.strip("_") or "relates_to"
