"""Parse kubeconfig and test connectivity to a registered Kubernetes cluster."""
from __future__ import annotations

import asyncio
import copy
from typing import Any
from urllib.parse import urlparse

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
    clusters = {
        c["name"]: c
        for c in (kubeconfig.get("clusters") or [])
        if isinstance(c, dict) and isinstance(c.get("name"), str)
    }
    cluster_name = _current_cluster_name(kubeconfig)
    if cluster_name and cluster_name in clusters:
        server = (clusters[cluster_name].get("cluster") or {}).get("server")
        if isinstance(server, str) and server.strip():
            return server.strip()
    for c in clusters.values():
        server = (c.get("cluster") or {}).get("server")
        if isinstance(server, str) and server.strip():
            return server.strip()
    return None


def normalize_api_server(value: str | None) -> str | None:
    """Validate an optional API server override. Empty → None."""
    text = (value or "").strip()
    if not text:
        return None
    parsed = urlparse(text)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("API server must be an http(s) URL")
    return text.rstrip("/")


def _current_cluster_name(kubeconfig: dict[str, Any]) -> str | None:
    contexts = {
        c["name"]: c
        for c in (kubeconfig.get("contexts") or [])
        if isinstance(c, dict) and isinstance(c.get("name"), str)
    }
    cluster_name: str | None = None
    current = kubeconfig.get("current-context")
    if isinstance(current, str) and current in contexts:
        cluster_name = (contexts[current].get("context") or {}).get("cluster")
    if not cluster_name and contexts:
        first = next(iter(contexts.values()))
        cluster_name = (first.get("context") or {}).get("cluster")
    return cluster_name if isinstance(cluster_name, str) else None


def apply_api_server(kubeconfig: dict[str, Any], api_server: str | None) -> dict[str, Any]:
    """Rewrite the current context cluster's server URL. No-op when api_server is empty."""
    if not api_server:
        return kubeconfig
    data = copy.deepcopy(kubeconfig)
    name = _current_cluster_name(data)
    clusters = data.get("clusters") or []
    updated = False
    for entry in clusters:
        if not isinstance(entry, dict) or not isinstance(entry.get("cluster"), dict):
            continue
        if name is None or entry.get("name") == name:
            entry["cluster"]["server"] = api_server
            updated = True
            if name is not None:
                break
    if not updated:
        for entry in clusters:
            if isinstance(entry, dict) and isinstance(entry.get("cluster"), dict):
                entry["cluster"]["server"] = api_server
                break
    return data


def _apply_insecure_skip_tls(kubeconfig: dict[str, Any]) -> dict[str, Any]:
    """Return a copied kubeconfig with insecure-skip-tls-verify on all clusters."""
    data = copy.deepcopy(kubeconfig)
    for entry in data.get("clusters") or []:
        if isinstance(entry, dict) and isinstance(entry.get("cluster"), dict):
            entry["cluster"]["insecure-skip-tls-verify"] = True
    return data


def prepare_kubeconfig(
    kubeconfig_text: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> dict[str, Any]:
    """Parse kubeconfig and apply connection overrides used by test/browse."""
    data = parse_kubeconfig_yaml(kubeconfig_text)
    data = apply_api_server(data, api_server)
    if insecure_skip_tls_verify:
        data = _apply_insecure_skip_tls(data)
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
    api_server: str | None = None,
) -> tuple[bool, str]:
    """Load kubeconfig and probe the cluster Version API."""
    try:
        data = prepare_kubeconfig(
            kubeconfig_text,
            insecure_skip_tls_verify=insecure_skip_tls_verify,
            api_server=api_server,
        )
    except ValueError as e:
        return False, str(e)
    return await asyncio.to_thread(_test_connection_sync, data)


def resolve_api_server_from_text(kubeconfig_text: str) -> str | None:
    """Parse kubeconfig text and extract the API server URL."""
    return extract_api_server(parse_kubeconfig_yaml(kubeconfig_text))
