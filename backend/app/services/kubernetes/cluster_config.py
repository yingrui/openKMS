"""Secret / ConfigMap / Deployment env helpers for registered clusters."""
from __future__ import annotations

import asyncio
import base64
import re
from typing import Any

from app.services.kubernetes.cluster_connection import prepare_kubeconfig
from app.services.kubernetes.cluster_resources import _build_api_client

LABEL_MANAGED_BY = "app.kubernetes.io/managed-by"
LABEL_MANAGED_BY_VALUE = "openkms"
LABEL_PROJECT_ID = "openkms.io/project-id"

_DNS1123_NAME = re.compile(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")
_ENV_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SKIP_SECRET_TYPES = frozenset(
    {
        "kubernetes.io/service-account-token",
        "kubernetes.io/dockerconfigjson",
        "kubernetes.io/dockercfg",
        "bootstrap.kubernetes.io/token",
    }
)


def validate_resource_name(name: str) -> str:
    n = (name or "").strip()
    if not n or len(n) > 253 or not _DNS1123_NAME.match(n):
        raise ValueError(
            "name must be a DNS-1123 label: lowercase alphanumeric or '-', "
            "start/end with alphanumeric, max 253 chars"
        )
    return n


def validate_env_key(key: str) -> str:
    k = (key or "").strip()
    if not k or not _ENV_KEY.match(k):
        raise ValueError(f"invalid env/secret key: {key!r}")
    return k


def _labels_of(obj: Any) -> dict[str, str]:
    meta = getattr(obj, "metadata", None)
    labels = getattr(meta, "labels", None) or {}
    return {str(k): str(v) for k, v in labels.items()}


def managed_project_id(labels: dict[str, str] | None) -> str | None:
    if not labels:
        return None
    if labels.get(LABEL_MANAGED_BY) != LABEL_MANAGED_BY_VALUE:
        return None
    pid = (labels.get(LABEL_PROJECT_ID) or "").strip()
    return pid or None


def openkms_secret_labels(project_id: str) -> dict[str, str]:
    return {
        LABEL_MANAGED_BY: LABEL_MANAGED_BY_VALUE,
        LABEL_PROJECT_ID: project_id,
    }


def _prepare(
    kubeconfig_text: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> dict[str, Any]:
    return prepare_kubeconfig(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )


def _list_secrets_sync(kubeconfig: dict[str, Any], namespace: str) -> list[dict[str, Any]]:
    from kubernetes import client

    with _build_api_client(kubeconfig) as api_client:
        core = client.CoreV1Api(api_client)
        items = core.list_namespaced_secret(namespace).items or []
    out: list[dict[str, Any]] = []
    for sec in items:
        meta = sec.metadata
        stype = (sec.type or "Opaque") if hasattr(sec, "type") else "Opaque"
        if stype in _SKIP_SECRET_TYPES or str(stype).startswith("helm.sh/"):
            continue
        if stype != "Opaque":
            continue
        labels = _labels_of(sec)
        data = sec.data or {}
        out.append(
            {
                "name": meta.name if meta else "",
                "namespace": meta.namespace if meta else namespace,
                "type": stype,
                "keys": sorted(str(k) for k in data.keys()),
                "managed_by_project_id": managed_project_id(labels),
            }
        )
    out.sort(key=lambda x: x["name"] or "")
    return out


def _read_secret_sync(kubeconfig: dict[str, Any], namespace: str, name: str) -> Any:
    from kubernetes import client
    from kubernetes.client.exceptions import ApiException

    with _build_api_client(kubeconfig) as api_client:
        core = client.CoreV1Api(api_client)
        try:
            return core.read_namespaced_secret(name, namespace)
        except ApiException as e:
            if e.status == 404:
                return None
            raise


def _upsert_secret_sync(
    kubeconfig: dict[str, Any],
    namespace: str,
    name: str,
    *,
    set_values: dict[str, str],
    remove_keys: list[str],
    labels: dict[str, str] | None,
    require_project_id: str | None,
    allow_create: bool = True,
) -> dict[str, Any]:
    from kubernetes import client
    from kubernetes.client.exceptions import ApiException

    name = validate_resource_name(name)
    for k in set_values:
        validate_env_key(k)
    for k in remove_keys:
        validate_env_key(k)

    with _build_api_client(kubeconfig) as api_client:
        core = client.CoreV1Api(api_client)
        existing = None
        try:
            existing = core.read_namespaced_secret(name, namespace)
        except ApiException as e:
            if e.status != 404:
                raise

        if existing is None:
            if not allow_create:
                raise ValueError(f"Secret {name!r} not found")
            if require_project_id is None and labels and managed_project_id(labels):
                pass
            data_b64 = {
                k: base64.b64encode(v.encode("utf-8")).decode("ascii")
                for k, v in set_values.items()
            }
            body = client.V1Secret(
                metadata=client.V1ObjectMeta(
                    name=name,
                    namespace=namespace,
                    labels=labels or None,
                ),
                type="Opaque",
                data=data_b64 or None,
            )
            created = core.create_namespaced_secret(namespace, body)
            meta = created.metadata
            return {
                "name": meta.name if meta else name,
                "namespace": meta.namespace if meta else namespace,
                "type": "Opaque",
                "keys": sorted(set_values.keys()),
                "managed_by_project_id": managed_project_id(labels or {}),
                "action": "created",
            }

        stype = existing.type or "Opaque"
        if stype != "Opaque":
            raise ValueError(f"Secret {name!r} has type {stype!r}; only Opaque is editable")
        existing_labels = _labels_of(existing)
        owner = managed_project_id(existing_labels)
        if require_project_id is not None:
            if owner != require_project_id:
                raise LookupError(
                    f"Secret {name!r} already exists and is not managed by this project"
                )
        elif owner is not None:
            raise PermissionError(
                f"Secret {name!r} is managed by project {owner}; edit from Project settings"
            )

        data = dict(existing.data or {})
        for k in remove_keys:
            data.pop(k, None)
        for k, v in set_values.items():
            if v == "" and k in data:
                continue  # empty = keep
            data[k] = base64.b64encode(v.encode("utf-8")).decode("ascii")

        meta_labels = dict(existing_labels)
        if labels:
            meta_labels.update(labels)
        body = client.V1Secret(
            metadata=client.V1ObjectMeta(
                name=name,
                namespace=namespace,
                labels=meta_labels or None,
                resource_version=existing.metadata.resource_version if existing.metadata else None,
            ),
            type="Opaque",
            data=data or None,
        )
        patched = core.replace_namespaced_secret(name, namespace, body)
        meta = patched.metadata
        keys = sorted(str(k) for k in (patched.data or {}).keys())
        return {
            "name": meta.name if meta else name,
            "namespace": meta.namespace if meta else namespace,
            "type": "Opaque",
            "keys": keys,
            "managed_by_project_id": managed_project_id(_labels_of(patched)),
            "action": "updated",
        }


def _delete_secret_sync(
    kubeconfig: dict[str, Any],
    namespace: str,
    name: str,
    *,
    require_project_id: str | None = None,
    allow_project_managed: bool = False,
) -> None:
    from kubernetes import client
    from kubernetes.client.exceptions import ApiException

    name = validate_resource_name(name)
    with _build_api_client(kubeconfig) as api_client:
        core = client.CoreV1Api(api_client)
        try:
            existing = core.read_namespaced_secret(name, namespace)
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"Secret {name!r} not found") from e
            raise
        owner = managed_project_id(_labels_of(existing))
        if require_project_id is not None:
            if owner != require_project_id:
                raise LookupError(f"Secret {name!r} is not managed by this project")
        elif owner is not None and not allow_project_managed:
            raise PermissionError(
                f"Secret {name!r} is managed by project {owner}; delete from Project settings"
            )
        core.delete_namespaced_secret(name, namespace)


def _list_configmaps_sync(kubeconfig: dict[str, Any], namespace: str) -> list[dict[str, Any]]:
    from kubernetes import client

    with _build_api_client(kubeconfig) as api_client:
        core = client.CoreV1Api(api_client)
        items = core.list_namespaced_config_map(namespace).items or []
    out: list[dict[str, Any]] = []
    for cm in items:
        meta = cm.metadata
        data = cm.data or {}
        out.append(
            {
                "name": meta.name if meta else "",
                "namespace": meta.namespace if meta else namespace,
                "keys": sorted(str(k) for k in data.keys()),
                "data": {str(k): str(v) for k, v in data.items()},
            }
        )
    out.sort(key=lambda x: x["name"] or "")
    return out


def _upsert_configmap_sync(
    kubeconfig: dict[str, Any],
    namespace: str,
    name: str,
    *,
    set_values: dict[str, str],
    remove_keys: list[str],
) -> dict[str, Any]:
    from kubernetes import client
    from kubernetes.client.exceptions import ApiException

    name = validate_resource_name(name)
    for k in set_values:
        validate_env_key(k)
    for k in remove_keys:
        validate_env_key(k)

    with _build_api_client(kubeconfig) as api_client:
        core = client.CoreV1Api(api_client)
        existing = None
        try:
            existing = core.read_namespaced_config_map(name, namespace)
        except ApiException as e:
            if e.status != 404:
                raise

        if existing is None:
            body = client.V1ConfigMap(
                metadata=client.V1ObjectMeta(name=name, namespace=namespace),
                data=dict(set_values) or None,
            )
            created = core.create_namespaced_config_map(namespace, body)
            meta = created.metadata
            data = created.data or {}
            return {
                "name": meta.name if meta else name,
                "namespace": meta.namespace if meta else namespace,
                "keys": sorted(data.keys()),
                "data": dict(data),
                "action": "created",
            }

        data = dict(existing.data or {})
        for k in remove_keys:
            data.pop(k, None)
        for k, v in set_values.items():
            data[k] = v
        body = client.V1ConfigMap(
            metadata=client.V1ObjectMeta(
                name=name,
                namespace=namespace,
                resource_version=existing.metadata.resource_version if existing.metadata else None,
            ),
            data=data or None,
        )
        patched = core.replace_namespaced_config_map(name, namespace, body)
        meta = patched.metadata
        pdata = patched.data or {}
        return {
            "name": meta.name if meta else name,
            "namespace": meta.namespace if meta else namespace,
            "keys": sorted(pdata.keys()),
            "data": dict(pdata),
            "action": "updated",
        }


def _delete_configmap_sync(kubeconfig: dict[str, Any], namespace: str, name: str) -> None:
    from kubernetes import client
    from kubernetes.client.exceptions import ApiException

    name = validate_resource_name(name)
    with _build_api_client(kubeconfig) as api_client:
        core = client.CoreV1Api(api_client)
        try:
            core.delete_namespaced_config_map(name, namespace)
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"ConfigMap {name!r} not found") from e
            raise


