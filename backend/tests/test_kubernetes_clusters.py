"""Unit tests for Kubernetes cluster kubeconfig parsing and response shaping."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.api.kubernetes_clusters import _to_response
from app.models.kubernetes_cluster import KubernetesCluster
from app.services.kubernetes.cluster_connection import (
    extract_api_server,
    parse_kubeconfig_yaml,
    probe_cluster_connection_async,
    resolve_api_server_from_text,
)

SAMPLE_KUBECONFIG = """
apiVersion: v1
kind: Config
clusters:
  - name: demo
    cluster:
      server: https://k8s.example.com:6443
contexts:
  - name: demo
    context:
      cluster: demo
      user: demo
current-context: demo
users:
  - name: demo
    user:
      token: fake-token
"""


def test_parse_kubeconfig_yaml_ok():
    data = parse_kubeconfig_yaml(SAMPLE_KUBECONFIG)
    assert data["kind"] == "Config"
    assert extract_api_server(data) == "https://k8s.example.com:6443"


def test_resolve_api_server_from_text():
    assert resolve_api_server_from_text(SAMPLE_KUBECONFIG) == "https://k8s.example.com:6443"


def test_parse_kubeconfig_rejects_empty():
    with pytest.raises(ValueError, match="empty"):
        parse_kubeconfig_yaml("   ")


def test_parse_kubeconfig_rejects_non_mapping():
    with pytest.raises(ValueError, match="mapping"):
        parse_kubeconfig_yaml("- just a list\n")


def test_parse_kubeconfig_rejects_missing_clusters():
    with pytest.raises(ValueError, match="clusters/contexts"):
        parse_kubeconfig_yaml("apiVersion: v1\nkind: Config\n")


def test_to_response_never_exposes_kubeconfig():
    row = KubernetesCluster(
        id="c1",
        name="demo",
        description="d",
        default_namespace="apps",
        api_server="https://k8s.example.com:6443",
        kubeconfig_encrypted="cipher-text",
        options={"insecure_skip_tls_verify": True},
        last_tested_at=datetime.now(timezone.utc),
        last_test_ok=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    resp = _to_response(row)
    payload = resp.model_dump()
    assert "kubeconfig" not in payload
    assert payload["kubeconfig_configured"] is True
    assert payload["api_server"] == "https://k8s.example.com:6443"
    assert payload["default_namespace"] == "apps"


@pytest.mark.asyncio
async def test_probe_connection_async_uses_version_api():
    with patch("app.services.kubernetes.cluster_connection._test_connection_sync") as sync:
        sync.return_value = (True, "Connected (gitVersion=v1.29.0)")
        ok, message = await probe_cluster_connection_async(SAMPLE_KUBECONFIG)
    assert ok is True
    assert "v1.29.0" in message
    sync.assert_called_once()


@pytest.mark.asyncio
async def test_probe_connection_async_invalid_kubeconfig():
    ok, message = await probe_cluster_connection_async("not: yaml: [[[")
    assert ok is False
    assert "Invalid" in message or "empty" in message or "mapping" in message


def test_permission_patterns_include_kubernetes():
    from app.services.permissions.permission_catalog import PERM_CONSOLE_KUBERNETES
    from app.services.permissions.permission_default_patterns import default_patterns_for_key

    fe, be = default_patterns_for_key(PERM_CONSOLE_KUBERNETES)
    assert "/console/kubernetes" in fe
    assert "/console/kubernetes/*" in fe
    assert "/api/kubernetes-clusters/*" in be


def test_pod_ready_and_restarts():
    from types import SimpleNamespace

    from app.services.kubernetes.cluster_resources import _pod_ready_and_restarts

    pod = SimpleNamespace(
        status=SimpleNamespace(
            container_statuses=[
                SimpleNamespace(ready=True, restart_count=2),
                SimpleNamespace(ready=False, restart_count=1),
            ]
        )
    )
    assert _pod_ready_and_restarts(pod) == ("1/2", 3)


@pytest.mark.asyncio
async def test_list_namespaces_async_invalid_kubeconfig():
    from app.services.kubernetes.cluster_resources import list_namespaces_async

    with pytest.raises(ValueError):
        await list_namespaces_async("   ")


@pytest.mark.asyncio
async def test_list_namespaces_async_delegates_to_sync():
    from app.services.kubernetes.cluster_resources import list_namespaces_async

    with patch(
        "app.services.kubernetes.cluster_resources._list_namespaces_sync",
        return_value=[{"name": "default", "phase": "Active", "created_at": None}],
    ) as sync:
        items = await list_namespaces_async(SAMPLE_KUBECONFIG)
    assert items[0]["name"] == "default"
    sync.assert_called_once()
