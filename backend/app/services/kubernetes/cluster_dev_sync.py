"""On-demand project → Pod code sync (tar over exec). No DevSpace; kubeconfig stays server-side."""
from __future__ import annotations

import asyncio
import io
import tarfile
import time
from pathlib import Path
from typing import Any

from app.services.kubernetes.cluster_config import validate_resource_name
from app.services.kubernetes.cluster_connection import prepare_kubeconfig
from app.services.kubernetes.cluster_resources import _build_api_client

MAX_PACKED_BYTES = 32 * 1024 * 1024  # 32 MiB

EXCLUDE_DIR_NAMES = frozenset(
    {
        ".git",
        "node_modules",
        "__pycache__",
        ".venv",
        "venv",
        "dist",
        "build",
        ".tox",
        ".mypy_cache",
        ".pytest_cache",
        ".next",
        "coverage",
    }
)
EXCLUDE_FILE_NAMES = frozenset({".DS_Store"})


def validate_container_path(path: str) -> str:
    p = (path or "").strip()
    if not p.startswith("/") or p == "/":
        raise ValueError("container_path must be an absolute path under / (not / alone)")
    parts = Path(p).parts
    if ".." in parts:
        raise ValueError("container_path must not contain '..'")
    return p


def should_exclude(rel: Path) -> bool:
    for part in rel.parts:
        if part in EXCLUDE_DIR_NAMES:
            return True
        if part in EXCLUDE_FILE_NAMES:
            return True
    return False


def pack_local_tree(local_root: Path, *, max_bytes: int = MAX_PACKED_BYTES) -> tuple[bytes, int]:
    """Pack files under local_root into a tar archive. Returns (bytes, file_count)."""
    if not local_root.exists():
        raise ValueError(f"local_path does not exist: {local_root}")
    if not local_root.is_dir():
        raise ValueError(f"local_path must be a directory: {local_root}")

    buf = io.BytesIO()
    file_count = 0
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for path in sorted(local_root.rglob("*")):
            if not path.is_file():
                continue
            try:
                rel = path.relative_to(local_root)
            except ValueError as e:
                raise ValueError("path escaped local root") from e
            if should_exclude(rel):
                continue
            size = path.stat().st_size
            if buf.tell() + size > max_bytes:
                raise ValueError(
                    f"packed size would exceed {max_bytes} bytes; "
                    "narrow local_path or exclude large artifacts"
                )
            tar.add(path, arcname=str(rel), recursive=False)
            file_count += 1
        if file_count == 0:
            # Empty tree: still create an empty tar so mkdir+extract is a no-op sync.
            pass
    data = buf.getvalue()
    if len(data) > max_bytes:
        raise ValueError(f"packed size exceeds {max_bytes} bytes")
    return data, file_count


def _pod_is_ready(pod: Any) -> bool:
    status = getattr(pod, "status", None)
    if status is None:
        return False
    if (getattr(status, "phase", None) or "") != "Running":
        return False
    for cond in getattr(status, "conditions", None) or []:
        if getattr(cond, "type", None) == "Ready" and getattr(cond, "status", None) == "True":
            return True
    return False


def _resolve_pod_for_deployment_sync(
    kubeconfig: dict[str, Any],
    namespace: str,
    deployment: str,
) -> tuple[str, list[str]]:
    """Return (pod_name, container_names) for the newest Ready pod of the Deployment."""
    from kubernetes import client
    from kubernetes.client.exceptions import ApiException

    deployment = validate_resource_name(deployment)
    with _build_api_client(kubeconfig) as api_client:
        apps = client.AppsV1Api(api_client)
        core = client.CoreV1Api(api_client)
        try:
            dep = apps.read_namespaced_deployment(deployment, namespace)
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"Deployment {deployment!r} not found in {namespace}") from e
            raise
        selector = (dep.spec.selector.match_labels if dep.spec and dep.spec.selector else None) or {}
        if not selector:
            raise ValueError(f"Deployment {deployment!r} has no matchLabels selector")
        label_sel = ",".join(f"{k}={v}" for k, v in sorted(selector.items()))
        pods = core.list_namespaced_pod(namespace, label_selector=label_sel).items or []

    ready = [p for p in pods if _pod_is_ready(p)]
    candidates = ready or list(pods)
    if not candidates:
        raise ValueError(f"No pods found for Deployment {deployment!r} in {namespace}")

    def _created(p: Any) -> str:
        meta = p.metadata
        ts = getattr(meta, "creation_timestamp", None) if meta else None
        return ts.isoformat() if ts is not None else ""

    candidates.sort(key=_created, reverse=True)
    pod = candidates[0]
    name = (pod.metadata.name if pod.metadata else "") or ""
    if not name:
        raise ValueError("resolved pod is missing metadata.name")
    containers = [
        c.name
        for c in ((pod.spec.containers if pod.spec else None) or [])
        if getattr(c, "name", None)
    ]
    if not containers:
        raise ValueError(f"Pod {name!r} has no containers")
    return name, containers