def _env_var_to_dict(ev: Any) -> dict[str, Any]:
    name = getattr(ev, "name", None) or ""
    value = getattr(ev, "value", None)
    vs = getattr(ev, "value_from", None)
    if vs is None:
        return {"name": name, "value": value if value is not None else ""}
    skr = getattr(vs, "secret_key_ref", None)
    if skr is not None:
        return {
            "name": name,
            "value_from": {
                "secret_key_ref": {
                    "name": getattr(skr, "name", "") or "",
                    "key": getattr(skr, "key", "") or "",
                    "optional": bool(getattr(skr, "optional", False)),
                }
            },
        }
    cmr = getattr(vs, "config_map_key_ref", None)
    if cmr is not None:
        return {
            "name": name,
            "value_from": {
                "config_map_key_ref": {
                    "name": getattr(cmr, "name", "") or "",
                    "key": getattr(cmr, "key", "") or "",
                    "optional": bool(getattr(cmr, "optional", False)),
                }
            },
        }
    return {"name": name, "value": ""}


def _env_from_to_dict(ef: Any) -> dict[str, Any]:
    prefix = getattr(ef, "prefix", None) or None
    sr = getattr(ef, "secret_ref", None)
    if sr is not None:
        return {
            "prefix": prefix,
            "secret_ref": {
                "name": getattr(sr, "name", "") or "",
                "optional": bool(getattr(sr, "optional", False)),
            },
        }
    cm = getattr(ef, "config_map_ref", None)
    if cm is not None:
        return {
            "prefix": prefix,
            "config_map_ref": {
                "name": getattr(cm, "name", "") or "",
                "optional": bool(getattr(cm, "optional", False)),
            },
        }
    return {"prefix": prefix}


def _get_deployment_env_sync(
    kubeconfig: dict[str, Any], namespace: str, name: str
) -> dict[str, Any]:
    from kubernetes import client
    from kubernetes.client.exceptions import ApiException

    name = validate_resource_name(name)
    with _build_api_client(kubeconfig) as api_client:
        apps = client.AppsV1Api(api_client)
        try:
            dep = apps.read_namespaced_deployment(name, namespace)
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"Deployment {name!r} not found") from e
            raise
    containers = []
    for c in (dep.spec.template.spec.containers if dep.spec and dep.spec.template and dep.spec.template.spec else []) or []:
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
                "env": [_env_var_to_dict(e) for e in (c.env or [])],
                "env_from": [_env_from_to_dict(e) for e in (c.env_from or [])],
            }
        )
    return {"name": name, "namespace": namespace, "containers": containers}


def _dict_to_env_var(item: dict[str, Any]) -> Any:
    from kubernetes import client

    name = validate_env_key(str(item.get("name") or ""))
    vf = item.get("value_from")
    if isinstance(vf, dict):
        skr = vf.get("secret_key_ref")
        if isinstance(skr, dict):
            return client.V1EnvVar(
                name=name,
                value_from=client.V1EnvVarSource(
                    secret_key_ref=client.V1SecretKeySelector(
                        name=validate_resource_name(str(skr.get("name") or "")),
                        key=validate_env_key(str(skr.get("key") or "")),
                        optional=bool(skr.get("optional")),
                    )
                ),
            )
        cmr = vf.get("config_map_key_ref")
        if isinstance(cmr, dict):
            return client.V1EnvVar(
                name=name,
                value_from=client.V1EnvVarSource(
                    config_map_key_ref=client.V1ConfigMapKeySelector(
                        name=validate_resource_name(str(cmr.get("name") or "")),
                        key=validate_env_key(str(cmr.get("key") or "")),
                        optional=bool(cmr.get("optional")),
                    )
                ),
            )
    return client.V1EnvVar(name=name, value=str(item.get("value") if item.get("value") is not None else ""))


