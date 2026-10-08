"""Read-only listing of namespaces, deployments, and pods on a registered cluster."""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

import yaml

from app.services.kubernetes.cluster_connection import prepare_kubeconfig

YAML_KINDS = frozenset({"ConfigMap", "Deployment", "Pod", "Secret", "Service"})


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


def _list_services_sync(kubeconfig: dict[str, Any], namespace: str) -> list[dict[str, Any]]:
    from kubernetes import client

    with _build_api_client(kubeconfig) as api_client:
        v1 = client.CoreV1Api(api_client)
        items = v1.list_namespaced_service(namespace).items or []
    out: list[dict[str, Any]] = []
    for svc in items:
        meta = svc.metadata
        spec = svc.spec
        ports = getattr(spec, "ports", None) or [] if spec else []
        port_s = ",".join(
            f"{getattr(p, 'port', '')}/{getattr(p, 'protocol', '') or 'TCP'}" for p in ports
        )
        port_numbers: list[int] = []
        for p in ports:
            n = getattr(p, "port", None)
            try:
                i = int(n)
            except (TypeError, ValueError):
                continue
            if i not in port_numbers:
                port_numbers.append(i)
        out.append(
            {
                "name": meta.name if meta else "",
                "namespace": meta.namespace if meta else namespace,
                "type": (spec.type if spec else None) or "ClusterIP",
                "cluster_ip": (spec.cluster_ip if spec else None) or None,
                "ports": port_s or None,
                "port_numbers": port_numbers,
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


async def list_services_async(
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
    return await asyncio.to_thread(_list_services_sync, data, namespace)


def _container_state(status: Any) -> str:
    state = getattr(status, "state", None)
    if state is None:
        return "unknown"
    if getattr(state, "running", None) is not None:
        return "running"
    if getattr(state, "waiting", None) is not None:
        waiting = state.waiting
        reason = getattr(waiting, "reason", None) or "Waiting"
        return f"waiting:{reason}"
    if getattr(state, "terminated", None) is not None:
        term = state.terminated
        reason = getattr(term, "reason", None) or "Terminated"
        code = getattr(term, "exit_code", None)
        return f"terminated:{reason}" + (f"({code})" if code is not None else "")
    return "unknown"


def _get_pod_sync(kubeconfig: dict[str, Any], namespace: str, name: str) -> dict[str, Any]:
    from kubernetes import client
    from kubernetes.client.exceptions import ApiException

    from app.services.kubernetes.cluster_config import validate_resource_name

    name = validate_resource_name(name)
    with _build_api_client(kubeconfig) as api_client:
        v1 = client.CoreV1Api(api_client)
        try:
            pod = v1.read_namespaced_pod(name, namespace)
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"Pod {name!r} not found") from e
            raise

    meta = pod.metadata
    status = pod.status
    spec = pod.spec
    ready, restarts = _pod_ready_and_restarts(pod)
    labels = dict(meta.labels or {}) if meta else {}
    status_by_name = {
        (s.name or ""): s for s in (getattr(status, "container_statuses", None) or [])
    }
    containers: list[dict[str, Any]] = []
    for c in (getattr(spec, "containers", None) or []) if spec else []:
        st = status_by_name.get(c.name or "")
        ports = []
        for p in c.ports or []:
            ports.append(
                {
                    "container_port": int(getattr(p, "container_port", 0) or 0),
                    "protocol": (getattr(p, "protocol", None) or "TCP"),
                    "name": getattr(p, "name", None) or None,
                }
            )
        containers.append(
            {
                "name": c.name or "",
                "image": getattr(c, "image", None) or None,
                "ports": ports,
                "ready": bool(getattr(st, "ready", False)) if st else False,
                "restarts": int(getattr(st, "restart_count", 0) or 0) if st else 0,
                "state": _container_state(st) if st else "unknown",
            }
        )
    return {
        "name": meta.name if meta else name,
        "namespace": meta.namespace if meta else namespace,
        "phase": (status.phase if status else None) or "Unknown",
        "ready": ready,
        "restarts": restarts,
        "node": (spec.node_name if spec else None) or None,
        "pod_ip": (getattr(status, "pod_ip", None) if status else None) or None,
        "created_at": _as_dt(meta.creation_timestamp if meta else None),
        "labels": labels,
        "containers": containers,
    }


def _get_service_sync(kubeconfig: dict[str, Any], namespace: str, name: str) -> dict[str, Any]:
    from kubernetes import client
    from kubernetes.client.exceptions import ApiException

    from app.services.kubernetes.cluster_config import validate_resource_name

    name = validate_resource_name(name)
    with _build_api_client(kubeconfig) as api_client:
        v1 = client.CoreV1Api(api_client)
        try:
            svc = v1.read_namespaced_service(name, namespace)
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"Service {name!r} not found") from e
            raise

    meta = svc.metadata
    spec = svc.spec
    ports_out: list[dict[str, Any]] = []
    for p in (getattr(spec, "ports", None) or []) if spec else []:
        target = getattr(p, "target_port", None)
        ports_out.append(
            {
                "name": getattr(p, "name", None) or None,
                "port": int(getattr(p, "port", 0) or 0),
                "target_port": str(target) if target is not None else None,
                "node_port": int(getattr(p, "node_port", 0) or 0) or None,
                "protocol": (getattr(p, "protocol", None) or "TCP"),
            }
        )
    external = list(getattr(spec, "external_ips", None) or []) if spec else []
    return {
        "name": meta.name if meta else name,
        "namespace": meta.namespace if meta else namespace,
        "type": (spec.type if spec else None) or "ClusterIP",
        "cluster_ip": (spec.cluster_ip if spec else None) or None,
        "external_ips": [str(x) for x in external if x],
        "ports": ports_out,
        "selector": dict(getattr(spec, "selector", None) or {}) if spec else {},
        "created_at": _as_dt(meta.creation_timestamp if meta else None),
        "labels": dict(meta.labels or {}) if meta else {},
    }


async def get_pod_async(
    kubeconfig_text: str,
    namespace: str,
    name: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> dict[str, Any]:
    data = prepare_kubeconfig(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(_get_pod_sync, data, namespace, name)


async def get_service_async(
    kubeconfig_text: str,
    namespace: str,
    name: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> dict[str, Any]:
    data = prepare_kubeconfig(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(_get_service_sync, data, namespace, name)


def _clean_manifest_dict(data: dict[str, Any]) -> dict[str, Any]:
    """Drop noisy server fields so YAML is closer to `kubectl get -o yaml --export`-ish."""
    meta = data.get("metadata")
    if isinstance(meta, dict):
        for key in (
            "managedFields",
            "resourceVersion",
            "uid",
            "generation",
            "creationTimestamp",
            "selfLink",
        ):
            meta.pop(key, None)
    data.pop("status", None)
    return data


def _redact_secret_manifest(data: dict[str, Any]) -> None:
    for field in ("data", "stringData"):
        raw = data.get(field)
        if isinstance(raw, dict):
            data[field] = {str(k): "***" for k in raw}


def _get_manifest_yaml_sync(
    kubeconfig: dict[str, Any], namespace: str, kind: str, name: str
) -> dict[str, Any]:
    from kubernetes import client
    from kubernetes.client.exceptions import ApiException

    from app.services.kubernetes.cluster_config import validate_resource_name

    kind = (kind or "").strip()
    if kind not in YAML_KINDS:
        allowed = ", ".join(sorted(YAML_KINDS))
        raise ValueError(f"kind {kind!r} is not supported for YAML (allowed: {allowed})")
    name = validate_resource_name(name)

    with _build_api_client(kubeconfig) as api_client:
        core = client.CoreV1Api(api_client)
        apps = client.AppsV1Api(api_client)
        try:
            if kind == "Deployment":
                obj = apps.read_namespaced_deployment(name, namespace)
            elif kind == "Service":
                obj = core.read_namespaced_service(name, namespace)
            elif kind == "Pod":
                obj = core.read_namespaced_pod(name, namespace)
            elif kind == "ConfigMap":
                obj = core.read_namespaced_config_map(name, namespace)
            else:
                obj = core.read_namespaced_secret(name, namespace)
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"{kind} {name!r} not found") from e
            raise

        raw = api_client.sanitize_for_serialization(obj)

    if not isinstance(raw, dict):
        raise ValueError(f"unexpected {kind} serialization")
    data = _clean_manifest_dict(dict(raw))
    redacted = False
    if kind == "Secret":
        _redact_secret_manifest(data)
        redacted = True
    text = yaml.safe_dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
    return {
        "kind": kind,
        "name": name,
        "namespace": namespace,
        "yaml": text,
        "redacted": redacted,
    }


async def get_manifest_yaml_async(
    kubeconfig_text: str,
    namespace: str,
    kind: str,
    name: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> dict[str, Any]:
    data = prepare_kubeconfig(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(_get_manifest_yaml_sync, data, namespace, kind, name)
