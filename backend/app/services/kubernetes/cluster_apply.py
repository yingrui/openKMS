"""Apply / delete allowlisted Kubernetes manifests on a registered cluster."""
from __future__ import annotations

import asyncio
from typing import Any

import yaml

from app.services.kubernetes.cluster_connection import prepare_kubeconfig
from app.services.kubernetes.cluster_resources import _build_api_client

ALLOWED_KINDS = frozenset({"ConfigMap", "Deployment", "Pod", "Service"})


def parse_manifests(yaml_text: str) -> list[dict[str, Any]]:
    text = (yaml_text or "").strip()
    if not text:
        raise ValueError("manifest YAML is empty")
    try:
        raw_docs = list(yaml.safe_load_all(text))
    except yaml.YAMLError as e:
        raise ValueError(f"Invalid manifest YAML: {e}") from e
    docs: list[dict[str, Any]] = []
    for doc in raw_docs:
        if doc is None:
            continue
        if not isinstance(doc, dict):
            raise ValueError("each YAML document must be a mapping")
        kind = doc.get("kind")
        if not isinstance(kind, str) or kind not in ALLOWED_KINDS:
            allowed = ", ".join(sorted(ALLOWED_KINDS))
            raise ValueError(f"kind {kind!r} is not allowed (allowed: {allowed})")
        meta = doc.get("metadata")
        if not isinstance(meta, dict) or not str(meta.get("name") or "").strip():
            raise ValueError(f"{kind} is missing metadata.name")
        docs.append(doc)
    if not docs:
        raise ValueError("no YAML documents")
    return docs


def _namespace_for(doc: dict[str, Any], default_namespace: str) -> str:
    meta = doc.get("metadata") or {}
    ns = str(meta.get("namespace") or "").strip()
    return ns or default_namespace


def _create_or_patch(*, create, patch, conflict_is_409: bool = True) -> str:
    from kubernetes.client.exceptions import ApiException

    try:
        create()
        return "created"
    except ApiException as e:
        if not (conflict_is_409 and e.status == 409):
            raise
        patch()
        return "patched"


def _apply_docs_sync(
    kubeconfig: dict[str, Any],
    docs: list[dict[str, Any]],
    default_namespace: str,
) -> list[dict[str, str]]:
    from kubernetes import client

    results: list[dict[str, str]] = []
    with _build_api_client(kubeconfig) as api_client:
        core = client.CoreV1Api(api_client)
        apps = client.AppsV1Api(api_client)
        for doc in docs:
            kind = str(doc.get("kind"))
            name = str((doc.get("metadata") or {}).get("name")).strip()
            ns = _namespace_for(doc, default_namespace)
            meta = dict(doc.get("metadata") or {})
            meta["name"] = name
            meta["namespace"] = ns
            body = {**doc, "metadata": meta}
            if kind == "Deployment":
                action = _create_or_patch(
                    create=lambda b=body, n=ns: apps.create_namespaced_deployment(n, b),
                    patch=lambda b=body, n=ns, nm=name: apps.patch_namespaced_deployment(nm, n, b),
                )
            elif kind == "Service":
                action = _create_or_patch(
                    create=lambda b=body, n=ns: core.create_namespaced_service(n, b),
                    patch=lambda b=body, n=ns, nm=name: core.patch_namespaced_service(nm, n, b),
                )
            elif kind == "Pod":
                action = _create_or_patch(
                    create=lambda b=body, n=ns: core.create_namespaced_pod(n, b),
                    patch=lambda b=body, n=ns, nm=name: core.patch_namespaced_pod(nm, n, b),
                )
            elif kind == "ConfigMap":
                action = _create_or_patch(
                    create=lambda b=body, n=ns: core.create_namespaced_config_map(n, b),
                    patch=lambda b=body, n=ns, nm=name: core.patch_namespaced_config_map(nm, n, b),
                )
            else:
                raise ValueError(f"kind {kind!r} is not allowed")
            results.append({"kind": kind, "name": name, "namespace": ns, "action": action})
    return results


def _delete_sync(kubeconfig: dict[str, Any], kind: str, name: str, namespace: str) -> None:
    from kubernetes import client

    with _build_api_client(kubeconfig) as api_client:
        core = client.CoreV1Api(api_client)
        apps = client.AppsV1Api(api_client)
        if kind == "Deployment":
            apps.delete_namespaced_deployment(name, namespace)
        elif kind == "Service":
            core.delete_namespaced_service(name, namespace)
        elif kind == "Pod":
            core.delete_namespaced_pod(name, namespace)
        elif kind == "ConfigMap":
            core.delete_namespaced_config_map(name, namespace)
        else:
            raise ValueError(f"kind {kind!r} is not allowed")


def _pod_logs_sync(
    kubeconfig: dict[str, Any],
    namespace: str,
    pod: str,
    *,
    tail_lines: int,
    container: str | None,
) -> str:
    from kubernetes import client

    with _build_api_client(kubeconfig) as api_client:
        core = client.CoreV1Api(api_client)
        kwargs: dict[str, Any] = {"tail_lines": tail_lines}
        if container:
            kwargs["container"] = container
        return core.read_namespaced_pod_log(pod, namespace, **kwargs) or ""


def _prepare(
    kubeconfig_text: str,
    *,
    insecure_skip_tls_verify: bool,
    api_server: str | None,
) -> dict[str, Any]:
    return prepare_kubeconfig(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )


async def apply_manifests_async(
    kubeconfig_text: str,
    yaml_text: str,
    default_namespace: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> list[dict[str, str]]:
    docs = parse_manifests(yaml_text)
    data = _prepare(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(_apply_docs_sync, data, docs, default_namespace)


async def delete_resource_async(
    kubeconfig_text: str,
    kind: str,
    name: str,
    namespace: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> None:
    if kind not in ALLOWED_KINDS:
        allowed = ", ".join(sorted(ALLOWED_KINDS))
        raise ValueError(f"kind {kind!r} is not allowed (allowed: {allowed})")
    data = _prepare(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    await asyncio.to_thread(_delete_sync, data, kind, name, namespace)


async def pod_logs_async(
    kubeconfig_text: str,
    namespace: str,
    pod: str,
    *,
    tail_lines: int = 200,
    container: str | None = None,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> str:
    data = _prepare(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(
        _pod_logs_sync,
        data,
        namespace,
        pod,
        tail_lines=tail_lines,
        container=container,
    )
