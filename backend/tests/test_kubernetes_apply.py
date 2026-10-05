"""Allowlisted Kubernetes manifest parsing (no live cluster)."""

from __future__ import annotations

import pytest

from app.services.kubernetes.cluster_apply import parse_manifests


def test_parse_service_and_deployment():
    docs = parse_manifests(
        """
apiVersion: v1
kind: Service
metadata:
  name: demo
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo
spec:
  replicas: 1
"""
    )
    assert [d["kind"] for d in docs] == ["Service", "Deployment"]


def test_parse_rejects_cluster_role():
    with pytest.raises(ValueError, match="not allowed"):
        parse_manifests(
            """
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: too-powerful
"""
        )


def test_parse_rejects_empty():
    with pytest.raises(ValueError, match="empty"):
        parse_manifests("  ")
