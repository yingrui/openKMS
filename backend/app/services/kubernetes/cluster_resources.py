"""Read-only listing of namespaces, deployments, and pods on a registered cluster."""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from app.services.kubernetes.cluster_connection import prepare_kubeconfig


def _build_api_client(kubeconfig: dict[str, Any]):
    from kubernetes import client
    from kubernetes.config.kube_config import KubeConfigLoader

    configuration = client.Configuration()
    loader = KubeConfigLoader(config_dict=kubeconfig)
    loader.load_and_set(configuration)
    return client.ApiClient(configuration)


def _as_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return None


def _pod_ready_and_restarts(pod: Any) -> tuple[str, int]:
    status = getattr(pod, "status", None)
    statuses = list(getattr(status, "container_statuses", None) or []) if status else []
    ready = sum(1 for s in statuses if getattr(s, "ready", False))
    total = len(statuses)
    restarts = sum(int(getattr(s, "restart_count", 0) or 0) for s in statuses)
    return f"{ready}/{total}", restarts


def _list_namespaces_sync(kubeconfig: dict[str, Any]) -> list[dict[str, Any]]:
    from kubernetes import client

    with _build_api_client(kubeconfig) as api_client:
        v1 = client.CoreV1Api(api_client)
        items = v1.list_namespace().items or []
    out: list[dict[str, Any]] = []
    for ns in items:
        meta = ns.metadata
        status = ns.status
        out.append(
            {
                "name": meta.name if meta else "",
                "phase": (status.phase if status else None) or None,
                "created_at": _as_dt(meta.creation_timestamp if meta else None),
            }
        )
    out.sort(key=lambda x: x["name"] or "")
    return out


def _list_deployments_sync(kubeconfig: dict[str, Any], namespace: str) -> list[dict[str, Any]]:
    from kubernetes import client

    with _build_api_client(kubeconfig) as api_client:
        apps = client.AppsV1Api(api_client)
        items = apps.list_namespaced_deployment(namespace).items or []
    out: list[dict[str, Any]] = []
    for dep in items:
        meta = dep.metadata
        status = dep.status
        spec = dep.spec
        ready = int(getattr(status, "ready_replicas", 0) or 0) if status else 0
        desired = int(getattr(spec, "replicas", 0) or 0) if spec else 0
        available = int(getattr(status, "available_replicas", 0) or 0) if status else 0
        out.append(
            {
                "name": meta.name if meta else "",
                "namespace": meta.namespace if meta else namespace,
                "ready": f"{ready}/{desired}",
                "replicas": desired,
                "available": available,
                "updated_at": _as_dt(meta.creation_timestamp if meta else None),
            }
        )
    out.sort(key=lambda x: x["name"] or "")
    return out


def _list_pods_sync(kubeconfig: dict[str, Any], namespace: str) -> list[dict[str, Any]]:
    from kubernetes import client

    with _build_api_client(kubeconfig) as api_client:
        v1 = client.CoreV1Api(api_client)
        items = v1.list_namespaced_pod(namespace).items or []
    out: list[dict[str, Any]] = []
    for pod in items:
        meta = pod.metadata
        status = pod.status
        spec = pod.spec
        ready, restarts = _pod_ready_and_restarts(pod)
        out.append(
            {
                "name": meta.name if meta else "",
                "namespace": meta.namespace if meta else namespace,
                "phase": (status.phase if status else None) or "Unknown",
                "ready": ready,
                "restarts": restarts,
                "node": (spec.node_name if spec else None) or None,
                "created_at": _as_dt(meta.creation_timestamp if meta else None),
            }
        )
    out.sort(key=lambda x: x["name"] or "")
    return out


async def list_namespaces_async(
    kubeconfig_text: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> list[dict[str, Any]]:
    data = prepare_kubeconfig(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(_list_namespaces_sync, data)


async def list_deployments_async(
    kubeconfig_text: str,
    namespace: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> list[dict[str, Any]]:
    data = prepare_kubeconfig(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(_list_deployments_sync, data, namespace)


async def list_pods_async(
    kubeconfig_text: str,
    namespace: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> list[dict[str, Any]]:
    data = prepare_kubeconfig(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(_list_pods_sync, data, namespace)