def _dict_to_env_from(item: dict[str, Any]) -> Any:
    from kubernetes import client

    prefix = item.get("prefix") or None
    if isinstance(item.get("secret_ref"), dict):
        sr = item["secret_ref"]
        return client.V1EnvFromSource(
            prefix=prefix,
            secret_ref=client.V1SecretEnvSource(
                name=validate_resource_name(str(sr.get("name") or "")),
                optional=bool(sr.get("optional")),
            ),
        )
    if isinstance(item.get("config_map_ref"), dict):
        cm = item["config_map_ref"]
        return client.V1EnvFromSource(
            prefix=prefix,
            config_map_ref=client.V1ConfigMapEnvSource(
                name=validate_resource_name(str(cm.get("name") or "")),
                optional=bool(cm.get("optional")),
            ),
        )
    raise ValueError("env_from entry needs secret_ref or config_map_ref")


def _patch_deployment_env_sync(
    kubeconfig: dict[str, Any],
    namespace: str,
    name: str,
    *,
    container: str,
    env: list[dict[str, Any]],
    env_from: list[dict[str, Any]],
) -> dict[str, Any]:
    from kubernetes import client
    from kubernetes.client.exceptions import ApiException

    name = validate_resource_name(name)
    cname = (container or "").strip()
    if not cname:
        raise ValueError("container is required")

    with _build_api_client(kubeconfig) as api_client:
        apps = client.AppsV1Api(api_client)
        try:
            dep = apps.read_namespaced_deployment(name, namespace)
        except ApiException as e:
            if e.status == 404:
                raise ValueError(f"Deployment {name!r} not found") from e
            raise
        containers = (
            dep.spec.template.spec.containers
            if dep.spec and dep.spec.template and dep.spec.template.spec
            else None
        ) or []
        found = False
        for c in containers:
            if c.name == cname:
                c.env = [_dict_to_env_var(e) for e in env]
                c.env_from = [_dict_to_env_from(e) for e in env_from] if env_from else None
                found = True
                break
        if not found:
            raise ValueError(f"container {cname!r} not found on Deployment {name!r}")
        apps.replace_namespaced_deployment(name, namespace, dep)
    return _get_deployment_env_sync(kubeconfig, namespace, name)


