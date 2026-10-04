"""Parse kubeconfig and test connectivity to a registered Kubernetes cluster."""
from __future__ import annotations

import asyncio
from typing import Any

import yaml


def parse_kubeconfig_yaml(kubeconfig_text: str) -> dict[str, Any]:
    """Parse kubeconfig YAML into a dict. Raises ValueError on invalid input."""
    text = (kubeconfig_text or "").strip()
    if not text:
        raise ValueError("kubeconfig is empty")
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as e:
        raise ValueError(f"Invalid kubeconfig YAML: {e}") from e
    if not isinstance(data, dict):
        raise ValueError("Invalid kubeconfig: expected a YAML mapping")
    if not data.get("clusters") and not data.get("contexts"):
        raise ValueError("Invalid kubeconfig: missing clusters/contexts")
    return data


def extract_api_server(kubeconfig: dict[str, Any]) -> str | None:
    """Return the API server URL for the current (or first) context's cluster."""
    contexts = {
        c["name"]: c
        for c in (kubeconfig.get("contexts") or [])
        if isinstance(c, dict) and isinstance(c.get("name"), str)
    }
    clusters = {
        c["name"]: c
        for c in (kubeconfig.get("clusters") or [])
        if isinstance(c, dict) and isinstance(c.get("name"), str)
    }

    cluster_name: str | None = None
    current = kubeconfig.get("current-context")
    if isinstance(current, str) and current in contexts:
        cluster_name = (contexts[current].get("context") or {}).get("cluster")
    if not cluster_name and contexts:
        first = next(iter(contexts.values()))
        cluster_name = (first.get("context") or {}).get("cluster")

    if isinstance(cluster_name, str) and cluster_name in clusters:
        server = (clusters[cluster_name].get("cluster") or {}).get("server")
        if isinstance(server, str) and server.strip():
            return server.strip()

    for c in clusters.values():
        server = (c.get("cluster") or {}).get("server")
        if isinstance(server, str) and server.strip():
            return server.strip()
    return None


def _apply_insecure_skip_tls(kubeconfig: dict[str, Any]) -> dict[str, Any]:
    """Return a shallow-copied kubeconfig with insecure-skip-tls-verify on all clusters."""
    import copy

    data = copy.deepcopy(kubeconfig)
    for entry in data.get("clusters") or []:
        if isinstance(entry, dict) and isinstance(entry.get("cluster"), dict):
            entry["cluster"]["insecure-skip-tls-verify"] = True
    return data


def _test_connection_sync(kubeconfig: dict[str, Any]) -> tuple[bool, str]:
    try:
        from kubernetes import client
        from kubernetes.config.kube_config import KubeConfigLoader
    except ImportError:
        return False, "kubernetes client not installed"

    try:
        configuration = client.Configuration()
        loader = KubeConfigLoader(config_dict=kubeconfig)
        loader.load_and_set(configuration)
        with client.ApiClient(configuration) as api_client:
            version = client.VersionApi(api_client).get_code()
        git_version = getattr(version, "git_version", None) or "unknown"
        return True, f"Connected (gitVersion={git_version})"
    except Exception as e:
        return False, f"Connection failed: {e}"


async def probe_cluster_connection_async(
    kubeconfig_text: str,
    *,
    insecure_skip_tls_verify: bool = False,
) -> tuple[bool, str]:
    """Load kubeconfig and probe the cluster Version API."""
    try:
        data = parse_kubeconfig_yaml(kubeconfig_text)
    except ValueError as e:
        return False, str(e)
    if insecure_skip_tls_verify:
        data = _apply_insecure_skip_tls(data)
    return await asyncio.to_thread(_test_connection_sync, data)


def resolve_api_server_from_text(kubeconfig_text: str) -> str | None:
    """Parse kubeconfig text and extract the API server URL."""
    return extract_api_server(parse_kubeconfig_yaml(kubeconfig_text))
