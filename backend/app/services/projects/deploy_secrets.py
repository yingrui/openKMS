"""Encrypt / decrypt project deploy secret payloads."""
from __future__ import annotations

import json
from typing import Any

from app.services.credentials.credential_encryption import decrypt, encrypt
from app.services.kubernetes.cluster_config import validate_env_key, validate_resource_name


def encrypt_values(values: dict[str, str]) -> str:
    clean = {validate_env_key(k): str(v) for k, v in values.items()}
    return encrypt(json.dumps(clean, separators=(",", ":"), sort_keys=True))


def decrypt_values(cipher: str) -> dict[str, str]:
    raw = decrypt(cipher)
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("invalid deploy secret payload")
    return {str(k): str(v) for k, v in data.items()}


def merge_values(
    current: dict[str, str],
    *,
    set_values: dict[str, str] | None = None,
    remove_keys: list[str] | None = None,
) -> dict[str, str]:
    out = dict(current)
    for k in remove_keys or []:
        out.pop(validate_env_key(k), None)
    for k, v in (set_values or {}).items():
        key = validate_env_key(k)
        if v == "" and key in out:
            continue
        out[key] = str(v)
    return out


def validate_secret_name(name: str) -> str:
    return validate_resource_name(name)


def to_response_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row.id,
        "project_id": row.project_id,
        "name": row.name,
        "cluster_id": row.cluster_id,
        "namespace": row.namespace,
        "key_names": list(row.key_names or []),
        "last_synced_at": row.last_synced_at,
        "last_sync_error": row.last_sync_error,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }
