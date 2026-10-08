"""kubernetes — list registered clusters and apply allowlisted manifests.

Kubeconfig never leaves the server. Requires console:kubernetes on the API key.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json, write_or_print


def cmd_clusters_list(ns: argparse.Namespace) -> None:
    params: dict[str, int] = {}
    if ns.limit is not None:
        params["limit"] = ns.limit
    if ns.offset is not None:
        params["offset"] = ns.offset
    with client() as s:
        r = s.get("/api/kubernetes-clusters", params=params or None)
    r.raise_for_status()
    print_json(r.json())


def cmd_clusters_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/kubernetes-clusters/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def cmd_namespaces(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/kubernetes-clusters/{ns.cluster_id}/namespaces")
    r.raise_for_status()
    print_json(r.json())


def _ns_params(ns: argparse.Namespace) -> dict[str, str] | None:
    n = (getattr(ns, "namespace", None) or "").strip()
    return {"namespace": n} if n else None


def cmd_deployments(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/kubernetes-clusters/{ns.cluster_id}/deployments", params=_ns_params(ns))
    r.raise_for_status()
    print_json(r.json())


def cmd_pods(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/kubernetes-clusters/{ns.cluster_id}/pods", params=_ns_params(ns))
    r.raise_for_status()
    print_json(r.json())


def cmd_services(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/kubernetes-clusters/{ns.cluster_id}/services", params=_ns_params(ns))
    r.raise_for_status()
    print_json(r.json())


def cmd_logs(ns: argparse.Namespace) -> None:
    params: dict[str, str | int] = {}
    n = (ns.namespace or "").strip()
    if n:
        params["namespace"] = n
    if ns.tail is not None:
        params["tail"] = ns.tail
    c = (ns.container or "").strip()
    if c:
        params["container"] = c
    with client() as s:
        r = s.get(
            f"/api/kubernetes-clusters/{ns.cluster_id}/pods/{ns.pod}/logs",
            params=params or None,
        )
    r.raise_for_status()
    data = r.json()
    if ns.out:
        write_or_print(data.get("log") or "", ns.out)
        return
    print_json(data)


def cmd_apply(ns: argparse.Namespace) -> None:
    path = Path(ns.file)
    if not path.is_file():
        print(f"Not a file: {path}", file=sys.stderr)
        sys.exit(1)
    yaml_text = path.read_text(encoding="utf-8")
    body: dict[str, str] = {"yaml": yaml_text}
    n = (ns.namespace or "").strip()
    if n:
        body["namespace"] = n
    api = f"/api/kubernetes-clusters/{ns.cluster_id}/apply"
    confirm_or_abort(
        action=f"apply {path.name} to cluster {ns.cluster_id}",
        method="POST",
        path=api,
        body={"yaml": f"<{path} {len(yaml_text)} bytes>", "namespace": body.get("namespace")},
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(api, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_delete(ns: argparse.Namespace) -> None:
    body: dict[str, str] = {"kind": ns.kind, "name": ns.name}
    n = (ns.namespace or "").strip()
    if n:
        body["namespace"] = n
    api = f"/api/kubernetes-clusters/{ns.cluster_id}/delete"
    confirm_or_abort(
        action=f"delete {ns.kind}/{ns.name}",
        method="POST",
        path=api,
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(api, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_secrets(ns: argparse.Namespace) -> None:
    """List Opaque Secrets (keys only; values never returned)."""
    with client() as s:
        r = s.get(f"/api/kubernetes-clusters/{ns.cluster_id}/secrets", params=_ns_params(ns))
    r.raise_for_status()
    print_json(r.json())


def cmd_configmaps(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/kubernetes-clusters/{ns.cluster_id}/configmaps", params=_ns_params(ns))
    r.raise_for_status()
    print_json(r.json())


def cmd_env(ns: argparse.Namespace) -> None:
    params = _ns_params(ns)
    with client() as s:
        r = s.get(
            f"/api/kubernetes-clusters/{ns.cluster_id}/deployments/{ns.deployment}/env",
            params=params,
        )
    r.raise_for_status()
    print_json(r.json())


def cmd_register_app(ns: argparse.Namespace) -> None:
    k8s: dict[str, str | int] = {
        "cluster_id": ns.cluster_id,
        "namespace": ns.namespace,
        "service": ns.service,
        "port": ns.port,
    }
    path = (getattr(ns, "path", None) or "").strip()
    if path:
        k8s["path"] = path
    body: dict[str, object] = {
        "name": ns.name,
        "api_name": ns.api_name,
        "template_id": "module",
        "bindings": {"k8s": k8s},
    }
    if ns.description is not None:
        body["description"] = ns.description
    api = "/api/app-builder/apps"
    confirm_or_abort(
        action=f"register module app {ns.api_name} → {ns.service}:{ns.port}",
        method="POST",
        path=api,
        body=body,
        yes=ns.yes,
        dry_run=ns.dry_run,
    )
    with client() as s:
        r = s.post(api, json=body)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser(
        "kubernetes",
        help="Registered clusters: list, browse, apply YAML (Deployment/Service/Pod/ConfigMap)",
    )
    sp = p.add_subparsers(dest="kubernetes_cmd", required=True)

    cl = sp.add_parser("clusters", help="Registered cluster metadata (no kubeconfig)")
    clsp = cl.add_subparsers(dest="kubernetes_clusters_cmd", required=True)
    ls = clsp.add_parser("list", help="GET /api/kubernetes-clusters")
    ls.add_argument("--limit", type=int, default=None)
    ls.add_argument("--offset", type=int, default=None)
    ls.set_defaults(fn=cmd_clusters_list)
    gt = clsp.add_parser("get", help="GET /api/kubernetes-clusters/{id}")
    gt.add_argument("--id", required=True)
    gt.set_defaults(fn=cmd_clusters_get)

    nsp = sp.add_parser("namespaces", help="List namespaces")
    nsp.add_argument("--cluster-id", required=True)
    nsp.set_defaults(fn=cmd_namespaces)

    dep = sp.add_parser("deployments", help="List Deployments")
    dep.add_argument("--cluster-id", required=True)
    dep.add_argument("--namespace", default=None)
    dep.set_defaults(fn=cmd_deployments)

    pods = sp.add_parser("pods", help="List Pods")
    pods.add_argument("--cluster-id", required=True)
    pods.add_argument("--namespace", default=None)
    pods.set_defaults(fn=cmd_pods)

    svcs = sp.add_parser("services", help="List Services")
    svcs.add_argument("--cluster-id", required=True)
    svcs.add_argument("--namespace", default=None)
    svcs.set_defaults(fn=cmd_services)

    logs = sp.add_parser("logs", help="Pod logs")
    logs.add_argument("--cluster-id", required=True)
    logs.add_argument("--pod", required=True)
    logs.add_argument("--namespace", default=None)
    logs.add_argument("--container", default=None)
    logs.add_argument("--tail", type=int, default=200)
    logs.add_argument("--out", default=None, help="write log text to a file instead of JSON")
    logs.set_defaults(fn=cmd_logs)

    ap = sp.add_parser("apply", help="Create or patch YAML (POST …/apply)")
    ap.add_argument("--cluster-id", required=True)
    ap.add_argument("--file", required=True, help="manifest YAML (one or more documents)")
    ap.add_argument("--namespace", default=None, help="default namespace when YAML omits metadata.namespace")
    add_write_flags(ap)
    ap.set_defaults(fn=cmd_apply)

    dl = sp.add_parser("delete", help="Delete a namespaced object (POST …/delete)")
    dl.add_argument("--cluster-id", required=True)
    dl.add_argument("--kind", required=True, help="Deployment | Service | Pod | ConfigMap")
    dl.add_argument("--name", required=True)
    dl.add_argument("--namespace", default=None)
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_delete)

    ra = sp.add_parser("register-app", help="Register a Service as a published module App")
    ra.add_argument("--cluster-id", required=True)
    ra.add_argument("--namespace", required=True)
    ra.add_argument("--service", required=True)
    ra.add_argument("--port", type=int, required=True)
    ra.add_argument("--name", required=True)
    ra.add_argument("--api-name", required=True)
    ra.add_argument("--path", default=None, help="optional path prefix on the Service")
    ra.add_argument("--description", default=None)
    add_write_flags(ra)
    ra.set_defaults(fn=cmd_register_app)

    secrets = sp.add_parser("secrets", help="List Opaque Secrets (keys only; no values)")
    secrets.add_argument("--cluster-id", required=True)
    secrets.add_argument("--namespace", default=None)
    secrets.set_defaults(fn=cmd_secrets)

    cms = sp.add_parser("configmaps", help="List ConfigMaps (includes data values)")
    cms.add_argument("--cluster-id", required=True)
    cms.add_argument("--namespace", default=None)
    cms.set_defaults(fn=cmd_configmaps)

    envp = sp.add_parser("env", help="Read Deployment container env (refs, not secret values)")
    envp.add_argument("--cluster-id", required=True)
    envp.add_argument("--deployment", required=True)
    envp.add_argument("--namespace", default=None)
    envp.set_defaults(fn=cmd_env)