# --- async wrappers ---


async def list_secrets_async(
    kubeconfig_text: str,
    namespace: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> list[dict[str, Any]]:
    data = _prepare(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(_list_secrets_sync, data, namespace)


async def upsert_secret_async(
    kubeconfig_text: str,
    namespace: str,
    name: str,
    *,
    set_values: dict[str, str],
    remove_keys: list[str] | None = None,
    labels: dict[str, str] | None = None,
    require_project_id: str | None = None,
    allow_create: bool = True,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> dict[str, Any]:
    data = _prepare(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(
        _upsert_secret_sync,
        data,
        namespace,
        name,
        set_values=set_values,
        remove_keys=list(remove_keys or []),
        labels=labels,
        require_project_id=require_project_id,
        allow_create=allow_create,
    )


async def delete_secret_async(
    kubeconfig_text: str,
    namespace: str,
    name: str,
    *,
    require_project_id: str | None = None,
    allow_project_managed: bool = False,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> None:
    data = _prepare(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    await asyncio.to_thread(
        _delete_secret_sync,
        data,
        namespace,
        name,
        require_project_id=require_project_id,
        allow_project_managed=allow_project_managed,
    )


async def list_configmaps_async(
    kubeconfig_text: str,
    namespace: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> list[dict[str, Any]]:
    data = _prepare(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(_list_configmaps_sync, data, namespace)


async def upsert_configmap_async(
    kubeconfig_text: str,
    namespace: str,
    name: str,
    *,
    set_values: dict[str, str],
    remove_keys: list[str] | None = None,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> dict[str, Any]:
    data = _prepare(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(
        _upsert_configmap_sync,
        data,
        namespace,
        name,
        set_values=set_values,
        remove_keys=list(remove_keys or []),
    )


async def delete_configmap_async(
    kubeconfig_text: str,
    namespace: str,
    name: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> None:
    data = _prepare(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    await asyncio.to_thread(_delete_configmap_sync, data, namespace, name)


async def get_deployment_env_async(
    kubeconfig_text: str,
    namespace: str,
    name: str,
    *,
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> dict[str, Any]:
    data = _prepare(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(_get_deployment_env_sync, data, namespace, name)


async def patch_deployment_env_async(
    kubeconfig_text: str,
    namespace: str,
    name: str,
    *,
    container: str,
    env: list[dict[str, Any]],
    env_from: list[dict[str, Any]],
    insecure_skip_tls_verify: bool = False,
    api_server: str | None = None,
) -> dict[str, Any]:
    data = _prepare(
        kubeconfig_text,
        insecure_skip_tls_verify=insecure_skip_tls_verify,
        api_server=api_server,
    )
    return await asyncio.to_thread(
        _patch_deployment_env_sync,
        data,
        namespace,
        name,
        container=container,
        env=env,
        env_from=env_from,
    )