def _exec_command_sync(
    kubeconfig: dict[str, Any],
    *,
    namespace: str,
    pod: str,
    container: str,
    command: list[str],
    stdin_bytes: bytes | None = None,
) -> tuple[int, str, str]:
    """Run a command in the pod. Returns (returncode, stdout, stderr)."""
    from kubernetes import client
    from kubernetes.stream import stream

    with _build_api_client(kubeconfig) as api_client:
        v1 = client.CoreV1Api(api_client)
        kwargs: dict[str, Any] = {
            "name": pod,
            "namespace": namespace,
            "command": command,
            "container": container,
            "stderr": True,
            "stdin": stdin_bytes is not None,
            "stdout": True,
            "tty": False,
        }
        if stdin_bytes is not None:
            resp = stream(
                v1.connect_get_namespaced_pod_exec,
                **kwargs,
                _preload_content=False,
            )
            try:
                # Write in chunks to avoid huge websocket frames.
                chunk = 256 * 1024
                for i in range(0, len(stdin_bytes), chunk):
                    resp.write_stdin(stdin_bytes[i : i + chunk])
                # Signal EOF on stdin channel when supported.
                close_stdin = getattr(resp, "close_stdin", None)
                if callable(close_stdin):
                    close_stdin()
                # Drain until closed.
                while resp.is_open():
                    resp.update(timeout=1)
                    if resp.peek_stdout():
                        resp.read_stdout()
                    if resp.peek_stderr():
                        resp.read_stderr()
                stdout = resp.read_stdout() or ""
                stderr = resp.read_stderr() or ""
                code = getattr(resp, "returncode", None)
                if code is None:
                    code = 0
                return int(code), stdout, stderr
            finally:
                try:
                    resp.close()
                except Exception:
                    pass
        else:
            out = stream(v1.connect_get_namespaced_pod_exec, **kwargs)
            # Non-streaming returns combined string; treat as stdout.
            text = out if isinstance(out, str) else str(out or "")
            return 0, text, ""


def _sync_tree_sync(
    kubeconfig: dict[str, Any],
    *,
    namespace: str,
    deployment: str,
    container: str | None,
    local_root: Path,
    container_path: str,
    reload: bool,
    reload_port: int,
    reload_path: str,
    reload_required: bool,
) -> dict[str, Any]:
    t0 = time.perf_counter()
    container_path = validate_container_path(container_path)
    tar_bytes, files_packed = pack_local_tree(local_root)
    pod, containers = _resolve_pod_for_deployment_sync(kubeconfig, namespace, deployment)
    container_name = (container or "").strip() or containers[0]
    if container_name not in containers:
        raise ValueError(
            f"container {container_name!r} not on pod {pod!r} (have: {', '.join(containers)})"
        )

    code, _out, err = _exec_command_sync(
        kubeconfig,
        namespace=namespace,
        pod=pod,
        container=container_name,
        command=["mkdir", "-p", container_path],
    )
    if code != 0:
        raise ValueError(f"mkdir failed in pod (exit {code}): {err or _out}")

    code, _out, err = _exec_command_sync(
        kubeconfig,
        namespace=namespace,
        pod=pod,
        container=container_name,
        command=["tar", "xmf", "-", "-C", container_path],
        stdin_bytes=tar_bytes,
    )
    if code != 0:
        raise ValueError(f"tar extract failed in pod (exit {code}): {err or _out}")

    reload_status = "skipped"
    reload_message: str | None = None
    if reload:
        path = reload_path if reload_path.startswith("/") else f"/{reload_path}"
        url = f"http://127.0.0.1:{int(reload_port)}{path}"
        # Prefer curl; fall back to wget. Ignore missing tool if not required.
        code, _out, err = _exec_command_sync(
            kubeconfig,
            namespace=namespace,
            pod=pod,
            container=container_name,
            command=[
                "sh",
                "-c",
                f'curl -fsS -X POST "{url}" || wget -qO- --post-data="" "{url}"',
            ],
        )
        if code == 0:
            reload_status = "ok"
        else:
            reload_status = "failed"
            reload_message = (err or _out or f"exit {code}").strip()[:500]
            if reload_required:
                raise ValueError(f"reload required but failed: {reload_message}")

    duration_ms = int((time.perf_counter() - t0) * 1000)
    return {
        "pod": pod,
        "container": container_name,
        "namespace": namespace,
        "files_packed": files_packed,
        "bytes": len(tar_bytes),
        "duration_ms": duration_ms,
        "reload": reload_status,
        "reload_message": reload_message,
    }


async def sync_project_tree_async(
    kubeconfig_text: str,
    *,
    namespace: str,
    deployment: str,
    container: str | None,
    local_root: Path,
    container_path: str,
    reload: bool = False,
    reload_port: int = 8080,
    reload_path: str = "/-/reload",
    reload_required: bool = False,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> dict[str, Any]:
    data = prepare_kubeconfig(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(
        _sync_tree_sync,
        data,
        namespace=namespace,
        deployment=deployment,
        container=container,
        local_root=local_root,
        container_path=container_path,
        reload=reload,
        reload_port=reload_port,
        reload_path=reload_path,
        reload_required=reload_required,
    )
