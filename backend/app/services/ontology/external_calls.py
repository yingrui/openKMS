"""Call a registered external service from the **backend**.

Two callers: the runtime relay (a `k8s_service` the sandbox cannot reach) and the Action webhook
delivery (the platform posts after a successful Action). Both need the same three things — the
service's transport, its credential, and its path allowlist — so they live here instead of in a
route handler.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

import httpx

from app.models.external_service import ExternalService
from app.models.kubernetes_cluster import KubernetesCluster
from app.services.credentials.credential_encryption import decrypt
from app.services.kubernetes.cluster_service_proxy import join_proxy_path, proxy_service_async
from app.services.ontology.constants import EXTERNAL_CALL_TIMEOUT_SECONDS


def path_allowed(service: ExternalService, path: str) -> bool:
    return any(path.startswith(prefix) for prefix in (service.allowed_paths or []))


def auth_headers(service: ExternalService, raw_body: bytes) -> dict[str, str]:
    """The credential the service expects. `hmac` signs these exact bytes."""
    if not service.secret_encrypted:
        return {}
    secret = decrypt(service.secret_encrypted)
    if service.auth_kind == "bearer":
        return {"Authorization": f"Bearer {secret}"}
    if service.auth_kind == "header" and service.auth_header_name:
        return {service.auth_header_name: secret}
    if service.auth_kind == "hmac":
        digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
        return {(service.auth_header_name or "X-OpenKMS-Signature"): f"sha256={digest}"}
    return {}


async def call_service(
    service: ExternalService,
    cluster: KubernetesCluster | None,
    *,
    method: str,
    path: str,
    body: Any | None,
    identity: dict[str, str] | None = None,
    timeout_seconds: int | None = None,
) -> tuple[int, bytes]:
    """Send one request to the service. Raises for a transport/configuration failure.

    The caller decides what a non-2xx status means; this returns it.
    """
    raw = json.dumps(body).encode("utf-8") if body is not None else b""
    headers = {**(identity or {}), **auth_headers(service, raw)}
    timeout = min(
        timeout_seconds or service.timeout_seconds or EXTERNAL_CALL_TIMEOUT_SECONDS,
        max(service.timeout_seconds or 0, EXTERNAL_CALL_TIMEOUT_SECONDS),
    )

    if service.kind == "k8s_service":
        if cluster is None:
            raise ValueError("The service's Kubernetes cluster is missing")
        kubeconfig = decrypt(cluster.kubeconfig_encrypted)
        options = cluster.options or {}
        _status, _headers, payload = await proxy_service_async(
            kubeconfig,
            method=method,
            namespace=str(service.namespace),
            service=str(service.service),
            port=int(service.port or 0),
            extra_path=join_proxy_path(service.base_path, path),
            query=[],
            body=raw or None,
            content_type="application/json" if raw else None,
            identity=headers,
            insecure_skip_tls_verify=bool(options.get("insecure_skip_tls_verify")),
            api_server=cluster.api_server,
        )
        return _status, payload

    if not service.base_url:
        raise ValueError("An http service needs base_url")
    url = f"{service.base_url.rstrip('/')}{(service.base_path or '')}{path}"
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        response = await client.request(
            method.upper(),
            url,
            content=raw or None,
            headers={"Content-Type": "application/json", **headers} if raw else headers,
        )
        return response.status_code, response.content
