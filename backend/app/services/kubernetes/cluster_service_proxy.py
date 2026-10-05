"""Proxy HTTP through the Kubernetes API server to a registered Service (no kubeconfig leak)."""
from __future__ import annotations

import asyncio
from typing import Any

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
) -> tuple[int, dict[str, str], bytes]:
    from kubernetes.client.exceptions import ApiException

    resource = service_proxy_resource_path(namespace, service, port, extra_path)
    header_params: dict[str, str] = {}
    if content_type:
        header_params["Content-Type"] = content_type
    with _build_api_client(kubeconfig) as api_client:
        try:
            http_resp, status, headers = api_client.call_api(
                resource,
                method,
                query_params=query or None,
                header_params=header_params or None,
                body=body if body else None,
                auth_settings=["BearerToken"],
                _preload_content=False,
                _return_http_data_only=False,
            )
        except ApiException as e:
            raw = e.body
            if isinstance(raw, bytes):
                payload = raw
            elif raw is None:
                payload = b""
            else:
                payload = str(raw).encode("utf-8", errors="replace")
            hdrs = {str(k): str(v) for k, v in (e.headers or {}).items()}
            return int(e.status or 502), hdrs, payload
        raw = getattr(http_resp, "data", None)
        if raw is None and hasattr(http_resp, "read"):
            raw = http_resp.read()
        payload = raw if isinstance(raw, bytes) else (b"" if raw is None else str(raw).encode("utf-8", errors="replace"))
        hdrs = {str(k): str(v) for k, v in (headers or {}).items()}
        return int(status or 200), hdrs, payload


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
    )
    return status, filter_response_headers(headers), payload
