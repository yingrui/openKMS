"""Proxy HTTP to a registered Service: via the Kubernetes API server, or directly in-cluster."""
from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import quote

import httpx

from app.services.kubernetes.cluster_config import validate_resource_name
from app.services.permissions.permission_resolution import jwt_payload_is_admin
from app.services.kubernetes.cluster_connection import prepare_kubeconfig
from app.services.kubernetes.cluster_resources import _build_api_client

_HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "content-encoding",
        "content-length",
    }
)


def service_proxy_resource_path(namespace: str, service: str, port: int, extra_path: str) -> str:
    """API-server path for Service proxy. extra_path is relative (no leading host)."""
    name = f"{service}:{int(port)}"
    base = f"/api/v1/namespaces/{namespace}/services/{name}/proxy"
    extra = (extra_path or "").lstrip("/")
    return f"{base}/{extra}" if extra else f"{base}/"


IDENTITY_HEADER_PREFIX = "x-openkms-"

_DIRECT_DROP_REQUEST_HEADERS = _HOP_BY_HOP | frozenset(
    {"host", "cookie", "authorization", "accept-encoding", "origin", "referer"}
)


def identity_headers(payload: dict[str, Any]) -> dict[str, str]:
    """openKMS user identity for the hosted app; values are percent-encoded UTF-8."""
    fields = {
        "X-Openkms-User-Id": payload.get("sub"),
        "X-Openkms-Username": payload.get("preferred_username") or payload.get("name"),
        "X-Openkms-User-Name": payload.get("name") or payload.get("preferred_username"),
        "X-Openkms-User-Email": payload.get("email"),
    }
    out = {k: quote(str(v), safe="") for k, v in fields.items() if v}
    out["X-Openkms-User-Admin"] = "true" if jwt_payload_is_admin(payload) else "false"
    return out


def service_direct_base_url(namespace: str, service: str, port: int) -> str:
    """In-cluster Service URL; names are validated because they become the hostname."""
    ns = validate_resource_name(namespace)
    svc = validate_resource_name(service)
    return f"http://{svc}.{ns}.svc.cluster.local:{int(port)}"


def direct_request_headers(
    headers: list[tuple[str, str]], identity: dict[str, str]
) -> dict[str, str]:
    """Browser headers minus openKMS credentials and any client-supplied identity, plus ``identity``."""
    out: dict[str, str] = {}
    for key, value in headers:
        lower = key.lower()
        if lower in _DIRECT_DROP_REQUEST_HEADERS or lower.startswith(IDENTITY_HEADER_PREFIX):
            continue
        out[key] = value
    out.update(identity)
    return out


async def proxy_service_direct_async(
    base_url: str,
    *,
    method: str,
    extra_path: str,
    query: list[tuple[str, str]],
    body: bytes | None,
    headers: list[tuple[str, str]],
    identity: dict[str, str],
    timeout: float = 60.0,
) -> tuple[int, dict[str, str], bytes]:
    url = f"{base_url.rstrip('/')}/{(extra_path or '').lstrip('/')}"
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        resp = await client.request(
            method.upper(),
            url,
            params=query or None,
            content=body if body else None,
            headers=direct_request_headers(headers, identity),
        )
    return resp.status_code, filter_response_headers(dict(resp.headers)), resp.content


def join_proxy_path(binding_path: str | None, request_path: str) -> str:
    prefix = (binding_path or "").strip().strip("/")
    rest = (request_path or "").lstrip("/")
    if prefix and rest:
        return f"{prefix}/{rest}"
    return prefix or rest


def _proxy_sync(
    kubeconfig: dict[str, Any],
    *,
    method: str,
    namespace: str,
    service: str,
    port: int,
    extra_path: str,
    query: list[tuple[str, str]],
    body: bytes | None,
    content_type: str | None,
    identity: dict[str, str],
) -> tuple[int, dict[str, str], bytes]:
    from urllib.parse import urlencode

    resource = quote(service_proxy_resource_path(namespace, service, port, extra_path), safe="/:@")
    headers: dict[str, str] = dict(identity)
    if content_type:
        headers["Content-Type"] = content_type
    with _build_api_client(kubeconfig) as api_client:
        auth_query: list[tuple[str, str]] = []
        api_client.update_params_for_auth(headers, auth_query, ["BearerToken"])
        url = api_client.configuration.host + resource
        all_query = list(query) + auth_query
        if all_query:
            url += "?" + urlencode(all_query)
        # The generated REST client re-serializes JSON bodies and drops form bodies; send raw bytes.
        resp = api_client.rest_client.pool_manager.request(
            method.upper(),
            url,
            body=body if body else None,
            headers=headers,
            preload_content=True,
            redirect=False,
        )
        payload = resp.data or b""
        hdrs = {str(k): str(v) for k, v in resp.headers.items()}
        return int(resp.status), hdrs, payload


def filter_response_headers(headers: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in headers.items():
        if key.lower() in _HOP_BY_HOP:
            continue
        if key.lower() in ("set-cookie", "www-authenticate"):
            continue
        if key.startswith(":"):
            continue
        out[key] = value
    return out


async def proxy_service_async(
    kubeconfig_text: str,
    *,
    method: str,
    namespace: str,
    service: str,
    port: int,
    extra_path: str,
    query: list[tuple[str, str]],
    body: bytes | None,
    content_type: str | None,
    identity: dict[str, str],
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> tuple[int, dict[str, str], bytes]:
    data = prepare_kubeconfig(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    status, headers, payload = await asyncio.to_thread(
        _proxy_sync,
        data,
        method=method,
        namespace=namespace,
        service=service,
        port=port,
        extra_path=extra_path,
        query=query,
        body=body,
        content_type=content_type,
        identity=identity,
    )
    return status, filter_response_headers(headers), payload
