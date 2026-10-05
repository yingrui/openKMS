"""Kubernetes Service binding stored on module apps (`bindings.k8s`)."""
from __future__ import annotations

from typing import Any


def normalize_k8s_binding(raw: Any) -> dict[str, Any] | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("k8s binding must be an object")
    cluster_id = str(raw.get("cluster_id") or "").strip()
    namespace = str(raw.get("namespace") or "").strip()
    service = str(raw.get("service") or "").strip()
    path_raw = str(raw.get("path") or "").strip()
    port_raw = raw.get("port")
    try:
        port = int(port_raw)
    except (TypeError, ValueError) as e:
        raise ValueError("k8s.port must be an integer") from e
    if not (1 <= port <= 65535):
        raise ValueError("k8s.port must be between 1 and 65535")
    if not cluster_id or not namespace or not service:
        raise ValueError("k8s.cluster_id, namespace, and service are required")
    out: dict[str, Any] = {
        "cluster_id": cluster_id,
        "namespace": namespace,
        "service": service,
        "port": port,
    }
    if path_raw:
        out["path"] = path_raw if path_raw.startswith("/") else f"/{path_raw}"
    return out
