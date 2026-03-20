"""Ontology client: fetch object types, link types, and execute Cypher via backend API."""
from typing import Any

import httpx

from .config import settings


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
    object_types = get_object_types(access_token)
    link_types = get_link_types(access_token)
    return {
        "object_types": object_types,
        "link_types": link_types,
        "summary": (
            f"{len(object_types)} object types (node labels), {len(link_types)} link types (relationships). "
            "Use neo4j_label for MATCH (n:Label) and neo4j_rel_type for MATCH ()-[r:REL_TYPE]->()."
        ),
    }


def run_cypher(access_token: str, cypher: str) -> dict[str, Any]:
    """Execute a read-only Cypher query against Neo4j. Returns columns and rows."""
    base = settings.openkms_backend_url.rstrip("/")
    url = f"{base}/api/ontology/explore"
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            url,
            json={"cypher": cypher},
            headers=_headers(access_token),
        )
        resp.raise_for_status()
        return resp.json()


def _to_neo4j_label(name: str) -> str:
    """Convert object type name to Neo4j-safe label (alphanumeric, underscore)."""
    import re
    s = re.sub(r"[^a-zA-Z0-9_]", "_", name or "")
    return s.strip("_") or "Node"


def _to_neo4j_rel_type(name: str) -> str:
    """Convert link type name to Neo4j relationship type (uppercase, underscore)."""
    import re
    s = re.sub(r"[^a-zA-Z0-9_]", "_", name or "")
    return (s.strip("_") or "RELATES_TO").upper()
