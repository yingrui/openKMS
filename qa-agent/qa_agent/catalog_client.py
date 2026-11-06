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


def list_data_resources(access_token: str, model_id: str) -> list[dict[str, Any]]:
    """Data resources granted for one model; a restricted model answers only inside one of them."""
    url = f"{_base()}/api/data-resources"
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            url, headers=_headers(access_token), params={"semantic_model_id": model_id}
        )
        if resp.status_code >= 400:
            return []
        data = resp.json()
    if isinstance(data, dict):
        return data.get("items", [])
    return []


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
    access_token: str, model_id: str, body: dict[str, Any], resource_id: str | None = None
) -> dict[str, Any]:
    url = f"{_base()}/api/semantic-models/{model_id}/query"
    if resource_id:
        body = {**body, "resource_id": resource_id}
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(url, headers=_headers(access_token), json=body)
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise RuntimeError(f"query failed ({resp.status_code}): {detail}")
        return resp.json()


def run_model_sql(
    access_token: str,
    model_id: str,
    sql: str,
    limit: int | None = None,
    resource_id: str | None = None,
) -> dict[str, Any]:
    """SQL Lab: one read-only SELECT against the model's table datasets."""
    url = f"{_base()}/api/semantic-models/{model_id}/sql"
    body: dict[str, Any] = {"sql": sql}
    if limit is not None:
        body["limit"] = limit
    if resource_id:
        body["resource_id"] = resource_id
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(url, headers=_headers(access_token), json=body)
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise RuntimeError(f"sql lab failed ({resp.status_code}): {detail}")
        return resp.json()


def get_dataset(access_token: str, dataset_id: str) -> dict[str, Any]:
    url = f"{_base()}/api/datasets/{dataset_id}"
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, headers=_headers(access_token))
        resp.raise_for_status()
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
