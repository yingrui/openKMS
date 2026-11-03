"""Catalog client: KB-scoped semantic models and query API."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import settings

logger = logging.getLogger(__name__)


def _headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"} if access_token else {}


def _base() -> str:
    return settings.openkms_backend_url.rstrip("/")


def list_kb_semantic_models(access_token: str, knowledge_base_id: str) -> list[dict[str, Any]]:
    """Models linked to this KB (name, metrics, ai_context summary) — selection list for the agent."""
    url = f"{_base()}/api/knowledge-bases/{knowledge_base_id}/semantic-models"
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, headers=_headers(access_token))
        resp.raise_for_status()
        data = resp.json()
    return data if isinstance(data, list) else []


def get_semantic_model(access_token: str, model_id: str) -> dict[str, Any]:
    url = f"{_base()}/api/semantic-models/{model_id}"
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, headers=_headers(access_token))
        resp.raise_for_status()
        return resp.json()


def list_model_metrics(access_token: str, model_id: str) -> list[dict[str, Any]]:
    url = f"{_base()}/api/metrics"
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, headers=_headers(access_token), params={"semantic_model_id": model_id})
        resp.raise_for_status()
        data = resp.json()
    return data.get("items", []) if isinstance(data, dict) else []


def list_model_fields(access_token: str, model_id: str) -> list[dict[str, Any]]:
    url = f"{_base()}/api/semantic-models/{model_id}/fields"
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, headers=_headers(access_token))
        resp.raise_for_status()
        data = resp.json()
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("items", [])
    return []


def query_semantic_model(
    access_token: str, model_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    url = f"{_base()}/api/semantic-models/{model_id}/query"
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(url, headers=_headers(access_token), json=body)
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise RuntimeError(f"query failed ({resp.status_code}): {detail}")
        return resp.json()


def list_kb_ontology_groups(access_token: str, knowledge_base_id: str) -> list[dict[str, Any]]:
    url = f"{_base()}/api/knowledge-bases/{knowledge_base_id}/ontology-groups"
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, headers=_headers(access_token))
        resp.raise_for_status()
        data = resp.json()
    return data if isinstance(data, list) else []


def get_ontology_group_related(access_token: str, group_id: str) -> dict[str, Any]:
    url = f"{_base()}/api/ontology/groups/{group_id}/related"
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, headers=_headers(access_token))
        resp.raise_for_status()
        return resp.json()
